import { describe, expect, it } from "vitest";
import {
	checkDeliveryForm,
	deliveryErrors,
	itemKey,
	itemRowMessage,
} from "../fieldErrors";
import { blankForm, emptyItem } from "../form";

const filled = () => ({
	...blankForm("Workshop"),
	customerName: "Tan",
	customerPhone: "012",
	siteAddress: "12 Jalan Setia",
});

describe("checkDeliveryForm", () => {
	it("passes a filled form", () => {
		expect(checkDeliveryForm(filled())).toEqual({});
	});

	it("marks every empty required field", () => {
		const errors = checkDeliveryForm(blankForm(""));
		expect(Object.keys(errors).sort()).toEqual([
			"customerName",
			"customerPhone",
			"pickupAddress",
			"siteAddress",
		]);
	});

	it("marks the empty size on its own row", () => {
		const state = filled();
		state.items = [
			{ ...emptyItem(), label: "BC 600" },
			{ ...emptyItem(), label: "BC 800", widthMm: 0 },
		];
		const errors = checkDeliveryForm(state);
		expect(Object.keys(errors)).toEqual([
			itemKey(state.items[1].uid, "widthMm"),
		]);
		expect(itemRowMessage(errors, state.items[1].uid)).toBe(
			"Width: Enter whole millimetres, 1 to 10,000.",
		);
		expect(itemRowMessage(errors, state.items[0].uid)).toBeNull();
	});

	it("ignores a row with no name, as the payload does", () => {
		const state = filled();
		state.items = [{ ...emptyItem(), widthMm: 0 }];
		expect(checkDeliveryForm(state)).toEqual({});
	});
});

describe("deliveryErrors", () => {
	it("maps a server row index past an unnamed row", () => {
		const state = filled();
		state.items = [
			{ ...emptyItem(), label: "" },
			{ ...emptyItem(), label: "Door", weightKg: 5000 },
		];
		const errors = deliveryErrors([{ path: ["items", 0, "weightKg"] }], state);
		expect(Object.keys(errors)).toEqual([
			itemKey(state.items[1].uid, "weightKg"),
		]);
	});

	it("drops paths no input carries", () => {
		expect(
			deliveryErrors(
				[{ path: ["siteLat"] }, { path: ["items", 9, "qty"] }],
				filled(),
			),
		).toEqual({});
	});
});
