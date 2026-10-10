import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * The writes that take a user back to "no second factor", so their next
 * sign-in is forced through `/admin/setup-2fa` again. Exported so
 * `removePassword` can run the same writes inside its own transaction.
 *
 * Trusted devices go too. The plugin stores each as a `verification` row —
 * identifier `trust-device-<random>`, value the user id
 * (node_modules/better-auth/dist/plugins/two-factor/verify-two-factor.mjs) —
 * and a device trusted under the old authenticator would otherwise skip the
 * new one for up to 30 days.
 *
 * So do live reset links: `canEmailReset` refuses to mail one before
 * enrolment, and this puts the account back to "not enrolled", so a link
 * mailed earlier must not survive to be used against the fresh state.
 */
export function twoFactorResetOps(userId: string) {
	return [
		prisma.twoFactor.deleteMany({ where: { userId } }),
		prisma.user.update({
			where: { id: userId },
			data: { twoFactorEnabled: false },
		}),
		prisma.session.deleteMany({ where: { userId } }),
		prisma.verification.deleteMany({
			where: { identifier: { startsWith: "trust-device-" }, value: userId },
		}),
		prisma.verification.deleteMany({
			where: { identifier: { startsWith: "reset-password:" }, value: userId },
		}),
	];
}

/**
 * The one path that removes a second factor: `/two-factor/disable` is closed
 * in `lib/auth.ts`.
 */
export async function resetTwoFactor(userId: string): Promise<void> {
	await prisma.$transaction(twoFactorResetOps(userId));
}
