import { fieldsFromIssues } from "@/lib/fieldIssues";
import { deliveryInputSchema } from "@/lib/logistics/types";
import { type FormState, toPayload } from "./form";

/**
 * Which delivery-form inputs fail, and what each is told. A field is keyed by
 * its name (`customerName`) or, for an item row, `items.<uid>.<field>`: the
 * row's `uid` rather than its position, because the payload drops unnamed rows
 * and the server's issue paths index the payload, not the form.
 */
export type DeliveryErrors = Record<string, string>;

const TOP_MESSAGES: Record<string, string> = {
	customerName: "Enter the customer's name.",
	customerPhone: "Enter a phone number the driver can call.",
	siteAddress: "Enter the site address.",
	addressNotes: "Keep the access notes under 500 characters.",
	pickupAddress: "Enter where the load is picked up.",
	scheduledAt: "Pick a valid date and time, or leave it empty.",
};

const MM = "Enter whole millimetres, 1 to 10,000.";
/** Item fields, named as the row's own labels name them. */
export const ITEM_FIELDS: Record<string, { name: string; message: string }> = {
	label: { name: "Item", message: "Name the item." },
	qty: { name: "Qty", message: "Enter a whole number from 1 to 999." },
	widthMm: { name: "Width", message: MM },
	heightMm: { name: "Height", message: MM },
	depthMm: { name: "Depth", message: MM },
	weightKg: {
		name: "Weight",
		message: "Enter 0 to 2,000 kg, or leave it empty.",
	},
};

export const itemKey = (uid: string, field: string) => `items.${uid}.${field}`;

/** Issues from the schema (our own parse, or the server's reply) onto the form's inputs. */
export function deliveryErrors(
	issues: unknown,
	state: FormState,
): DeliveryErrors {
	// The payload sends only named rows, so an issue's row index counts those.
	const sent = state.items.filter((i) => i.label.trim() !== "");
	const keys = fieldsFromIssues(issues, (path) => {
		const [head, row, field] = path;
		if (head === "items") {
			const uid = typeof row === "number" ? sent[row]?.uid : undefined;
			return uid !== undefined &&
				typeof field === "string" &&
				field in ITEM_FIELDS
				? itemKey(uid, field)
				: null;
		}
		return typeof head === "string" && head in TOP_MESSAGES ? head : null;
	});
	return Object.fromEntries(
		keys.map((key) => {
			const field = key.startsWith("items.") ? key.split(".")[2] : key;
			return [key, TOP_MESSAGES[key] ?? ITEM_FIELDS[field].message];
		}),
	);
}

/** The checks the server will make, made before sending: an empty size is `0` and would otherwise fail only there. */
export function checkDeliveryForm(state: FormState): DeliveryErrors {
	const parsed = deliveryInputSchema.safeParse(toPayload(state));
	return parsed.success ? {} : deliveryErrors(parsed.error.issues, state);
}

/** One sentence for a row's failing inputs, which are too narrow to carry their own. */
export function itemRowMessage(
	errors: DeliveryErrors,
	uid: string,
): string | null {
	const parts = Object.entries(ITEM_FIELDS)
		.filter(([field]) => errors[itemKey(uid, field)])
		.map(([field, { name }]) => `${name}: ${errors[itemKey(uid, field)]}`);
	return parts.length > 0 ? parts.join(" ") : null;
}
