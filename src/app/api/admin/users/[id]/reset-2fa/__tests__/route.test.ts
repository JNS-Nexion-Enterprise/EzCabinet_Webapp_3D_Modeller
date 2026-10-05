import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const resetTwoFactor = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth/resetTwoFactor", () => ({ resetTwoFactor }));

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
};
const call = (id: string) =>
	POST(new Request("http://x", { method: "POST" }), {
		params: Promise.resolve({ id }),
	});

describe("POST /api/admin/users/[id]/reset-2fa", () => {
	beforeEach(() => vi.clearAllMocks());

	it("asks for users:manage", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		await call("u1");
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
	});

	it("refuses an admin without the permission and resets nothing", async () => {
		requireAuth.mockRejectedValue(new AuthError(403));
		const response = await call("u1");
		expect(response.status).toBe(403);
		expect(resetTwoFactor).not.toHaveBeenCalled();
	});

	it("404s for a user that does not exist", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue(null);
		const response = await call("ghost");
		expect(response.status).toBe(404);
		expect(resetTwoFactor).not.toHaveBeenCalled();
	});

	it("resets the named user", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "u1" });
		const response = await call("u1");
		expect(response.status).toBe(200);
		expect(resetTwoFactor).toHaveBeenCalledWith("u1");
	});

	it("lets a superadmin reset their own — they are signed out and enrol again", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "boss" });
		const response = await call("boss");
		expect(response.status).toBe(200);
		expect(resetTwoFactor).toHaveBeenCalledWith("boss");
	});
});
