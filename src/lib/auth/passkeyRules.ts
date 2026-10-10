import type { Role } from "@/lib/auth/permissions";

/**
 * Whether this session still owes a passkey ceremony before it counts as a
 * signed-in customer. Staff are exempt: their second factor is the
 * authenticator code (`lib/auth/twoFactor.ts`).
 */
export function needsPasskeyCheck(u: {
	role: Role;
	sessionVerified: boolean;
}): boolean {
	return u.role === "CUSTOMER" && !u.sessionVerified;
}

export type PasskeyAction = "register" | "manage" | "delete" | "authenticate";

export type PasskeyDecision =
	| "allow"
	| "sign_in_required"
	| "verification_required"
	| "last_passkey";

/**
 * What a session may do to its account's passkeys.
 *
 * The plugin's defaults let any fresh session register another passkey and
 * any session delete one — so whoever held only the sign-in could add
 * their own and verify with it. Hence: the first passkey is free (there is
 * nothing to verify against yet), every later change needs a passkey
 * ceremony in the last few minutes, and the last passkey is never deleted
 * because the account would fall back to "first passkey is free".
 *
 * Recent, not merely verified: `session.passkeyVerified` lasts the session's
 * week, so on that flag alone anyone at an unlocked laptop hours later could
 * enrol their own authenticator and pass every later check with it. The
 * caller derives `recentPasskey` with `recentStepUp` (`stepUp.ts`).
 *
 * `authenticate` needs a signed-in account because the passkey is a second
 * step after sign-in, never a sign-in on its own.
 */
export function passkeyDecision(s: {
	action: PasskeyAction;
	signedIn: boolean;
	/** This session authenticated with a passkey within the step-up window. */
	recentPasskey: boolean;
	passkeyCount: number;
}): PasskeyDecision {
	if (!s.signedIn) return "sign_in_required";
	if (s.action === "authenticate") return "allow";
	if (s.action === "register") {
		return s.passkeyCount === 0 || s.recentPasskey
			? "allow"
			: "verification_required";
	}
	if (!s.recentPasskey) return "verification_required";
	if (s.action === "delete" && s.passkeyCount <= 1) return "last_passkey";
	return "allow";
}
