/**
 * What the code prompt says after a failed attempt. One sentence for every
 * kind of wrong code — which kind is nobody's business — but a lock and an
 * expired prompt are different situations, and "try again" would be a lie
 * for both. The page appends the full stop.
 */
export function twoFactorMessage(code: string | undefined): string {
	if (
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
