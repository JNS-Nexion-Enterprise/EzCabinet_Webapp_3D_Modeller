import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { user: { findUnique } },
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const { currentUser } = await import("@/lib/auth/session");

const row = {
	id: "u1",
	email: "a@b.com",
	name: "A",
	image: null,
	role: "ADMIN",
	disabled: false,
	mustChangePassword: false,
	twoFactorEnabled: false,
	accounts: [] as { id: string }[],
};

const user = {
	id: "u1",
	email: "a@b.com",
	name: "A",
	image: null,
	role: "ADMIN",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: false,
};

beforeEach(() => {
	getSession.mockReset();
	findUnique.mockReset();
});

describe("currentUser", () => {
	it("returns the user for a live session", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue(row);
		await expect(currentUser()).resolves.toEqual(user);
	});

	it("asks staff with a password and no second factor to set one up", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue({ ...row, accounts: [{ id: "acc1" }] });
		await expect(currentUser()).resolves.toEqual({
			...user,
			mustSetupTwoFactor: true,
		});
	});

	it("does not ask once the second factor is enabled", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue({
			...row,
			accounts: [{ id: "acc1" }],
			twoFactorEnabled: true,
		});
		await expect(currentUser()).resolves.toEqual(user);
	});

	it("treats a null twoFactorEnabled as not enabled", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue({
			...row,
			accounts: [{ id: "acc1" }],
			twoFactorEnabled: null,
		});
		await expect(currentUser()).resolves.toMatchObject({
			mustSetupTwoFactor: true,
		});
	});

	it("is null when there is no session", async () => {
		getSession.mockResolvedValue(null);
		await expect(currentUser()).resolves.toBeNull();
		expect(findUnique).not.toHaveBeenCalled();
	});

	it("is null when the session names a row that is gone", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue(null);
		await expect(currentUser()).resolves.toBeNull();
	});

	it("is null for a disabled user holding a valid session", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue({ ...row, disabled: true });
		await expect(currentUser()).resolves.toBeNull();
	});

	it("reads the row on every call, never a cached role", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue(row);
		await currentUser();
		await currentUser();
		expect(findUnique).toHaveBeenCalledTimes(2);
	});

	it("asks a customer whose session has not passed a passkey", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({
			mustVerifyPasskey: true,
		});
	});

	it("does not ask once the session is passkey-verified", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: true },
		});
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({
			mustVerifyPasskey: false,
		});
	});

	it("treats a null flag as not verified", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: null },
		});
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({
			mustVerifyPasskey: true,
		});
	});

	it("never asks staff, whatever the session says", async () => {
		getSession.mockResolvedValue({
			user: { id: "u1" },
			session: { passkeyVerified: false },
		});
		findUnique.mockResolvedValue(row);
		await expect(currentUser()).resolves.toMatchObject({
			mustVerifyPasskey: false,
		});
	});
});
