import "server-only";
import Stripe from "stripe";
import {
	BadSignature,
	type PaymentEvent,
	type PaymentGateway,
	PaymentInProgress,
	RefundRefused,
	toSen,
} from "./types";

/**
 * Stripe, through a PaymentIntent and the Payment Element mounted in our own
 * checkout (`StripePayment.tsx`). Our form collects name, phone, email and
 * address; Stripe draws only the payment method — FPX, GrabPay, card — so the
 * customer types nothing twice.
 *
 * `server-only`: `STRIPE_SECRET_KEY` moves money. The browser gets the
 * publishable key and one intent's client secret, nothing else.
 */

/** Also listed client-side, in the deferred Payment Element; the two must agree. */
export const STRIPE_METHODS = ["fpx", "grabpay", "card"];

/** Intent states in which the customer can still try (again) to pay. */
const RESUMABLE = new Set<Stripe.PaymentIntent.Status>([
	"requires_payment_method",
	"requires_confirmation",
	"requires_action",
]);

let client: Stripe | undefined;

export function stripeGateway(): PaymentGateway | null {
	const secretKey = process.env.STRIPE_SECRET_KEY;
	const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
	if (!secretKey || !publishableKey) return null;
	client ??= new Stripe(secretKey);
	const stripe = client;

	return {
		id: "stripe",
		client: { kind: "stripe-elements", publishableKey },

		async start(order) {
			const amount = toSen(order.totalRm);
			// One intent per order: a retry after a declined card resumes it, so
			// two tabs or two presses can never become two charges.
			if (order.previousRef?.startsWith("pi_")) {
				const previous = await stripe.paymentIntents.retrieve(
					order.previousRef,
				);
				if (
					previous.status === "processing" ||
					previous.status === "succeeded"
				) {
					throw new PaymentInProgress(previous.id);
				}
				if (
					RESUMABLE.has(previous.status) &&
					previous.amount === amount &&
					previous.client_secret
				) {
					return {
						kind: "stripe-elements",
						ref: previous.id,
						publishableKey,
						clientSecret: previous.client_secret,
					};
				}
			}

			const metadata = { orderId: order.id, orderRef: order.ref };
			const intent = await stripe.paymentIntents.create(
				{
					amount,
					currency: "myr",
					payment_method_types: STRIPE_METHODS,
					description: `EzCabinet order ${order.ref}`,
					receipt_email: order.customerEmail ?? undefined,
					metadata,
				},
				// A double-submit inside Stripe's idempotency window gets the same intent.
				{ idempotencyKey: `order-${order.id}-${order.previousRef ?? "first"}` },
			);
			if (!intent.client_secret) throw new Error("stripe: no client secret");
			return {
				kind: "stripe-elements",
				ref: intent.id,
				publishableKey,
				clientSecret: intent.client_secret,
			};
		},

		async verify(rawBody, headers) {
			const secret = process.env.STRIPE_WEBHOOK_SECRET;
			if (!secret) throw new BadSignature("STRIPE_WEBHOOK_SECRET unset");
			let event: Stripe.Event;
			try {
				event = stripe.webhooks.constructEvent(
					rawBody,
					headers.get("stripe-signature") ?? "",
					secret,
				);
			} catch {
				throw new BadSignature("stripe signature");
			}
			if (
				event.type === "refund.created" ||
				event.type === "refund.updated" ||
				event.type === "refund.failed"
			) {
				// Stripe does not deliver events in order, so the event's snapshot
				// may be older than one already handled: a stale `succeeded`
				// arriving after `failed` must not record a refund. The event
				// only says which refund to look at; its state is read now.
				return refundEventOf(
					await stripe.refunds.retrieve(event.data.object.id),
				);
			}
			return eventOf(event);
		},

		async refund(order) {
			let refund: Stripe.Refund;
			try {
				// No amount: whatever of the payment is left. The metadata is how
				// `refund.*` events find their order — a Refund does not inherit
				// the intent's.
				refund = await stripe.refunds.create(
					{
						payment_intent: order.paymentRef,
						reason: "requested_by_customer",
						metadata: { orderId: order.id, orderRef: order.ref },
					},
					{ idempotencyKey: order.idempotencyKey },
				);
			} catch (error) {
				// These three are Stripe answering 400/402/404: it read the
				// request and sent nothing. Everything else propagates as
				// "unknown" — a connection error, a 5xx, a 429, or the 409 for a
				// key still in use by the first request.
				if (
					error instanceof Stripe.errors.StripeInvalidRequestError ||
					error instanceof Stripe.errors.StripeCardError ||
					error instanceof Stripe.errors.StripeIdempotencyError
				) {
					throw new RefundRefused(error.message);
				}
				throw error;
			}
			if (refund.status === "failed" || refund.status === "canceled") {
				throw new RefundRefused(
					`Stripe refund ${refund.status}: ${refund.failure_reason ?? "no reason given"}`,
				);
			}
			return { ref: refund.id, settled: refund.status === "succeeded" };
		},
	};
}

const OUTCOMES: Partial<
	Record<Stripe.Event.Type, "paid" | "pending" | "failed">
> = {
	"payment_intent.succeeded": "paid",
	"payment_intent.processing": "pending",
	"payment_intent.payment_failed": "failed",
};

function eventOf(event: Stripe.Event): PaymentEvent | null {
	const outcome = OUTCOMES[event.type];
	if (!outcome) return null;
	const intent = event.data.object as Stripe.PaymentIntent;
	const orderId = intent.metadata?.orderId;
	if (!orderId) return null;
	return {
		orderId,
		outcome,
		// What actually arrived, not what was asked for.
		amountSen: outcome === "paid" ? intent.amount_received : intent.amount,
		currency: intent.currency,
		ref: intent.id,
	};
}

/** A refund still on its way (`pending`, `requires_action`) needs no action yet. */
function refundEventOf(refund: Stripe.Refund): PaymentEvent | null {
	const outcome =
		refund.status === "succeeded"
			? "refunded"
			: refund.status === "failed" || refund.status === "canceled"
				? "refund_failed"
				: null;
	const paymentRef =
		typeof refund.payment_intent === "string"
			? refund.payment_intent
			: refund.payment_intent?.id;
	if (!outcome || !paymentRef) return null;
	return {
		outcome,
		orderId: refund.metadata?.orderId ?? null,
		paymentRef,
		amountSen: refund.amount,
		currency: refund.currency,
		ref: refund.id,
	};
}
