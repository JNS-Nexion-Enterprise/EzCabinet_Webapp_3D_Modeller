import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const limitDelete = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const codeDelete = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			true,
	),
);

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: { findUnique },
		rateLimit: { deleteMany: limitDelete, upsert },
		verification: { deleteMany: codeDelete },
	},
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendSignInCode } = await import("@/lib/auth/emailCodeMail");

const logs = () =>
	[console.info, console.log, console.warn, console.error]
		.flatMap((fn) => vi.mocked(fn).mock.calls)
		.flat()
		.map(String)
		.join("\n");

beforeEach(() => {
	vi.clearAllMocks();
	findUnique.mockResolvedValue(null);
	upsert.mockResolvedValue({ count: 1 });
	codeDelete.mockResolvedValue({ count: 1 });
	for (const level of ["info", "log", "warn", "error"] as const) {
		vi.spyOn(console, level).mockImplementation(() => {});
	}
	process.env.RESEND_API_KEY = "test-key";
});

afterEach(() => {
	delete process.env.RESEND_API_KEY;
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("sendSignInCode", () => {
	it("mails the code, the site name and the ignore line, with no link", async () => {
		await sendSignInCode("aiman@outlook.com", "482913");
		const message = sendEmail.mock.calls[0][0];
		expect(message.to).toBe("aiman@outlook.com");
		for (const part of [message.text, message.html ?? ""]) {
			expect(part).toContain("482913");
			expect(part).toContain("EzCabinet");
			expect(part).toContain("If you did not ask for this, ignore this email.");
			// A scanner that follows links must find nothing to follow.
			expect(part).not.toMatch(/https?:|href|www\./i);
		}
		expect(message.subject).not.toContain("482913");
	});

	it("never logs the code when mail is configured", async () => {
		await sendSignInCode("aiman@outlook.com", "482913");
		sendEmail.mockResolvedValueOnce(false);
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(logs()).not.toContain("482913");
	});

	it("logs the code instead of mailing when there is no mail key", async () => {
		delete process.env.RESEND_API_KEY;
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(sendEmail).not.toHaveBeenCalled();
		expect(logs()).toContain("482913");
	});

	// Function logs are read by more people than a mailbox is, and kept.
	it("in production with no mail key, logs an error without the code or the address", async () => {
		vi.stubEnv("VERCEL_ENV", "production");
		delete process.env.RESEND_API_KEY;
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(sendEmail).not.toHaveBeenCalled();
		expect(logs()).not.toContain("482913");
		expect(logs()).not.toContain("aiman@outlook.com");
		expect(console.error).toHaveBeenCalledTimes(1);
		expect(console.info).not.toHaveBeenCalled();
	});

	it("on a preview deployment with no mail key, still logs the code", async () => {
		vi.stubEnv("VERCEL_ENV", "preview");
		delete process.env.RESEND_API_KEY;
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(logs()).toContain("482913");
	});

	// Counted and kept like a customer's, so the plugin's attempt counting and
	// the cap cannot tell the address apart. Only the mail and the log differ.
	describe.each(["ADMIN", "SUPERADMIN"])("to a %s", (role) => {
		beforeEach(() => findUnique.mockResolvedValue({ role }));

		it.each([
			["with a mail key", true],
			["with none", false],
		])("sends nothing and logs nothing, %s", async (_label, key) => {
			if (!key) delete process.env.RESEND_API_KEY;
			await sendSignInCode("boss@x.com", "482913");
			expect(sendEmail).not.toHaveBeenCalled();
			expect(logs()).not.toContain("482913");
			expect(upsert).toHaveBeenCalledTimes(1);
			expect(upsert.mock.calls[0][0]).toMatchObject({
				where: { key: "email-code|boss@x.com" },
			});
			expect(codeDelete).not.toHaveBeenCalled();
		});

		it("drops the code past the cap, still unmailed and unlogged", async () => {
			delete process.env.RESEND_API_KEY;
			upsert.mockResolvedValueOnce({ count: 4 });
			await sendSignInCode("boss@x.com", "482913");
			expect(sendEmail).not.toHaveBeenCalled();
			expect(logs()).not.toContain("482913");
			expect(codeDelete).toHaveBeenCalledWith({
				where: { identifier: "sign-in-otp-boss@x.com" },
			});
		});
	});

	describe("a code that was not delivered is not left live", () => {
		const dropped = { where: { identifier: "sign-in-otp-cust@x.com" } };

		it("when the send cannot be counted", async () => {
			upsert.mockRejectedValueOnce(new Error("db down"));
			await expect(sendSignInCode("cust@x.com", "482913")).rejects.toThrow(
				"db down",
			);
			expect(codeDelete).toHaveBeenCalledWith(dropped);
			expect(sendEmail).not.toHaveBeenCalled();
			expect(logs()).not.toContain("482913");
		});

		it("when the address cannot be looked up", async () => {
			findUnique.mockRejectedValueOnce(new Error("db down"));
			await expect(sendSignInCode("cust@x.com", "482913")).rejects.toThrow(
				"db down",
			);
			expect(codeDelete).toHaveBeenCalledWith(dropped);
			expect(sendEmail).not.toHaveBeenCalled();
		});

		// A staff address is never mailed and keeps its row, so a customer's
		// must stay too, or the fourth wrong guess tells the two apart.
		it.each([
			["a customer", { role: "CUSTOMER" }],
			["a new address", null],
		])("but one the mail provider refused stays, for %s", async (_l, row) => {
			findUnique.mockResolvedValue(row);
			sendEmail.mockResolvedValueOnce(false);
			await sendSignInCode("cust@x.com", "482913");
			expect(codeDelete).not.toHaveBeenCalled();
			expect(logs()).not.toContain("482913");
		});

		// Local and preview: the developer reads it from the log, so it stays.
		it("but a code logged for want of a mail key stays", async () => {
			delete process.env.RESEND_API_KEY;
			await sendSignInCode("cust@x.com", "482913");
			expect(codeDelete).not.toHaveBeenCalled();
		});
	});

	it("mails a known customer", async () => {
		findUnique.mockResolvedValue({ role: "CUSTOMER" });
		await sendSignInCode("cust@x.com", "482913");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(codeDelete).not.toHaveBeenCalled();
	});

	it("counts each send against the address, in an hour's window", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T02:00:00Z") });
		await sendSignInCode("aiman@outlook.com", "482913");
		vi.useRealTimers();
		const now = Date.parse("2026-10-08T02:00:00Z");
		expect(limitDelete).toHaveBeenCalledWith({
			where: {
				key: "email-code|aiman@outlook.com",
				lastRequest: { lt: now - 3_600_000 },
			},
		});
		expect(upsert.mock.calls[0][0]).toMatchObject({
			where: { key: "email-code|aiman@outlook.com" },
			create: {
				key: "email-code|aiman@outlook.com",
				count: 1,
				lastRequest: now,
			},
			update: { count: { increment: 1 } },
		});
	});

	it("mails the third code of the hour and drops the fourth", async () => {
		upsert.mockResolvedValueOnce({ count: 3 });
		await sendSignInCode("aiman@outlook.com", "111111");
		expect(sendEmail).toHaveBeenCalledTimes(1);

		upsert.mockResolvedValueOnce({ count: 4 });
		await sendSignInCode("aiman@outlook.com", "222222");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(codeDelete).toHaveBeenCalledWith({
			where: { identifier: "sign-in-otp-aiman@outlook.com" },
		});
	});
});
