import { describe, expect, it } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import { companyDetailsSchema } from "@/lib/company/details";
import { fieldErrors, gdexNotice, readPin } from "../form";

describe("readPin", () => {
	it("reads latitude, longitude", () =>
		expect(readPin("2.98489, 101.86181")).toEqual({
			ok: true,
			lat: 2.98489,
			lng: 101.86181,
		}));
	it("reads a full Google Maps link", () =>
		expect(
			readPin(
				"https://www.google.com/maps/place/X/@2.9,101.8,17z/data=!3d2.9848868!4d101.861807",
			),
		).toMatchObject({ ok: true, lat: 2.9848868 }));
	it("explains a short link instead of failing silently", () =>
		expect(readPin("https://maps.app.goo.gl/abc123")).toEqual({
			ok: false,
			message:
				"That is a short link. Open it, then copy the full address from the browser bar.",
		}));
	it("asks for a pin when the box is empty", () =>
		expect(readPin(" ")).toEqual({
			ok: false,
			message:
				"Enter the pin as latitude, longitude, or paste a Google Maps link.",
		}));
	it("says what it could not read", () =>
		expect(readPin("near the mamak")).toEqual({
			ok: false,
			message:
				"Could not read a pin from that. Use latitude, longitude, like 2.98489, 101.86181.",
		}));
});

describe("fieldErrors", () => {
	it("words each failing field once", () => {
		const parsed = companyDetailsSchema.safeParse({
			...testCompany(),
			ssmNumber: "",
			postcode: "4380",
			lat: 101.8,
		});
		expect(parsed.success).toBe(false);
		if (!parsed.success)
			expect(fieldErrors(parsed.error)).toEqual({
				postcode: "Five digits.",
				lat: "The pin must be inside Malaysia.",
			});
	});
});

describe("gdexNotice", () => {
	it("says nothing when GDEX is not set up", () =>
		expect(gdexNotice(false, null, "43800")).toBeNull());
	it("still renders when GDEX did not answer", () =>
		expect(gdexNotice(true, null, "43800")).toEqual({ kind: "unchecked" }));
	it("warns when GDEX would collect from another postcode", () =>
		expect(gdexNotice(true, "43900", "43800")).toEqual({
			kind: "mismatch",
			gdexPostcode: "43900",
		}));
	it("only reminds when they agree", () =>
		expect(gdexNotice(true, "43800", "43800")).toEqual({ kind: "reminder" }));
});
