import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const requestGatewayRefund = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/orders/refund", () => ({ requestGatewayRefund }));

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
	mustVerifyPasskey: false,
	passkeyVerifiedAt: new Date(),
};

const call = () =>
	POST(new Request("http://x", { method: "POST" }), {
		params: Promise.resolve({ id: "ord1" }),
	});

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "info").mockImplementation(() => {});
	requireAuth.mockResolvedValue(superadmin);
	requestGatewayRefund.mockResolvedValue({ ok: true, settled: false });
});

describe("POST /api/admin/orders/[id]/refund", () => {
	it("asks for the orders:refund permission", async () => {
		await call();
		expect(requireAuth).toHaveBeenCalledWith("orders:refund");
	});

	it("403s without a recent passkey ceremony and refunds nothing", async () => {
		requireAuth.mockResolvedValue({ ...superadmin, passkeyVerifiedAt: null });
		const response = await call();
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: "step_up_required",
		});
		expect(requestGatewayRefund).not.toHaveBeenCalled();
	});

	it("passes who asked, and logs ids only", async () => {
		const response = await call();
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			ok: true,
			settled: false,
		});
		expect(requestGatewayRefund).toHaveBeenCalledWith("ord1", {
			actorName: "Boss",
		});
		expect(console.info).toHaveBeenCalledWith("Order refund requested", {
			actor: "boss",
			target: "ord1",
		});
	});

	it.each([
		["not_found", 404],
		["not_refundable", 409],
		["manual_order", 409],
		["not_configured", 409],
		["changed", 409],
		["gateway_refused", 502],
		["not_acknowledged", 502],
	])("answers %s with %i and logs nothing", async (error, status) => {
		requestGatewayRefund.mockResolvedValue({ ok: false, error });
		const response = await call();
		expect(response.status).toBe(status);
		await expect(response.json()).resolves.toEqual({ error });
		expect(console.info).not.toHaveBeenCalled();
	});
});
