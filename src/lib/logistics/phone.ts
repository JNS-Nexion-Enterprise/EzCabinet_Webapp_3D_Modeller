/**
 * A phone number as an admin types it, in the format a carrier's API demands.
 *
 * Pure and framework-free. Malaysian numbers arrive as `012-345 6789`,
 * `+60 12-345 6789` or `0123456789` depending on who filled the form, and
 * Lalamove accepts exactly one of those shapes: E.164, `^\+[1-9]\d{1,14}$`.
 */

/** Malaysia. The only market this app delivers in. */
const MALAYSIA_CC = "60";
const DEFAULT_CC = MALAYSIA_CC;

/**
 * `null` rather than a throw or a best guess: a phone number we cannot read is
 * the admin's typo to fix, and inventing a country code would put a driver on
 * the line to a stranger.
 */
export function toE164(
	raw: string,
	defaultCountryCode = DEFAULT_CC,
): string | null {
	const trimmed = raw.trim();
	// A leading + is the one piece of punctuation that carries meaning.
	const hadPlus = trimmed.startsWith("+");
	const digits = trimmed.replace(/\D/g, "");
	if (digits === "") return null;

	// A local number is written with a trunk 0 that E.164 does not use.
	const withCode =
		hadPlus || digits.startsWith(defaultCountryCode)
			? digits
			: `${defaultCountryCode}${digits.replace(/^0+/, "")}`;
	// "+60 012-345 6789": the country code *and* the trunk 0. Read literally
	// that is +600123456789 — a different number that still looks valid, and
	// the one shape a WhatsApp send fails on without anyone seeing why.
	const national = withCode.startsWith(`${defaultCountryCode}0`)
		? defaultCountryCode +
			withCode.slice(defaultCountryCode.length).replace(/^0+/, "")
		: withCode;

	// E.164 allows 15 digits; anything under 8 is not a reachable number.
	if (national.length < 8 || national.length > 15) return null;
	if (national.startsWith("0")) return null;
	// Malaysia is stricter than E.164: 8 to 10 digits after the 60, landline
	// to 011 mobile. A digit short or long is a typo, not a number.
	if (
		national.startsWith(MALAYSIA_CC) &&
		(national.length < 10 || national.length > 12)
	)
		return null;

	return `+${national}`;
}

/**
 * What a customer types, pastes or autofills into a field that already shows
 * `+60` — reduced to the digits that belong after it.
 *
 * A free-text phone box is where wrong numbers come from: spaces, a second
 * country code, the trunk 0. The checkout field prints the +60 itself and
 * keeps only this, so the string that reaches WhatsApp is built, not typed.
 */
export function malaysianNational(raw: string): string {
	const digits = raw.replace(/\D/g, "");
	// A pasted or autofilled number can bring the country code along again.
	const local =
		raw.trim().startsWith("+") || digits.length > 10
			? digits.replace(/^60/, "")
			: digits;
	return local.replace(/^0+/, "").slice(0, 10);
}
