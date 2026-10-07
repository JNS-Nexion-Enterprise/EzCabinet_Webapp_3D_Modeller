import { NextResponse } from "next/server";
import { z } from "zod";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import { cancelOrder } from "@/lib/orders/cancel";

export const runtime = "nodejs";

const bodySchema = z.object({
	reason: z.string().trim().max(300).nullable().default(null),
});

/**
 * Cancel an order: a junk checkout nobody paid for, or a paid one before
 * production starts — the refund policy's boundary (`lib/orders/cancel.ts`).
 *
 * Cancelling a paid order moves no money. It leaves the order owed a refund,
 * which staff pay back by hand and then record with `/refunded`.
 *
 * Step-up: irreversible, so the admin confirms with their passkey.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"orders:markPaid",
	async (request, { params }, user) => {
		const { id } = await params;
		const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
		if (!parsed.success) {
			return NextResponse.json({ error: "invalid_body" }, { status: 400 });
		}
		const result = await cancelOrder(id, {
			byName: user.id === BYPASS_USER.id ? null : user.name,
			reason: parsed.data.reason || null,
		});
		if (result === "ok") {
			console.info("Order cancelled", { order: id, actor: user.id });
			return NextResponse.json({ ok: true });
		}
		return NextResponse.json(
			{ error: result },
			{
				status:
					result === "not_found"
						? 404
						: result === "reason_required"
							? 400
							: 409,
			},
		);
	},
	{ stepUp: true },
);
