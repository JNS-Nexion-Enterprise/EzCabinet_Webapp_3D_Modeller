import "server-only";
import { twoFactorResetOps } from "@/lib/auth/resetTwoFactor";
import { prisma } from "@/lib/catalogue/db";

/**
 * Makes a staff account Google-only. Every invited row has a password, so
 * every one must enrol 2FA — and enrolment needs that password. A staff
 * member who only signs in with Google and has forgotten it would be sent to
 * setup forever. Without a password the account falls under the 2FA rule's
 * Google exemption, so nothing more is asked of them.
 *
 * Refused when Google (or anything else) is not linked: removing the only way
 * in would brick the account. The reset ops go with it — a second factor on a
 * password that no longer exists means nothing, and any session opened with
 * the old password must end.
 */
export async function removePassword(
	userId: string,
): Promise<"ok" | "no_other_sign_in"> {
	const others = await prisma.account.count({
		where: { userId, providerId: { not: "credential" } },
	});
	if (others === 0) return "no_other_sign_in";

	await prisma.$transaction([
		prisma.account.deleteMany({ where: { userId, providerId: "credential" } }),
		prisma.user.update({
			where: { id: userId },
			data: { mustChangePassword: false },
		}),
		...twoFactorResetOps(userId),
	]);
	return "ok";
}
