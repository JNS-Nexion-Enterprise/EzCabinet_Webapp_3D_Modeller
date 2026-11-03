import { NextResponse } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { gatewayById } from "@/lib/payments/registry";
import { BadSignature } from "@/lib/payments/types";

export const runtime = "nodejs";

/**
 * Where Fiuu sends the customer's browser back, as a form POST — the Return
 * URL set in Fiuu's merchant portal. A page answers only GET, so this reads
 * the post and sends the browser on (303, so it arrives as a GET) to the
 * order page, with Fiuu's status in the same `redirect_status` Stripe uses.
 *
 * Display only. A return can be replayed or forged, so it never marks an
 * order paid: that is the webhook's alone. The signature is still checked,
 * so a made-up post cannot be used to learn an order's page address.
 */
const SHOWN = {
	paid: "succeeded",
	pending: "processing",
	failed: "failed",
} as const;

export async function POST(request: Request) {
	const gateway = gatewayById("fiuu");
	if (!gateway) {
		return NextResponse.json({ error: "not_configured" }, { status: 404 });
	}
	let event: Awaited<ReturnType<typeof gateway.verify>>;
	try {
		event = await gateway.verify(await request.text(), request.headers);
	} catch (error) {
		if (error instanceof BadSignature) {
			return NextResponse.json({ error: "bad_signature" }, { status: 400 });
		}
		throw error;
	}
	if (
		event?.outcome !== "paid" &&
		event?.outcome !== "pending" &&
		event?.outcome !== "failed"
	) {
		return NextResponse.redirect(new URL("/", request.url), 303);
	}
	const order = await prisma.order.findUnique({
		where: { id: event.orderId },
		select: { locale: true, publicToken: true },
	});
	if (!order) {
		return NextResponse.json({ error: "not_found" }, { status: 404 });
	}
	return NextResponse.redirect(
		new URL(
			`/${order.locale}/order/${order.publicToken}?redirect_status=${SHOWN[event.outcome]}`,
			request.url,
		),
		303,
	);
}
