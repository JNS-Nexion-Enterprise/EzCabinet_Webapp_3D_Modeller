import "server-only";
import { APIError } from "better-auth/api";
import { type PasskeyAction, passkeyDecision } from "@/lib/auth/passkeyRules";
import { prisma } from "@/lib/catalogue/db";

/** The plugin's write paths. Listing passkeys needs no rule beyond a session. */
const ACTIONS: Record<string, PasskeyAction> = {
	"/passkey/generate-register-options": "register",
	"/passkey/verify-registration": "register",
	"/passkey/generate-authenticate-options": "authenticate",
	"/passkey/verify-authentication": "authenticate",
	"/passkey/delete-passkey": "delete",
	"/passkey/update-passkey": "manage",
};

export function actionFor(path: string): PasskeyAction | null {
	return ACTIONS[path] ?? null;
}

const refuse = (
	status: "UNAUTHORIZED" | "FORBIDDEN" | "BAD_REQUEST",
	code: string,
	message: string,
) => new APIError(status, { code, message });

/**
 * Runs before every Better Auth request (`hooks.before` in `lib/auth.ts`)
 * and throws unless `passkeyDecision` allows it. This is the load-bearing
 * guard of the whole feature: without it, whoever holds only the Google
 * account can register their own passkey or delete the real one.
 */
export async function checkPasskeyRequest(
	path: string,
	session: { userId: string; verified: boolean } | null,
): Promise<void> {
	const action = actionFor(path);
	if (action === null) return;

	const passkeyCount = session
		? await prisma.passkey.count({ where: { userId: session.userId } })
		: 0;
	const decision = passkeyDecision({
		action,
		signedIn: session !== null,
		sessionVerified: session?.verified ?? false,
		passkeyCount,
	});
	if (decision === "sign_in_required") {
		throw refuse("UNAUTHORIZED", "PASSKEY_SIGN_IN_REQUIRED", "Sign in first");
	}
	if (decision === "verification_required") {
		throw refuse(
			"FORBIDDEN",
			"PASSKEY_VERIFICATION_REQUIRED",
			"Confirm with an existing passkey first",
		);
	}
	if (decision === "last_passkey") {
		throw refuse(
			"BAD_REQUEST",
			"PASSKEY_LAST_ONE",
			"An account keeps at least one passkey",
		);
	}
}

/**
 * The plugin signs in whoever owns the presented passkey. Here a passkey is
 * a second step for the account already signed in with Google, so a passkey
 * that belongs to anyone else is refused — on a shared family device it
 * would otherwise switch the browser to the other person's account.
 */
export async function assertPasskeyOwner(
	sessionUserId: string | null,
	credentialId: string,
): Promise<void> {
	const passkey = await prisma.passkey.findFirst({
		where: { credentialID: credentialId },
		select: { userId: true },
	});
	if (sessionUserId === null || passkey?.userId !== sessionUserId) {
		throw refuse(
			"UNAUTHORIZED",
			"PASSKEY_NOT_YOURS",
			"That passkey is for a different account",
		);
	}
}

/** After a successful first registration: the session that enrolled has proved possession. */
export async function markSessionVerified(token: string): Promise<void> {
	await prisma.session.update({
		where: { token },
		data: { passkeyVerified: true },
	});
}
