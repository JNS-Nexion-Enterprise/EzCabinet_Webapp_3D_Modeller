import { describe, expect, it } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import { bankChange } from "../templates/bankChange";
import { signInCode } from "../templates/signInCode";
import { staffInvite } from "../templates/staffInvite";
import { staffReset } from "../templates/staffReset";

describe("staffReset", () => {
	const mail = staffReset({
		company: testCompany(),
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
		company: testCompany(),
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

	it("signs with the saved brand", () => {
		const mail = staffInvite({
			...input,
			company: testCompany({ brand: "Kabinet Baru" }),
		});
		expect(mail.subject).toBe("You've been invited to Kabinet Baru Admin");
	});

	it("does not mention a password to a Google-only account", () => {
		const mail = staffInvite({ ...input, hasPassword: false });
		expect(mail.text).not.toContain("password");
		expect(mail.html).not.toContain("password");
	});
});

describe("bankChange", () => {
	const input = {
		company: testCompany(),
		actorName: "Aisyah",
		when: "21 Oct 2026, 3:04 pm (Malaysia time)",
		before: { bankName: "Maybank", last4: "6789" },
		after: { bankName: "CIMB", last4: "1222" },
	};

	it("names who, when, and the last four of each account", () => {
		const mail = bankChange(input);
		expect(mail.subject).toBe(
			"The bank account for customer payments was changed",
		);
		expect(mail.text).toContain("Aisyah");
		expect(mail.text).toContain(input.when);
		expect(mail.text).toContain("Maybank, account ending 6789");
		expect(mail.text).toContain("CIMB, account ending 1222");
	});

	it("says so when there was no account number", () => {
		const mail = bankChange({
			...input,
			before: { bankName: "Maybank", last4: "" },
		});
		expect(mail.text).toContain("no account number");
	});

	it("never prints the full number and carries no link", () => {
		const mail = bankChange(input);
		expect(mail.text).not.toContain("562123456789");
		expect(mail.html).not.toContain("562123456789");
		expect(mail.html).not.toContain("href");
	});
});

describe("signInCode", () => {
	it.each(["en", "ms", "zh"] as const)(
		"%s: shows the code, no link, nothing unfilled",
		(locale) => {
			const mail = signInCode({
				company: testCompany(),
				locale,
				code: "482916",
				minutes: 10,
			});
			expect(mail.subject).toContain("482916");
			expect(mail.text).toContain("482916");
			expect(mail.html).toContain("482916");
			expect(mail.text).toContain("10");
			expect(mail.html).not.toContain("<a ");
			expect(mail.subject + mail.text).not.toMatch(/\{\w+\}/);
		},
	);
});
