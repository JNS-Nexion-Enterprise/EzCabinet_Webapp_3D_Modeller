import { describe, expect, it } from "vitest";
import { checkBatchRow, checkDesignForm, designErrorsFromReply } from "../form";

const ok = {
	name: "BC 800mm",
	w: "800",
	h: "720",
	d: "560",
	price: "450",
	weight: "",
	sku: "ICB-0001",
};

describe("checkDesignForm", () => {
	it("passes a filled form, weight optional, price 0 allowed", () => {
		expect(checkDesignForm(ok)).toEqual({});
		expect(checkDesignForm({ ...ok, price: "0" })).toEqual({});
	});

	it("marks empty required fields", () => {
		expect(
			Object.keys(
				checkDesignForm({ ...ok, name: " ", w: "", price: "", sku: "" }),
			),
		).toEqual(["name", "w", "price", "sku"]);
	});

	it("wants whole millimetres, as the server does", () => {
		const errors = checkDesignForm({ ...ok, w: "800.5", h: "0", d: "-3" });
		expect(Object.keys(errors)).toEqual(["w", "h", "d"]);
		expect(errors.w).toBe("Enter whole millimetres above 0, like 800.");
	});

	it("marks a weight that would silently have become null", () => {
		expect(checkDesignForm({ ...ok, weight: "0" }).weight).toBe(
			"Enter a weight above 0 kg, or leave it empty.",
		);
		expect(checkDesignForm({ ...ok, weight: "-1" }).weight).toBeDefined();
		expect(checkDesignForm({ ...ok, weight: "12.5" })).toEqual({});
	});
});

describe("checkBatchRow", () => {
	it("marks a missing SKU and price on the row", () => {
		expect(checkBatchRow({ sku: "", price: " " })).toEqual({
			sku: "Enter the SKU, like ICB-0000.",
			price: "Enter the price in RM, 0 or more.",
		});
		expect(checkBatchRow({ sku: "A", price: "0" })).toEqual({});
	});
});

describe("designErrorsFromReply", () => {
	it("maps issues onto the form's fields", () => {
		const errors = designErrorsFromReply({
			error: "invalid_body",
			issues: [
				{ path: ["widthMm"] },
				{ path: ["priceRm"] },
				{ path: ["rooms"] },
			],
		});
		expect(Object.keys(errors)).toEqual(["w", "price"]);
	});

	it("puts a taken SKU on the SKU field", () => {
		expect(designErrorsFromReply({ error: "sku_taken" })).toEqual({
			sku: "That SKU is already in use.",
		});
	});

	it("marks nothing for a reply no field can carry", () => {
		expect(designErrorsFromReply({ error: "duplicate" })).toEqual({});
		expect(designErrorsFromReply(null)).toEqual({});
	});
});
