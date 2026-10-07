import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one route that turns an online payment into PAID. What must hold, for
 * any gateway: a forgery writes nothing, a charge that differs from the stored
 * total writes nothing, and a genuine matching payment marks the order paid.
 * Exercised through the Stripe adapter because it is the one built.
 */

const markOrderPaid = vi.fn();
const markRefunded = vi.fn();
const refundFailed = vi.fn();
const findFirst = vi.fn();
vi.mock("@/lib/orders/markPaid", () => ({ markOrderPaid }));
vi.mock("@/lib/orders/cancel", () => ({ markRefunded }));
vi.mock("@/lib/orders/refund", () => ({ refundFailed }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		order: {
			findUnique: vi.fn(async () => ({ totalRm: 2641.76 })),
			findFirst,
		},
	},
}));

const SECRET = "whsec_test";
process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_x";
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

const { POST } = await import("../route");

function succeeded(amountReceived: number) {
	return JSON.stringify({
		id: "evt_1",
		object: "event",
		type: "payment_intent.succeeded",
		data: {
			object: {
				id: "pi_1",
				object: "payment_intent",
				metadata: { orderId: "ord1" },
				amount: 264176,
				amount_received: amountReceived,
				currency: "myr",
				status: "succeeded",
			},
		},
	});
}

function post(body: string, signature: string) {
	return POST(
		new Request("http://x/api/webhooks/payment/stripe", {
			method: "POST",
			body,
			headers: { "stripe-signature": signature },
		}),
		{ params: Promise.resolve({ gateway: "stripe" }) },
	);
}

const sign = (payload: string) =>
	new Stripe("sk_test_x").webhooks.generateTestHeaderString({
		payload,
		secret: SECRET,
	});

type RefundOver = {
	id?: string;
	amount?: number;
	status?: string;
	metadata?: Record<string, string>;
};

const refundObject = (over: RefundOver = {}) => ({
	id: over.id ?? "re_1",
	object: "refund",
	payment_intent: "pi_1",
	metadata: over.metadata ?? { orderId: "ord1" },
	amount: over.amount ?? 264176,
	currency: "myr",
	status: over.status ?? "succeeded",
});

/** A `refund.*` event. Ours carry `orderId`; one from the dashboard does not. */
const refundEvent = (
	type: "refund.updated" | "refund.failed",
	over: RefundOver = {},
) =>
	JSON.stringify({
		id: "evt_2",
		object: "event",
		type,
		data: { object: refundObject(over) },
	});

/**
 * The adapter reads a refund's current state from Stripe rather than trusting
 * the event's snapshot. Every Stripe client shares the resource's prototype,
 * so this stubs the adapter's own call.
 */
const retrieve = vi.spyOn(
	Object.getPrototypeOf(new Stripe("sk_test_x").refunds),
	"retrieve",
);

/** Deliver an event whose snapshot is also the refund's current state. */
async function deliver(
	type: "refund.updated" | "refund.failed",
	over: RefundOver = {},
) {
	retrieve.mockResolvedValue(refundObject(over));
	const body = refundEvent(type, over);
	return post(body, sign(body));
}

/** Cancelled after payment, our refund `re_1` in flight. */
const order = {
	id: "ord1",
	status: "CANCELLED",
	totalRm: 2641.76,
	paymentProvider: "stripe",
	paymentRef: "pi_1",
	refundRef: "re_1" as string | null,
};

