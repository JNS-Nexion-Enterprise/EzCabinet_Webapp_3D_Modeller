import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const sessionUpdate = vi.hoisted(() => vi.fn());

const getSessionFromCtx = vi.hoisted(() => vi.fn());
vi.mock("better-auth/api", async () => ({
	...(await vi.importActual<typeof import("better-auth/api")>(
		"better-auth/api",
	)),
	getSessionFromCtx,
}));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		passkey: { count, findFirst },
		session: { update: sessionUpdate },
	},
}));

const {
	actionFor,
	assertPasskeyOwner,
	checkPasskeyRequest,
	markSessionVerified,
	passkeyAfterHook,
	passkeyBeforeHook,
} = await import("@/lib/auth/passkeyHooks");

const code = async (run: () => Promise<unknown>) => {
	try {
		await run();
		return "allowed";
	} catch (error) {
		return (error as { body?: { code?: string } }).body?.code ?? "threw";
	}
};

describe("actionFor", () => {
	it.each([
		["/passkey/generate-register-options", "register"],
		["/passkey/verify-registration", "register"],
		["/passkey/generate-authenticate-options", "authenticate"],
		["/passkey/verify-authentication", "authenticate"],
		["/passkey/delete-passkey", "delete"],
		["/passkey/update-passkey", "manage"],
		["/passkey/list-user-passkeys", null],
		["/sign-in/social", null],
	])("%s → %s", (path, action) => {
		expect(actionFor(path)).toBe(action);
	});
});

describe("checkPasskeyRequest", () => {
	beforeEach(() => vi.clearAllMocks());
	const unverified = { userId: "u1", verifiedAt: null };
	const verified = { userId: "u1", verifiedAt: new Date() };
	// Verified all week, but the passkey ceremony was an hour ago.
	const stale = {
		userId: "u1",
		verifiedAt: new Date(Date.now() - 60 * 60_000),
	};

	it("ignores paths that are not passkey writes, without a query", async () => {
		expect(await code(() => checkPasskeyRequest("/sign-in/social", null))).toBe(
			"allowed",
		);
		expect(count).not.toHaveBeenCalled();
	});

	it("lets the read-only list through, and refuses any other passkey path", async () => {
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/list-user-passkeys", unverified),
			),
		).toBe("allowed");
		expect(
			await code(() => checkPasskeyRequest("/passkey/some-new-route", null)),
		).toBe("PASSKEY_ROUTE_REFUSED");
		expect(count).not.toHaveBeenCalled();
	});

	it("refuses every passkey path when signed out", async () => {
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/verify-authentication", null),
			),
		).toBe("PASSKEY_SIGN_IN_REQUIRED");
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/generate-register-options", null),
			),
		).toBe("PASSKEY_SIGN_IN_REQUIRED");
	});

	it("lets an account with no passkey register its first", async () => {
		count.mockResolvedValue(0);
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/verify-registration", unverified),
			),
		).toBe("allowed");
		expect(count).toHaveBeenCalledWith({ where: { userId: "u1" } });
	});

	it("refuses a Google-only session adding a passkey beside an existing one", async () => {
		count.mockResolvedValue(1);
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/generate-register-options", unverified),
			),
		).toBe("PASSKEY_VERIFICATION_REQUIRED");
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/verify-registration", unverified),
			),
		).toBe("PASSKEY_VERIFICATION_REQUIRED");
	});

	it("refuses a Google-only session deleting or renaming", async () => {
		count.mockResolvedValue(2);
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/delete-passkey", unverified),
			),
		).toBe("PASSKEY_VERIFICATION_REQUIRED");
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/update-passkey", unverified),
			),
		).toBe("PASSKEY_VERIFICATION_REQUIRED");
	});

	it("refuses a verified session whose passkey ceremony is no longer recent", async () => {
		count.mockResolvedValue(2);
		for (const path of [
			"/passkey/generate-register-options",
			"/passkey/verify-registration",
			"/passkey/update-passkey",
			"/passkey/delete-passkey",
		]) {
			expect(await code(() => checkPasskeyRequest(path, stale))).toBe(
				"PASSKEY_VERIFICATION_REQUIRED",
			);
		}
		// It can still answer a prompt: that is how it becomes recent again.
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/verify-authentication", stale),
			),
		).toBe("allowed");
	});

	it("refuses deleting the last passkey", async () => {
		count.mockResolvedValue(1);
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/delete-passkey", verified),
			),
		).toBe("PASSKEY_LAST_ONE");
	});

	it("lets a verified session add, rename and delete one of several", async () => {
		count.mockResolvedValue(2);
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/verify-registration", verified),
			),
		).toBe("allowed");
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/update-passkey", verified),
			),
		).toBe("allowed");
		expect(
			await code(() =>
				checkPasskeyRequest("/passkey/delete-passkey", verified),
			),
		).toBe("allowed");
	});
});

