import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const findUniqueOrThrow = vi.hoisted(() => vi.fn());
const enqueue = vi.hoisted(() => vi.fn());
const flushSoon = vi.hoisted(() => vi.fn());
const draftsFor = vi.hoisted(() => vi.fn());
/** What `markRefunded`'s transaction writes through. */
const tx = vi.hoisted(() => ({ order: {} as Record<string, unknown> }));
vi.mock("@/lib/catalogue/db", () => {
	tx.order = { updateMany, findUniqueOrThrow };
	return {
		prisma: {
			order: { findUnique, updateMany },
			$transaction: (run: (client: typeof tx) => unknown) => run(tx),
		},
	};
});
vi.mock("@/lib/whatsapp/outbox", () => ({ enqueue, flushSoon }));
vi.mock("@/lib/whatsapp/templates", () => ({
	draftsFor,
	NOTIFY_ORDER_SELECT: {},
}));

const { cancelBlock, cancelOrder, markRefunded } = await import(
	"@/lib/orders/cancel"
);

const unpaid = {
	status: "AWAITING_PAYMENT",
	productionStage: null,
	hasLiveDelivery: false,
} as const;
const paid = { ...unpaid, status: "PAID" } as const;

describe("cancelBlock", () => {
	it.each([
		["an unpaid order, no reason", unpaid, null, null],
		["a paid order with a reason", paid, "Customer changed mind", null],
		["a paid order without a reason", paid, null, "reason_required"],
		[
			"a cancelled order",
			{ ...unpaid, status: "CANCELLED" },
			"x",
			"already_cancelled",
		],
		[
			"an order in production",
			{ ...paid, productionStage: "MEASURE" },
			"x",
			"in_production",
		],
		[
			"an order with a live delivery",
			{ ...paid, hasLiveDelivery: true },
			"x",
			"has_delivery",
		],
	] as const)("%s → %s", (_, order, reason, expected) => {
		expect(cancelBlock(order, reason)).toBe(expected);
	});
});

describe("cancelOrder", () => {
	beforeEach(() => {
		findUnique.mockReset();
		updateMany.mockReset();
		updateMany.mockResolvedValue({ count: 1 });
	});
	const row = (over = {}) => ({
		status: "PAID",
		productionStage: null,
		_count: { deliveries: 0 },
		...over,
	});

	it("cancels a paid order, recording who and why, keeping paidAt", async () => {
		findUnique.mockResolvedValue(row());
		expect(
			await cancelOrder("o1", { byName: "Mei", reason: "Duplicate" }),
		).toBe("ok");
		const { where, data } = updateMany.mock.calls[0][0];
		expect(where).toMatchObject({
			id: "o1",
			status: "PAID",
			productionStage: null,
		});
		expect(data).toMatchObject({
			status: "CANCELLED",
			cancelledByName: "Mei",
			cancelReason: "Duplicate",
		});
		expect(data.cancelledAt).toBeInstanceOf(Date);
		expect(data).not.toHaveProperty("paidAt");
	});

	it("refuses an order already in production without writing", async () => {
		findUnique.mockResolvedValue(row({ productionStage: "CUTTING" }));
		expect(await cancelOrder("o1", { byName: "Mei", reason: "x" })).toBe(
			"in_production",
		);
		expect(updateMany).not.toHaveBeenCalled();
	});

	it("reports a race as changed", async () => {
		findUnique.mockResolvedValue(row());
		updateMany.mockResolvedValue({ count: 0 });
		expect(await cancelOrder("o1", { byName: "Mei", reason: "x" })).toBe(
			"changed",
		);
	});

	it("answers not_found for an unknown id", async () => {
		findUnique.mockResolvedValue(null);
		expect(await cancelOrder("nope", { byName: null, reason: null })).toBe(
			"not_found",
		);
	});
});

describe("markRefunded", () => {
	const order = { id: "o1", publicToken: "tok" };
	beforeEach(() => {
		vi.clearAllMocks();
		updateMany.mockResolvedValue({ count: 1 });
		findUniqueOrThrow.mockResolvedValue(order);
		draftsFor.mockReturnValue([{ dedupeKey: "order:o1:refunded" }]);
		enqueue.mockResolvedValue(["n1"]);
	});

	it("marks only a cancelled, paid, not-yet-refunded order", async () => {
		expect(
			await markRefunded("o1", { byName: "Mei", ref: "TT-1", byHand: true }),
		).toBe(true);
		const { where, data } = updateMany.mock.calls[0][0];
		// By hand: never over a gateway refund that is still in flight.
		expect(where).toEqual({
			id: "o1",
			status: "CANCELLED",
			paidAt: { not: null },
			refundedAt: null,
			refundRef: null,
		});
		expect(data).toEqual({
			refundedAt: expect.any(Date),
			refundedByName: "Mei",
			refundRef: "TT-1",
			refundError: null,
		});
	});

	it("records the gateway's refund over its own in-flight id, keeping who asked", async () => {
		expect(await markRefunded("o1", { ref: "re_1" })).toBe(true);
		const { where, data } = updateMany.mock.calls[0][0];
		expect(where).toEqual({
			id: "o1",
			status: "CANCELLED",
			paidAt: { not: null },
			refundedAt: null,
		});
		expect(data).toEqual({
			refundedAt: expect.any(Date),
			refundRef: "re_1",
			refundError: null,
		});
	});

	it("queues the customer's message exactly once, in the same transaction", async () => {
		await markRefunded("o1", { ref: "re_1" });
		expect(draftsFor).toHaveBeenCalledWith({ kind: "ORDER_REFUNDED", order });
		expect(enqueue).toHaveBeenCalledTimes(1);
		expect(enqueue).toHaveBeenCalledWith(tx, [
			{ dedupeKey: "order:o1:refunded" },
		]);
		expect(flushSoon).toHaveBeenCalledWith(["n1"]);
	});

	it("is a no-op when already refunded: false, and nothing queued", async () => {
		updateMany.mockResolvedValue({ count: 0 });
		expect(await markRefunded("o1", { ref: "re_1" })).toBe(false);
		expect(enqueue).not.toHaveBeenCalled();
		expect(flushSoon).not.toHaveBeenCalled();
	});
});
