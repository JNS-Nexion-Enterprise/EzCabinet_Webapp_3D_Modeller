import { prisma } from "@/lib/catalogue/db";
import { markRefunded } from "@/lib/orders/cancel";
import { orderRef } from "@/lib/orders/ref";
import { gatewayById } from "@/lib/payments/registry";
import { RefundRefused } from "@/lib/payments/types";

/**
 * Sending a cancelled order's money back through the gateway it was paid on.
 *
 * Cancelling stays `cancelOrder`'s (`lib/orders/cancel.ts`) and the order's
 * `status` never changes here: it is already CANCELLED, so production and
 * delivery cannot start under a refund. What moves is where the refund is:
 *
 *   due ─ ask ─▶ unacknowledged ─ gateway answered ─▶ pending ─ webhook ─▶ refunded
 *    ▲                 │ gateway refused                 │ webhook: failed
 *    └─────────────────┴─────────────────────────────────┘
 *
 * Only the gateway's word records the refund, as only its word marks an
 * order paid. Full refunds only.
 */

export type RefundState =
	| "none"
	| "due"
	| "unacknowledged"
	| "pending"
	| "refunded";

/**
 * Where a paid, cancelled order's refund is. Derived, never stored:
 * `refundRequestedAt` alone is an attempt the gateway has not answered, and
 * `refundRef` without `refundedAt` is one it is processing.
 */
export function refundState(order: {
	status: string;
	paidAt: Date | string | null;
	refundedAt: Date | string | null;
	refundRef: string | null;
	refundRequestedAt: Date | string | null;
}): RefundState {
	if (order.status !== "CANCELLED" || order.paidAt === null) return "none";
	if (order.refundedAt !== null) return "refunded";
	if (order.refundRef !== null) return "pending";
	if (order.refundRequestedAt !== null) return "unacknowledged";
	return "due";
}

export type GatewayRefundResult =
	| { ok: true; settled: boolean }
	| {
			ok: false;
			error:
				| "not_found"
				/** Not owed a refund, or one is already in flight or recorded. */
				| "not_refundable"
				/** A bank transfer: there is no gateway to ask. */
				| "manual_order"
				/** Paid through a gateway whose keys are gone, or that cannot refund. */
				| "not_configured"
				/** Somebody else's press, or the webhook, got there first. */
				| "changed"
				| "gateway_refused"
				| "not_acknowledged";
	  };

const NOT_ACKNOWLEDGED =
	"The payment gateway did not acknowledge the refund. Ask again: it repeats the same request, so it cannot refund twice.";

export async function requestGatewayRefund(
	id: string,
	by: { actorName: string | null },
): Promise<GatewayRefundResult> {
	const order = await prisma.order.findUnique({
		where: { id },
		select: {
			number: true,
			createdAt: true,
			status: true,
			paidAt: true,
			paymentProvider: true,
			paymentRef: true,
			refundedAt: true,
			refundRef: true,
			refundRequestedAt: true,
		},
	});
	if (!order) return { ok: false, error: "not_found" };
	const state = refundState(order);
	if (state !== "due" && state !== "unacknowledged") {
		return { ok: false, error: "not_refundable" };
	}
	if (order.paymentProvider === "manual") {
		return { ok: false, error: "manual_order" };
	}
	const gateway = gatewayById(order.paymentProvider);
	const paymentRef = order.paymentRef;
	if (!gateway?.refund || !paymentRef) {
		return { ok: false, error: "not_configured" };
	}

	// A repeat of an unanswered attempt keeps its time, and so its idempotency
	// key: if the gateway did take the first request, this one is the same one.
	const requestedAt = order.refundRequestedAt ?? new Date();
	// Claim first, so two presses, or a press racing the webhook, cannot both
	// start an attempt. Committed before the gateway call: a transaction is
	// never held open across the network.
	const { count } = await prisma.order.updateMany({
		where: {
			id,
			status: "CANCELLED",
			paidAt: { not: null },
			refundedAt: null,
			refundRef: null,
			refundRequestedAt: order.refundRequestedAt,
		},
		data: {
			refundRequestedAt: requestedAt,
			refundError: null,
			refundedByName: by.actorName,
		},
	});
	if (count !== 1) return { ok: false, error: "changed" };

	// Every write below is for this attempt only, and never over a refund
	// the webhook has recorded in the meantime.
	const thisAttempt = { id, refundedAt: null, refundRequestedAt: requestedAt };

	let refund: { ref: string; settled: boolean };
	try {
		refund = await gateway.refund({
			id,
			ref: orderRef(order.number, order.createdAt),
			paymentRef,
			idempotencyKey: `refund-${id}-${requestedAt.getTime()}`,
		});
	} catch (error) {
		// Only the gateway saying no ends the attempt. A timeout or a 5xx may
		// be a refund that went through, so the marker and its key are kept.
		const refused = error instanceof RefundRefused;
		console.error(
			refused ? "refund: gateway refused" : "refund: no answer from gateway",
			{ order: id, error },
		);
		await prisma.order.updateMany({
			where: { ...thisAttempt, refundRef: null },
			data: refused
				? { refundRequestedAt: null, refundError: error.message }
				: { refundError: NOT_ACKNOWLEDGED },
		});
		return {
			ok: false,
			error: refused ? "gateway_refused" : "not_acknowledged",
		};
	}

	await prisma.order.updateMany({
		where: { ...thisAttempt, status: "CANCELLED" },
		data: { refundRef: refund.ref },
	});
	if (refund.settled) await markRefunded(id, { ref: refund.ref });
	return { ok: true, settled: refund.settled };
}

/**
 * The gateway could not send the money back: the order is "Refund due" again,
 * with the reason kept for the admin.
 *
 * Only for the refund the order is waiting on — a failure report for any
 * other refund id must not undo this one. A refund that fails *after* it was
 * reported successful (FPX can) is taken back too, and said loudly: the
 * customer has been told the money is coming.
 */
export async function refundFailed(
	id: string,
	refundRef: string,
	error: string,
): Promise<void> {
	const data = { refundRef: null, refundRequestedAt: null, refundError: error };
	const { count } = await prisma.order.updateMany({
		where: { id, refundRef, refundedAt: null },
		data,
	});
	if (count === 1) return;
	const late = await prisma.order.updateMany({
		where: { id, refundRef, refundedAt: { not: null } },
		data: { ...data, refundedAt: null },
	});
	if (late.count === 1) {
		console.error("refund: failed after it was reported successful", {
			order: id,
			refund: refundRef,
		});
	}
}
