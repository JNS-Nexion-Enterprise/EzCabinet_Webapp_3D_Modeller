import { describe, expect, it } from "vitest";
import { canEditDetails } from "@/lib/orders/editDetails";

const open = {
	status: "AWAITING_PAYMENT",
	productionStage: null,
	hasDelivery: false,
} as const;

describe("canEditDetails", () => {
	it.each([
		["an unpaid order", open, true],
		["a paid order not yet in production", { ...open, status: "PAID" }, true],
		["a cancelled order", { ...open, status: "CANCELLED" }, false],
		[
			"an order in production",
			{ ...open, status: "PAID", productionStage: "CUTTING" },
			false,
		],
		[
			"an order with a delivery",
			{ ...open, status: "PAID", hasDelivery: true },
			false,
		],
	] as const)("%s → %s", (_, order, expected) => {
		expect(canEditDetails(order)).toBe(expected);
	});
});
