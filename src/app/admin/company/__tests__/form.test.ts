import { describe, expect, it } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import { companyDetailsSchema } from "@/lib/company/details";
import {
	addressNeedsPin,
	fieldErrors,
	gdexNotice,
	mapFailure,
	oneLine,
	pinStatus,
	placeFields,
	readPin,
	tidyAddress,
} from "../form";

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
			expect(fieldErrors(parsed.error.issues)).toEqual({
				postcode: "Five digits.",
				lat: "The pin must be inside Malaysia.",
			});
	});

	it("reads the server's issues, whose paths start with details", () =>
		expect(
			fieldErrors(
				[
					{ path: ["details", "phone"] },
					{ path: ["details", "nope"] },
					{ path: ["loadedAt"] },
					{ path: ["details", "phone"] },
				],
				"details",
			),
		).toEqual({ phone: "Enter a Malaysian number a courier can call." }));

	it("is empty for a reply with no issues", () =>
		expect(fieldErrors(undefined, "details")).toEqual({}));
});

describe("placeFields", () => {
	it("empties a part Google did not give rather than keeping the old one", () =>
		expect(
			placeFields({ postcode: null, city: "Subang Jaya", state: "MY-10" }),
		).toEqual({ postcode: "", city: "Subang Jaya", state: "MY-10" }));
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

describe("addressNeedsPin", () => {
	it("asks for a pin only when the address changed and the pin was not confirmed", () => {
		expect(addressNeedsPin("Lot 5", "Lot 9", false)).toBe(true);
		expect(addressNeedsPin("Lot 5", " Lot 5 ", false)).toBe(false);
		expect(addressNeedsPin("Lot 5", "Lot 9", true)).toBe(false);
	});
	it("compares the address as it would be saved, so the status line and Save agree", () => {
		expect(addressNeedsPin("Lot 5, Jalan A", "Lot 5, Jalan A, ", false)).toBe(
			false,
		);
		expect(addressNeedsPin("Lot 5, Jalan A", "Lot 5\nJalan A\n", false)).toBe(
			false,
		);
	});
});

describe("oneLine", () => {
	it("joins a pasted letterhead address with commas", () =>
		expect(
			oneLine("Lot 5, Jalan Industri\nTaman Perindustrian\n43800 Dengkil"),
		).toBe("Lot 5, Jalan Industri, Taman Perindustrian, 43800 Dengkil"));
	it("does not double a comma already at the line end", () =>
		expect(oneLine("Lot 5,\nJalan Industri")).toBe("Lot 5, Jalan Industri"));
	it("treats CRLF and blank lines as one break", () =>
		expect(oneLine("Lot 5\r\n\r\n  Jalan Industri")).toBe(
			"Lot 5, Jalan Industri",
		));
	it("leaves a single line alone, trailing space included", () =>
		expect(oneLine("Lot 5 ")).toBe("Lot 5 "));
	it("does not double a comma that starts the next line", () =>
		expect(oneLine("Lot 5\n, Jalan Industri")).toBe("Lot 5, Jalan Industri"));
});

describe("tidyAddress", () => {
	it("drops the comma a trailing line break leaves", () =>
		expect(tidyAddress(oneLine("Lot 5\nDengkil\n"))).toBe("Lot 5, Dengkil"));
	it("drops the comma a leading line break leaves", () =>
		expect(tidyAddress(oneLine("\nLot 5\nDengkil"))).toBe("Lot 5, Dengkil"));
	it("joins the lines of a paste by itself", () =>
		expect(tidyAddress("Lot 5\nDengkil\n")).toBe("Lot 5, Dengkil"));
});

describe("mapFailure", () => {
	const DOWN =
		"Could not reach Google Maps. Try again, or set the pin by hand below.";
	it.each([[null], [200], [502]])("calls %s a Google outage", (status) =>
		expect(mapFailure(status)).toBe(DOWN),
	);
	it("does not tell an admin to retry an address the route will always refuse", () =>
		expect(mapFailure(400)).toBe(
			"That address is too long to check. Shorten it, or set the pin by hand below.",
		));
	it.each([[401], [403]])(
		"sends a refused session to sign in on %s",
		(status) =>
			expect(mapFailure(status)).toBe(
				"You are no longer signed in here. Reload the page, then check the address.",
			),
	);
});

describe("pinStatus", () => {
	const found = {
		formattedAddress: "Jalan Industri, 43800 Dengkil",
		lat: 2.98,
		lng: 101.86,
	};
	const pin = { ok: true as const, lat: 3.1, lng: 101.6 };
	it("shows what Google found", () =>
		expect(pinStatus(found, false, pin)).toEqual({ kind: "found", ...found }));
	it("keeps only the three fields it shows", () => {
		const geocoded = { ...found, postcode: "43800", city: "Dengkil" };
		expect(pinStatus(geocoded, false, pin)).toEqual({
			kind: "found",
			...found,
		});
	});
	it("asks for a check when the address changed and nothing confirms it", () =>
		expect(pinStatus(null, true, pin)).toEqual({ kind: "unchecked" }));
	it("falls back to the pin in the box once found is cleared", () =>
		expect(pinStatus(null, false, pin)).toEqual({
			kind: "pinned",
			lat: 3.1,
			lng: 101.6,
		}));
	it("says nothing when the pin box cannot be read", () =>
		expect(pinStatus(null, false, { ok: false, message: "x" })).toEqual({
			kind: "none",
		}));
});
