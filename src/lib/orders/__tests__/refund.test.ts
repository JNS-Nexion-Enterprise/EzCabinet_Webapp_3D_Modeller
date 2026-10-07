import { beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
const markRefunded = vi.hoisted(() => vi.fn());
const gatewayRefund = vi.hoisted(() => vi.fn());
const gatewayById = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { order: { findUnique, updateMany } },
}));
vi.mock("@/lib/orders/cancel", () => ({ markRefunded }));
vi.mock("@/lib/payments/registry", () => ({ gatewayById }));

const { RefundRefused } = await import("@/lib/payments/types");
const { refundState, requestGatewayRefund, refundFailed } = await import(
	"@/lib/orders/refund"
);

const PAID_AT = new Date("2026-10-01T02:00:00Z");
const ASKED_AT = new Date("2026-10-07T03:00:00Z");

const owed = {
	status: "CANCELLED",
	paidAt: PAID_AT,
	refundedAt: null,
	refundRef: null,
	refundRequestedAt: null,
};

describe("refundState", () => {
	it.each([
		["a paid order", { ...owed, status: "PAID" }, "none"],
		["cancelled before payment", { ...owed, paidAt: null }, "none"],
		[
			"a paid order with stray refund fields",
			{ ...owed, status: "PAID", refundRef: "re_1", refundedAt: ASKED_AT },
			"none",
		],
		["cancelled after payment", owed, "due"],
		[
			"asked, never answered",
			{ ...owed, refundRequestedAt: ASKED_AT },
			"unacknowledged",
		],
		[
			"the gateway is processing it",
			{ ...owed, refundRequestedAt: ASKED_AT, refundRef: "re_1" },
			"pending",
		],
		[
			"a refund id with no attempt marker",
			{ ...owed, refundRef: "re_1" },
			"pending",
		],
		[
			"refunded by the gateway",
			{
				...owed,
				refundRequestedAt: ASKED_AT,
				refundRef: "re_1",
				refundedAt: ASKED_AT,
			},
			"refunded",
		],
		[
			"refunded by hand, no reference",
			{ ...owed, refundedAt: ASKED_AT },
			"refunded",
		],
	] as const)("%s → %s", (_, order, expected) => {
		expect(refundState(order)).toBe(expected);
	});
});

const row = (over = {}) => ({
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	paymentProvider: "stripe",
	paymentRef: "pi_1",
	...owed,
	...over,
});

const ask = () => requestGatewayRefund("ord1", { actorName: "Boss" });

