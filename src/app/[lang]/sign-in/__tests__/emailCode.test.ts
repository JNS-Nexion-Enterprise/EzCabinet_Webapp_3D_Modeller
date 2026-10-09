import { describe, expect, it } from "vitest";
import {
	canStart,
	cleanCode,
	isFullCode,
	looksLikeEmail,
	maySendAgain,
	maySendTo,
	normaliseEmail,
	RESEND_AFTER_S,
	recordSend,
	secondsLeft,
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
		// The server refused an address the form let through: `a@b.c`,
		// `a..b@x.com`, one with a zero-width space in it.
		[400, "emailInvalid"],
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

// "Use a different email" and back again must not buy a fourth code: the
// server would mail nothing and delete the third.
describe("sends are counted per address", () => {
	it("refuses the fourth send to one address, however it is typed", () => {
		const counts = new Map<string, number>();
		for (const typed of [
			"aiman@outlook.com",
			" Aiman@Outlook.com",
			"ａiman@outlook.com",
		]) {
			expect(maySendTo(counts, typed)).toBe(true);
			recordSend(counts, typed);
		}
		expect(maySendTo(counts, "aiman@outlook.com")).toBe(false);
		expect(maySendTo(counts, "AIMAN@outlook.com ")).toBe(false);
	});

	it("counts another address on its own", () => {
		const counts = new Map<string, number>();
		for (let i = 0; i < 3; i++) recordSend(counts, "aiman@outlook.com");
		expect(maySendTo(counts, "siti@outlook.com")).toBe(true);
		recordSend(counts, "siti@outlook.com");
		expect(maySendTo(counts, "siti@outlook.com")).toBe(true);
		expect(maySendTo(counts, "aiman@outlook.com")).toBe(false);
	});
});

// A short code would still cost one of the three tries.
describe("isFullCode", () => {
	it.each([
		["482913", true],
		["482 913", true],
		["４８２９１３", true],
		["Your code is 482913", true],
		["48291", false],
		["482 91", false],
		["abcdef", false],
		["", false],
	])("%j", (typed, expected) => {
		expect(isFullCode(typed)).toBe(expected);
	});
});

// Read off the clock, not counted down: a timer stops while the tab is in
// the background, which is when the customer is in their mail app.
describe("secondsLeft", () => {
	const deadline = 1_000_000;
	it.each([
		["just sent", deadline - 30_000, 30],
		["a moment later", deadline - 29_001, 30],
		["half way", deadline - 15_000, 15],
		["the last instant", deadline - 1, 1],
		["on the deadline", deadline, 0],
		["back from the mail app a minute later", deadline + 60_000, 0],
	])("%s", (_label, now, expected) => {
		expect(secondsLeft(deadline, now)).toBe(expected);
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
