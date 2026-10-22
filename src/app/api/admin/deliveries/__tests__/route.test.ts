import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const claim = vi.hoisted(() => vi.fn());
const create = vi.hoisted(() => vi.fn());
const resolveCoordinates = vi.hoisted(() => vi.fn());
const isFormerWorkshop = vi.hoisted(() => vi.fn());

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
vi.mock("@/lib/company/store", async () => {
	const { testCompany } = await import(
		"@/lib/company/__tests__/company.fixture"
	);
	return {
		getCompany: async () => testCompany({ orderPrefix: "PO" }),
		isFormerWorkshop,
	};
});
vi.mock("@/lib/logistics/geocode", () => ({
	resolveCoordinates,
	refreshGeocoderHealth: vi.fn(),
}));

const { testCompany } = await import("@/lib/company/__tests__/company.fixture");
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
	isFormerWorkshop.mockResolvedValue(false);
});

describe("POST /api/admin/deliveries", () => {
	it("stamps the delivery with the prefix live when it is made", async () => {
		await call();
		expect(create.mock.calls[0][0].data.refPrefix).toBe("PO");
	});

	it("writes the workshop's pickup without geocoding it", async () => {
		const workshop = testCompany();
		await call({ pickupAddress: workshop.address });
		const data = create.mock.calls[0][0].data;
		expect(data.fromWorkshop).toBe(true);
		expect(data.pickupLat).toBe(workshop.lat);
		expect(data.pickupPostcode).toBe(workshop.postcode);
		// The site only.
		expect(resolveCoordinates).toHaveBeenCalledTimes(1);
	});

	it("geocodes any other pickup and does not mark it from the workshop", async () => {
		await call();
		expect(create.mock.calls[0][0].data.fromWorkshop).toBe(false);
		expect(resolveCoordinates).toHaveBeenCalledTimes(2);
	});

	it("refuses a pickup at the old workshop from a form opened before the move", async () => {
		isFormerWorkshop.mockResolvedValue(true);
		const response = await call({ pickupAddress: "Lot 1, Jalan Lama, Klang" });
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "workshop_moved" });
		expect(isFormerWorkshop).toHaveBeenCalledWith(
			"Lot 1, Jalan Lama, Klang",
			expect.objectContaining({ address: testCompany().address }),
		);
		expect(resolveCoordinates).not.toHaveBeenCalled();
		expect(create).not.toHaveBeenCalled();
	});

	it("lets a typed pin at the old workshop through", async () => {
		isFormerWorkshop.mockResolvedValue(true);
		const response = await call({
			pickupAddress: "Lot 1, Jalan Lama, Klang",
			pickupLat: 3.05,
			pickupLng: 101.45,
		});
		expect(response.status).toBe(201);
	});

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
