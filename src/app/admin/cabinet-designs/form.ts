import { fieldsFromIssues } from "@/lib/fieldIssues";

/**
 * The cabinet-design form's checks and wording. The checks mirror the API's
 * zod schema (`api/admin/cabinet-designs/route.ts`) so a field is marked
 * before the round trip, and the server's `issues` land on the same fields.
 */
export type DesignField = "name" | "w" | "h" | "d" | "price" | "weight" | "sku";
export type DesignErrors = Partial<Record<DesignField, string>>;

const MESSAGES: Record<DesignField, string> = {
	name: "Enter the cabinet's name.",
	w: "Enter whole millimetres above 0, like 800.",
	h: "Enter whole millimetres above 0, like 800.",
	d: "Enter whole millimetres above 0, like 800.",
	price: "Enter the price in RM, 0 or more.",
	weight: "Enter a weight above 0 kg, or leave it empty.",
	sku: "Enter the SKU, like ICB-0000.",
};

/** The API's field names, for mapping a reply's issue paths. */
const API_FIELD: Record<string, DesignField> = {
	name: "name",
	widthMm: "w",
	heightMm: "h",
	depthMm: "d",
	priceRm: "price",
	weightKg: "weight",
	sku: "sku",
};

const wholeMm = (v: string) =>
	v.trim() !== "" && Number.isInteger(Number(v)) && Number(v) > 0;
const priceOk = (v: string) => v.trim() !== "" && Number(v) >= 0;

const present = (fields: DesignField[]): DesignErrors =>
	Object.fromEntries(fields.map((f) => [f, MESSAGES[f]]));

export function checkDesignForm(
	form: Record<DesignField, string>,
): DesignErrors {
	const bad: DesignField[] = [];
	if (form.name.trim() === "") bad.push("name");
	for (const f of ["w", "h", "d"] as const) if (!wholeMm(form[f])) bad.push(f);
	if (!priceOk(form.price)) bad.push("price");
	// A bad weight used to become `null` without a word.
	if (form.weight.trim() !== "" && !(Number(form.weight) > 0))
		bad.push("weight");
	if (form.sku.trim() === "") bad.push("sku");
	return present(bad);
}

/** A batch row has only these two to type; the rest is read from its file. */
export function checkBatchRow(row: {
	sku: string;
	price: string;
}): DesignErrors {
	return present([
		...(row.sku.trim() === "" ? (["sku"] as const) : []),
		...(priceOk(row.price) ? [] : (["price"] as const)),
	]);
}

/** What a rejected save says, on the fields that can carry it. */
export function designErrorsFromReply(body: unknown): DesignErrors {
	const reply = body as { error?: unknown; issues?: unknown } | null;
	if (reply?.error === "sku_taken")
		return { sku: "That SKU is already in use." };
	return present(
		fieldsFromIssues(reply?.issues, (path) =>
			typeof path[0] === "string" ? (API_FIELD[path[0]] ?? null) : null,
		),
	);
}

/** Plain words for a rejected body no (or not every) input could carry. */
export const INVALID_FIELDS_TEXT = "Some fields are invalid — check the form.";

/** True when the reply has issues that name no input of this form, so the banner must say something rather than let them go unsaid. */
export function hasUnmappedIssues(body: unknown): boolean {
	const issues = (body as { issues?: unknown } | null)?.issues;
	return (
		Array.isArray(issues) &&
		issues.some((issue) => {
			const head = (issue as { path?: unknown[] } | null)?.path?.[0];
			return typeof head !== "string" || !(head in API_FIELD);
		})
	);
}
