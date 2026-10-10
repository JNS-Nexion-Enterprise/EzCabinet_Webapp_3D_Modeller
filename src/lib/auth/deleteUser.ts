import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * Removes an account for good — someone who has left, or a row that should
 * never have existed. Suspend is the reversible answer; this is not.
 *
 * Refused for an account that placed orders: an order is a money record and
 * outlives its account (`Order.userId` is `Restrict`), so that one can only
 * be suspended. The count is for the answer; the foreign key is the guard,
 * which is why a P2003 from the delete is the same refusal — an order can
 * land between the two.
 *
 * Orders this person marked paid keep their name in `Order.paidByName`;
 * only the link to the row goes (`paidByUserId` is `SetNull`).
 *
 * No last-superadmin check: only a superadmin reaches this, and never on
 * their own row, so one always remains.
 */
export async function deleteUser(
	userId: string,
	actorId: string,
): Promise<"ok" | "not_yourself" | "has_orders"> {
	if (userId === actorId) return "not_yourself";
	if ((await prisma.order.count({ where: { userId } })) > 0) {
		return "has_orders";
	}

	try {
		await prisma.$transaction([
			// A plain column, not a relation — nothing would clear it for us.
			prisma.user.updateMany({
				where: { invitedById: userId },
				data: { invitedById: null },
			}),
			// Trusted devices and live reset links are `verification` rows whose
			// value is the user id, with no foreign key to cascade through.
			prisma.verification.deleteMany({ where: { value: userId } }),
			// Sessions, sign-in accounts and the second factor cascade.
			prisma.user.delete({ where: { id: userId } }),
		]);
	} catch (error) {
		if ((error as { code?: unknown }).code === "P2003") return "has_orders";
		throw error;
	}
	return "ok";
}
