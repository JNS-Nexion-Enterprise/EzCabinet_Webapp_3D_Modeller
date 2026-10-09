import "server-only";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, twoFactor } from "better-auth/plugins";
import { after } from "next/server";
import {
	emailCodeBeforeHook,
	refuseStaffCodeSession,
} from "@/lib/auth/emailCodeHooks";
import { sendSignInCode } from "@/lib/auth/emailCodeMail";
import {
	CLOSED_PATHS,
	CODE_ATTEMPTS,
	CODE_TTL_S,
	SEND_PATH,
	SEND_WINDOW_S,
	SENDS_PER_NETWORK,
} from "@/lib/auth/emailCodeRules";
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
 * Customers arrive self-service: through Google, or a six-digit code mailed
 * to any address (`emailOTP` below — never a password). Staff sign in with either Google or the password a superadmin
 * set for them, on an account a superadmin created (or promoted from an
 * existing customer row) — public sign-up can only ever produce a CUSTOMER,
 * so there is no code path by which a customer account grants itself a role.
 * Staff can never use a mailed code: it would be a way round both the
 * password and the authenticator. A staff address is never mailed one
 * (`emailCodeMail.ts`) and never given a session for one
 * (`refuseStaffCodeSession`, `emailCodeHooks.ts`); in every other way it is
 * treated like any address, so it cannot be told apart. So a promoted
 * customer row with no Google sign-in is given an invite password — see
 * `POST /api/admin/users`.
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
	// Nobody signs themselves up with a password: customers use a provider or
	// a mailed code, and staff passwords are set by a superadmin's invite. Left open, a stranger
	// could register a password on a future colleague's address and ride the
	// invite's promotion into the admin surface. `disabledPaths` closes the
	// HTTP route only — the invite and the seed call `auth.api.signUpEmail`
	// server-side, which never passes through the router.
	// (`emailAndPassword.disableSignUp` would close the server call too.)
	// `/two-factor/disable`: a second factor a staff member can switch off
	// with the password alone is not a second factor. Only a superadmin's
	// Reset 2FA (`lib/auth/resetTwoFactor.ts`) removes one.
	// Session management: the app calls none of these, and a session that
	// has not passed the passkey step could otherwise list the owner's session
	// rows or sign the owner out of every other device.
	// `/update-user`: the name has one door, `POST /api/account/name`, which
	// holds it to `parseCustomerName` and writes it once. This route would let
	// any signed-in session, the passkey step passed or not, set any name and
	// picture, and rename at will.
	// `/change-email`, `/delete-user` (and its callback),
	// `/send-verification-email`, `/verify-email`: each is refused today only
	// because an option is unset. Closed so that setting the option is not
	// what opens it: one address is one account, and an account with orders
	// is never deleted (`lib/auth/deleteUser.ts`).
	// `/link-social`, `/unlink-account`: sign-in methods change through Google
	// sign-in itself or a superadmin's Remove password, never from a session.
	// Unlinking would let staff drop their own password and, with it, the
	// second factor.
	// `/list-accounts`, `/account-info`, `/get-access-token`,
	// `/refresh-token`: they hand the owner's Google account id, profile and
	// tokens to a session that has not passed the passkey step.
	// The app calls none of the routes above.
	// `CLOSED_PATHS`: the email-code plugin registers nine routes and the app
	// uses two. Two of the other seven would put a password on a customer row.
	disabledPaths: [
		"/sign-up/email",
		"/two-factor/disable",
		"/list-sessions",
		"/revoke-session",
		"/revoke-sessions",
		"/revoke-other-sessions",
		"/update-session",
		"/update-user",
		"/change-email",
		"/delete-user",
		"/delete-user/callback",
		"/send-verification-email",
		"/verify-email",
		"/link-social",
		"/unlink-account",
		"/list-accounts",
		"/account-info",
		"/get-access-token",
		"/refresh-token",
		...CLOSED_PATHS,
	],
	// Counted in Postgres. The default is memory, which on a serverless
	// deployment is one counter per instance and so no limit at all.
	// The send-code rule is the per-network half of the code limits; the
	// per-address half is `takeSendSlot` (`lib/auth/emailCodeMail.ts`), whose
	// rows share this table — see `SEND_WINDOW_S` before shortening the window.
	rateLimit: {
		storage: "database",
		customRules: {
			[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },
		},
	},
	// One email is one account, joined only when both sides proved the
	// address: Better Auth links Google to an existing row only if Google
	// reports the email verified and our row is verified too. That is its
	// default; this line is here so that no provider is ever trusted past it.
	account: { accountLinking: { trustedProviders: [] } },
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
		// One slot, two guards, each ignoring every path that is not its own.
		// Every passkey write goes through `checkPasskeyRequest` first — see
		// that function for why the plugin's defaults are not enough — and
		// every email-code request through `emailCodeBeforeHook`.
		before: createAuthMiddleware(async (ctx) => {
			await emailCodeBeforeHook(ctx);
			await passkeyBeforeHook(ctx);
		}),
		after: createAuthMiddleware(passkeyAfterHook),
	},
	databaseHooks: {
		session: {
			create: {
				// The refusal first: it throws, and nothing is stamped on a
				// session that will not exist.
				before: async (session, ctx) => {
					await refuseStaffCodeSession(session, ctx);
					return verifiedIfPasskeySession(session, ctx);
				},
				// Stamped on session creation rather than on each request:
				// /admin/users wants "has anyone used this account lately", not a
				// precise last-seen, and a write per request would be a write per
				// page view. This fires for every path that creates a session —
				// credential, provider and code sign-in alike, all funnel through
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
			// A passkey here is proof the owner is present, so the device must
			// check them (biometric or PIN), not just that it is plugged in. This
			// asks for it at enrolment; the plugin (1.7.5) cannot enforce it at
			// authentication.
			authenticatorSelection: { userVerification: "required" },
			authentication: {
				afterVerification: async ({ ctx, clientData }) => {
					const current = await getSessionFromCtx(ctx);
					await assertPasskeyOwner(current?.user.id ?? null, clientData.id);
				},
			},
		}),
		emailOTP({
			otpLength: 6,
			expiresIn: CODE_TTL_S,
			allowedAttempts: CODE_ATTEMPTS,
			storeOTP: "hashed",
			// Scheduled, not awaited, for `sendResetPassword`'s reason: Better
			// Auth awaits this callback, and whether a code is mailed depends on
			// who the address belongs to, so awaiting would let response time
			// tell a requester who is staff. Everything that differs by address
			// happens inside `sendSignInCode`.
			sendVerificationOTP: async ({ email, otp, type }) => {
				if (type !== "sign-in") return;
				after(() =>
					sendSignInCode(email, otp).catch((error) =>
						console.error("Sign-in code not sent", error),
					),
				);
			},
		}),
		nextCookies(),
	],
});
