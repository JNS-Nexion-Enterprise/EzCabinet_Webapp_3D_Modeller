import "server-only";
import { canEmailReset } from "@/lib/auth/twoFactor";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";
import { staffReset } from "@/lib/email/templates/staffReset";

/**
 * Mails allowed per account per hour. Better Auth's own limiter is per IP and
 * memory-backed, so it does not stop a flood aimed at one inbox.
 */
const MAX_LIVE_RESET_LINKS = 3;

/**
 * Better Auth calls this for *every* address that has a user row — customer
 * rows included — and its reset endpoint will happily create a password on a
 * row that never had one. Whether a link goes out is therefore decided here,
 * by `canEmailReset`, from the row as it is now. Returning without sending
 * is indistinguishable to the requester: the endpoint answers the same
 * sentence either way.
 *
 * The link resets the password and nothing else. The second factor is
 * untouched, so a stolen mailbox still meets the code prompt.
 */
export async function sendStaffReset(
	userId: string,
	url: string,
): Promise<void> {
	const row = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			email: true,
			name: true,
			role: true,
			disabled: true,
			twoFactorEnabled: true,
			accounts: {
				where: { providerId: "credential" },
				select: { id: true },
				take: 1,
			},
		},
	});
	if (!row) return;
	const allowed = canEmailReset({
		role: row.role,
		disabled: row.disabled,
		hasPassword: row.accounts.length > 0,
		twoFactorEnabled: row.twoFactorEnabled === true,
	});
	if (!allowed) return;

	// Better Auth stores each link as a `verification` row (identifier
	// `reset-password:<token>`, value the user id) and creates it *before*
	// calling us, so the current request is already counted: `>` allows three
	// mails per hour per account and drops the fourth. A used link is consumed
	// and stops counting.
	const live = await prisma.verification.count({
		where: {
			identifier: { startsWith: "reset-password:" },
			value: userId,
			expiresAt: { gt: new Date() },
		},
	});
	if (live > MAX_LIVE_RESET_LINKS) return;

	await sendEmail({
		to: row.email,
		...staffReset({ name: row.name, link: url }),
	});
}

/**
 * A password the owner just chose by reset is no longer a handed-over one, and
 * every device trusted under the old one is forgotten: a trusted laptop plus
 * its mailbox would otherwise be enough to reset and sign in with no code.
 */
export async function afterPasswordReset(userId: string): Promise<void> {
	await prisma.$transaction([
		prisma.user.update({
			where: { id: userId },
			data: { mustChangePassword: false },
		}),
		prisma.verification.deleteMany({
			where: { identifier: { startsWith: "trust-device-" }, value: userId },
		}),
	]);
}

/**
 * Better Auth's own `url` carries a `callbackURL` the requester chose, so a
 * stranger could make the genuine mail land the token on any same-origin
 * page. The link is built from the token alone instead.
 */
export function resetLink(base: string, token: string): string {
	return `${base.replace(/\/+$/, "")}/admin/reset-password?token=${encodeURIComponent(token)}`;
}
