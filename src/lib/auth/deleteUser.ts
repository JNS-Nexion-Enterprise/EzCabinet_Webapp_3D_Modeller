import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * Removes an account for good — someone who has left, a row that should
 * never have existed, or a customer exercising their PDPA right to have
 * their data deleted. Suspend is the reversible answer; this is not.
 *
 * An account that placed orders cannot be removed: an order is a money
 * record that tax law keeps for seven years and it outlives its account
 * (`Order.userId` is `Restrict`). For a customer that is answered by
 * `anonymiseCustomer` instead — everything that identifies the account goes,
 * the order rows (which carry their own name, phone and address snapshot)
 * stay. A staff account with orders is still refused and can only be
 * suspended. The count is for the answer; the foreign key is the guard,
 * which is why a P2003 from the delete is the same path — an order can land
 * between the two.
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
): Promise<"ok" | "anonymised" | "not_yourself" | "has_orders"> {
	if (userId === actorId) return "not_yourself";
	if ((await prisma.order.count({ where: { userId } })) > 0) {
		return orderHolder(userId);
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
		if ((error as { code?: unknown }).code === "P2003") {
			return orderHolder(userId);
		}
		throw error;
	}
	return "ok";
}

/** A customer with orders is anonymised; anyone else with orders is refused. */
async function orderHolder(
	userId: string,
): Promise<"anonymised" | "has_orders"> {
	return (await anonymiseCustomer(userId)) ? "anonymised" : "has_orders";
}

/**
 * The address an anonymised row is left holding. `.invalid` is reserved
 * (RFC 2606), so nothing is ever mailed to it, and the id keeps it unique.
 * Signing in again with the real address makes a new, empty account.
 */
export const anonymisedEmail = (userId: string) =>
	`deleted-${userId}@anonymised.invalid`;

/**
 * Strips a customer account of everything that identifies it, keeping the
 * row only because its orders point at it: name, email, photo and every way
 * to sign in (sessions, Google link, passkeys) go, and the row is suspended.
 * The write is conditional on the row still being a customer's, so a
 * promotion that lands first is never anonymised; false means nothing was
 * changed.
 */
export async function anonymiseCustomer(userId: string): Promise<boolean> {
	return prisma.$transaction(async (tx) => {
		const stripped = await tx.user.updateMany({
			where: { id: userId, role: "CUSTOMER" },
			data: {
				name: "",
				email: anonymisedEmail(userId),
				emailVerified: false,
				image: null,
				disabled: true,
			},
		});
		if (stripped.count === 0) return false;
		await tx.session.deleteMany({ where: { userId } });
		await tx.account.deleteMany({ where: { userId } });
		await tx.passkey.deleteMany({ where: { userId } });
		await tx.verification.deleteMany({ where: { value: userId } });
		return true;
	});
}
