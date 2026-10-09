import { NextResponse } from "next/server";
import { demoCustomer } from "@/lib/auth/demoCustomer";
import { authEnabled } from "@/lib/auth/enabled";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";
import { toE164 } from "@/lib/logistics/phone";
import { detailsSchema, EDITABLE_ORDER } from "@/lib/orders/editDetails";

export const runtime = "nodejs";

/**
 * A customer corrects the contact and delivery details on their own order,
 * until production starts (`lib/orders/editDetails.ts`).
 *
 * Owner only — staff who can read an order cannot rewrite it here. Anyone
 * else gets the same 404 as a made-up token.
 */
export async function PATCH(
	request: Request,
	{ params }: { params: Promise<{ token: string }> },
) {
	const { token } = await params;
	// As at checkout: locally, a signed-out order belongs to the demo customer.
	const user = (await currentUser()) ?? (await demoCustomer());
	if (authEnabled() && user?.mustVerifyPasskey) {
		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
	}
	const order = await prisma.order.findUnique({
		where: { publicToken: token },
		select: { id: true, userId: true, whatsappOptIn: true },
	});
	if (order === null || user?.id !== order.userId) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}

	const parsed = detailsSchema.safeParse(
		await request.json().catch(() => null),
	);
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}
	const details = parsed.data;
	const phone = toE164(details.phone);
	if (phone === null) {
		return NextResponse.json({ error: "bad_phone" }, { status: 422 });
	}

	const saved = await prisma.$transaction(async (tx) => {
		// The lock rides in the `where`, so production starting between the
		// page load and this write still refuses the edit.
		const { count } = await tx.order.updateMany({
			where: { id: order.id, ...EDITABLE_ORDER },
			data: {
				customerName: details.name,
				customerPhone: phone,
				customerEmail: details.email,
				siteAddress: details.siteAddress,
				addressNotes: details.addressNotes || null,
				whatsappOptIn: details.whatsappOptIn,
				// Consent is dated from when it was given, not from each edit.
				whatsappOptInAt:
					details.whatsappOptIn && !order.whatsappOptIn
						? new Date()
						: undefined,
			},
		});
		if (count === 0) return false;
		// `Notification.to` is a snapshot. A queued message must not go to the
		// number or address the customer has just told us is wrong; sent ones
		// are history. Without an order email, mail goes to the account's.
		await tx.notification.updateMany({
			where: { orderId: order.id, status: "PENDING", channel: "WHATSAPP" },
			data: { to: phone },
		});
		await tx.notification.updateMany({
			where: { orderId: order.id, status: "PENDING", channel: "EMAIL" },
			data: { to: details.email ?? user.email },
		});
		return true;
	});
	if (!saved) {
		return NextResponse.json({ error: "locked" }, { status: 409 });
	}
	// Which order and who — never what they typed.
	console.info("Order details edited", { order: order.id, actor: user.id });
	return NextResponse.json({ ok: true });
}
