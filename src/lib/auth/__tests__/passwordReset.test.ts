import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());
const deleteMany = vi.hoisted(() => vi.fn(() => "trust"));
const $transaction = vi.hoisted(() => vi.fn(async () => []));
const sendEmail = vi.hoisted(() =>
	vi.fn(async (_message: { to: string; text: string }) => true),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: { findUnique, update },
		verification: { count, deleteMany },
		$transaction,
	},
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendStaffReset, afterPasswordReset, resetLink } = await import(
	"@/lib/auth/passwordReset"
);

const staff = {
	email: "a@b.com",
	role: "ADMIN",
	disabled: false,
	twoFactorEnabled: true,
	accounts: [{ id: "acc1" }],
};
const URL_ =
	"https://x.test/api/auth/reset-password/tok?callbackURL=%2Fadmin%2Freset-password";

describe("sendStaffReset", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		count.mockResolvedValue(1);
	});

	it("mails the link to enrolled staff who have a password", async () => {
		findUnique.mockResolvedValue(staff);
		await sendStaffReset("u1", URL_);
		expect(sendEmail).toHaveBeenCalledTimes(1);
		const sent = sendEmail.mock.calls[0][0];
		expect(sent.to).toBe("a@b.com");
		expect(sent.text).toContain(URL_);
	});

	it("mails the address on the row, not one the caller supplied", async () => {
		findUnique.mockResolvedValue({ ...staff, email: "row@b.com" });
		await sendStaffReset("u1", URL_);
		expect(sendEmail.mock.calls[0][0].to).toBe("row@b.com");
	});

	it.each([
		["a customer", { role: "CUSTOMER" }],
		["Google-only staff", { accounts: [] }],
		["a disabled account", { disabled: true }],
		["staff who have not enrolled 2FA", { twoFactorEnabled: false }],
		["staff whose 2FA flag is null", { twoFactorEnabled: null }],
	])("sends nothing to %s", async (_label, change) => {
		findUnique.mockResolvedValue({ ...staff, ...change });
		await sendStaffReset("u1", URL_);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("sends when the account has three live links", async () => {
		findUnique.mockResolvedValue(staff);
		count.mockResolvedValue(3);
		await sendStaffReset("u1", URL_);
		expect(sendEmail).toHaveBeenCalledTimes(1);
	});

	it("sends nothing when the account already has more than three live links", async () => {
		findUnique.mockResolvedValue(staff);
		count.mockResolvedValue(4);
		await sendStaffReset("u1", URL_);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("counts only this user's unexpired reset links", async () => {
		findUnique.mockResolvedValue(staff);
		await sendStaffReset("u1", URL_);
		expect(count).toHaveBeenCalledWith({
			where: {
				identifier: { startsWith: "reset-password:" },
				value: "u1",
				expiresAt: { gt: expect.any(Date) },
			},
		});
	});

	it("sends nothing when the row is gone", async () => {
		findUnique.mockResolvedValue(null);
		await sendStaffReset("ghost", URL_);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe("afterPasswordReset", () => {
	it("clears mustChangePassword and forgets trusted devices, in one transaction", async () => {
		update.mockReturnValue("user");
		await afterPasswordReset("u1");
		expect(update).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { mustChangePassword: false },
		});
		// A trusted laptop plus its mailbox must not be enough to skip the code.
		expect(deleteMany).toHaveBeenCalledWith({
			where: { identifier: { startsWith: "trust-device-" }, value: "u1" },
		});
		expect($transaction).toHaveBeenCalledWith(["user", "trust"]);
	});
});

describe("resetLink", () => {
	it("builds the link from the base and token alone", () => {
		expect(resetLink("https://x.test", "tok")).toBe(
			"https://x.test/admin/reset-password?token=tok",
		);
	});
	it("tolerates a trailing slash on the base", () => {
		expect(resetLink("https://x.test/", "tok")).toBe(
			"https://x.test/admin/reset-password?token=tok",
		);
	});
	it("encodes the token", () => {
		expect(resetLink("https://x.test", "a&b=c d")).toBe(
			"https://x.test/admin/reset-password?token=a%26b%3Dc%20d",
		);
	});
});
