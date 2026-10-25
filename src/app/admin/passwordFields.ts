/**
 * The wording and field mapping for the two screens where staff choose a new
 * password (change, reset). Better Auth's error codes are never shown as they
 * are: each is either said on the input it is about or in plain words.
 */

/** Matches `emailAndPassword.minPasswordLength`; the server enforces it. */
export const MIN_LENGTH = 12;

export type PasswordField = "current" | "newPassword" | "confirm";
export type PasswordErrors = Partial<Record<PasswordField, string>>;
export type PasswordFailure = { errors: PasswordErrors; banner: string | null };

const TOO_SHORT = `New password must be at least ${MIN_LENGTH} characters.`;
const MISMATCH = "The two passwords do not match.";
export const DEAD_LINK =
	"This link has expired or was already used. Request a new one.";

/** The checks both screens run before asking the server. */
export function checkNewPassword(
	newPassword: string,
	confirm: string,
): PasswordErrors {
	return {
		...(newPassword.length < MIN_LENGTH ? { newPassword: TOO_SHORT } : {}),
		...(newPassword !== confirm ? { confirm: MISMATCH } : {}),
	};
}

export function changePasswordFailure(code: string): PasswordFailure {
	if (code === "INVALID_PASSWORD")
		return {
			errors: { current: "That is not your current password." },
			banner: null,
		};
	if (code === "PASSWORD_TOO_SHORT")
		return { errors: { newPassword: TOO_SHORT }, banner: null };
	// The password did change (and other sessions were revoked); only the
	// follow-up bookkeeping failed. Distinct from every error above this one,
	// which all mean the password was never touched.
	if (code === "flag_not_cleared")
		return {
			errors: {},
			banner:
				"Your password was changed, but something went wrong finishing up. Sign in again — if you're still asked to change your password, tell an admin.",
		};
	return { errors: {}, banner: "Could not change password. Try again." };
}

export function resetPasswordFailure(
	code: string | undefined,
): PasswordFailure {
	return code === "PASSWORD_TOO_SHORT"
		? { errors: { newPassword: TOO_SHORT }, banner: null }
		: { errors: {}, banner: DEAD_LINK };
}
