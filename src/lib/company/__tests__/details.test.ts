import { describe, expect, it } from "vitest";
import {
	bankChanged,
	companyDetailsSchema,
	lastFour,
	mapsLink,
	seedCompany,
	sellerLine,
	workshopMoved,
} from "../details";
import { testCompany } from "./company.fixture";

const input = (over: Record<string, unknown> = {}) => ({
	...testCompany(),
	ssmNumber: "",
	...over,
});
const ok = (over = {}) => companyDetailsSchema.safeParse(input(over)).success;

describe("companyDetailsSchema", () => {
	it("accepts a complete company and turns a blank SSM number into null", () => {
		expect(companyDetailsSchema.parse(input()).ssmNumber).toBeNull();
		expect(
			companyDetailsSchema.parse(input({ ssmNumber: " 202301012345 " }))
				.ssmNumber,
		).toBe("202301012345");
	});
	it.each([
		"brand",
		"legalName",
		"contactEmail",
		"phone",
		"address",
		"postcode",
		"city",
		"state",
		"closeTime",
		"bankName",
		"bankAccountName",
		"bankAccountNumber",
		"orderPrefix",
	])("requires %s", (field) => expect(ok({ [field]: "  " })).toBe(false));
	it("keeps the brand between 2 and 60 characters", () => {
		expect(ok({ brand: "E" })).toBe(false);
		expect(ok({ brand: "E".repeat(61) })).toBe(false);
	});
	it("refuses a pin outside Malaysia, including one with lat and lng swapped", () => {
		expect(ok({ lat: 101.861807, lng: 2.9848868 })).toBe(false);
		expect(ok({ lat: 51.5, lng: -0.12 })).toBe(false);
		expect(ok({ lat: 5.98, lng: 116.07 })).toBe(true); // Kota Kinabalu
	});
	it("strips spaces and dashes from the account number, then wants digits only", () => {
		expect(
			companyDetailsSchema.parse(input({ bankAccountNumber: "5621 2345-6789" }))
				.bankAccountNumber,
		).toBe("562123456789");
		expect(ok({ bankAccountNumber: "5621-ABCD" })).toBe(false);
	});
	it("upper-cases the order prefix and keeps it to five letters or digits", () => {
		expect(
			companyDetailsSchema.parse(input({ orderPrefix: "po" })).orderPrefix,
		).toBe("PO");
		expect(ok({ orderPrefix: "ABCDEF" })).toBe(false);
		expect(ok({ orderPrefix: "I-C" })).toBe(false);
	});
	it("wants a phone a courier can call", () =>
		expect(ok({ phone: "call the office" })).toBe(false));
	it("wants a five-digit postcode and an ISO state code", () => {
		expect(ok({ postcode: "4380" })).toBe(false);
		expect(ok({ state: "Selangor" })).toBe(false);
	});
	it("wants the close time as HH:MM", () => {
		expect(ok({ closeTime: "6pm" })).toBe(false);
		expect(ok({ closeTime: "24:00" })).toBe(false);
		expect(ok({ closeTime: "17:30" })).toBe(true);
	});
	it("wants an email", () =>
		expect(ok({ contactEmail: "hello at ezcabinet" })).toBe(false));
});

describe("workshopMoved", () => {
	const a = testCompany();
	it("is false for the same address with stray whitespace, or for a new phone", () => {
		expect(workshopMoved(a, { ...a, address: ` ${a.address}  ` })).toBe(false);
		expect(workshopMoved(a, { ...a, phone: "03-5555 1234" })).toBe(false);
	});
	it.each([
		["address", "Lot 9, Jalan Baru, 47500 Subang Jaya"],
		["lat", 3.07],
		["lng", 101.59],
		["postcode", "47500"],
		["city", "Subang Jaya"],
		["state", "MY-14"],
	])("is true when %s changes", (field, value) =>
		expect(workshopMoved(a, { ...a, [field]: value })).toBe(true),
	);
});

describe("bankChanged", () => {
	const a = testCompany();
	it.each([
		["bankName", "CIMB"],
		["bankAccountName", "EzCabinet Trading"],
		["bankAccountNumber", "8000111222"],
	])("is true when %s changes", (field, value) =>
		expect(bankChanged(a, { ...a, [field]: value })).toBe(true),
	);
	it("is false when only the address changes", () =>
		expect(bankChanged(a, { ...a, address: "elsewhere" })).toBe(false));
});

describe("sellerLine", () => {
	it("names the company, its registration and the address", () =>
		expect(sellerLine(testCompany({ ssmNumber: "202301012345" }))).toBe(
			"EzCabinet Sdn Bhd (202301012345), Lot 5, Jalan Kilang 2, 43800 Dengkil, Selangor",
		));
	it("does not repeat the name when the address already starts with it", () =>
		expect(
			sellerLine({
				legalName: "EzCabinet Sdn Bhd",
				ssmNumber: null,
				address: "EzCabinet Sdn Bhd, Klang Valley, Selangor",
			}),
		).toBe("EzCabinet Sdn Bhd, Klang Valley, Selangor"));
});

describe("seedCompany", () => {
	it("is this deployment's tenant values, with no SSM number and an 18:00 close", () => {
		const seed = seedCompany();
		expect(seed).toMatchObject({
			brand: "EzCabinet",
			orderPrefix: "IC",
			ssmNumber: null,
			closeTime: "18:00",
			address: "EzCabinet Sdn Bhd, Klang Valley, Selangor",
			lat: 2.9848868,
		});
	});
});

it("lastFour keeps the last four digits, and nothing when there are none", () => {
	expect(lastFour("5621 2345 6789")).toBe("6789");
	expect(lastFour("To be confirmed")).toBe("");
});

it("mapsLink opens the pin in Google Maps", () =>
	expect(mapsLink(2.98, 101.86)).toBe(
		"https://www.google.com/maps/search/?api=1&query=2.98,101.86",
	));
