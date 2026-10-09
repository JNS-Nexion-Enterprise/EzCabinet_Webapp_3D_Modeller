import "server-only";
import {
	APIError,
	type createAuthMiddleware,
	getSessionFromCtx,
	isAPIError,
} from "better-auth/api";
import { queuePasskeyMail } from "@/lib/auth/passkeyMail";
import { type PasskeyAction, passkeyDecision } from "@/lib/auth/passkeyRules";
import { recentStepUp } from "@/lib/auth/stepUp";
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

/** Read-only; the plugin itself requires a session for it. */
const LIST_PATH = "/passkey/list-user-passkeys";

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
 * guard of the whole feature: without it, whoever holds only the sign-in
 * (the Google account, or the mailbox a code goes to) can register their own
 * passkey or delete the real one.
 *
 * `verifiedAt` is when this session last authenticated with a passkey
 * (`Session.passkeyVerifiedAt`), null if it never has. Every change after
 * the first enrolment needs that to be recent.
 */
export async function checkPasskeyRequest(
	path: string,
	session: { userId: string; verifiedAt: Date | null } | null,
): Promise<void> {
	const action = actionFor(path);
	if (action === null) {
		if (!path.startsWith("/passkey/") || path === LIST_PATH) return;
		// Fail closed: a write route a later plugin version adds must not be
		// born unguarded.
		throw refuse("FORBIDDEN", "PASSKEY_ROUTE_REFUSED", "Route not allowed");
	}

	const passkeyCount = session
		? await prisma.passkey.count({ where: { userId: session.userId } })
		: 0;
	const decision = passkeyDecision({
		action,
		signedIn: session !== null,
		recentPasskey: recentStepUp(session?.verifiedAt, new Date()),
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
 * a second step for the account already signed in, so a passkey
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

/** The context Better Auth hands a `hooks.before` / `hooks.after` body. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/** `hooks.before`: every passkey write is checked before the plugin sees it. */
export async function passkeyBeforeHook(ctx: HookContext): Promise<void> {
	// An endpoint with no path (internal calls) is none of ours.
	if (!ctx.path?.startsWith("/passkey/")) return;
	// `createSession` makes the plugin mint a second, unverified session
	// and swap the cookie to it, undoing the verified stamp in the after hook.
	// Nothing in the app asks for it, so refuse it rather than chase it.
	if (
		ctx.path === "/passkey/verify-registration" &&
		(ctx.body as { createSession?: boolean } | undefined)?.createSession
	) {
		throw refuse(
			"BAD_REQUEST",
			"PASSKEY_CREATE_SESSION_REFUSED",
			"createSession is not supported",
		);
	}
	const current = await getSessionFromCtx(ctx);
	// `additionalFields` types this on the built instance, not inside the
	// config that defines it. A cookie-cached session carries it as a string;
	// one that will not parse is refused by `recentStepUp`.
	const verifiedAt = (
		current?.session as { passkeyVerifiedAt?: Date | string | null } | undefined
	)?.passkeyVerifiedAt;
	await checkPasskeyRequest(
		ctx.path,
		current
			? {
					userId: current.user.id,
					verifiedAt: verifiedAt ? new Date(verifiedAt) : null,
				}
			: null,
	);
}

/**
 * A passkey authentication mints a new session and swaps the cookie to it,
 * leaving the one the request came in with alive in the database. Signing
 * out afterwards would then end only the new one, and the original password,
 * Google or code session would outlive it. So the old one ends here.
 *
 * Only on positive evidence, like the registration branch: not an API error,
 * and a new session for the same account that is not the old one.
 */
async function endReplacedSession(ctx: HookContext): Promise<void> {
	if (isAPIError(ctx.context.returned)) return;
	const fresh = ctx.context.newSession;
	// The request's own cookie: `newSession` is where the new one lives.
	const previous = await getSessionFromCtx(ctx);
	if (
		!fresh ||
		!previous ||
		previous.session.token === fresh.session.token ||
		previous.user.id !== fresh.user.id
	) {
		return;
	}
	await ctx.context.internalAdapter.deleteSession(previous.session.token);
}

/**
 * `hooks.after`: enrolling the account's first passkey is itself the proof of
 * possession, so the enrolling session becomes verified. Only on success: a
 * failed registration leaves an APIError in `returned`.
 */
export async function passkeyAfterHook(ctx: HookContext): Promise<void> {
	if (ctx.path === "/passkey/verify-authentication") {
		return endReplacedSession(ctx);
	}
	if (ctx.path === "/passkey/delete-passkey") {
		// The owner is told of every removal — see `passkeyMail.ts`. Only once
		// the plugin has actually deleted one.
		if (isAPIError(ctx.context.returned)) return;
		const owner = await getSessionFromCtx(ctx);
		if (owner) queuePasskeyMail(owner.user.id, "removed");
		return;
	}
	if (ctx.path !== "/passkey/verify-registration") return;
	// `instanceof APIError` is not enough: a body that fails validation makes
	// better-call throw its base APIError, which is not an instance of Better
	// Auth's subclass, and dispatch hands it to this hook all the same.
	if (isAPIError(ctx.context.returned)) return;
	const current = await getSessionFromCtx(ctx);
	if (!current) return;
	// Positive evidence too: the account must now hold a passkey. A result
	// that is merely "not an error" is not proof anything was enrolled.
	const enrolled = await prisma.passkey.count({
		where: { userId: current.user.id },
	});
	if (enrolled > 0) {
		await markSessionVerified(current.session.token);
		// Every successful registration, a second device included. Id only: an
		// enrolment on an account with orders leaves a trace, as a reset does.
		console.info("Passkey enrolled", { user: current.user.id });
		queuePasskeyMail(current.user.id, "added");
	}
}

/**
 * `databaseHooks.session.create.before`: a session born from a passkey
 * ceremony is a verified one. The plugin creates it with
 * `internalAdapter.createSession`, so this is the one place the flag can be
 * set atomically with the row. `ctx` is the endpoint context
 * (better-auth/dist/db/with-hooks.mjs); it is null outside a request.
 *
 * `passkeyVerifiedAt` is stamped here and nowhere else: an enrolment marks
 * its session verified without it, so the time always means "authenticated
 * with a passkey then" — what a step-up check needs (`stepUp.ts`).
 */
export async function verifiedIfPasskeySession<T extends object>(
	session: T,
	ctx: { path?: string } | null,
): Promise<
	{ data: T & { passkeyVerified: true; passkeyVerifiedAt: Date } } | undefined
> {
	if (ctx?.path !== "/passkey/verify-authentication") return undefined;
	return {
		data: { ...session, passkeyVerified: true, passkeyVerifiedAt: new Date() },
	};
}
