import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.STRIPE_SECRET_KEY = "sk_test_x";
process.env.STRIPE_PUBLISHABLE_KEY = "pk_test_x";

const { stripeGateway } = await import("@/lib/payments/stripe");
const { RefundRefused } = await import("@/lib/payments/types");

// Every Stripe client shares the resource's prototype, the adapter's included.
const create = vi.spyOn(
	Object.getPrototypeOf(new Stripe("sk_test_x").refunds),
	"create",
);

const refund = () =>
	stripeGateway()?.refund?.({
		id: "ord1",
		ref: "IC-20260826-014",
		paymentRef: "pi_1",
		idempotencyKey: "refund-ord1-1",
	});

const raw = (type: string, statusCode: number) =>
	({ type, statusCode, message: "Stripe says so" }) as Parameters<
		typeof Stripe.errors.StripeError.generate
	>[0];

/**
 * The line this adapter must hold: only Stripe reading the request and saying
 * no is a refusal. Anything that might be a refund that went through is not.
 */
describe("stripe refund", () => {
	// Braces matter: a function returned from `beforeEach` is run as teardown.
	beforeEach(() => {
		create.mockReset();
	});

	it("refunds the whole payment under the caller's idempotency key", async () => {
		create.mockResolvedValue({ id: "re_1", status: "pending" });
		await expect(refund()).resolves.toEqual({ ref: "re_1", settled: false });
		expect(create).toHaveBeenCalledWith(
			{
				payment_intent: "pi_1",
				reason: "requested_by_customer",
				metadata: { orderId: "ord1", orderRef: "IC-20260826-014" },
			},
			{ idempotencyKey: "refund-ord1-1" },
		);
	});

	it("reports a refund that settled at once", async () => {
		create.mockResolvedValue({ id: "re_1", status: "succeeded" });
		await expect(refund()).resolves.toEqual({ ref: "re_1", settled: true });
	});

	it.each([
		["an invalid request", raw("invalid_request_error", 400)],
		["an unknown payment", raw("invalid_request_error", 404)],
		["a card error", raw("card_error", 402)],
		["a key reused for a different request", raw("idempotency_error", 400)],
	])("treats %s as a refusal", async (_, error) => {
		create.mockRejectedValue(Stripe.errors.StripeError.generate(error));
		await expect(refund()).rejects.toBeInstanceOf(RefundRefused);
	});

	it.each(["failed", "canceled"])(
		"treats a refund returned as %s as a refusal",
		async (status) => {
			create.mockResolvedValue({ id: "re_1", status, failure_reason: "x" });
			await expect(refund()).rejects.toBeInstanceOf(RefundRefused);
		},
	);

	it.each([
		["a key still in use by the first request", raw("idempotency_error", 409)],
		["a server error", raw("api_error", 500)],
		["a rate limit", raw("rate_limit_error", 429)],
		["a connection error", new Stripe.errors.StripeConnectionError(raw("", 0))],
		["a timeout", new Error("ETIMEDOUT")],
	])("never treats %s as a refusal", async (_, error) => {
		const thrown =
			error instanceof Error
				? error
				: Stripe.errors.StripeError.generate(error);
		create.mockRejectedValue(thrown);
		const outcome = await refund()?.catch((e: unknown) => e);
		expect(outcome).toBe(thrown);
		expect(outcome).not.toBeInstanceOf(RefundRefused);
	});
});

describe("stripe refund status", () => {
	const retrieve = vi.spyOn(
		Object.getPrototypeOf(new Stripe("sk_test_x").refunds),
		"retrieve",
	);

	// The same reading of a refund's status the webhook path uses.
	it.each([
		["succeeded", "refunded"],
		["failed", "failed"],
		["canceled", "failed"],
		["pending", "pending"],
		["requires_action", "pending"],
	])("reads %s as %s", async (status, expected) => {
		retrieve.mockResolvedValue({ id: "re_1", status });
		await expect(stripeGateway()?.refundStatus?.("re_1")).resolves.toBe(
			expected,
		);
		expect(retrieve).toHaveBeenLastCalledWith("re_1");
	});
});
