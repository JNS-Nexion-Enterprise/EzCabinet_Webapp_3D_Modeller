/**
 * Step-up: a guarded admin action runs only if this session passed a passkey
 * ceremony moments ago — proof that the account's owner is the one pressing
 * the button, not whoever found the laptop unlocked.
 *
 * `session.passkeyVerified` cannot answer this. It stays true for the
 * session's whole week, and a first enrolment sets it with no authentication
 * ceremony at all. `passkeyVerifiedAt` is stamped only when a passkey
 * authentication mints the session (`verifiedIfPasskeySession`).
 *
 * The window is "a ceremony within five minutes", not a proof bound to one
 * action: one prompt covers the few clicks of a single task.
 */
export const STEP_UP_WINDOW_MS = 5 * 60_000;

export function recentStepUp(
	verifiedAt: Date | null | undefined,
	now: Date,
): boolean {
	if (!verifiedAt) return false;
	const age = now.getTime() - verifiedAt.getTime();
	// NaN (an unparseable date) fails both comparisons' intent: refuse it.
	return Number.isFinite(age) && age <= STEP_UP_WINDOW_MS;
}
