import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const removePassword = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth/removePassword", () => ({ removePassword }));

const { POST } = await import("../route");
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
	POST(new Request("http://x", { method: "POST" }), {
		params: Promise.resolve({ id }),
	});

describe("POST /api/admin/users/[id]/remove-password", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	it("asks for users:manage", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		removePassword.mockResolvedValue("ok");
		await call("u1");
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
	});

	it("refuses an admin without the permission and removes nothing", async () => {
		requireAuth.mockRejectedValue(new AuthError(403));
		const response = await call("u1");
		expect(response.status).toBe(403);
		expect(removePassword).not.toHaveBeenCalled();
	});

	it("404s for a user that does not exist", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue(null);
		const response = await call("ghost");
		expect(response.status).toBe(404);
		expect(removePassword).not.toHaveBeenCalled();
	});

	it("409s when the account has no other way to sign in", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		removePassword.mockResolvedValue("no_other_sign_in");
		const response = await call("u1");
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "no_other_sign_in" });
		expect(console.info).not.toHaveBeenCalled();
	});

	it("removes the password and logs actor and target ids only", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		removePassword.mockResolvedValue("ok");
		const response = await call("u1");
		expect(response.status).toBe(200);
		expect(removePassword).toHaveBeenCalledWith("u1");
		expect(console.info).toHaveBeenCalledWith("Password removed", {
			actor: "boss",
			target: "u1",
		});
	});
});
