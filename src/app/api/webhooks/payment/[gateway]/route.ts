import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { markRefunded } from "@/lib/orders/cancel";
import { markOrderPaid } from "@/lib/orders/markPaid";
import { refundFailed } from "@/lib/orders/refund";
import { gatewayById } from "@/lib/payments/registry";
import { BadSignature, toSen } from "@/lib/payments/types";

export const runtime = "nodejs";

/**
 * Where a payment gateway tells us an order was paid — the only thing that
 * ever marks an online payment PAID. A customer's return to the order page is
 * display only; both Stripe and Fiuu say not to trust it.
 *
 * Public, like the carrier webhooks, so it verifies itself: the body is read
 * as text, because signatures are over the raw bytes, and a forgery writes
 * nothing. The checks after verification belong here rather than in an
 * adapter, so no gateway can skip them:
 *
 * - the charge must equal the stored order total, in ringgit;
 * - `markOrderPaid` is conditional, so a retried notification is a no-op.
 *
 * A genuine event we do not act on is a quiet ack, so the gateway stops
 * retrying.
 *
 * Refunds are the same in reverse: only the gateway's word records one
 * (`lib/orders/refund.ts`). Ours is known by its refund id; one issued in the
 * gateway's dashboard counts only for the whole order total, and only on an
 * order that is already cancelled — anything else is logged for an admin and
 * never applied.
 */
export async function POST(
	request: Request,
	{ params }: { params: Promise<{ gateway: string }> },
) {
	const gateway = gatewayById((await params).gateway);
	if (!gateway) {
		return NextResponse.json({ error: "not_configured" }, { status: 404 });
	}

	const rawBody = await request.text();
	let event: Awaited<ReturnType<typeof gateway.verify>>;
	try {
		event = await gateway.verify(rawBody, request.headers);
	} catch (error) {
		if (error instanceof BadSignature) {
			return NextResponse.json({ error: "bad_signature" }, { status: 400 });
		}
		throw error;
	}
	const ack = () => gateway.ack?.() ?? NextResponse.json({ ok: true });
	if (event?.outcome === "refunded" || event?.outcome === "refund_failed") {
		// Our own refunds name their order; one made in the gateway's dashboard
		// is found by the payment it refunds.
		const order = await prisma.order.findFirst({
			where: event.orderId
				? { id: event.orderId }
				: { paymentProvider: gateway.id, paymentRef: event.paymentRef },
			select: {
				id: true,
				status: true,
				totalRm: true,
				paymentProvider: true,
				paymentRef: true,
				refundRef: true,
				refundRequestedAt: true,
			},
		});
		// The refund we asked for, whatever its amount: it may be the remainder
		// after a partial refund somebody made in the dashboard. Known by its
		// id, or — when this beats the write that stores the id — by naming
		// our order while an attempt is in flight.
		const ours =
			order?.refundRef === event.ref ||
			(order?.id === event.orderId && order.refundRequestedAt !== null);
		if (
			!order ||
			order.paymentProvider !== gateway.id ||
			order.paymentRef !== event.paymentRef ||
			event.currency !== "myr" ||
			(!ours && event.amountSen !== toSen(order.totalRm))
		) {
			console.error("payment webhook: refund does not match an order", {
				gateway: gateway.id,
				orderId: event.orderId,
				ref: event.ref,
			});
			return ack();
		}
		if (event.outcome === "refund_failed") {
			// A failure for any other refund id says nothing about ours. By id
			// only: one that beat the stored id is found by asking again.
			if (order.refundRef === event.ref) {
				await refundFailed(order.id, event.ref);
			}
			return ack();
		}
		if (order.status !== "CANCELLED") {
			// Money left for an order the app still thinks is live. Nothing is
			// written: an admin cancels it and records the refund by hand.
			console.error("payment webhook: refund on an order not cancelled", {
				gateway: gateway.id,
				orderId: order.id,
				ref: event.ref,
			});
			return ack();
		}
		await markRefunded(order.id, { ref: event.ref });
		return ack();
	}
	if (event?.outcome !== "paid") return ack();

	const order = await prisma.order.findUnique({
		where: { id: event.orderId },
		select: { totalRm: true },
	});
	if (
		!order ||
		event.currency !== "myr" ||
		event.amountSen !== toSen(order.totalRm)
	) {
		// Never marked paid silently; an admin reconciles it by hand.
		console.error("payment webhook: order or amount mismatch", {
			gateway: gateway.id,
			orderId: event.orderId,
			ref: event.ref,
		});
		return ack();
	}

	const marked = await markOrderPaid(event.orderId, {
		paymentProvider: gateway.id,
		paymentRef: event.ref,
	});
	if (!marked) {
		// A customer can finish paying after staff cancelled their unpaid
		// order. The money is real, so it goes on the order: cancelled with a
		// `paidAt` is "Refund due", and can be sent back through the gateway.
		// No payment-confirmed message — the order is not going ahead.
		// Anything else that was not marked (a retry for an order already
		// paid) matches nothing here and stays a quiet no-op.
		const { count } = await prisma.order.updateMany({
			where: { id: event.orderId, status: "CANCELLED", paidAt: null },
			data: {
				paidAt: new Date(),
				paymentProvider: gateway.id,
				paymentRef: event.ref,
			},
		});
		if (count === 1) {
			console.error("payment webhook: payment arrived on a cancelled order", {
				gateway: gateway.id,
				orderId: event.orderId,
				ref: event.ref,
			});
		}
	}
	return ack();
}
