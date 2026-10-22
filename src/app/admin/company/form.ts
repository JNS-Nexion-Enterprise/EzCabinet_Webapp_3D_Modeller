import type { z } from "zod";
import type { CompanyDetails } from "@/lib/company/details";
import { parseCoords } from "@/lib/logistics/coords";

/**
 * The company form's own wording. The schema's messages are written for the
 * API; a person typing needs to be told what to type, once per field.
 */
const FIELD_MESSAGES: Record<keyof CompanyDetails, string> = {
	brand: "Between 2 and 60 characters.",
	legalName: "Enter the registered company name.",
	ssmNumber: "Up to 40 characters.",
	contactEmail: "Enter an email address.",
	phone: "Enter a Malaysian number a courier can call.",
	address: "Enter the full address, as on your letterhead.",
	postcode: "Five digits.",
	city: "Enter the town.",
	state: "Choose a state.",
	lat: "The pin must be inside Malaysia.",
	lng: "The pin must be inside Malaysia.",
	closeTime: "Use 24-hour time, like 18:00.",
	bankName: "Enter the bank's name.",
	bankAccountName: "Enter the name on the account.",
	bankAccountNumber: "Digits only. Spaces and dashes are fine.",
	orderPrefix: "One to five letters or digits.",
};

/** The first issue per field; a field the schema does not know is dropped. */
export function fieldErrors(
	error: z.ZodError,
): Partial<Record<keyof CompanyDetails, string>> {
	const out: Partial<Record<keyof CompanyDetails, string>> = {};
	for (const issue of error.issues) {
		const field = issue.path[0] as keyof CompanyDetails;
		if (field in FIELD_MESSAGES && !(field in out)) {
			out[field] = FIELD_MESSAGES[field];
		}
	}
	return out;
}

export type PinReading =
	| { ok: true; lat: number; lng: number }
	| { ok: false; message: string };

/** What the pin box holds, as a pin or as a sentence on what to do instead. */
export function readPin(text: string): PinReading {
	const parsed = parseCoords(text);
	if (parsed.ok) return parsed;
	if (parsed.reason === "empty") {
		return {
			ok: false,
			message:
				"Enter the pin as latitude, longitude, or paste a Google Maps link.",
		};
	}
	if (parsed.reason === "short-link") {
		return {
			ok: false,
			message:
				"That is a short link. Open it, then copy the full address from the browser bar.",
		};
	}
	return {
		ok: false,
		message:
			"Could not read a pin from that. Use latitude, longitude, like 2.98489, 101.86181.",
	};
}

/**
 * The address fields a geocoded place fills in. Google gives no postcode for a
 * street-level result, and the old workshop's would then be saved against the
 * new address and price every parcel's pickup zone, so a missing part is
 * emptied and validation makes the admin type it.
 */
export function placeFields(found: {
	postcode: string | null;
	city: string | null;
	state: string | null;
}) {
	return {
		postcode: found.postcode ?? "",
		city: found.city ?? "",
		state: found.state ?? "",
	};
}

export type GdexNotice =
	| null
	| { kind: "reminder" }
	| { kind: "mismatch"; gdexPostcode: string }
	| { kind: "unchecked" };

/**
 * GDEX collects from the address on its own account, which this app cannot
 * change, so the form says so — and says louder when the two postcodes differ.
 */
export function gdexNotice(
	configured: boolean,
	gdexPostcode: string | null,
	savedPostcode: string,
): GdexNotice {
	if (!configured) return null;
	if (gdexPostcode === null) return { kind: "unchecked" };
	if (gdexPostcode !== savedPostcode) return { kind: "mismatch", gdexPostcode };
	return { kind: "reminder" };
}
