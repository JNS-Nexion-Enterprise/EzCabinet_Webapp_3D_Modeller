import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const resolveCoordinates = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => {
	const tx = { order: { updateMany: claim }, delivery: { create } };
	return {
		prisma: {
			order: { findUnique },
			$transaction: (run: (client: typeof tx) => unknown) => run(tx),
		},
	};
});
vi.mock("@/lib/logistics/geocode", () => ({
	resolveCoordinates,
	refreshGeocoderHealth: vi.fn(),
}));

const { POST } = await import("../route");

const body = {
	customerName: "Mei",
	customerPhone: "+60123456789",
	siteAddress: "1 Jalan Satu, Shah Alam",
	pickupAddress: "Workshop, Klang",
	orderId: "ord1",
};

const call = (over = {}) =>
	POST(
		new Request("http://x", {
			method: "POST",
			body: JSON.stringify({ ...body, ...over }),
		}),
		undefined as never,
	);

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
	findUnique.mockResolvedValue({ status: "PAID" });
	resolveCoordinates.mockResolvedValue({
		lat: 3.07,
		lng: 101.5,
		geocodedFor: "x",
		postcode: "40000",
		city: "Shah Alam",
		state: "Selangor",
	});
	claim.mockResolvedValue({ count: 1 });
	create.mockResolvedValue({ id: "d1" });
});

describe("POST /api/admin/deliveries", () => {
	it("creates a paid order's delivery, re-checking the order as it writes", async () => {
		const response = await call();
		expect(response.status).toBe(201);
		expect(claim.mock.calls[0][0].where).toEqual({
			id: "ord1",
			status: "PAID",
		});
		// Re-checked after the geocode, immediately before the insert.
		expect(resolveCoordinates.mock.invocationCallOrder[0]).toBeLessThan(
			claim.mock.invocationCallOrder[0],
		);
		expect(claim.mock.invocationCallOrder[0]).toBeLessThan(
			create.mock.invocationCallOrder[0],
		);
	});

	it("refuses when the order stopped being paid while the address was geocoded", async () => {
		// Paid at the first look; cancelled by the time the delivery is written.
		claim.mockResolvedValue({ count: 0 });
		const response = await call();
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "order_not_paid" });
		expect(create).not.toHaveBeenCalled();
	});

	it("refuses an unpaid order before geocoding anything", async () => {
		findUnique.mockResolvedValue({ status: "CANCELLED" });
		expect((await call()).status).toBe(409);
		expect(resolveCoordinates).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	it("creates a standalone delivery without touching any order", async () => {
		expect((await call({ orderId: null })).status).toBe(201);
		expect(claim).not.toHaveBeenCalled();
		expect(create).toHaveBeenCalledTimes(1);
	});
});
