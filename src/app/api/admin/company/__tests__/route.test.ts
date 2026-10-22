import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const saveCompany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/company/save", () => ({ saveCompany }));

const { testCompany } = await import("@/lib/company/__tests__/company.fixture");
const { BYPASS_USER } = await import("@/lib/auth/requireAuth");
const { POST } = await import("../route");

const call = (body: unknown) =>
	POST(
		new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
		undefined as never,
	);

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue({
		id: "u1",
		name: "Aisyah",
		role: "SUPERADMIN",
		passkeyVerifiedAt: new Date(),
	});
	saveCompany.mockResolvedValue({ ok: true, repointed: 2 });
});

describe("POST /api/admin/company", () => {
	it("refuses a pin outside Malaysia", async () => {
		const res = await call({
			details: { ...testCompany(), lat: 101.86, lng: 2.98 },
		});
		expect(res.status).toBe(400);
		expect((await res.json()).error).toBe("invalid_body");
		expect(saveCompany).not.toHaveBeenCalled();
	});

	it("passes the move question through as a 409", async () => {
		const move = { repoint: [], booked: [] };
		saveCompany.mockResolvedValue({ ok: false, error: "confirm_move", move });
		const res = await call({ details: testCompany() });
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ error: "confirm_move", move });
	});

	it("saves as the signed-in superadmin", async () => {
		const res = await call({ details: testCompany(), confirmMove: true });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true, repointed: 2 });
		expect(saveCompany).toHaveBeenCalledWith(
			expect.objectContaining({ brand: testCompany().brand }),
			{ id: "u1", name: "Aisyah" },
			true,
		);
	});

	it("records no actor id for the local bypass user", async () => {
		requireAuth.mockResolvedValue({
			...BYPASS_USER,
			passkeyVerifiedAt: new Date(),
		});
		await call({ details: testCompany() });
		expect(saveCompany).toHaveBeenCalledWith(
			expect.anything(),
			{ id: null, name: BYPASS_USER.name },
			false,
		);
	});
});
