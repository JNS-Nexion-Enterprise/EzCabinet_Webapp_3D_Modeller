import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * A customer lost every device that held a passkey. Their account goes back
 * to "no passkey", so the next Google sign-in enrols a new one.
 *
 * That is exactly what an attacker holding the Google account wants, which
 * is why this is a staff action and not a button on the verify page: the
 * check is a person at EzCabinet confirming who is calling (order number and
 * the phone on the order — both shown on the row).
 */
export async function resetPasskeys(userId: string): Promise<void> {
	await prisma.$transaction([
		prisma.passkey.deleteMany({ where: { userId } }),
		prisma.session.deleteMany({ where: { userId } }),
	]);
}
