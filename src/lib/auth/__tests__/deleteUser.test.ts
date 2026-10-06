import { beforeEach, describe, expect, it, vi } from "vitest";

const orderCount = vi.hoisted(() => vi.fn());
const userUpdateMany = vi.hoisted(() => vi.fn(() => "invites"));
const userDelete = vi.hoisted(() => vi.fn(() => "user"));
const verificationDeleteMany = vi.hoisted(() => vi.fn(() => "verifications"));
const $transaction = vi.hoisted(() => vi.fn(async () => []));

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

	it("refuses an account that placed orders", async () => {
		orderCount.mockResolvedValue(2);
		expect(await deleteUser("u1", "boss")).toBe("has_orders");
		expect(orderCount).toHaveBeenCalledWith({ where: { userId: "u1" } });
		expect($transaction).not.toHaveBeenCalled();
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

	it("answers has_orders when an order lands between the count and the delete", async () => {
		$transaction.mockRejectedValueOnce(
			Object.assign(new Error("fk"), { code: "P2003" }),
		);
		expect(await deleteUser("u1", "boss")).toBe("has_orders");
	});

	it("rethrows anything else", async () => {
		$transaction.mockRejectedValueOnce(new Error("db down"));
		await expect(deleteUser("u1", "boss")).rejects.toThrow("db down");
	});
});
