import "server-only";
import { canEmailReset } from "@/lib/auth/twoFactor";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";

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

	await sendEmail({
		to: row.email,
		subject: "Reset your EzCabinet admin password",
		text: [
			"Someone asked to reset the password on your EzCabinet admin account.",
			"",
			"Choose a new password here (the link works once, for one hour):",
			url,
			"",
			"You will still need your authenticator code to sign in.",
			"If this was not you, ignore this email — nothing has changed.",
		].join("\n"),
	});
}

/** A password the owner just chose by reset is no longer a handed-over one. */
export async function clearForcedChange(userId: string): Promise<void> {
	await prisma.user.update({
		where: { id: userId },
		data: { mustChangePassword: false },
	});
}
