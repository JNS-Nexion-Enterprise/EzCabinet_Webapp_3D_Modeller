import { describe, expect, it } from "vitest";
import {
	canStart,
	cleanCode,
	looksLikeEmail,
	maySendAgain,
	normaliseEmail,
	RESEND_AFTER_S,
	sendFailure,
	verifyFailure,
} from "../emailCode";

describe("normaliseEmail", () => {
	it.each([
		["Aiman@Outlook.com", "aiman@outlook.com"],
		["  aiman@outlook.com ", "aiman@outlook.com"],
		["aiman@outlook.com\n", "aiman@outlook.com"],
		// Full-width, from a Chinese keyboard.
		["ａｉｍａｎ＠ｏｕｔｌｏｏｋ．ｃｏｍ", "aiman@outlook.com"],
	])("%j", (typed, expected) => {
		expect(normaliseEmail(typed)).toBe(expected);
	});
});

describe("looksLikeEmail", () => {
	it.each([
		["aiman@outlook.com", true],
		["a.b+c@mail.example.my", true],
		["aiman@outlook", false],
		["aiman outlook.com", false],
		["aiman@@outlook.com", false],
		["@outlook.com", false],
		["", false],
	])("%j", (address, expected) => {
		expect(looksLikeEmail(address)).toBe(expected);
	});
});

describe("cleanCode", () => {
	it.each([
		["482913", "482913"],
		["482 913", "482913"],
		[" 482913\n", "482913"],
		["482-913", "482913"],
		["Your EzCabinet sign-in code is 482913", "482913"],
		["４８２９１３", "482913"],
		["4829137", "482913"],
		["", ""],
	])("%j", (typed, expected) => {
		expect(cleanCode(typed)).toBe(expected);
	});
});

describe("what the customer is told", () => {
	it.each([
		[{ status: 400, code: "INVALID_OTP" }, "wrongCode"],
		[{ status: 400, code: "OTP_EXPIRED" }, "codeExpired"],
		[{ status: 403, code: "TOO_MANY_ATTEMPTS" }, "codeExpired"],
		[{ status: 429 }, "codeExpired"],
		[{ status: 500 }, "failed"],
		// The request never left the phone.
		[{}, "failed"],
	])("a failed code %j", (error, expected) => {
		expect(verifyFailure(error)).toBe(expected);
	});

	it.each([
		[429, "tooMany"],
		[403, "failed"],
		[500, "failed"],
		[undefined, "failed"],
	])("a failed send, status %s", (status, expected) => {
		expect(sendFailure(status)).toBe(expected);
	});

	it("stops the form at the server's cap, before the request that would be dropped", () => {
		expect(maySendAgain(0)).toBe(true);
		expect(maySendAgain(2)).toBe(true);
		expect(maySendAgain(3)).toBe(false);
	});

	it("holds the resend back thirty seconds", () => {
		expect(RESEND_AFTER_S).toBe(30);
	});
});

// WhatsApp's, Facebook's and most mail apps' built-in browsers have no
// passkeys, so the journey cannot finish there.
describe("canStart", () => {
	it.each([
		["before the browser has been asked", null, "wait"],
		["a browser with passkeys", true, "go"],
		["an in-app browser", false, "blocked"],
	] as const)("%s", (_label, supported, expected) => {
		expect(canStart(supported)).toBe(expected);
	});
});
