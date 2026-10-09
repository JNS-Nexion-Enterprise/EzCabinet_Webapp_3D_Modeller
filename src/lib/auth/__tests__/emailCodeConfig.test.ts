import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `emailCodeWiring.test.ts` proves the hooks against the real plugin, on an
 * instance it builds itself. This is the other half: that `lib/auth.ts` — which
 * cannot be imported here, it opens a database — is wired the same way. Read
 * as text, like `coverage.test.ts` reads the admin routes.
 */
const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");

const auth = read("../../auth.ts");

describe("lib/auth.ts", () => {
	it.each([
		["closes the plugin's other seven routes", "...CLOSED_PATHS,"],
		["keeps password sign-up closed", '"/sign-up/email",'],
		[
			"keeps role out of request bodies",
			'role: { type: "string", input: false,',
		],
		["sends six digits", "otpLength: 6,"],
		["for ten minutes", "expiresIn: CODE_TTL_S,"],
		["with three tries", "allowedAttempts: CODE_ATTEMPTS,"],
		["stored hashed", 'storeOTP: "hashed",'],
		["counts rate limits in the database", 'storage: "database",'],
		[
			"limits code requests per network",
			"[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },",
		],
		["trusts no provider's word past its own", "trustedProviders: []"],
		[
			"runs both request guards in the one before slot",
			"before: createAuthMiddleware(async (ctx) => { await emailCodeBeforeHook(ctx); await passkeyBeforeHook(ctx); }),",
		],
		[
			"refuses a staff code session before stamping a passkey one",
			"before: async (session, ctx) => { await refuseStaffCodeSession(session, ctx); return verifiedIfPasskeySession(session, ctx); },",
		],
		[
			"schedules the mail instead of awaiting it",
			"after(() => sendSignInCode(email, otp).catch(",
		],
		["mails sign-in codes only", 'if (type !== "sign-in") return;'],
		[
			"marks a session verified after a passkey registration",
			"after: createAuthMiddleware(passkeyAfterHook),",
		],
	])("%s", (_label, needle) => {
		expect(auth).toContain(needle);
	});

	// Every entry, in order: one dropped in a merge reopens a route, and
	// nothing else would notice.
	it("closes exactly these routes", () => {
		const list = /disabledPaths: \[(.*?)\],/.exec(auth)?.[1] ?? "";
		expect(list.split(",").map((entry) => entry.trim())).toEqual([
			'"/sign-up/email"',
			'"/two-factor/disable"',
			'"/list-sessions"',
			'"/revoke-session"',
			'"/revoke-sessions"',
			'"/revoke-other-sessions"',
			'"/update-session"',
			'"/update-user"',
			'"/change-email"',
			'"/delete-user"',
			'"/delete-user/callback"',
			'"/send-verification-email"',
			'"/verify-email"',
			'"/link-social"',
			'"/unlink-account"',
			'"/list-accounts"',
			'"/account-info"',
			'"/get-access-token"',
			'"/refresh-token"',
			'"/verify-password"',
			'"/two-factor/send-otp"',
			'"/two-factor/verify-otp"',
			"...CLOSED_PATHS",
			"",
		]);
	});

	// A proxy in front of Vercel would put every visitor in one bucket; the
	// note is what tells whoever adds one.
	it("says what the rate limiter keys on", () => {
		expect(auth).toContain("x-forwarded-for");
	});

	it("never awaits the mail", () => {
		expect(auth).not.toContain("await sendSignInCode");
	});

	it("keeps nextCookies last", () => {
		expect(auth).toMatch(/emailOTP\(\{.*\}\), nextCookies\(\), \], \}\);\s*$/);
	});
});

describe("the browser side", () => {
	it("has the plugin's client", () => {
		expect(read("../client.ts")).toContain("emailOTPClient(),");
	});

	it("asks BotID to guard the send-code request", () => {
		expect(read("../../../instrumentation-client.ts")).toContain(
			'{ path: "/api/auth/email-otp/send-verification-otp", method: "POST" },',
		);
	});
});
