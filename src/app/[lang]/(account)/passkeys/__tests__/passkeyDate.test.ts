import { describe, expect, it } from "vitest";
import { passkeyDate } from "../passkeyDate";

describe("passkeyDate", () => {
	it("shows the Malaysia calendar day, not the UTC one", () => {
		// 17:30 UTC on 6 Oct is 01:30 on 7 Oct in Kuala Lumpur.
		expect(passkeyDate("2026-10-06T17:30:00Z", "en")).toBe("Oct 7, 2026");
	});

	it("is empty when the passkey has no creation date", () => {
		expect(passkeyDate(null, "en")).toBe("");
	});
});
