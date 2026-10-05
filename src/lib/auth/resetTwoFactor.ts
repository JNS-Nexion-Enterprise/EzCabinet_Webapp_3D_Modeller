import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * Takes a user back to "no second factor", so their next sign-in is forced
 * through `/admin/setup-2fa` again. The one path that removes a second
 * factor: `/two-factor/disable` is closed in `lib/auth.ts`.
 *
 * Trusted devices go too. The plugin stores each as a `verification` row —
 * identifier `trust-device-<random>`, value the user id
 * (node_modules/better-auth/dist/plugins/two-factor/verify-two-factor.mjs) —
 * and a device trusted under the old authenticator would otherwise skip the
 * new one for up to 30 days.
 */
export async function resetTwoFactor(userId: string): Promise<void> {
	await prisma.$transaction([
		prisma.twoFactor.deleteMany({ where: { userId } }),
		prisma.user.update({
			where: { id: userId },
			data: { twoFactorEnabled: false },
		}),
		prisma.session.deleteMany({ where: { userId } }),
		prisma.verification.deleteMany({
			where: { identifier: { startsWith: "trust-device-" }, value: userId },
		}),
	]);
}
