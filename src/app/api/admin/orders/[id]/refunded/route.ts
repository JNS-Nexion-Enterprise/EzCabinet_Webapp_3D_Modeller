import { NextResponse } from "next/server";
import { z } from "zod";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import { markRefunded } from "@/lib/orders/cancel";

export const runtime = "nodejs";

const bodySchema = z.object({
	refundRef: z.string().trim().max(120).nullable().default(null),
});

/**
 * Record that a cancelled, paid order's money has gone back. The refund
 * itself happens outside the app; this is only the record of it.
 *
 * Step-up: it closes a debt to the customer, so the admin confirms with
 * their passkey.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"orders:markPaid",
	async (request, { params }, user) => {
		const { id } = await params;
		const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		}
		const marked = await markRefunded(id, {
			byName: user.id === BYPASS_USER.id ? null : user.name,
			ref: parsed.data.refundRef || null,
		});
		if (!marked) {
			return NextResponse.json({ error: "not_refundable" }, { status: 409 });
		}
		console.info("Order refund recorded", { order: id, actor: user.id });
		return NextResponse.json({ ok: true });
	},
	{ stepUp: true },
);
