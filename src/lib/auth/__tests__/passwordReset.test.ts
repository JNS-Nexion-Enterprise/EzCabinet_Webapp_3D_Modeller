import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
	vi.fn(async (_message: { to: string; text: string }) => true),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { user: { findUnique, update } },
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendStaffReset, clearForcedChange } = await import(
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
	beforeEach(() => vi.clearAllMocks());

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

	it("sends nothing when the row is gone", async () => {
		findUnique.mockResolvedValue(null);
		await sendStaffReset("ghost", URL_);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});

describe("clearForcedChange", () => {
	it("clears mustChangePassword — the owner has now chosen the password", async () => {
		await clearForcedChange("u1");
		expect(update).toHaveBeenCalledWith({
			where: { id: "u1" },
			data: { mustChangePassword: false },
		});
	});
});
