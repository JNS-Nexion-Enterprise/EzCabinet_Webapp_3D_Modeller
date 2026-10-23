import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const geocodeAddress = vi.hoisted(() => vi.fn());
const geocoderFault = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/logistics/geocode", () => ({ geocodeAddress, geocoderFault }));

const { POST } = await import("../route");

const call = (body: unknown) =>
	POST(
		new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
		undefined as never,
	);

const found = {
	lat: 2.98,
	lng: 101.86,
	formattedAddress: "Dengkil",
	postcode: "43800",
	city: "Dengkil",
	state: "MY-10",
};

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue({
		id: "u1",
		name: "Aisyah",
		role: "SUPERADMIN",
	});
	geocodeAddress.mockResolvedValue(found);
	geocoderFault.mockReturnValue(null);
});

describe("POST /api/admin/company/geocode", () => {
	it("geocodes the trimmed address", async () => {
		const res = await call({ address: "  Lot 5, Jalan Kilang 2, Dengkil " });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ found, fault: null });
		expect(geocodeAddress).toHaveBeenCalledWith(
			"Lot 5, Jalan Kilang 2, Dengkil",
		);
	});

	it("refuses an empty address", async () => {
		const res = await call({ address: "  " });
		expect(res.status).toBe(400);
		expect(geocodeAddress).not.toHaveBeenCalled();
	});
});
