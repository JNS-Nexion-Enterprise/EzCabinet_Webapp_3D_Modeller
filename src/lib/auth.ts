import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import {
	assertPasskeyOwner,
	passkeyAfterHook,
	passkeyBeforeHook,
	verifiedIfPasskeySession,
} from "@/lib/auth/passkeyHooks";
import {
	afterPasswordReset,
	resetLink,
	sendStaffReset,
} from "@/lib/auth/passwordReset";
import { prisma } from "@/lib/catalogue/db";

/**
 * One door, gated by who created the row — not by which provider they used.
 *
 * Customers arrive through Google, self-service. Staff sign in with either
 * Google or the password a superadmin set for them, on an account a
 * superadmin created (or promoted from an existing customer row) — public
 * sign-up can only ever produce a CUSTOMER, so there is no code path by
 * which a customer account grants itself a role. A staff row promoted from
 * an existing customer keeps only the sign-in it already had (Google), since
 * the promotion sets no password — see `POST /api/admin/users`.
 *
 * `input: false` on every field below is the load-bearing line. Without it a
 * crafted sign-up body could post its own `role`, and the whole model is one
 * POST away from being decorative. Do not relax it to make a form easier.
 *
 * A server-side call to `auth.api.signUpEmail(...)` (Tasks 7 and 8, staff
 * invites) still passes `asResponse: true` and discards the returned
 * `Response` — that keeps the caller from reading a session out of it by
 * accident, and the route separately re-reads the new row by email. But
 * `asResponse` does **not** stop the cookie: `nextCookies()`'s after-hook
 * matcher is unconditional (`better-auth/dist/integrations/next-js.mjs`),
 * so it still runs and still writes `Set-Cookie` for whatever session
 * `signUpEmail` created, onto the ambient response, regardless of
 * `asResponse`. `autoSignIn: false` below is what actually prevents it — it
 * stops `signUpEmail` creating a `Session` row at all, so there is no
 * cookie for the after-hook to attach. Without it, a superadmin pressing
 * "Invite" is silently signed in as the account they just created.
 */
