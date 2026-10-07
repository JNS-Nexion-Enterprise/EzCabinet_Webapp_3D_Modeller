import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth/deleteUser", () => ({ deleteUser }));

const { DELETE, PATCH } = await import("../route");
const { AuthError } = await import("@/lib/auth/requireAuth");

const superadmin = {
	id: "boss",
	email: "boss@x.com",
	name: "Boss",
	image: null,
	role: "SUPERADMIN" as const,
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	// The route is step-up guarded: a passkey ceremony moments ago.
	passkeyVerifiedAt: new Date(),
};
const call = (id: string) =>
	DELETE(new Request("http://x", { method: "DELETE" }), {
		params: Promise.resolve({ id }),
	});

describe("DELETE /api/admin/users/[id]", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		deleteUser.mockResolvedValue("ok");
	});

	it("asks for users:manage", async () => {
		await call("u1");
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
	});

	it("refuses an admin without the permission and deletes nothing", async () => {
		requireAuth.mockRejectedValue(new AuthError(403));
		const response = await call("u1");
		expect(response.status).toBe(403);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it("404s for a user that does not exist", async () => {
		findUnique.mockResolvedValue(null);
		const response = await call("ghost");
		expect(response.status).toBe(404);
		expect(deleteUser).not.toHaveBeenCalled();
	});

	it("deletes the named user and logs ids only", async () => {
		const response = await call("u1");
		expect(response.status).toBe(200);
		expect(deleteUser).toHaveBeenCalledWith("u1", "boss");
		expect(console.info).toHaveBeenCalledWith("User deleted", {
			actor: "boss",
			target: "u1",
		});
	});

	it.each(["not_yourself", "has_orders"])(
		"answers 409 %s and logs nothing",
		async (reason) => {
			deleteUser.mockResolvedValue(reason);
			const response = await call("u1");
			expect(response.status).toBe(409);
			expect(await response.json()).toEqual({ error: reason });
			expect(console.info).not.toHaveBeenCalled();
		},
	);
});

describe("PATCH /api/admin/users/[id]", () => {
	const update = vi.fn();
	const patch = (body: unknown) =>
		PATCH(
			new Request("http://x", { method: "PATCH", body: JSON.stringify(body) }),
			{ params: Promise.resolve({ id: "u1" }) },
		);
	beforeEach(() => {
		vi.clearAllMocks();
		requireAuth.mockResolvedValue({ ...superadmin, passkeyVerifiedAt: null });
	});

	// A role change or a restore grants access, so a held session alone must
	// not be enough: it could otherwise mint itself a second superadmin.
	it.each([
		["a role change", { role: "SUPERADMIN" }],
		["a suspend", { disabled: true }],
		["a restore", { disabled: false }],
	])("403s %s without a recent passkey ceremony", async (_, body) => {
		const response = await patch(body);
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: "step_up_required",
		});
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
		expect(findUnique).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});
});
