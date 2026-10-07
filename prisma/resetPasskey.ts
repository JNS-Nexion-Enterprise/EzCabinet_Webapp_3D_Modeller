import { resetPasskeys } from "@/lib/auth/resetPasskeys";
import { prisma } from "@/lib/catalogue/db";

/**
 * For the one case the admin screen cannot cover: the only superadmin has
 * lost the device holding their passkey, so nobody is left to press Reset
 * passkey and they cannot confirm a guarded action themselves. Needs
 * database credentials, which is the point — there is no in-app back door.
 */
async function main() {
	const email = process.argv[2]?.trim().toLowerCase();
	if (!email) throw new Error("Usage: pnpm auth:reset-passkey <email>");

	const user = await prisma.user.findUnique({
		where: { email },
		select: { id: true },
	});
	if (!user) throw new Error(`No user with email ${email}`);

	await resetPasskeys(user.id);
	console.log(
		`Removed every passkey for ${email} and signed them out. They set up a new one under Security.`,
	);
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
