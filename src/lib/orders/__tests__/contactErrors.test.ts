import { describe, expect, it } from "vitest";
import { contactErrors } from "@/lib/orders/contactErrors";

const ok = {
	name: "Nur Aisyah",
	phone: "+60123456789",
	email: "a@b.my",
	siteAddress: "12 Jalan Meranti 4",
	emailRequired: false,
	emailValid: true,
};

describe("contactErrors", () => {
	it("passes a complete contact", () => {
		expect(contactErrors(ok)).toEqual({});
	});

	it("reports everything at once, in field order", () => {
		const errors = contactErrors({
			...ok,
			name: "",
			phone: "",
			siteAddress: "",
		});
		expect(Object.keys(errors)).toEqual(["name", "phone", "siteAddress"]);
		expect(errors).toEqual({
			name: "required",
			phone: "required",
			siteAddress: "required",
		});
	});

	it("tells an unreadable phone from a missing one", () => {
		expect(contactErrors({ ...ok, phone: "+60abc" }).phone).toBe("invalid");
		expect(contactErrors({ ...ok, phone: "+60" }).phone).toBe("invalid");
		expect(contactErrors({ ...ok, phone: "0123456789" }).phone).toBeUndefined();
	});

	it("needs an email only when asked to, and trusts the browser on syntax", () => {
		const blank = { ...ok, email: "" };
		expect(contactErrors(blank).email).toBeUndefined();
		expect(contactErrors({ ...blank, emailRequired: true }).email).toBe(
			"required",
		);
		expect(contactErrors({ ...ok, email: "x", emailValid: false }).email).toBe(
			"invalid",
		);
	});

	it("calls an address under five characters short, not missing", () => {
		expect(contactErrors({ ...ok, siteAddress: "abcd" }).siteAddress).toBe(
			"short",
		);
		expect(contactErrors({ ...ok, siteAddress: "abcde" }).siteAddress).toBe(
			undefined,
		);
	});
});
