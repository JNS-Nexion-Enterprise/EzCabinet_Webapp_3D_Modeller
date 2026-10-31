import type { CompanyDetails } from "@/lib/company/details";
import { fieldsFromIssues } from "@/lib/fieldIssues";
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

/**
 * One message per failing field, from zod issues: the form's own parse
 * (`error.issues`) or the server's reply, whose paths start with `prefix`
 * (`details`). A field the schema does not know is dropped.
 */
export function fieldErrors(
	issues: unknown,
	prefix?: string,
): Partial<Record<keyof CompanyDetails, string>> {
	const at = prefix === undefined ? 0 : 1;
	const fields = fieldsFromIssues(issues, (path) =>
		(prefix === undefined || path[0] === prefix) &&
		typeof path[at] === "string" &&
		path[at] in FIELD_MESSAGES
			? (path[at] as keyof CompanyDetails)
			: null,
	);
	return Object.fromEntries(fields.map((f) => [f, FIELD_MESSAGES[f]]));
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

/**
 * The pin and postcode are pre-filled with the current workshop's, so a new
 * address saved untouched would carry the old place. A typo fix is one pin
 * retype away, never blocked.
 */
export function addressNeedsPin(
	savedAddress: string,
	typedAddress: string,
	pinConfirmed: boolean,
): boolean {
	return (
		tidyAddress(typedAddress) !== tidyAddress(savedAddress) && !pinConfirmed
	);
}

/**
 * A pasted letterhead address, as the one line it is stored as. A text input
 * would delete the line breaks and glue "Industri" to "43800"; carriers, the
 * seller line and mail all read the address as one line.
 */
export const oneLine = (text: string) =>
	text.replace(/\s*,?\s*[\r\n]+\s*,?\s*/g, ", ");

/**
 * The address as saved. A copied block usually ends in a line break, which
 * `oneLine` turns into ", " — and that comma would reach the seller line on
 * the terms page. The form applies this on blur, not per keystroke: rewriting
 * a controlled box mid-edit sends the caret to its end.
 */
export const tidyAddress = (text: string) =>
	oneLine(text).replace(/^[\s,]+|[\s,]+$/g, "");

/** Why a check got no answer from Google, as what the admin can do about it. */
export function mapFailure(status: number | null): string {
	if (status === 400) {
		return "That address is too long to check. Shorten it, or set the pin by hand below.";
	}
	if (status === 401 || status === 403) {
		return "You are no longer signed in here. Reload the page, then check the address.";
	}
	return "Could not reach Google Maps. Try again, or set the pin by hand below.";
}

export type PinStatus =
	| { kind: "found"; formattedAddress: string; lat: number; lng: number }
	| { kind: "unchecked" }
	| { kind: "pinned"; lat: number; lng: number }
	| { kind: "none" };

/**
 * What the line under the address says about the pin. Google's answer only
 * while it is still the pin — the caller drops it on any edit — so the line
 * never vouches for a place Google did not find.
 */
export function pinStatus(
	found: { formattedAddress: string; lat: number; lng: number } | null,
	needsCheck: boolean,
	pin: PinReading,
): PinStatus {
	if (found) {
		const { formattedAddress, lat, lng } = found;
		return { kind: "found", formattedAddress, lat, lng };
	}
	if (needsCheck) return { kind: "unchecked" };
	if (pin.ok) return { kind: "pinned", lat: pin.lat, lng: pin.lng };
	return { kind: "none" };
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
