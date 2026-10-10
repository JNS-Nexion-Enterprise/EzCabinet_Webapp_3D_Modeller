import { z } from "zod";
import type { Role } from "@/lib/auth/permissions";

/**
 * The Hangul fillers. Unicode files them as letters and they draw nothing,
 * so a name made of them is a blank label on a staff screen.
 */
const FILLERS = "\u115f\u1160\u3164\uffa0";

/**
 * Characters no name may carry: control characters, line and paragraph
 * separators, and the Hangul fillers.
 */
const HIDDEN = new RegExp(`[\\p{Cc}\\p{Zl}\\p{Zp}${FILLERS}]`, "u");

/**
 * Format characters, removed before anything is judged: the direction marks,
 * overrides and isolates, which can reorder the text around the name on a
 * staff screen or in a mail, and the zero-width ones, which hide. They ride
 * along on a paste from a chat app and the customer cannot see them, so
 * refusing the name would be refusing it for nothing they can fix. Two are
 * kept, because they spell things: the zero-width joiner (U+200D) builds
 * emoji, and the non-joiner (U+200C) is ordinary in Persian and several
 * Indian scripts. Emoji variation selectors are marks, not format
 * characters, so they pass untouched.
 */
const INVISIBLE = /(?![\u200c\u200d])\p{Cf}/gu;

/**
 * At least one letter that draws something. Without it — "..", "--", emoji
 * alone, zero-width spaces — the name reads as empty wherever it is shown.
 */
const hasLetter = (name: string): boolean =>
	/\p{L}/u.test(name.replace(new RegExp(`[${FILLERS}]`, "g"), ""));

/** Marks the "no letter" issue, so it is answered like an empty name. */
const NO_LETTER = "no_letter";

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
 * trimmed, with invisible format characters removed.
 */
export const customerNameSchema = z
	.string()
	.transform((typed) => typed.replace(INVISIBLE, ""))
	.pipe(
		z
			.string()
			.trim()
			.min(2)
			.max(80)
			.refine(hasLetter, { message: NO_LETTER })
			.refine((name) => !HIDDEN.test(name) && !posesAsBusiness(name)),
	);

/**
 * The schema's verdict as the two answers the customer can be given:
 * `name_required` ("Enter your name.") for nothing, too little or no letter
 * at all, and `name_refused` ("Use your own name.") for everything else.
 */
export function parseCustomerName(
	input: unknown,
): { name: string } | { error: "name_required" | "name_refused" } {
	const parsed = customerNameSchema.safeParse(input);
	if (parsed.success) return { name: parsed.data };
	const short = parsed.error.issues.some(
		(issue) =>
			issue.code === "too_small" ||
			issue.code === "invalid_type" ||
			issue.message === NO_LETTER,
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
