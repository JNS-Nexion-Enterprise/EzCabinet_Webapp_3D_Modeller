import { describe, expect, it } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import { workshopColumns, workshopPickup } from "../carriers";

const workshop = testCompany();

describe("workshopPickup", () => {
	it("gives the workshop's own pin and place when the job leaves from the workshop", () =>
		expect(workshopPickup(` ${workshop.address} `, null, workshop)).toEqual({
			pickupAddress: workshop.address,
			pickupLat: workshop.lat,
			pickupLng: workshop.lng,
			pickupGeocodedFor: workshop.address,
			pickupPostcode: "43800",
			pickupCity: "Dengkil",
			pickupState: "MY-10",
		}));
	it("is null for any other address", () =>
		expect(
			workshopPickup("12 Jalan Setia, Shah Alam", null, workshop),
		).toBeNull());
	it("is null when the admin typed a pin, even at the workshop's address", () =>
		expect(
			workshopPickup(workshop.address, { lat: 3.1, lng: 101.6 }, workshop),
		).toBeNull());
	it("is the same columns workshopColumns writes", () =>
		expect(workshopPickup(workshop.address, null, workshop)).toEqual(
			workshopColumns(workshop),
		));
});
