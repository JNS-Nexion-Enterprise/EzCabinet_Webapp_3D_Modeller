import { describe, expect, it } from "vitest";
import { safeCustomerNext } from "@/lib/auth/safeCustomerNext";

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
	])("falls back to My orders for %s", (_label, next) => {
		expect(safeCustomerNext(next, "zh")).toBe("/zh/orders");
	});
	it("never sends the customer back to the verify page itself", () => {
		expect(safeCustomerNext("/en/verify?next=/en/verify", "en")).toBe(
			"/en/orders",
		);
	});
});
