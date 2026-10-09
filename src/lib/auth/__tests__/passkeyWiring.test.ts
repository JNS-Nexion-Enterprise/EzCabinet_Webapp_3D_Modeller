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

const queuePasskeyMail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/passkeyMail", () => ({ queuePasskeyMail }));

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
	queuePasskeyMail.mockClear();
});

describe("passkey hooks, through the real plugin", () => {
	it("does not verify the session when the body fails validation", async () => {
		const cookie = await signedIn();
		expect(sessionRow().passkeyVerified).toBe(false);
		const res = await post("/passkey/verify-registration", { name: 5 }, cookie);
		expect(res.status).toBe(400);
		expect(sessionRow().passkeyVerified).toBe(false);
		expect(queuePasskeyMail).not.toHaveBeenCalled();
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
		// No passkey was added, so the owner is told of none.
		expect(queuePasskeyMail).not.toHaveBeenCalled();
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

// Deleting needs no WebAuthn ceremony of its own — only a session that had
// one recently — so the whole path runs here: guard, plugin, after hook.
describe("removing a passkey, through the real plugin", () => {
	/** Signed in, holding `count` passkeys, the ceremony moments ago. */
	async function withPasskeys(count: number) {
		const cookie = await signedIn();
		const userId = store.db.user[0].id as string;
		for (let i = 1; i <= count; i++) {
			store.db.passkey.push({
				id: `p${i}`,
				userId,
				credentialID: `cred-${i}`,
			});
		}
		Object.assign(sessionRow(), {
			passkeyVerified: true,
			passkeyVerifiedAt: new Date(),
		});
		return { cookie, userId };
	}

	it("tells the owner once the passkey is gone", async () => {
		const { cookie, userId } = await withPasskeys(2);
		const res = await post("/passkey/delete-passkey", { id: "p1" }, cookie);
		expect(res.status).toBe(200);
		expect(store.db.passkey.map((r) => r.id)).toEqual(["p2"]);
		expect(queuePasskeyMail).toHaveBeenCalledTimes(1);
		expect(queuePasskeyMail).toHaveBeenCalledWith(userId, "removed");
	});

	it("tells nobody when the last passkey is kept", async () => {
		const { cookie } = await withPasskeys(1);
		const res = await post("/passkey/delete-passkey", { id: "p1" }, cookie);
		expect(res.status).toBe(400);
		expect(((await res.json()) as { code: string }).code).toBe(
			"PASSKEY_LAST_ONE",
		);
		expect(store.db.passkey).toHaveLength(1);
		expect(queuePasskeyMail).not.toHaveBeenCalled();
	});

	it("tells nobody when a session with no recent ceremony is refused", async () => {
		const { cookie } = await withPasskeys(2);
		sessionRow().passkeyVerifiedAt = new Date(Date.now() - 60 * 60_000);
		const res = await post("/passkey/delete-passkey", { id: "p1" }, cookie);
		expect(res.status).toBe(403);
		expect(store.db.passkey).toHaveLength(2);
		expect(queuePasskeyMail).not.toHaveBeenCalled();
	});

	// The guard passes, and the plugin itself finds nothing to delete.
	it("tells nobody when the plugin deletes nothing", async () => {
		const { cookie } = await withPasskeys(2);
		const res = await post("/passkey/delete-passkey", { id: "nope" }, cookie);
		expect(res.status).not.toBe(200);
		expect(store.db.passkey).toHaveLength(2);
		expect(queuePasskeyMail).not.toHaveBeenCalled();
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
