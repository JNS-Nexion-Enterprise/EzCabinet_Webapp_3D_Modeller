import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const sessionUpdate = vi.hoisted(() => vi.fn());

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
	const unverified = { userId: "u1", verified: false };
	const verified = { userId: "u1", verified: true };

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

describe("markSessionVerified", () => {
	it("stamps exactly the session named", async () => {
		await markSessionVerified("tok");
		expect(sessionUpdate).toHaveBeenCalledWith({
			where: { token: "tok" },
			data: { passkeyVerified: true },
		});
	});
});
