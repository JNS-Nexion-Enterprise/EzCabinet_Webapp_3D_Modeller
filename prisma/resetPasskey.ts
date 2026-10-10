import { sendPasskeyChange } from "@/lib/auth/passkeyMail";
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
	// Awaited here, unlike in a request: there is no response to send first,
	// and the process is about to exit. It never throws on a failed send.
	await sendPasskeyChange(user.id, "reset").catch((error) =>
		console.error("Passkey mail failed", error),
	);
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
