import { beforeEach, describe, expect, it, vi } from "vitest";

const twoFactorDeleteMany = vi.hoisted(() => vi.fn(() => "2fa"));
const userUpdate = vi.hoisted(() => vi.fn(() => "user"));
const sessionDeleteMany = vi.hoisted(() => vi.fn(() => "sessions"));
const verificationDeleteMany = vi.hoisted(() =>
	vi.fn((arg: { where: { identifier: { startsWith: string } } }) =>
		arg.where.identifier.startsWith === "trust-device-" ? "trust" : "links",
	),
);
const $transaction = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		twoFactor: { deleteMany: twoFactorDeleteMany },
		user: { update: userUpdate },
		session: { deleteMany: sessionDeleteMany },
		verification: { deleteMany: verificationDeleteMany },
		$transaction,
	},
}));

const { resetTwoFactor } = await import("@/lib/auth/resetTwoFactor");

describe("resetTwoFactor", () => {
	beforeEach(() => vi.clearAllMocks());

	it("removes the secret, the flag, the sessions and the trusted devices, in one transaction", async () => {
		await resetTwoFactor("u1");
		expect(twoFactorDeleteMany).toHaveBeenCalledWith({
			where: { userId: "u1" },
		});
		expect(userUpdate).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { twoFactorEnabled: false },
		});
		expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		// A device trusted before the reset must be asked for a code again.
		expect(verificationDeleteMany).toHaveBeenCalledWith({
			where: { identifier: { startsWith: "trust-device-" }, value: "u1" },
		});
		// A mailed reset link must not outlive the reset: reset links are only
		// sent to enrolled staff, and this puts the account back to "not enrolled".
		expect(verificationDeleteMany).toHaveBeenCalledWith({
			where: { identifier: { startsWith: "reset-password:" }, value: "u1" },
		});
		expect($transaction).toHaveBeenCalledWith([
			"2fa",
			"user",
			"sessions",
			"trust",
			"links",
		]);
	});
});
