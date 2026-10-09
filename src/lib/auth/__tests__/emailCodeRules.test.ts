import { describe, expect, it } from "vitest";
import {
	CLOSED_PATHS,
	CODE_ATTEMPTS,
	CODE_TTL_S,
	CODES_PER_HOUR,
	codeRequest,
	mayUseCode,
	SEND_PATH,
	SEND_WINDOW_S,
	SIGN_IN_PATH,
	withinSendCap,
} from "@/lib/auth/emailCodeRules";

describe("mayUseCode", () => {
	it.each([
		["an address with no account", null, true],
		["a customer", { role: "CUSTOMER" as const }, true],
		["an admin", { role: "ADMIN" as const }, false],
		["a superadmin", { role: "SUPERADMIN" as const }, false],
	])("%s", (_label, row, expected) => {
		expect(mayUseCode(row)).toBe(expected);
	});
});

describe("the spec's numbers", () => {
	it("ten minutes, three tries, three codes an hour", () => {
		expect(CODE_TTL_S).toBe(600);
		expect(CODE_ATTEMPTS).toBe(3);
		expect(CODES_PER_HOUR).toBe(3);
		expect(SEND_WINDOW_S).toBe(3600);
	});
	it.each([
		[1, true],
		[3, true],
		[4, false],
		[40, false],
	])("send number %i in the hour", (n, expected) => {
		expect(withinSendCap(n)).toBe(expected);
	});
});

describe("codeRequest", () => {
	it.each([
		[
			"a sign-in code request",
			SEND_PATH,
			{ email: "a@b.com", type: "sign-in" },
			"send",
		],
		[
			"a code sign-in",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "123456" },
			"sign_in",
		],
		[
			"a verification code request",
			SEND_PATH,
			{ email: "a@b.com", type: "email-verification" },
			"refuse",
		],
		[
			"a reset code request",
			SEND_PATH,
			{ email: "a@b.com", type: "forget-password" },
			"refuse",
		],
		["a send with no type", SEND_PATH, { email: "a@b.com" }, "refuse"],
		["a send with no body", SEND_PATH, undefined, "refuse"],
		[
			"a sign-in posting a role",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "1", role: "SUPERADMIN" },
			"refuse",
		],
		[
			"a sign-in posting a name",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "1", name: "x" },
			"refuse",
		],
		["a sign-in with no body", SIGN_IN_PATH, undefined, "refuse"],
		["a route the plugin may add later", "/email-otp/new-thing", {}, "refuse"],
		["a longer sign-in path", "/sign-in/email-otp/extra", {}, "refuse"],
		["Google sign-in", "/sign-in/social", {}, "ignore"],
		["password sign-in", "/sign-in/email", {}, "ignore"],
		["a passkey route", "/passkey/verify-registration", {}, "ignore"],
		["an internal call with no path", undefined, {}, "ignore"],
	])("%s", (_label, path, body, expected) => {
		expect(codeRequest(path, body)).toBe(expected);
	});

	it.each(CLOSED_PATHS)("%s is refused even if it were reached", (path) => {
		expect(codeRequest(path, { email: "a@b.com" })).toBe("refuse");
	});

	it("closes exactly the seven routes the form never calls", () => {
		expect(CLOSED_PATHS).toHaveLength(7);
		expect(CLOSED_PATHS).not.toContain(SEND_PATH);
		expect(CLOSED_PATHS).not.toContain(SIGN_IN_PATH);
	});
});
