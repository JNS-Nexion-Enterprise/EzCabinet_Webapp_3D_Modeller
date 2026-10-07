import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const signUpEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/auth", () => ({ auth: { api: { signUpEmail } } }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { user: { findUnique, update } },
}));

const { POST } = await import("../route");

const superadmin = {
	id: "boss",
	email: "boss@x.com",
	name: "Boss",
	image: null,
	role: "SUPERADMIN" as const,
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	passkeyVerifiedAt: new Date(),
};

const invite = () =>
	POST(
		new Request("http://x", {
			method: "POST",
			body: JSON.stringify({
				email: "new@x.com",
				name: "New",
				role: "SUPERADMIN",
				password: "a-long-enough-password",
			}),
		}),
		undefined as never,
	);

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue(superadmin);
});

describe("POST /api/admin/users", () => {
	// An invite grants a role. Without the step-up, a held superadmin session
	// could promote an account it controls and enrol that account's passkey.
	it("403s without a recent passkey ceremony and creates nobody", async () => {
		requireAuth.mockResolvedValue({ ...superadmin, passkeyVerifiedAt: null });
		const response = await invite();
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: "step_up_required",
		});
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
		expect(findUnique).not.toHaveBeenCalled();
		expect(signUpEmail).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it("invites once the passkey step has passed", async () => {
		findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: "u9", role: "CUSTOMER" });
		const response = await invite();
		expect(response.status).toBe(201);
		expect(update.mock.calls[0][0]).toMatchObject({
			where: { id: "u9" },
			data: { role: "SUPERADMIN", invitedById: "boss" },
		});
	});
});