describe("assertPasskeyOwner", () => {
	beforeEach(() => vi.clearAllMocks());

	it("accepts a passkey that belongs to the signed-in account", async () => {
		findFirst.mockResolvedValue({ userId: "u1" });
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe("allowed");
		expect(findFirst).toHaveBeenCalledWith({
			where: { credentialID: "cred" },
			select: { userId: true },
		});
	});

	it("refuses another account's passkey — it must not switch who is signed in", async () => {
		findFirst.mockResolvedValue({ userId: "someone-else" });
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe(
			"PASSKEY_NOT_YOURS",
		);
	});

	it("refuses when nobody is signed in", async () => {
		findFirst.mockResolvedValue({ userId: "u1" });
		expect(await code(() => assertPasskeyOwner(null, "cred"))).toBe(
			"PASSKEY_NOT_YOURS",
		);
	});

	it("refuses an unknown credential", async () => {
		findFirst.mockResolvedValue(null);
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe(
			"PASSKEY_NOT_YOURS",
		);
	});
});

// The hooks take Better Auth's context; only what they read is faked.
const hookCtx = (path: string | undefined, returned: unknown = {}) =>
	({ path, context: { returned } }) as never;

describe("hooks on an endpoint with no path", () => {
	it("pass it untouched instead of throwing", async () => {
		await expect(
			passkeyBeforeHook(hookCtx(undefined)),
		).resolves.toBeUndefined();
		await expect(passkeyAfterHook(hookCtx(undefined))).resolves.toBeUndefined();
		expect(getSessionFromCtx).not.toHaveBeenCalled();
	});
});

describe("passkeyAfterHook, any successful registration", () => {
	beforeEach(() => vi.clearAllMocks());

	it("verifies the session and leaves a trace with the user id only", async () => {
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		getSessionFromCtx.mockResolvedValue({
			user: { id: "u1", email: "a@x.com" },
			session: { token: "tok" },
		});
		count.mockResolvedValue(1);
		await passkeyAfterHook(hookCtx("/passkey/verify-registration"));
		expect(sessionUpdate).toHaveBeenCalledWith({
			where: { token: "tok" },
			data: { passkeyVerified: true },
		});
		expect(info).toHaveBeenCalledWith("Passkey enrolled", { user: "u1" });
		info.mockRestore();
	});
});

describe("passkeyBeforeHook", () => {
	beforeEach(() => vi.clearAllMocks());
	const session = (passkeyVerifiedAt: unknown) => ({
		user: { id: "u1" },
		session: { token: "tok", passkeyVerified: true, passkeyVerifiedAt },
	});

	it("reads how recent the ceremony was off the session, not the week-long flag", async () => {
		count.mockResolvedValue(1);
		getSessionFromCtx.mockResolvedValue(session(null));
		expect(
			await code(() =>
				passkeyBeforeHook(hookCtx("/passkey/generate-register-options")),
			),
		).toBe("PASSKEY_VERIFICATION_REQUIRED");

		// A cookie-cached session carries the date as a string.
		getSessionFromCtx.mockResolvedValue(session(new Date().toISOString()));
		expect(
			await code(() =>
				passkeyBeforeHook(hookCtx("/passkey/generate-register-options")),
			),
		).toBe("allowed");
	});
});

describe("passkeyAfterHook, a successful passkey authentication", () => {
	const deleteSession = vi.fn();
	const ctx = (returned: unknown, newToken: string | null) =>
		({
			path: "/passkey/verify-authentication",
			context: {
				returned,
				newSession: newToken
					? { session: { token: newToken }, user: { id: "u1" } }
					: null,
				internalAdapter: { deleteSession },
			},
		}) as never;
	beforeEach(() => {
		vi.clearAllMocks();
		getSessionFromCtx.mockResolvedValue({
			user: { id: "u1" },
			session: { token: "old" },
		});
	});

	it("ends the session the request came in with, never the new one", async () => {
		await passkeyAfterHook(ctx({}, "new"));
		expect(deleteSession).toHaveBeenCalledTimes(1);
		expect(deleteSession).toHaveBeenCalledWith("old");
	});

	it("keeps the old session when the ceremony failed", async () => {
		const { APIError } = await import("better-auth/api");
		await passkeyAfterHook(ctx(new APIError("BAD_REQUEST"), "new"));
		await passkeyAfterHook(ctx({}, null));
		expect(deleteSession).not.toHaveBeenCalled();
	});

	it("deletes nothing when no new session replaced the old one", async () => {
		await passkeyAfterHook(ctx({}, "old"));
		getSessionFromCtx.mockResolvedValue(null);
		await passkeyAfterHook(ctx({}, "new"));
		getSessionFromCtx.mockResolvedValue({
			user: { id: "someone-else" },
			session: { token: "old" },
		});
		await passkeyAfterHook(ctx({}, "new"));
		expect(deleteSession).not.toHaveBeenCalled();
	});
});

describe("markSessionVerified", () => {
	it("stamps exactly the session named", async () => {
		await markSessionVerified("tok");
		expect(sessionUpdate).toHaveBeenCalledWith({
			where: { token: "tok" },
			data: { passkeyVerified: true },
		});
	});
});
