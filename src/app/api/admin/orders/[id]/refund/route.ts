import { NextResponse } from "next/server";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import {
	type GatewayRefundResult,
	requestGatewayRefund,
} from "@/lib/orders/refund";

export const runtime = "nodejs";

type Failure = Extract<GatewayRefundResult, { ok: false }>["error"];

const STATUS: Record<Failure, number> = {
	not_found: 404,
	not_refundable: 409,
	manual_order: 409,
	not_configured: 409,
	changed: 409,
	// The gateway said no; the order is "Refund due" again with the reason.
	gateway_refused: 502,
	// The gateway said nothing we can rely on; asking again repeats the request.
	not_acknowledged: 502,
	// A check on a pending refund got no answer. Nothing was written.
	gateway_unreachable: 502,
};

/**
 * Send a cancelled order's money back through its payment gateway —
 * `lib/orders/refund.ts`. No body: the reason was given when it was cancelled.
 *
 * Called for a refund already in flight, it asks the gateway where that
 * refund has got to and records the answer as the webhook would have — the
 * way out when the webhook never arrived. It never starts a second refund.
 *
 * Superadmin only (`orders:refund`) and step-up guarded: this is the one
 * admin action that moves money out.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"orders:refund",
	async (_request, { params }, actor) => {
		const { id } = await params;
		const result = await requestGatewayRefund(id, {
			actorName: actor.id === BYPASS_USER.id ? null : actor.name,
		});
		if (!result.ok) {
			return NextResponse.json(
				{ error: result.error },
				{ status: STATUS[result.error] },
			);
		}
		// Ids only, like every other guarded action.
		console.info("Order refund requested", { actor: actor.id, target: id });
		return NextResponse.json({ ok: true, state: result.state });
	},
	{ stepUp: true },
);
