import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The hook bodies in `passkeyHooks.ts` run here against the real plugin and
 * Better Auth's real dispatch, on its in-memory adapter. The first version of
 * `hooks.after` passed every unit test and still stamped a session verified
 * after a failed registration, because the error that matters only exists
 * once dispatch has run. `prisma` is faked over the same in-memory store, so
 * what the hooks read and write is what the instance sees.
 */
type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
	db: {} as Record<string, Row[]>,
}));

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		passkey: {
			count: async ({ where }: { where: { userId: string } }) =>
				store.db.passkey.filter((r) => r.userId === where.userId).length,
			findFirst: async ({ where }: { where: { credentialID: string } }) =>
				store.db.passkey.find((r) => r.credentialID === where.credentialID) ??
				null,
		},
		session: {
			update: async ({
				where,
				data,
			}: {
				where: { token: string };
				data: Row;
			}) => {
				const row = store.db.session.find((r) => r.token === where.token);
				if (row) Object.assign(row, data);
				return row;
			},
		},
	},
}));

const {
	assertPasskeyOwner,
	passkeyAfterHook,
	passkeyBeforeHook,
	verifiedIfPasskeySession,
} = await import("@/lib/auth/passkeyHooks");

const ORIGIN = "http://localhost:3000";

function makeAuth() {
	return betterAuth({
		baseURL: ORIGIN,
		secret: "test-secret-test-secret-test-secret-0123",
		database: memoryAdapter(store.db),
		emailAndPassword: { enabled: true },
		session: {
			additionalFields: {
				passkeyVerified: { type: "boolean", input: false, defaultValue: false },
				passkeyVerifiedAt: { type: "date", input: false, required: false },
			},
		},
		hooks: {
			before: createAuthMiddleware(passkeyBeforeHook),
			after: createAuthMiddleware(passkeyAfterHook),
		},
		databaseHooks: {
			session: { create: { before: verifiedIfPasskeySession } },
		},
		plugins: [
			passkey({
				rpName: "Test",
				authentication: {
					afterVerification: async ({ ctx, clientData }) => {
						const current = await getSessionFromCtx(ctx);
						await assertPasskeyOwner(current?.user.id ?? null, clientData.id);
					},
				},
			}),
		],
	});
}

let auth: ReturnType<typeof makeAuth>;

const post = (path: string, body: unknown, cookie?: string) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: ORIGIN,
				...(cookie ? { cookie } : {}),
			},
			body: JSON.stringify(body),
		}),
	);

// The plugin's two `generate-*-options` routes are GETs.
const get = (path: string, cookie?: string) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth${path}`, {
			method: "GET",
			headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
		}),
	);

/** Signs up, which also signs in: returns the session cookie header. */
async function signedIn() {
	const res = await post("/sign-up/email", {
		name: "Test",
		email: "t@example.com",
		password: "a-long-enough-password",
	});
	expect(res.status).toBe(200);
	return res.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
}

const sessionRow = () => store.db.session[0];

beforeEach(() => {
	store.db = {
		user: [],
		session: [],
		account: [],
		verification: [],
		passkey: [],
	};
	auth = makeAuth();
});

describe("passkey hooks, through the real plugin", () => {
	it("does not verify the session when the body fails validation", async () => {
		const cookie = await signedIn();
		expect(sessionRow().passkeyVerified).toBe(false);
		const res = await post("/passkey/verify-registration", { name: 5 }, cookie);
		expect(res.status).toBe(400);
		expect(sessionRow().passkeyVerified).toBe(false);
	});

	it("does not verify the session when the handler itself fails", async () => {
		const cookie = await signedIn();
		const res = await post(
			"/passkey/verify-registration",
			{ response: {} },
			cookie,
		);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { code: string }).code).toBe(
			"CHALLENGE_NOT_FOUND",
		);
		expect(sessionRow().passkeyVerified).toBe(false);
	});

	it("refuses createSession on registration", async () => {
		const cookie = await signedIn();
		const res = await post(
			"/passkey/verify-registration",
			{ response: {}, createSession: true },
			cookie,
		);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { code: string }).code).toBe(
			"PASSKEY_CREATE_SESSION_REFUSED",
		);
	});

	it("refuses a signed-out passkey request", async () => {
		const res = await get("/passkey/generate-authenticate-options");
		expect(res.status).toBe(401);
		expect(((await res.json()) as { code: string }).code).toBe(
			"PASSKEY_SIGN_IN_REQUIRED",
		);
	});

	it("refuses an unverified session adding beside an existing passkey", async () => {
		const cookie = await signedIn();
		store.db.passkey.push({
			id: "p1",
			userId: store.db.user[0].id,
			credentialID: "cred-1",
		});
		const res = await get("/passkey/generate-register-options", cookie);
		expect(res.status).toBe(403);
		expect(((await res.json()) as { code: string }).code).toBe(
			"PASSKEY_VERIFICATION_REQUIRED",
		);
	});

	it("refuses a verified but stale session adding a second passkey", async () => {
		const cookie = await signedIn();
		store.db.passkey.push({
			id: "p1",
			userId: store.db.user[0].id,
			credentialID: "cred-1",
		});
		// Verified for the session's whole week; the ceremony was an hour ago.
		Object.assign(sessionRow(), {
			passkeyVerified: true,
			passkeyVerifiedAt: new Date(Date.now() - 60 * 60_000),
		});
		const stale = await get("/passkey/generate-register-options", cookie);
		expect(stale.status).toBe(403);
		expect(((await stale.json()) as { code: string }).code).toBe(
			"PASSKEY_VERIFICATION_REQUIRED",
		);

		// The same session moments after a ceremony gets past the guard.
		sessionRow().passkeyVerifiedAt = new Date();
		const recent = await get("/passkey/generate-register-options", cookie);
		expect(recent.status).toBe(200);
	});
});

// A real WebAuthn assertion cannot be driven from a unit test, so the hook
// that stamps the session is tested directly. The end-to-end proof is the
// plan's Task 8.
describe("verifiedIfPasskeySession", () => {
	it("stamps a session created by a passkey sign-in", async () => {
		expect(
			await verifiedIfPasskeySession(
				{ userId: "u1" },
				{ path: "/passkey/verify-authentication" },
			),
		).toEqual({
			data: {
				userId: "u1",
				passkeyVerified: true,
				passkeyVerifiedAt: expect.any(Date),
			},
		});
	});

	it("leaves any other session alone", async () => {
		expect(
			await verifiedIfPasskeySession(
				{ userId: "u1" },
				{ path: "/sign-in/social" },
			),
		).toBeUndefined();
		expect(
			await verifiedIfPasskeySession({ userId: "u1" }, null),
		).toBeUndefined();
	});
});
