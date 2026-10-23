import type { CompanyDetails } from "@/lib/company/details";

/**
 * The logistics partner vocabulary, in one place.
 *
 * The admin form, the API's payload schema and the comparison table all read
 * this list — same reasoning as `lib/tutorials.ts`. Two lists kept in step by
 * hand drift, and here the drift would be a carrier the admin can pick and the
 * booking route cannot reach.
 *
 * Isomorphic: this is imported by client components, so nothing secret belongs
 * here. Credentials live in the adapters, which are `server-only`.
 */

/**
 * `vehicle` books a whole van or lorry by distance; `parcel` books a
 * consignment by weight and dimensions.
 *
 * The distinction is not cosmetic. Finished cabinets are bulky — a 900mm
 * carcass fails the girth and weight caps of every parcel network — so a
 * `vehicle` partner does the real work, and the `parcel` ones carry hardware,
 * samples and spare doors. It is also only the `vehicle` partners that report
 * where the driver currently is.
 */
export type CarrierKind = "vehicle" | "parcel";

export const CARRIERS = [
	{ id: "manual", label: "Own lorry / phoned in", kind: "vehicle" },
	{ id: "lalamove", label: "Lalamove", kind: "vehicle" },
	{ id: "gdex", label: "GDEX", kind: "parcel" },
	{ id: "citylink", label: "City-Link", kind: "parcel" },
	{ id: "easyparcel", label: "EasyParcel", kind: "parcel" },
	{ id: "fedex", label: "FedEx", kind: "parcel" },
] as const satisfies readonly {
	id: string;
	label: string;
	kind: CarrierKind;
}[];

export type CarrierId = (typeof CARRIERS)[number]["id"];

export const CARRIER_IDS = CARRIERS.map((c) => c.id) as [
	CarrierId,
	...CarrierId[],
];

/** `{ lalamove: "Lalamove", … }` for rendering a row or a chip. */
export const LABEL: Record<string, string> = Object.fromEntries(
	CARRIERS.map((c) => [c.id, c.label]),
);

export const KIND: Record<string, CarrierKind> = Object.fromEntries(
	CARRIERS.map((c) => [c.id, c.kind]),
);

/**
 * Where a job leaves from, as the columns a delivery row stores.
 *
 * The workshop is the company's (`/admin/company`), and a job leaving from it
 * carries its pin and place on the row. Nothing matches address strings at
 * quote time: Lalamove prices by the pin and EasyParcel by postcode and
 * state, and both read them off the job.
 */
export type PickupColumns = {
	pickupAddress: string;
	pickupLat: number;
	pickupLng: number;
	pickupGeocodedFor: string;
	pickupPostcode: string;
	pickupCity: string;
	pickupState: string;
};

export type Workshop = Pick<
	CompanyDetails,
	"address" | "lat" | "lng" | "postcode" | "city" | "state"
>;

export function workshopColumns(workshop: Workshop): PickupColumns {
	return {
		pickupAddress: workshop.address,
		pickupLat: workshop.lat,
		pickupLng: workshop.lng,
		pickupGeocodedFor: workshop.address,
		pickupPostcode: workshop.postcode,
		pickupCity: workshop.city,
		pickupState: workshop.state,
	};
}

/**
 * The workshop's columns when the job leaves from the workshop, else null so
 * the caller geocodes.
 *
 * The address check keeps this honest: an admin who edits the pickup to
 * another address gets a geocode, not the workshop's pin silently attached to
 * somewhere else. A pin the admin typed always wins, so it is left to the
 * geocoder's override path.
 */
export function workshopPickup(
	address: string,
	given: { lat: number; lng: number } | null,
	workshop: Workshop,
): PickupColumns | null {
	if (given) return null;
	return address.trim() === workshop.address ? workshopColumns(workshop) : null;
}
