import { describe, expect, it } from "vitest";
import { malaysianNational, toE164 } from "../phone";

describe("toE164", () => {
	it("turns a local mobile number into +60", () => {
		expect(toE164("012-345 6789")).toBe("+60123456789");
	});

	it("keeps a number that already carries the country code", () => {
		expect(toE164("+60 12 345 6789")).toBe("+60123456789");
		expect(toE164("60123456789")).toBe("+60123456789");
	});

	it("strips the punctuation an admin types", () => {
		expect(toE164("(012) 345-6789")).toBe("+60123456789");
	});

	it("keeps a foreign number as given", () => {
		expect(toE164("+6591234567")).toBe("+6591234567");
	});

	it("reads the workshop landline", () => {
		expect(toE164("03-1234 5678")).toBe("+60312345678");
	});

	it("drops a trunk 0 typed after the country code", () => {
		// Read literally this is +600123456789: a valid-looking wrong number.
		expect(toE164("+60 012-345 6789")).toBe("+60123456789");
		expect(toE164("60 012 345 6789")).toBe("+60123456789");
		expect(toE164("+60 (0)3-1234 5678")).toBe("+60312345678");
	});

	it("reads every Malaysian shape: 10 to 12 digits with the country code", () => {
		expect(toE164("088-123456")).toBe("+6088123456");
		expect(toE164("011-1234 5678")).toBe("+601112345678");
	});

	it("refuses a Malaysian number that is too short or too long", () => {
		expect(toE164("012-3456")).toBeNull();
		expect(toE164("+60 12 345")).toBeNull();
		expect(toE164("012-345 6789 01")).toBeNull();
	});

	it("returns null for something that is not a number", () => {
		expect(toE164("call the office")).toBeNull();
		expect(toE164("")).toBeNull();
		expect(toE164("123")).toBeNull();
	});
});

describe("malaysianNational", () => {
	it("keeps only the digits after +60", () => {
		expect(malaysianNational("012-345 6789")).toBe("123456789");
		expect(malaysianNational("12 345 6789")).toBe("123456789");
		expect(malaysianNational("011-1234 5678")).toBe("1112345678");
	});

	it("drops a country code that was pasted or autofilled in", () => {
		expect(malaysianNational("+60 12-345 6789")).toBe("123456789");
		expect(malaysianNational("+60 012-345 6789")).toBe("123456789");
		expect(malaysianNational("60123456789")).toBe("123456789");
	});

	it("drops letters and stops at ten digits", () => {
		expect(malaysianNational("call 012")).toBe("12");
		expect(malaysianNational("1234567890123")).toBe("1234567890");
		expect(malaysianNational("")).toBe("");
	});

	it("feeds toE164 a number it accepts", () => {
		expect(toE164(`+60${malaysianNational("03-1234 5678")}`)).toBe(
			"+60312345678",
		);
	});
});
