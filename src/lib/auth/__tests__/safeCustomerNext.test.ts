import { describe, expect, it } from "vitest";
import { safeCustomerNext, safeWelcomeNext } from "@/lib/auth/safeCustomerNext";

describe("safeCustomerNext", () => {
	it("keeps a same-site path", () => {
		expect(safeCustomerNext("/en/order/abc", "en")).toBe("/en/order/abc");
		expect(safeCustomerNext("/ms/planner/kitchen?step=quote", "ms")).toBe(
			"/ms/planner/kitchen?step=quote",
		);
	});
	it.each([
		["nothing", undefined],
		["empty", ""],
		["another site", "https://evil.example/x"],
		["protocol-relative", "//evil.example/x"],
		["backslash trick", "/\\evil.example"],
		["no leading slash", "en/orders"],
		["javascript", "javascript:alert(1)"],
		["tab after the slash", "/\t/evil.example"],
		["newline after the slash", "/\n/evil.example"],
		["carriage return after the slash", "/\r/evil.example"],
		["double backslash", "\\\\evil.example"],
		["encoded verify", "/en/%76erify"],
		["dot segment before verify", "/en/./verify"],
		["empty segment before verify", "/en//verify"],
		["upper-case verify", "/en/VERIFY?next=x"],
		["malformed encoding", "/%E0%A4%A"],
		["dot segments leave an empty one", "/a/..//evil.example"],
		["current dir then empty segment", "/.//evil.example"],
		["parent dir then empty segment", "/..//evil.example"],
		["dot segments with a path", "/en/..//evil.example/path"],
		["empty segment in the middle", "/en///orders"],
		["dot slash only", "/./"],
		["bare slash", "/"],
		// `?next=a&next=b` reaches the page as an array.
		["a repeated parameter", ["/en/orders", "/en/order/x"]],
		["a non-string", 42],
		// No locale: the proxy would add one and land on the verify page.
		["verify with no locale", "/verify"],
		["verify with no locale, upper-case", "/VERIFY"],
		["verify with no locale and a query", "/verify?next=/en/orders"],
		["an encoded slash before verify", "/en%2Fverify"],
		["dot segments back to verify", "/en/x/../verify"],
		["encoded slashes that decode to another site", "/%2F%2Fevil.example"],
		["an encoded empty segment further in", "/en/%2F%2Fevil.example"],
	] as [string, never][])("falls back to My orders for %s", (_label, next) => {
		expect(safeCustomerNext(next, "zh")).toBe("/zh/orders");
	});
	it("returns the normalised path, never the raw input", () => {
		expect(safeCustomerNext("/en/orders#top", "en")).toBe("/en/orders#top");
		expect(safeCustomerNext("/en/orders/../orders", "en")).toBe("/en/orders");
		expect(safeCustomerNext("/en/orders/", "en")).toBe("/en/orders/");
	});
	// The name step is not this export's own page: a customer who owes no
	// name is passed straight through it.
	it.each([
		["/welcome", "/welcome"],
		["/welcome?next=/en/orders", "/welcome?next=/en/orders"],
		["/en%2Fwelcome", "/en%2Fwelcome"],
		["/en/x/../welcome", "/en/welcome"],
	])("leaves the name step alone: %s", (next, expected) => {
		expect(safeCustomerNext(next, "en")).toBe(expected);
	});
	it("never sends the customer back to the verify page itself", () => {
		expect(safeCustomerNext("/en/verify?next=/en/verify", "en")).toBe(
			"/en/orders",
		);
	});
});

describe("safeWelcomeNext", () => {
	it("never sends the customer back to the name step itself", () => {
		for (const next of [
			"/en/welcome?next=/en/orders",
			"/en/WELCOME",
			"/en/%77elcome",
			"/en/./welcome",
			// No locale: the proxy would add one and land here again.
			"/welcome",
			"/WELCOME",
			"/welcome?next=/en/orders",
			"/en%2Fwelcome",
			"/en/x/../welcome",
		]) {
			expect(safeWelcomeNext(next, "en")).toBe("/en");
		}
	});
	it("keeps a same-site path, the verify bounce included", () => {
		expect(safeWelcomeNext("/en/planner/kitchen?a=1#quote", "en")).toBe(
			"/en/planner/kitchen?a=1#quote",
		);
		expect(safeWelcomeNext("/ms/verify?next=%2Fms%2Forder%2Fabc", "ms")).toBe(
			"/ms/verify?next=%2Fms%2Forder%2Fabc",
		);
		// Allowed with a locale, so allowed without: the proxy adds one.
		expect(safeWelcomeNext("/verify", "ms")).toBe("/verify");
	});
	it.each([
		["nothing", undefined],
		["empty", ""],
		["another site", "https://evil.example/x"],
		["protocol-relative", "//evil.example/x"],
		["backslash trick", "/\\evil.example"],
		["no leading slash", "en/orders"],
		["javascript", "javascript:alert(1)"],
		["tab after the slash", "/\t/evil.example"],
		["newline after the slash", "/\n/evil.example"],
		["carriage return after the slash", "/\r/evil.example"],
		["double backslash", "\\\\evil.example"],
		["malformed encoding", "/%E0%A4%A"],
		["dot segments leave an empty one", "/a/..//evil.example"],
		["current dir then empty segment", "/.//evil.example"],
		["parent dir then empty segment", "/..//evil.example"],
		["dot segments with a path", "/en/..//evil.example/path"],
		["empty segment in the middle", "/en///orders"],
		["empty segment before verify", "/en//verify"],
		["dot slash only", "/./"],
		["bare slash", "/"],
		["a repeated parameter", ["/en/orders", "/en/order/x"]],
		["a non-string", 42],
		["encoded slashes that decode to another site", "/%2F%2Fevil.example"],
		["an encoded empty segment further in", "/en/%2F%2Fevil.example"],
	] as [string, never][])("falls back to home for %s", (_label, next) => {
		expect(safeWelcomeNext(next, "zh")).toBe("/zh");
	});
});
