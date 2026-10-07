import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const flushSoon = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => {
	const order = { findUnique, updateMany };
	return {
		prisma: {
			order,
			$transaction: (run: (tx: { order: typeof order }) => unknown) =>
				run({ order }),
		},
	};
});
vi.mock("@/lib/whatsapp/outbox", () => ({ enqueue, flushSoon }));

const { POST } = await import("../route");

const order = {
	id: "ord1",
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok",
	customerName: "Mei",
	customerPhone: "+60123456789",
	totalRm: 2641.76,
	locale: "en",
	whatsappOptIn: true,
	status: "PAID",
	productionStage: null,
};

const call = () =>
	POST(
		new Request("http://x", {
			method: "POST",
			body: JSON.stringify({ stage: "MEASURE" }),
		}),
		{ params: Promise.resolve({ id: "ord1" }) },
	);

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue({ id: "a1", name: "Admin", role: "ADMIN" });
	findUnique.mockResolvedValue(order);
	updateMany.mockResolvedValue({ count: 1 });
	enqueue.mockResolvedValue(["n1"]);
});

describe("POST /api/admin/orders/[id]/stage", () => {
	it("advances only an order that is still paid when the write lands", async () => {
		expect((await call()).status).toBe(200);
		expect(updateMany.mock.calls[0][0]).toEqual({
			where: { id: "ord1", status: "PAID", productionStage: null },
			data: { productionStage: "MEASURE" },
		});
		expect(enqueue).toHaveBeenCalledTimes(1);
	});

	it("refuses, and messages nobody, when a cancel got there first", async () => {
		// Read as paid; cancelled before the conditional write.
		updateMany.mockResolvedValue({ count: 0 });
		const response = await call();
		expect(response.status).toBe(409);
		expect(enqueue).not.toHaveBeenCalled();
		expect(flushSoon).not.toHaveBeenCalled();
	});

	it("refuses a cancelled order without writing", async () => {
		findUnique.mockResolvedValue({ ...order, status: "CANCELLED" });
		const response = await call();
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({ error: "not_paid" });
		expect(updateMany).not.toHaveBeenCalled();
	});
});
