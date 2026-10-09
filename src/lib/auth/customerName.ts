import { z } from "zod";
import type { Role } from "@/lib/auth/permissions";

/**
 * Control characters, and the Unicode direction overrides and isolates
 * (U+202A–202E, U+2066–2069). A name carrying one can reorder the text
 * around it on a staff screen or in a mail. The zero-width joiner is not
 * here on purpose: emoji are built with it.
 */
const HIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;

/**
 * Compatibility forms unified, lower-cased, and everything that is not a
 * letter or a digit removed — so spacing, punctuation and invisible format
 * characters (a zero-width space, a soft hyphen) cannot dress a word up.
 */
const fold = (text: string): string =>
	text
		.normalize("NFKC")
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]/gu, "");

/**
 * A name that would read as the business on a staff screen or in a mail:
 * anything containing "ezcabinet", or whose first word starts with "admin"
 * or "support".
 *
 * Both are tested folded; only this check folds, and what is stored is the
 * name as typed. "ezcabinet" is looked for in the whole name, spaces and all.
 * The prefix is looked for in the first word only, or real names whose
 * opening letters spell it across a space are refused ("Ad Minh", "Sup
 * Port"). A word ends at an ordinary space and nothing else — a hair space
 * is all but invisible, so it must not end one — and the first word is the
 * first that is anything once folded, so "- admin" does not hide behind its
 * dash. Look-alike letters from another script (Cyrillic "а", Greek "ο")
 * are not unified: out of scope.
 */
function posesAsBusiness(name: string): boolean {
	const first = name.split(" ").map(fold).find(Boolean) ?? "";
	return fold(name).includes("ezcabinet") || /^(admin|support)/.test(first);
}

/**
 * The name a customer gives after their first code sign-in. It labels the
 * account and pre-fills checkout; it is not unique, not a credential, and
 * never identifies a caller. Any script is fine — it is stored as typed,
 * trimmed.
 */
export const customerNameSchema = z
	.string()
	.trim()
	.min(2)
	.max(80)
	.refine((name) => !HIDDEN.test(name) && !posesAsBusiness(name));

/**
 * The schema's verdict as the two answers the customer can be given:
 * `name_required` ("Enter your name.") for nothing or too little, and
 * `name_refused` ("Use your own name.") for everything else.
 */
export function parseCustomerName(
	input: unknown,
): { name: string } | { error: "name_required" | "name_refused" } {
	const parsed = customerNameSchema.safeParse(input);
	if (parsed.success) return { name: parsed.data };
	const short = parsed.error.issues.some(
		(issue) => issue.code === "too_small" || issue.code === "invalid_type",
	);
	return { error: short ? "name_required" : "name_refused" };
}

/**
 * Whether this account still has to give a name before it counts as a
 * signed-in customer. Only a code sign-in makes a row without one: Google
 * arrives with a name, and an invite types one.
 */
export function owesName(user: { role: Role; name: string | null }): boolean {
	return user.role === "CUSTOMER" && (user.name ?? "").trim() === "";
}
