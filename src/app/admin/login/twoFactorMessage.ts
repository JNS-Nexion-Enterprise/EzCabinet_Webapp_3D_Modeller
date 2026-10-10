/**
 * What the code prompt says after a failed attempt. One sentence for every
 * kind of wrong code — which kind is nobody's business — but a lock, a
 * throttle and an expired prompt are different situations, and "try again"
 * would be a lie for all three. Better Auth's rate limiter answers HTTP 429
 * with no `code` at all after three two-factor calls in ten seconds, and the
 * code was never checked — hence `status`. The page appends the full stop.
 */
export function twoFactorMessage(
	code: string | undefined,
	status?: number,
): string {
	if (
		status === 429 ||
		code === "ACCOUNT_TEMPORARILY_LOCKED" ||
		code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
	) {
		return "Too many attempts. Wait a few minutes, then sign in again";
	}
	if (code === "INVALID_TWO_FACTOR_COOKIE") {
		return "That took too long. Sign in again";
	}
	return "That code didn't work. Try again";
}
