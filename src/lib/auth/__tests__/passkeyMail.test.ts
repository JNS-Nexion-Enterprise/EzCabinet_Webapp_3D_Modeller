import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			true,
	),
);
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("next/server", () => ({ after }));

const { queuePasskeyMail, sendPasskeyChange } = await import(
	"@/lib/auth/passkeyMail"
);

/** 01:30 on 9 October in Malaysia, still 8 October in UTC. */
const AT = new Date("2026-10-08T17:30:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	findUnique.mockResolvedValue({ email: "aiman@outlook.com", name: "Aiman" });
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("sendPasskeyChange", () => {
	it.each([
		["added", "A passkey was added to your EzCabinet account"],
		["removed", "A passkey was removed from your EzCabinet account"],
		["reset", "EzCabinet staff removed every passkey"],
	] as const)(
		"%s: says what and when, to the account's own address",
		async (change, what) => {
			await sendPasskeyChange("u1", change, AT);
			expect(findUnique).toHaveBeenCalledWith({
				where: { id: "u1" },
				select: { email: true, name: true },
			});
			const message = sendEmail.mock.calls[0][0];
			expect(message.to).toBe("aiman@outlook.com");
			for (const part of [message.text, message.html ?? ""]) {
				expect(part).toContain(what);
				expect(part).toContain("9 Oct 2026");
				expect(part).toContain("1:30");
				expect(part).toContain("Malaysia time");
				expect(part).toContain("If it was not,");
				// Nothing to click, so a forged copy has nothing to phish with.
				expect(part).not.toMatch(/https?:|href|www\.|wa\.me/i);
			}
		},
	);

	it("gives the sales WhatsApp number when there is one", async () => {
		vi.stubEnv("WHATSAPP_SALES_NUMBER", "+60 12-345 6789");
		await sendPasskeyChange("u1", "added", AT);
		expect(sendEmail.mock.calls[0][0].text).toContain(
			"message EzCabinet on WhatsApp at +60123456789",
		);
	});

	it("gives the workshop phone when there is no sales number", async () => {
		vi.stubEnv("WHATSAPP_SALES_NUMBER", "");
		await sendPasskeyChange("u1", "added", AT);
		expect(sendEmail.mock.calls[0][0].text).toMatch(/call EzCabinet on \S+/);
	});

	it("escapes the name in the HTML, and leaves it as typed in the text", async () => {
		findUnique.mockResolvedValue({
			email: "a@b.com",
			name: '<img src=x onerror="alert(1)">',
		});
		await sendPasskeyChange("u1", "added", AT);
		const message = sendEmail.mock.calls[0][0];
		expect(message.html).not.toContain("<img");
		expect(message.html).toContain("&lt;img");
		expect(message.text).toContain("<img");
	});

	it("greets an account with no name yet without one", async () => {
		findUnique.mockResolvedValue({ email: "a@b.com", name: "" });
		await sendPasskeyChange("u1", "added", AT);
		// The heading comes first now; the greeting is the next paragraph.
		expect(sendEmail.mock.calls[0][0].text).toContain("\n\nHello,\n\n");
	});

	it("sends nothing for an account that no longer exists", async () => {
		findUnique.mockResolvedValue(null);
		await sendPasskeyChange("gone", "reset", AT);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("does not throw when the mail is not sent", async () => {
		sendEmail.mockResolvedValueOnce(false);
		await expect(sendPasskeyChange("u1", "added", AT)).resolves.toBeUndefined();
	});
});

describe("queuePasskeyMail", () => {
	it("schedules the mail for after the response and sends nothing itself", () => {
		queuePasskeyMail("u1", "added");
		expect(after).toHaveBeenCalledTimes(1);
		expect(sendEmail).not.toHaveBeenCalled();
		expect(findUnique).not.toHaveBeenCalled();
	});

	it("sends to the account once the scheduled work runs", async () => {
		queuePasskeyMail("u1", "removed");
		await after.mock.calls[0][0]();
		expect(sendEmail.mock.calls[0][0].to).toBe("aiman@outlook.com");
		expect(sendEmail.mock.calls[0][0].subject).toContain("removed");
	});

	it("does not throw when there is no request to run after", () => {
		after.mockImplementationOnce(() => {
			throw new Error("after() called outside a request scope");
		});
		expect(() => queuePasskeyMail("u1", "added")).not.toThrow();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("swallows a failure inside the scheduled work", async () => {
		findUnique.mockRejectedValueOnce(new Error("database is down"));
		queuePasskeyMail("u1", "reset");
		await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
	});
});
