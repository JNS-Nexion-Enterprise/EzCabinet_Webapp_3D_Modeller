import { describe, expect, it } from "vitest";
import {
	customerEvents,
	deliveryRef,
	readItems,
	shipmentBooked,
	trackingTone,
} from "../publicTracking";

describe("shipmentBooked", () => {
	it("is false while the job is still being typed in or priced", () => {
		expect(shipmentBooked("DRAFT")).toBe(false);
		expect(shipmentBooked("QUOTED")).toBe(false);
	});
});

describe("trackingTone", () => {
	it("does not tell a cancelled job's customer it is being prepared", () => {
		expect(trackingTone("CANCELLED")).toBe("stopped");
		expect(trackingTone("FAILED")).toBe("stopped");
	});

	it("greets a delivered job as arrived rather than as in progress", () => {
		expect(trackingTone("DELIVERED")).toBe("delivered");
	});
});

describe("deliveryRef", () => {
	it("pads the job number under the prefix it was made with", () => {
		expect(deliveryRef({ refPrefix: "PO", number: 41 })).toBe("PO-00041");
		expect(deliveryRef({ refPrefix: null, number: 120_000 })).toBe("IC-120000");
	});
});

describe("customerEvents", () => {
	it("drops entries that are not a delivery transition", () => {
		expect(
			customerEvents([
				{ at: "2026-08-27T09:20:00.000Z", status: "PICKED_UP" },
				// A quote fan-out or an edit: no status, admin wording.
				{ at: "2026-08-26T16:05:00.000Z", status: null },
				// Our procurement, not the customer's delivery.
				{ at: "2026-08-26T15:12:00.000Z", status: "QUOTED" },
			]),
		).toEqual([{ at: "2026-08-27T09:20:00.000Z", status: "PICKED_UP" }]);
	});
});

const line = (label: string, qty = 1) => ({
	label,
	qty,
	widthMm: 900,
	heightMm: 720,
	depthMm: 560,
	weightKg: null,
});

describe("readItems", () => {
	it("keeps the readable lines when one of them is not", () => {
		const items = readItems([
			line("Base cabinet 900mm"),
			{ label: "", qty: 0 },
			line("Wall cabinet 600mm"),
		]);
		expect(items.map((entry) => entry.item.label)).toEqual([
			"Base cabinet 900mm",
			"Wall cabinet 600mm",
		]);
	});

	it("gives two identical lines distinct keys", () => {
		const keys = readItems([
			line("Soft-close runner", 6),
			line("Soft-close runner", 6),
		]).map((entry) => entry.key);
		expect(new Set(keys).size).toBe(2);
	});
});
