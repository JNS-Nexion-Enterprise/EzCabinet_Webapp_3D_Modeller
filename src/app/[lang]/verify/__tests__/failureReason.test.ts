import { describe, expect, it } from "vitest";
import { failureReason } from "../failureReason";

describe("failureReason", () => {
	it("calls a stale session stale", () => {
		expect(failureReason("SESSION_NOT_FRESH")).toBe("stale");
	});
	it("calls a dismissed prompt cancelled", () => {
		expect(failureReason("AUTH_CANCELLED")).toBe("cancelled");
		expect(failureReason("ERROR_CEREMONY_ABORTED")).toBe("cancelled");
	});
	it("calls anything else other", () => {
		expect(failureReason("PASSKEY_NOT_YOURS")).toBe("other");
		expect(failureReason(undefined)).toBe("other");
	});
});
