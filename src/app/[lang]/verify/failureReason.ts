/**
 * The one non-identifying property on a failed passkey event. `AUTH_CANCELLED`
 * and `ERROR_CEREMONY_ABORTED` are the client's own codes for a dismissed or
 * timed-out browser prompt; `SESSION_NOT_FRESH` is the server refusing to
 * enrol on a session more than a day old.
 */
export function failureReason(
	code: string | undefined,
): "cancelled" | "stale" | "other" {
	if (code === "SESSION_NOT_FRESH") return "stale";
	if (code === "AUTH_CANCELLED" || code === "ERROR_CEREMONY_ABORTED")
		return "cancelled";
	return "other";
}
