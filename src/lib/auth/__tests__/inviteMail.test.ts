import { describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
	vi.fn(async (_message: { to: string; text: string; html?: string }) => true),
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendStaffInvite } = await import("@/lib/auth/inviteMail");

const invite = {
	to: "a@b.com",
	name: "Ali",
	inviterName: "Jack",
	role: "ADMIN" as const,
	base: "https://x.test/",
	hasPassword: true,
};

describe("sendStaffInvite", () => {
	it("mails the sign-in link to the invited address", async () => {
		await sendStaffInvite(invite);
		const message = sendEmail.mock.calls[0][0];
		expect(message.to).toBe("a@b.com");
		expect(message.text).toContain("https://x.test/admin/login");
		expect(message.html).toContain('href="https://x.test/admin/login"');
		expect(message.text).toContain("temporary password");
	});

	it("does not mention a password to a promoted Google account", async () => {
		sendEmail.mockClear();
		await sendStaffInvite({ ...invite, hasPassword: false });
		const message = sendEmail.mock.calls[0][0];
		expect(message.text).not.toContain("password");
		expect(message.html).not.toContain("password");
	});

	it("escapes typed names in the HTML", async () => {
		sendEmail.mockClear();
		await sendStaffInvite({
			...invite,
			name: "<img src=x>",
			inviterName: '"><script>',
		});
		const html = sendEmail.mock.calls[0][0].html ?? "";
		expect(html).not.toContain("<img src=x>");
		expect(html).not.toContain("<script>");
	});
});
