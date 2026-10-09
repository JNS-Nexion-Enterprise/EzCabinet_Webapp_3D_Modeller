import "server-only";
import type {
	NotificationKind,
	ProductionStage,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { deliverEmail, type EmailOutcome } from "@/lib/email";
import { LABEL as CARRIER_LABEL } from "@/lib/logistics/carriers";
import { orderEmail } from "./templates/order";

/**
 * Send the mail an outbox row stands for.
 *
 * Rendered now, from the order as it is, not from anything stored on the
 * row: a receipt needs the breakdown the order already keeps as charged.
 */
export async function sendOrderEmail(
	row: {
		orderId: string;
		deliveryId: string | null;
		kind: NotificationKind;
		stage: ProductionStage | null;
		to: string;
		locale: string;
	},
	base: string,
): Promise<EmailOutcome> {
	const order = await prisma.order.findUnique({
		where: { id: row.orderId },
		select: {
			number: true,
			createdAt: true,
			publicToken: true,
			customerName: true,
			siteAddress: true,
			paymentProvider: true,
			paidAt: true,
			breakdown: true,
			cabinetsRm: true,
			deliveryRm: true,
			totalRm: true,
		},
	});
	if (!order) return "refused";

	// A bare id, not a relation: a split consumes the delivery, and the mail
	// about it then points at the order page instead.
	const delivery = row.deliveryId
		? await prisma.delivery.findUnique({
				where: { id: row.deliveryId },
				select: { publicToken: true, carrierId: true, carrierOrderId: true },
			})
		: null;

	const locale = isLocale(row.locale) ? row.locale : "en";
	const t = await getDictionary(locale);
	const mail = orderEmail({
		kind: row.kind,
		locale,
		base: base.replace(/\/+$/, ""),
		order,
		lineLabels: t.planner.price.lines,
		stageLabel: row.stage ? t.order.stages[row.stage] : undefined,
		delivery: delivery && {
			publicToken: delivery.publicToken,
			carrierLabel:
				CARRIER_LABEL[delivery.carrierId ?? ""] ?? delivery.carrierId ?? "",
			// A by-hand delivery's `carrierOrderId` is our own `manual-<cuid>`.
			tracking:
				delivery.carrierId === "manual" ? null : delivery.carrierOrderId,
		},
	});
	return deliverEmail({ to: row.to, ...mail });
}
