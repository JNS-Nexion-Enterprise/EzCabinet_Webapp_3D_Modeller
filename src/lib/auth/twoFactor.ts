import { type Role, STAFF_ROLES } from "@/lib/auth/permissions";

/**
 * Who must enrol an authenticator before using the admin surface.
 *
 * Keyed on the account, not on how this session signed in: the session row
 * does not record the method, and a staff account with a password is the
 * exposure whichever door was used today. Google-only staff are exempt —
 * Google carries its own second factor.
 *
 * Reads `twoFactorEnabled` and nothing else about the enrolment, so a staff
 * member who scanned the QR and walked away (a `twoFactor` row with
 * `verified = false`) is still asked.
 */
export function needsTwoFactorSetup(u: {
	role: Role;
	hasPassword: boolean;
	twoFactorEnabled: boolean;
}): boolean {
	return STAFF_ROLES.includes(u.role) && u.hasPassword && !u.twoFactorEnabled;
}

/**
 * Who may be emailed a password-reset link.
 *
 * Better Auth's reset *creates* a credential account on a row that has none,
 * so an open reset would let any customer give themselves a password — hence
 * staff with an existing password only. And only once 2FA is enrolled: before
 * that, a stolen mailbox could set a password, sign in and enrol the thief's
 * own authenticator. An unenrolled staff member who forgets their password
 * asks a superadmin, as before.
 */
export function canEmailReset(u: {
	role: Role;
	disabled: boolean;
	hasPassword: boolean;
	twoFactorEnabled: boolean;
}): boolean {
	return (
		STAFF_ROLES.includes(u.role) &&
		!u.disabled &&
		u.hasPassword &&
		u.twoFactorEnabled
	);
}
