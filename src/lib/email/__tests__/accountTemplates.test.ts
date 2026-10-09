import { describe, expect, it } from "vitest";
import { signInCode } from "../templates/signInCode";
import { staffInvite } from "../templates/staffInvite";
import { staffReset } from "../templates/staffReset";

describe("staffReset", () => {
	const mail = staffReset({
		name: "Ali",
		link: "https://x.test/admin/reset-password?token=abc",
	});

	it("carries the link in both parts", () => {
		expect(mail.subject).toBe("Reset your EzCabinet admin password");
		expect(mail.text).toContain(
			"https://x.test/admin/reset-password?token=abc",
		);
		expect(mail.html).toContain(
			'href="https://x.test/admin/reset-password?token=abc"',
		);
	});

	it("says the second factor still applies", () => {
		expect(mail.text).toContain("authenticator code");
		expect(mail.text).toContain("one hour");
	});
});

describe("staffInvite", () => {
	const input = {
		name: "Ali",
		inviterName: "Jack",
		role: "Admin",
		roleDescription: "Manage orders.",
		link: "https://x.test/admin/login",
		to: "a@b.com",
		hasPassword: true,
	};

	it("shows the role and the sign-in link", () => {
		const mail = staffInvite(input);
		expect(mail.subject).toBe("You've been invited to EzCabinet Admin");
		expect(mail.text).toContain("Your role: Admin");
		expect(mail.html).toContain('href="https://x.test/admin/login"');
	});

	it("does not mention a password to a Google-only account", () => {
		const mail = staffInvite({ ...input, hasPassword: false });
		expect(mail.text).not.toContain("password");
		expect(mail.html).not.toContain("password");
	});
});

describe("signInCode", () => {
	it.each(["en", "ms", "zh"] as const)(
		"%s: shows the code, no link, nothing unfilled",
		(locale) => {
			const mail = signInCode({ locale, code: "482916", minutes: 10 });
			expect(mail.subject).toContain("482916");
			expect(mail.text).toContain("482916");
			expect(mail.html).toContain("482916");
			expect(mail.text).toContain("10");
			expect(mail.html).not.toContain("<a ");
			expect(mail.subject + mail.text).not.toMatch(/\{\w+\}/);
		},
	);
});
