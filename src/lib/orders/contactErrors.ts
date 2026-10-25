import { toE164 } from "@/lib/logistics/phone";

export type ContactField = "name" | "phone" | "email" | "siteAddress";
export type ContactReason = "required" | "invalid" | "short";
export type ContactErrors = Partial<Record<ContactField, ContactReason>>;

/** `customerSchema`'s `siteAddress` minimum — the server re-checks it. */
const ADDRESS_MIN = 5;

/**
 * Which contact fields fail, and why, for the checkout form and the order's
 * edit form alike. Values arrive trimmed. `phone` is the whole number as the
 * server will read it (checkout prepends +60 to the national digits, empty
 * staying empty). Email syntax is the browser's call — it implements the
 * `type="email"` grammar — so its verdict arrives as `emailValid`.
 */
export function contactErrors(input: {
	name: string;
	phone: string;
	email: string;
	siteAddress: string;
	emailRequired: boolean;
	emailValid: boolean;
}): ContactErrors {
	const errors: ContactErrors = {};
	if (!input.name) errors.name = "required";
	if (!input.phone) errors.phone = "required";
	// The server's own reader, so the two cannot disagree about a number.
	else if (toE164(input.phone) === null) errors.phone = "invalid";
	if (input.emailRequired && !input.email) errors.email = "required";
	else if (!input.emailValid) errors.email = "invalid";
	if (!input.siteAddress) errors.siteAddress = "required";
	else if (input.siteAddress.length < ADDRESS_MIN) errors.siteAddress = "short";
	return errors;
}
