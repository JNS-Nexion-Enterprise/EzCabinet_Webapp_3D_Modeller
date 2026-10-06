import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const resetPasskeys = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth/resetPasskeys", () => ({ resetPasskeys }));

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
	mustVerifyPasskey: false,
};
const call = (id: string) =>
	POST(new Request("http://x", { method: "POST" }), {
		params: Promise.resolve({ id }),
	});

describe("POST /api/admin/users/[id]/reset-passkey", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	it("asks for users:manage", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "c1", role: "CUSTOMER" });
		await call("c1");
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
	});

	it("refuses without the permission and resets nothing", async () => {
		requireAuth.mockRejectedValue(new AuthError(403));
		expect((await call("c1")).status).toBe(403);
		expect(resetPasskeys).not.toHaveBeenCalled();
	});

	it("404s for a user that does not exist", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue(null);
		expect((await call("ghost")).status).toBe(404);
		expect(resetPasskeys).not.toHaveBeenCalled();
	});

	it("404s for staff: they have no passkey step, a reset would only sign them out", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "s1", role: "ADMIN" });
		expect((await call("s1")).status).toBe(404);
		expect(resetPasskeys).not.toHaveBeenCalled();
	});

	it("resets the named user and records who did it", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "c1", role: "CUSTOMER" });
		expect((await call("c1")).status).toBe(200);
		expect(resetPasskeys).toHaveBeenCalledWith("c1");
		expect(console.info).toHaveBeenCalledWith("Passkeys reset", {
			actor: "boss",
			target: "c1",
		});
	});
});
