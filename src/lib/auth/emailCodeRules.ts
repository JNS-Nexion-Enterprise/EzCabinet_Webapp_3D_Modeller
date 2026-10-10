import type { Role } from "@/lib/auth/permissions";

/** The two plugin routes that stay open. Everything else is refused. */
export const SEND_PATH = "/email-otp/send-verification-otp";
export const SIGN_IN_PATH = "/sign-in/email-otp";

/**
 * The plugin's other seven routes, closed in `disabledPaths`. Two of them
 * would put a password on a customer row.
 */
export const CLOSED_PATHS = [
	"/email-otp/verify-email",
	"/email-otp/check-verification-otp",
	"/email-otp/request-password-reset",
	"/email-otp/reset-password",
	"/forget-password/email-otp",
	"/email-otp/request-email-change",
	"/email-otp/change-email",
];

export const CODE_TTL_S = 10 * 60;
export const CODE_ATTEMPTS = 3;
export const CODES_PER_HOUR = 3;
/**
 * One hour, for both send limits. Better Auth prunes the rate-limit table by
 * its longest configured window, and the per-address rows live in that table,
 * so the per-network send rule must not be given a shorter window than this.
 */
export const SEND_WINDOW_S = 60 * 60;
/**
 * Codes one network may ask for in the window, across addresses. Better
 * Auth's rule is rolling: while requests keep arriving under an hour apart
 * the count never resets, so this is really "N, then an hour's refusal" for
 * a whole carrier address or a showroom's Wi-Fi. Thirty is the owner's
 * starting value; raise it if real customers on a shared network are refused.
 */
export const SENDS_PER_NETWORK = 30;
/**
 * Code tries one network may make in a minute, across addresses. The plugin's
 * own limit is three, which three typos — or two customers behind one carrier
 * address — use up, and the right code is then refused. Guessing is bounded
 * elsewhere: three tries per code, three codes an hour per address.
 *
 * Rolling, like the send rule: the count resets only after a minute with no
 * try at all, so on a busy shared network this is "ten, then refused until
 * the network is quiet for a minute", and a customer with the right code can
 * be told to wait more than once. Raise it if that is seen.
 */
export const SIGN_IN_TRIES_PER_MINUTE = 10;

/**
 * May this address be sent a code, and may this row sign in with one. `null`
 * is an address with no account yet: a code sign-in creates it. Staff never
 * qualify — a mailed code would be a way round their password and
 * authenticator.
 */
export function mayUseCode(row: { role: Role } | null): boolean {
	return row === null || row.role === "CUSTOMER";
}

export function withinSendCap(sendsThisHour: number): boolean {
	return sendsThisHour <= CODES_PER_HOUR;
}

const only = (body: unknown, allowed: string[]): boolean =>
	typeof body === "object" &&
	body !== null &&
	Object.keys(body).every((key) => allowed.includes(key));

/**
 * What a request to the plugin is. `refuse` is every plugin route that is not
 * one of the two open ones used exactly as the form uses them — so a route a
 * later plugin version adds is born closed.
 *
 * The sign-in body is held to `email` and `otp`: the plugin would otherwise
 * copy `name`, `image` and any other posted field onto a new account.
 */
export function codeRequest(
	path: string | undefined,
	body: unknown,
): "ignore" | "send" | "sign_in" | "refuse" {
	// Every route the plugin has carries its name, wherever it sits:
	// `/email-otp/…`, `/sign-in/email-otp`, `/forget-password/email-otp`.
	if (!path?.includes("email-otp")) return "ignore";
	if (path === SEND_PATH) {
		return (body as { type?: unknown } | null)?.type === "sign-in" &&
			only(body, ["email", "type"])
			? "send"
			: "refuse";
	}
	if (path === SIGN_IN_PATH) {
		return only(body, ["email", "otp"]) ? "sign_in" : "refuse";
	}
	return "refuse";
}
