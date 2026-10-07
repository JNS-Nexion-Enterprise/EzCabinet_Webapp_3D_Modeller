import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/catalogue/db";

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
 * The app moves no money — the refund is a bank transfer or a press in the
 * gateway's dashboard, recorded here afterwards.
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

/** Record that a cancelled, paid order's money went back. False when nothing changed. */
export async function markRefunded(
	id: string,
	by: { byName: string | null; ref: string | null },
): Promise<boolean> {
	const { count } = await prisma.order.updateMany({
		where: {
			id,
			status: "CANCELLED",
			paidAt: { not: null },
			refundedAt: null,
		},
		data: {
			refundedAt: new Date(),
			refundedByName: by.byName,
			refundRef: by.ref,
		},
	});
	return count === 1;
}
