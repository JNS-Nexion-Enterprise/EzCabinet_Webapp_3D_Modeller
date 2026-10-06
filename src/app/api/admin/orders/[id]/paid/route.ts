import { NextResponse } from "next/server";
import { z } from "zod";
import { BYPASS_USER } from "@/lib/auth/requireAuth";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";
import { markOrderPaid } from "@/lib/orders/markPaid";

export const runtime = "nodejs";

const bodySchema = z.object({
	paymentRef: z.string().trim().max(120).nullable().default(null),
});

/**
 * Manual payment: an admin confirms the bank transfer arrived.
 *
 * `markOrderPaid` is conditional, so two admins pressing at once cannot both
 * mark it, and a cancelled order cannot be revived as paid.
 *
 * `BYPASS_USER.id` is not a real row, so it must not go into a foreign key —
 * a bypass admin marking an order paid still leaves `paidByUserId` null,
 * and `paidByName` with it.
 */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"orders:markPaid",
	async (request, { params }, user) => {
		const { id } = await params;
		const parsed = bodySchema.safeParse(await request.json().catch(() => null));
		if (!parsed.success) {
			return NextResponse.json(
				{ error: "invalid_body", issues: parsed.error.issues },
				{ status: 400 },
			);
		}

		const bypass = user.id === BYPASS_USER.id;
		const marked = await markOrderPaid(id, {
			paidByUserId: bypass ? null : user.id,
			paidByName: bypass ? null : user.name,
			paymentRef: parsed.data.paymentRef,
		});
		if (marked) return NextResponse.json({ ok: true });

		const exists = await prisma.order.findUnique({
			where: { id },
			select: { id: true },
		});
		return exists
			? NextResponse.json({ error: "not_awaiting_payment" }, { status: 409 })
			: NextResponse.json({ error: "not_found" }, { status: 404 });
	},
);
