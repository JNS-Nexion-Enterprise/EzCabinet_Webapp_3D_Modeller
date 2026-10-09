import { CODES_PER_HOUR } from "@/lib/auth/emailCodeRules";

/**
 * Seconds before "Send a new code" is offered. Mail is rarely slower than
 * this, and a second code makes the first one useless — so the customer is
 * held back from asking again while the first is probably still on its way.
 */
export const RESEND_AFTER_S = 30;

/**
 * What the customer typed, as the address the server will use. NFKC first: a
 * Chinese keyboard left in full-width mode types `＠` and `．`, which look
 * right and match nothing.
 */
export function normaliseEmail(input: string): string {
	return input.normalize("NFKC").trim().toLowerCase();
}

/** Loose on purpose: the code arriving is the real check. */
export function looksLikeEmail(address: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

/**
 * The six digits out of whatever landed in the box: a paste with spaces
 * ("482 913"), a whole pasted sentence, or full-width digits.
 */
export function cleanCode(input: string): string {
	return input.normalize("NFKC").replace(/\D/g, "").slice(0, 6);
}

/**
 * Whether the box holds a whole code. A short one is not sent: it cannot be
 * right, and it would cost one of the three tries.
 */
export function isFullCode(input: string): boolean {
	return cleanCode(input).length === 6;
}

/** Keys of `signIn` in the dictionary. */
export type FormMessage =
	| "emailInvalid"
	| "wrongCode"
	| "codeExpired"
	| "tooMany"
	| "failed";

/**
 * 429 is Better Auth's per-network limit. 400 is the server refusing an
 * address `looksLikeEmail` let through — its check is the stricter one.
 * Anything else is ours or the network's.
 */
export function sendFailure(status: number | undefined): FormMessage {
	if (status === 429) return "tooMany";
	return status === 400 ? "emailInvalid" : "failed";
}

/**
 * A used-up code and a rate-limited try get the "expired" message: either
 * way the next step is a new code, which is what that message says.
 */
export function verifyFailure(error: {
	status?: number;
	code?: string;
}): FormMessage {
	if (error.code === "INVALID_OTP") return "wrongCode";
	if (
		error.code === "OTP_EXPIRED" ||
		error.code === "TOO_MANY_ATTEMPTS" ||
		error.status === 429
	) {
		return "codeExpired";
	}
	return "failed";
}

/**
 * The server drops a fourth code in the hour without saying so (its answer
 * must not differ by address), and that request would also kill the third
 * code. So the form counts its own sends and says "too many" itself.
 */
export function maySendAgain(sent: number): boolean {
	return sent < CODES_PER_HOUR;
}

/**
 * Sends so far, by address as the server will read it. Per address and never
 * reset: "Use a different email" and back to the same one must not buy a
 * fourth "we sent a code". Kept for the life of the page; a reload forgets.
 */
export type SendCounts = Map<string, number>;

export function maySendTo(counts: SendCounts, typed: string): boolean {
	return maySendAgain(counts.get(normaliseEmail(typed)) ?? 0);
}

export function recordSend(counts: SendCounts, typed: string): void {
	const address = normaliseEmail(typed);
	counts.set(address, (counts.get(address) ?? 0) + 1);
}

/**
 * Whole seconds until `deadline`, both in epoch milliseconds. Read off the
 * clock instead of counted down: a timer is paused while the tab is in the
 * background, which is exactly when the customer is in their mail app.
 */
export function secondsLeft(deadline: number, now: number): number {
	return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * Whether the form may be used at all. `supported` is `passkeysSupported`,
 * null until the browser has been asked. An in-app browser cannot do the
 * passkey step that follows sign-in, so a code asked for there would be mail
 * the customer can do nothing with: they are told before, not after.
 */
export function canStart(supported: boolean | null): "wait" | "blocked" | "go" {
	if (supported === null) return "wait";
	return supported ? "go" : "blocked";
}
