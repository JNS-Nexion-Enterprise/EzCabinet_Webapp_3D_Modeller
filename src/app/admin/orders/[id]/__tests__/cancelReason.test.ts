import { describe, expect, it } from "vitest";
import { cancelReasonError } from "../cancelReason";

describe("cancelReasonError", () => {
	it("asks a paid order for a reason, blanks included", () => {
		expect(cancelReasonError(true, "")).toBe("Enter a reason for cancelling.");
		expect(cancelReasonError(true, "   ")).toBe(
			"Enter a reason for cancelling.",
		);
	});

	it("is satisfied by a reason, and never asks an unpaid order", () => {
		expect(cancelReasonError(true, "Customer changed their mind")).toBeNull();
		expect(cancelReasonError(false, "")).toBeNull();
	});
});
