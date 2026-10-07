import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/catalogue/db";
import { enqueue, flushSoon } from "@/lib/whatsapp/outbox";
import { draftFor, NOTIFY_ORDER_SELECT } from "@/lib/whatsapp/templates";

export type CancelBlock =
	| "already_cancelled"
	| "in_production"
	| "has_delivery"
	| "reason_required";

/** A delivery that was called off no longer holds its order open. */
const LIVE_DELIVERY: Prisma.DeliveryWhereInput = {
	status: { notIn: ["CANCELLED", "FAILED"] },
};

/**
 * Why an order cannot be cancelled, or null when it can.
 *
 * The boundary is the refund policy's: a full refund any time before
 * production starts. A paid order needs a reason, because cancelling it
 * creates a refund somebody has to justify later.
 */
export function cancelBlock(
	order: {
		status: string;
		productionStage: string | null;
		hasLiveDelivery: boolean;
	},
	reason: string | null,
): CancelBlock | null {
	if (order.status === "CANCELLED") return "already_cancelled";
	if (order.productionStage !== null) return "in_production";
	if (order.hasLiveDelivery) return "has_delivery";
	if (order.status === "PAID" && !reason) return "reason_required";
	return null;
}

/**
 * Cancel an order, paid or not. `paidAt` is left alone: cancelled with a
 * `paidAt` is what "a refund is owed" means, until `markRefunded`.
 *
 * Cancelling moves no money. The refund is a separate step: through the
 * gateway (`lib/orders/refund.ts`), or by hand and recorded afterwards.
 *
 * The rule rides in the `where` as well, so an order paid or put into
 * production between the read and the write answers `changed`.
 */
export async function cancelOrder(
	id: string,
	by: { byName: string | null; reason: string | null },
): Promise<"ok" | "not_found" | "changed" | CancelBlock> {
	const order = await prisma.order.findUnique({
		where: { id },
		select: {
			status: true,
			productionStage: true,
			_count: { select: { deliveries: { where: LIVE_DELIVERY } } },
		},
	});
	if (order === null) return "not_found";
	const block = cancelBlock(
		{ ...order, hasLiveDelivery: order._count.deliveries > 0 },
		by.reason,
	);
	if (block) return block;

	const { count } = await prisma.order.updateMany({
		where: {
			id,
			status: order.status,
			productionStage: null,
			deliveries: { none: LIVE_DELIVERY },
		},
		data: {
			status: "CANCELLED",
			cancelledAt: new Date(),
			cancelledByName: by.byName,
			cancelReason: by.reason,
		},
	});
	return count === 1 ? "ok" : "changed";
}

/**
 * Record that a cancelled, paid order's money went back, with its WhatsApp
 * message queued in the same transaction. The one write path to `refundedAt`:
 * an admin's Mark refunded, a gateway refund that settled at once, and the
 * gateway's webhook (`lib/orders/refund.ts`).
 *
 * Conditional, so a retried webhook is a no-op. False when nothing changed.
 *
 * The message goes out for a refund made by hand as well, on purpose: the
 * customer should hear their refund was sent, however it was sent.
 */
export async function markRefunded(
	id: string,
	by: {
		ref: string | null;
		/** Left out, the order keeps whoever asked the gateway for the refund. */
		byName?: string | null;
		/**
		 * An admin recording a refund made outside the app. Refused while a
		 * gateway refund is in flight: that one records itself, and money sent
		 * by hand on top of it would be paid back twice.
		 */
		byHand?: boolean;
	},
): Promise<boolean> {
	const { ref, byName, byHand } = by;
	const notificationIds = await prisma.$transaction(async (tx) => {
		const { count } = await tx.order.updateMany({
			where: {
				id,
				status: "CANCELLED",
				paidAt: { not: null },
				refundedAt: null,
				...(byHand ? { refundRef: null } : {}),
			},
			data: {
				refundedAt: new Date(),
				refundRef: ref,
				refundError: null,
				...(byName === undefined ? {} : { refundedByName: byName }),
			},
		});
		if (count !== 1) return null;
		const order = await tx.order.findUniqueOrThrow({
			where: { id },
			select: NOTIFY_ORDER_SELECT,
		});
		return enqueue(tx, [draftFor({ kind: "ORDER_REFUNDED", order })]);
	});
	if (!notificationIds) return false;
	flushSoon(notificationIds);
	return true;
}