describe("requestGatewayRefund", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		findUnique.mockResolvedValue(row());
		updateMany.mockResolvedValue({ count: 1 });
		gatewayById.mockReturnValue({ refund: gatewayRefund });
		gatewayRefund.mockResolvedValue({ ref: "re_1", settled: false });
		markRefunded.mockResolvedValue(true);
	});

	it("claims with every eligibility condition, then asks the gateway", async () => {
		vi.useFakeTimers({ now: ASKED_AT });
		expect(await ask()).toEqual({ ok: true, settled: false });
		vi.useRealTimers();

		const claim = updateMany.mock.calls[0][0];
		expect(claim.where).toEqual({
			id: "ord1",
			status: "CANCELLED",
			paidAt: { not: null },
			refundedAt: null,
			refundRef: null,
			refundRequestedAt: null,
		});
		expect(claim.data).toEqual({
			refundRequestedAt: ASKED_AT,
			refundError: null,
			refundedByName: "Boss",
		});
		expect(gatewayRefund).toHaveBeenCalledWith({
			id: "ord1",
			ref: "IC-20260826-014",
			paymentRef: "pi_1",
			idempotencyKey: `refund-ord1-${ASKED_AT.getTime()}`,
		});
		// The claim is committed before the gateway is called.
		expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(
			gatewayRefund.mock.invocationCallOrder[0],
		);
	});

	it("stores the gateway's refund id and waits for the webhook", async () => {
		await ask();
		expect(updateMany.mock.calls[1][0]).toEqual({
			where: {
				id: "ord1",
				status: "CANCELLED",
				refundedAt: null,
				refundRequestedAt: expect.any(Date),
			},
			data: { refundRef: "re_1" },
		});
		expect(markRefunded).not.toHaveBeenCalled();
	});

	it("records a refund the gateway settled at once", async () => {
		gatewayRefund.mockResolvedValue({ ref: "re_1", settled: true });
		expect(await ask()).toEqual({ ok: true, settled: true });
		expect(markRefunded).toHaveBeenCalledWith("ord1", { ref: "re_1" });
	});

	it("clears the attempt when the gateway refuses, so the next press is a new one", async () => {
		gatewayRefund.mockRejectedValue(
			new RefundRefused("Charge already refunded"),
		);
		expect(await ask()).toEqual({ ok: false, error: "gateway_refused" });
		const { where, data } = updateMany.mock.calls[1][0];
		expect(where).toEqual({
			id: "ord1",
			refundedAt: null,
			refundRef: null,
			refundRequestedAt: expect.any(Date),
		});
		expect(data).toEqual({
			refundRequestedAt: null,
			refundError: "Charge already refunded",
		});
	});

	it("keeps the attempt on an ambiguous error, and the next press repeats its key", async () => {
		gatewayRefund.mockRejectedValue(new Error("socket hang up"));
		vi.useFakeTimers({ now: ASKED_AT });
		expect(await ask()).toEqual({ ok: false, error: "not_acknowledged" });
		const { where, data } = updateMany.mock.calls[1][0];
		expect(where).toMatchObject({ id: "ord1", refundRequestedAt: ASKED_AT });
		expect(data).not.toHaveProperty("refundRequestedAt");
		expect(data.refundError).toMatch(/not acknowledge/i);

		// Later, from the state that left behind.
		vi.setSystemTime(new Date(ASKED_AT.getTime() + 10 * 60_000));
		findUnique.mockResolvedValue(row({ refundRequestedAt: ASKED_AT }));
		gatewayRefund.mockResolvedValue({ ref: "re_1", settled: false });
		expect(await ask()).toEqual({ ok: true, settled: false });
		vi.useRealTimers();

		const retry = updateMany.mock.calls[2][0];
		expect(retry.where.refundRequestedAt).toEqual(ASKED_AT);
		expect(retry.data.refundRequestedAt).toEqual(ASKED_AT);
		expect(gatewayRefund.mock.calls[1][0].idempotencyKey).toBe(
			gatewayRefund.mock.calls[0][0].idempotencyKey,
		);
	});

	it("never calls the gateway when the claim is lost", async () => {
		updateMany.mockResolvedValue({ count: 0 });
		expect(await ask()).toEqual({ ok: false, error: "changed" });
		expect(gatewayRefund).not.toHaveBeenCalled();
	});

	it("refuses a bank-transfer order without touching it", async () => {
		findUnique.mockResolvedValue(
			row({ paymentProvider: "manual", paymentRef: "TT-9" }),
		);
		expect(await ask()).toEqual({ ok: false, error: "manual_order" });
		expect(updateMany).not.toHaveBeenCalled();
		expect(gatewayRefund).not.toHaveBeenCalled();
	});

	it.each([
		["an unknown order", null, "not_found"],
		["an order still paid", row({ status: "PAID" }), "not_refundable"],
		["a refund in flight", row({ refundRef: "re_1" }), "not_refundable"],
		[
			"an order already refunded",
			row({ refundedAt: ASKED_AT }),
			"not_refundable",
		],
		[
			"an order with no payment id",
			row({ paymentRef: null }),
			"not_configured",
		],
	] as const)("refuses %s as %s", async (_, order, error) => {
		findUnique.mockResolvedValue(order);
		expect(await ask()).toEqual({ ok: false, error });
		expect(updateMany).not.toHaveBeenCalled();
		expect(gatewayRefund).not.toHaveBeenCalled();
	});

	it.each([
		["is gone", null],
		["cannot refund", {}],
	])("refuses when the gateway %s", async (_, gateway) => {
		gatewayById.mockReturnValue(gateway);
		expect(await ask()).toEqual({ ok: false, error: "not_configured" });
		expect(updateMany).not.toHaveBeenCalled();
	});
});

describe("refundFailed", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	it("makes a refund in flight due again, for that refund id only", async () => {
		updateMany.mockResolvedValue({ count: 1 });
		await refundFailed("ord1", "re_1", "It failed.");
		expect(updateMany).toHaveBeenCalledTimes(1);
		expect(updateMany.mock.calls[0][0]).toEqual({
			where: { id: "ord1", refundRef: "re_1", refundedAt: null },
			data: {
				refundRef: null,
				refundRequestedAt: null,
				refundError: "It failed.",
			},
		});
		expect(console.error).not.toHaveBeenCalled();
	});

	it("takes back a refund that failed after it was reported paid, loudly", async () => {
		updateMany
			.mockResolvedValueOnce({ count: 0 })
			.mockResolvedValueOnce({ count: 1 });
		await refundFailed("ord1", "re_1", "It failed.");
		expect(updateMany.mock.calls[1][0]).toEqual({
			where: { id: "ord1", refundRef: "re_1", refundedAt: { not: null } },
			data: {
				refundRef: null,
				refundRequestedAt: null,
				refundedAt: null,
				refundError: "It failed.",
			},
		});
		expect(console.error).toHaveBeenCalled();
	});
});