export const auth = betterAuth({
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	// Nobody signs themselves up with a password: customers use Google, and
	// staff passwords are set by a superadmin's invite. Left open, a stranger
	// could register a password on a future colleague's address and ride the
	// invite's promotion into the admin surface. `disabledPaths` closes the
	// HTTP route only — the invite and the seed call `auth.api.signUpEmail`
	// server-side, which never passes through the router.
	// (`emailAndPassword.disableSignUp` would close the server call too.)
	// `/two-factor/disable`: a second factor a staff member can switch off
	// with the password alone is not a second factor. Only a superadmin's
	// Reset 2FA (`lib/auth/resetTwoFactor.ts`) removes one.
	// Session management: the app calls none of these, and a Google-only
	// session could otherwise list the owner's session rows or sign the owner
	// out of every other device.
	disabledPaths: [
		"/sign-up/email",
		"/two-factor/disable",
		"/list-sessions",
		"/revoke-session",
		"/revoke-sessions",
		"/revoke-other-sessions",
		"/update-session",
	],
	emailAndPassword: {
		enabled: true,
		// See the module comment above: this is the line that stops a staff
		// invite from signing the inviting superadmin in as the invitee.
		autoSignIn: false,
		// Reset by emailed link, staff only — `sendStaffReset` decides who is
		// mailed, and why it is not simply "everyone with a row".
		// Scheduled, not awaited: Better Auth awaits this callback, and only
		// eligible staff would reach the lookup and the Resend call, so awaiting
		// would let response time tell a requester who is staff.
		// Better Auth's `url` is ignored: it carries a requester-chosen
		// `callbackURL`. The link is built here from the token and our own origin.
		sendResetPassword: async ({ user, token }, request) => {
			const base =
				process.env.BETTER_AUTH_URL ??
				(request ? new URL(request.url).origin : undefined);
			if (!base) {
				console.error("Reset mail not sent: no BETTER_AUTH_URL and no request");
				return;
			}
			after(() =>
				sendStaffReset(user.id, resetLink(base, token)).catch((error) =>
					console.error("Reset mail failed", error),
				),
			);
		},
		resetPasswordTokenExpiresIn: 60 * 60,
		// Whoever knew the old password is out, on every device.
		revokeSessionsOnPasswordReset: true,
		onPasswordReset: async ({ user }) => {
			await afterPasswordReset(user.id);
		},
		//
		// Better Auth's own default is 8
		// (node_modules/better-auth/dist/context/create-context.mjs:
		// `minPasswordLength: options.emailAndPassword?.minPasswordLength || 8`),
		// read by every password-accepting endpoint — sign-up, `set-password`,
		// and `change-password` alike — off `ctx.context.password.config`. Set
		// here so all of them share the one floor, matching the invite's own
		// 12-character minimum (`src/lib/auth/invite.ts`) rather than leaving a
		// server-side gap under a client-side check.
		minPasswordLength: 12,
	},
	socialProviders: {
		google: {
			clientId: process.env.GOOGLE_CLIENT_ID ?? "",
			clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
		},
	},
	user: {
		additionalFields: {
			role: { type: "string", input: false, defaultValue: "CUSTOMER" },
			disabled: { type: "boolean", input: false, defaultValue: false },
			mustChangePassword: {
				type: "boolean",
				input: false,
				defaultValue: false,
			},
			invitedById: { type: "string", input: false, required: false },
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		// Off deliberately. A cached session would carry a stale role for its
		// lifetime, and the spec requires a role change or a disable to bite on
		// the very next request.
		cookieCache: { enabled: false },
		// Set only by the hooks below, never by a request body.
		additionalFields: {
			passkeyVerified: { type: "boolean", input: false, defaultValue: false },
			passkeyVerifiedAt: { type: "date", input: false, required: false },
		},
	},
	hooks: {
		// Every passkey write goes through `checkPasskeyRequest` first — see
		// that function for why the plugin's defaults are not enough.
		before: createAuthMiddleware(passkeyBeforeHook),
		after: createAuthMiddleware(passkeyAfterHook),
	},
	databaseHooks: {
		session: {
			create: {
				before: verifiedIfPasskeySession,
				// Stamped on session creation rather than on each request:
				// /admin/users wants "has anyone used this account lately", not a
				// precise last-seen, and a write per request would be a write per
				// page view. This fires for every path that creates a session —
				// credential sign-in and Google sign-in alike, both funnel through
				// the same `internalAdapter.createSession` — so a Google-only
				// staff member's row updates too.
				//
				// Verified against node_modules/better-auth/dist/db/with-hooks.mjs:
				// `createWithHooks` calls `hooks[model].create.after(created,
				// context)` — one argument is the created row (here the session,
				// carrying `userId`), not the `{ user }`/`{ session }` shape the
				// brief's own snippet assumed — and awaits it via
				// `queueAfterTransactionHook`, which runs and is awaited after the
				// transaction commits, before the API response is sent.
				//
				// Wrapped in try/catch: this hook has no `onError`, so an
				// unhandled throw here would propagate out of session creation and
				// fail the sign-in itself. A stale `lastLoginAt` is a cosmetic
				// miss; a failed sign-in is not an acceptable price for it.
				after: async (session) => {
					try {
						await prisma.user.update({
							where: { id: session.userId },
							data: { lastLoginAt: new Date() },
						});
					} catch (error) {
						console.error("Failed to stamp lastLoginAt", error);
					}
				},
			},
		},
	},
	// `nextCookies()` stays last: it must see the cookies every other plugin sets.
	plugins: [
		twoFactor({ issuer: "EzCabinet Admin" }),
		passkey({
			rpName: "EzCabinet",
			authentication: {
				afterVerification: async ({ ctx, clientData }) => {
					const current = await getSessionFromCtx(ctx);
					await assertPasskeyOwner(current?.user.id ?? null, clientData.id);
				},
			},
		}),
		nextCookies(),
	],
});
