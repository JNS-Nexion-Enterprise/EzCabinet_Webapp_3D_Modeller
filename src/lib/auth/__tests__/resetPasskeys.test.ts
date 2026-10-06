import { beforeEach, describe, expect, it, vi } from "vitest";

const passkeyDeleteMany = vi.hoisted(() => vi.fn(() => "passkeys"));
const sessionDeleteMany = vi.hoisted(() => vi.fn(() => "sessions"));
const $transaction = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		passkey: { deleteMany: passkeyDeleteMany },
		session: { deleteMany: sessionDeleteMany },
		$transaction,
	},
}));

const { resetPasskeys } = await import("@/lib/auth/resetPasskeys");

describe("resetPasskeys", () => {
	beforeEach(() => vi.clearAllMocks());

	it("removes every passkey and every session, in one transaction", async () => {
		await resetPasskeys("u1");
		expect(passkeyDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		// A verified session must not outlive the passkeys that verified it.
		expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		expect($transaction).toHaveBeenCalledWith(["passkeys", "sessions"]);
	});
});
