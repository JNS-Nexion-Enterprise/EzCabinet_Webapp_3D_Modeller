import { beforeEach, describe, expect, it, vi } from "vitest";

const orderCount = vi.hoisted(() => vi.fn());
const userUpdateMany = vi.hoisted(() => vi.fn(() => "invites"));
const userDelete = vi.hoisted(() => vi.fn(() => "user"));
const verificationDeleteMany = vi.hoisted(() => vi.fn(() => "verifications"));
const userUpdateManyTx = vi.hoisted(() => vi.fn());
const sessionDeleteMany = vi.hoisted(() => vi.fn());
const accountDeleteMany = vi.hoisted(() => vi.fn());
const passkeyDeleteMany = vi.hoisted(() => vi.fn());
const verificationDeleteManyTx = vi.hoisted(() => vi.fn());
const tx = {
	user: { updateMany: userUpdateManyTx },
	session: { deleteMany: sessionDeleteMany },
	account: { deleteMany: accountDeleteMany },
	passkey: { deleteMany: passkeyDeleteMany },
	verification: { deleteMany: verificationDeleteManyTx },
};
// An array is the delete; a function is the anonymise, run against `tx`.
const $transaction = vi.hoisted(() =>
	vi.fn(async (arg: unknown) => (typeof arg === "function" ? arg(tx) : [])),
);

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		order: { count: orderCount },
		user: { updateMany: userUpdateMany, delete: userDelete },
		verification: { deleteMany: verificationDeleteMany },
		$transaction,
	},
}));

const { deleteUser } = await import("@/lib/auth/deleteUser");

describe("deleteUser", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		orderCount.mockResolvedValue(0);
	});

	it("refuses to delete yourself", async () => {
		expect(await deleteUser("boss", "boss")).toBe("not_yourself");
		expect($transaction).not.toHaveBeenCalled();
	});

	it("anonymises a customer who placed orders, and keeps the orders", async () => {
		orderCount.mockResolvedValue(2);
		userUpdateManyTx.mockResolvedValue({ count: 1 });
		expect(await deleteUser("u1", "boss")).toBe("anonymised");
		expect(orderCount).toHaveBeenCalledWith({ where: { userId: "u1" } });
		expect(userUpdateManyTx).toHaveBeenCalledWith({
			where: { id: "u1", role: "CUSTOMER" },
			data: {
				name: "",
				email: "deleted-u1@anonymised.invalid",
				emailVerified: false,
				image: null,
				disabled: true,
			},
		});
		for (const deleteMany of [
			sessionDeleteMany,
			accountDeleteMany,
			passkeyDeleteMany,
		])
			expect(deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		expect(verificationDeleteManyTx).toHaveBeenCalledWith({
			where: { value: "u1" },
		});
		expect(userDelete).not.toHaveBeenCalled();
	});

	it("refuses a staff account that placed orders, and touches nothing", async () => {
		orderCount.mockResolvedValue(2);
		userUpdateManyTx.mockResolvedValue({ count: 0 });
		expect(await deleteUser("u1", "boss")).toBe("has_orders");
		expect(sessionDeleteMany).not.toHaveBeenCalled();
		expect(verificationDeleteManyTx).not.toHaveBeenCalled();
		expect(userDelete).not.toHaveBeenCalled();
	});

	it("clears what points at the row, then deletes it, in one transaction", async () => {
		expect(await deleteUser("u1", "boss")).toBe("ok");
		expect(userUpdateMany).toHaveBeenCalledWith({
			where: { invitedById: "u1" },
			data: { invitedById: null },
		});
		expect(verificationDeleteMany).toHaveBeenCalledWith({
			where: { value: "u1" },
		});
		expect(userDelete).toHaveBeenCalledWith({ where: { id: "u1" } });
		expect($transaction).toHaveBeenCalledWith([
			"invites",
			"verifications",
			"user",
		]);
	});

	it("anonymises when an order lands between the count and the delete", async () => {
		$transaction.mockRejectedValueOnce(
			Object.assign(new Error("fk"), { code: "P2003" }),
		);
		userUpdateManyTx.mockResolvedValue({ count: 1 });
		expect(await deleteUser("u1", "boss")).toBe("anonymised");
	});

	it("rethrows anything else", async () => {
		$transaction.mockRejectedValueOnce(new Error("db down"));
		await expect(deleteUser("u1", "boss")).rejects.toThrow("db down");
	});
});
