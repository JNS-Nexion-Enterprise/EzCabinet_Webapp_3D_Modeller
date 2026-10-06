import { resetTwoFactor } from "@/lib/auth/resetTwoFactor";
import { prisma } from "@/lib/catalogue/db";

/**
 * For the one case the admin screen cannot cover: the only superadmin has
 * lost both their phone and their backup codes, so nobody is left to press
 * Reset 2FA. Needs database credentials, which is the point — there is no
 * in-app back door.
 */
async function main() {
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email) throw new Error("Usage: pnpm auth:reset-2fa <email>");

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});
	if (!user) throw new Error(`No user with email ${email}`);

	await resetTwoFactor(user.id);
	console.log(
		`Reset two-step sign-in for ${email}. They enrol again at next sign-in.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
