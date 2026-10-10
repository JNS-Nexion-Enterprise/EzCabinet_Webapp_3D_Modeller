import { beforeEach, describe, expect, it, vi } from "vitest";

const accountCount = vi.hoisted(() => vi.fn());
const accountDeleteMany = vi.hoisted(() => vi.fn(() => "account"));
const userUpdate = vi.hoisted(() => vi.fn(() => "user"));
const $transaction = vi.hoisted(() => vi.fn(async () => []));
const twoFactorResetOps = vi.hoisted(() => vi.fn(() => ["reset-a", "reset-b"]));

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		account: { count: accountCount, deleteMany: accountDeleteMany },
		user: { update: userUpdate },
		$transaction,
	},
}));
vi.mock("@/lib/auth/resetTwoFactor", () => ({ twoFactorResetOps }));

const { removePassword } = await import("@/lib/auth/removePassword");

describe("removePassword", () => {
	beforeEach(() => vi.clearAllMocks());

	it("refuses, and writes nothing, when the password is the only way in", async () => {
		accountCount.mockResolvedValue(0);
		expect(await removePassword("u1")).toBe("no_other_sign_in");
		expect(accountCount).toHaveBeenCalledWith({
			where: { userId: "u1", providerId: { not: "credential" } },
		});
		expect($transaction).not.toHaveBeenCalled();
		expect(accountDeleteMany).not.toHaveBeenCalled();
	});

	it("deletes the credential account, clears the flag and resets 2FA, in one transaction", async () => {
		accountCount.mockResolvedValue(1);
		expect(await removePassword("u1")).toBe("ok");
		expect(accountDeleteMany).toHaveBeenCalledWith({
			where: { userId: "u1", providerId: "credential" },
		});
		expect(userUpdate).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { mustChangePassword: false },
		});
		expect(twoFactorResetOps).toHaveBeenCalledWith("u1");
		expect($transaction).toHaveBeenCalledWith([
			"account",
			"user",
			"reset-a",
			"reset-b",
		]);
	});
});