describe("payment webhook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "error").mockImplementation(() => {});
		findFirst.mockResolvedValue(order);
	});

	it("refuses a forged signature and writes nothing", async () => {
		const res = await post(succeeded(264176), "t=1,v1=forged");
		expect(res.status).toBe(400);
		expect(markOrderPaid).not.toHaveBeenCalled();
	});

	it("marks a matching payment paid", async () => {
		const body = succeeded(264176);
		const res = await post(body, sign(body));
		expect(res.status).toBe(200);
		expect(markOrderPaid).toHaveBeenCalledWith("ord1", {
			paymentProvider: "stripe",
			paymentRef: "pi_1",
		});
	});

	it("never marks paid when the charge differs from the order total", async () => {
		const body = succeeded(100);
		const res = await post(body, sign(body));
		expect(res.status).toBe(200);
		expect(markOrderPaid).not.toHaveBeenCalled();
	});

	it("records our refund when the gateway says it succeeded", async () => {
		const res = await deliver("refund.updated");
		expect(res.status).toBe(200);
		expect(retrieve.mock.calls[0][0]).toBe("re_1");
		expect(findFirst.mock.calls[0][0].where).toEqual({ id: "ord1" });
		expect(markRefunded).toHaveBeenCalledWith("ord1", { ref: "re_1" });
	});

	it("accepts our refund for a remainder, because the id matches", async () => {
		// Part of the payment was already refunded in the dashboard.
		await deliver("refund.updated", { amount: 200000 });
		expect(markRefunded).toHaveBeenCalledWith("ord1", { ref: "re_1" });
	});

	it("records a full refund made in the dashboard on a cancelled order", async () => {
		findFirst.mockResolvedValue({ ...order, refundRef: null });
		await deliver("refund.updated", { id: "re_dash", metadata: {} });
		expect(findFirst.mock.calls[0][0].where).toEqual({
			paymentProvider: "stripe",
			paymentRef: "pi_1",
		});
		expect(markRefunded).toHaveBeenCalledWith("ord1", { ref: "re_dash" });
	});

	it("never applies a partial refund made in the dashboard", async () => {
		findFirst.mockResolvedValue({ ...order, refundRef: null });
		const res = await deliver("refund.updated", {
			id: "re_dash",
			metadata: {},
			amount: 5000,
		});
		expect(res.status).toBe(200);
		expect(markRefunded).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalled();
	});

	it("writes nothing for a refund on an order that is not cancelled", async () => {
		findFirst.mockResolvedValue({ ...order, status: "PAID", refundRef: null });
		const res = await deliver("refund.updated", {
			id: "re_dash",
			metadata: {},
		});
		expect(res.status).toBe(200);
		expect(markRefunded).not.toHaveBeenCalled();
		expect(refundFailed).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("not cancelled"),
			expect.objectContaining({ orderId: "ord1" }),
		);
	});

	it.each([
		["payment", { paymentRef: "pi_other" }],
		["gateway", { paymentProvider: "fiuu" }],
	])("never applies a refund whose %s is not the order's", async (_, over) => {
		findFirst.mockResolvedValue({ ...order, ...over });
		await deliver("refund.updated");
		expect(markRefunded).not.toHaveBeenCalled();
	});

	it("never applies a refund for an order it cannot find", async () => {
		findFirst.mockResolvedValue(null);
		const res = await deliver("refund.updated");
		expect(res.status).toBe(200);
		expect(markRefunded).not.toHaveBeenCalled();
	});

	it("makes the refund due again when the gateway says ours failed", async () => {
		const res = await deliver("refund.failed", { status: "failed" });
		expect(res.status).toBe(200);
		expect(refundFailed).toHaveBeenCalledWith("ord1", "re_1");
		expect(markRefunded).not.toHaveBeenCalled();
	});

	it("ignores a failure for a refund that is not the one in flight", async () => {
		await deliver("refund.failed", { id: "re_old", status: "failed" });
		expect(refundFailed).not.toHaveBeenCalled();
	});

	it("reads the refund's current state, not a stale event's", async () => {
		// Delivered late: the snapshot says succeeded, Stripe now says failed.
		retrieve.mockResolvedValue(refundObject({ status: "failed" }));
		const body = refundEvent("refund.updated", { status: "succeeded" });
		const res = await post(body, sign(body));
		expect(res.status).toBe(200);
		expect(markRefunded).not.toHaveBeenCalled();
		expect(refundFailed).toHaveBeenCalledWith("ord1", "re_1");
	});

	it("waits while a refund is still on its way", async () => {
		const res = await deliver("refund.updated", { status: "pending" });
		expect(res.status).toBe(200);
		expect(findFirst).not.toHaveBeenCalled();
		expect(markRefunded).not.toHaveBeenCalled();
		expect(refundFailed).not.toHaveBeenCalled();
	});

	it("writes nothing for a forged refund, and asks Stripe nothing", async () => {
		const res = await post(refundEvent("refund.updated"), "t=1,v1=x");
		expect(res.status).toBe(400);
		expect(retrieve).not.toHaveBeenCalled();
		expect(markRefunded).not.toHaveBeenCalled();
	});

	it("404s a gateway that is not configured", async () => {
		const res = await POST(new Request("http://x", { method: "POST" }), {
			params: Promise.resolve({ gateway: "fiuu" }),
		});
		expect(res.status).toBe(404);
	});
});
