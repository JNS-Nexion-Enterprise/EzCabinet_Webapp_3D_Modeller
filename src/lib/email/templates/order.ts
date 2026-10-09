import type { NotificationKind } from "@/generated/prisma/enums";
import { fill } from "@/lib/copy/fill";
import type { Locale } from "@/lib/copy/locales";
import { BANK_TRANSFER } from "@/lib/orders/payment";
import { orderRef } from "@/lib/orders/ref";
import { summaryExtras, summaryLines } from "@/lib/orders/summary";
import { EMAIL_COPY } from "../copy";
import { type Block, renderEmail } from "../layout";

/**
 * The eight order mails: one per event the outbox reports. Pure — the row is
 * loaded by `orderMail.ts`, and whether a mail is owed at all is `draftsFor`.
 */
export type OrderMailInput = {
	kind: NotificationKind;
	locale: Locale;
	/** Site origin, no trailing slash. */
	base: string;
	order: {
		number: number;
		createdAt: Date;
		publicToken: string;
		customerName: string;
		siteAddress: string;
		paymentProvider: string;
		paidAt: Date | null;
		breakdown: unknown;
		cabinetsRm: number;
		deliveryRm: number;
		totalRm: number;
	};
	/** `t.planner.price.lines` for the locale: price line id → label. */
	lineLabels: Record<string, string>;
	/** STAGE only. */
	stageLabel?: string;
	/** Delivery kinds. Null when the delivery row no longer exists. */
	delivery?: {
		publicToken: string;
		carrierLabel: string;
		/** Null for a delivery booked by hand, which has no tracking number. */
		tracking: string | null;
	} | null;
};

const money = (amount: number) =>
	`RM ${amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

const DATE_LOCALE: Record<Locale, string> = {
	en: "en-MY",
	ms: "ms-MY",
	zh: "zh-CN",
};

/** Pinned to Malaysia: the server runs in UTC and a receipt's day must not. */
const day = (date: Date, locale: Locale) =>
	date.toLocaleDateString(DATE_LOCALE[locale], {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "Asia/Kuala_Lumpur",
	});

export function orderEmail(input: OrderMailInput): {
	subject: string;
	html: string;
	text: string;
} {
	const { order, locale } = input;
	const copy = EMAIL_COPY[locale];
	const ref = orderRef(order.number, order.createdAt);
	const total = money(order.totalRm);
	const orderUrl = `${input.base}/${locale}/order/${order.publicToken}`;
	// A split consumes the delivery row; the order page still shows where it is.
	const trackUrl = input.delivery
		? `${input.base}/${locale}/track/${input.delivery.publicToken}`
		: orderUrl;
	const vars = {
		ref,
		total,
		name: order.customerName,
		siteAddress: order.siteAddress,
		stage: input.stageLabel ?? "",
		carrier: input.delivery?.carrierLabel ?? "",
		...BANK_TRANSFER,
	};

	const mail = (
		t: { subject: string; heading: string },
		blocks: Block[],
		footnote?: string,
	) => {
		const subject = fill(t.subject, vars);
		return {
			subject,
			...renderEmail({
				locale,
				about: "order",
				preheader: subject,
				heading: fill(t.heading, vars),
				blocks,
				footnote,
			}),
		};
	};
	// Filled exactly once: what a customer typed is a value, never a template.
	const paragraph = (
		text: string,
		more: Record<string, string> = {},
	): Block => ({ type: "paragraph", text: fill(text, { ...vars, ...more }) });
	const button = (label: string, href: string): Block => ({
		type: "button",
		label,
		href,
	});

	switch (input.kind) {
		case "ORDER_PLACED": {
			const t = copy.orderPlaced;
			const payment = order.paidAt
				? []
				: [
						paragraph(
							order.paymentProvider === "manual" ? t.bankTransfer : t.online,
						),
					];
			return mail(t, [
				paragraph(t.body),
				{
					type: "box",
					label: t.boxLabel,
					value: ref,
					note: fill(t.boxNote, { date: day(order.createdAt, locale) }),
				},
				{
					type: "rows",
					rows: [
						...summaryLines(order.breakdown).map((line) => ({
							label: line.qty > 1 ? `${line.name} × ${line.qty}` : line.name,
							amount: money(line.amountRm),
						})),
						...summaryExtras(order.breakdown).map((line) => ({
							label: input.lineLabels[line.id] ?? line.id,
							amount: money(line.amountRm),
						})),
						{ label: t.delivery, amount: money(order.deliveryRm) },
					],
					total: { label: t.total, amount: total },
				},
				...payment,
				paragraph(t.address),
				button(t.button, orderUrl),
			]);
		}
		case "PAYMENT_CONFIRMED": {
			const t = copy.paymentConfirmed;
			return mail(t, [
				paragraph(t.body),
				{
					type: "rows",
					rows: [
						{ label: t.cabinets, amount: money(order.cabinetsRm) },
						{ label: t.delivery, amount: money(order.deliveryRm) },
					],
					total: { label: t.paid, amount: total },
				},
				...(order.paidAt
					? [paragraph(t.paidOn, { date: day(order.paidAt, locale) })]
					: []),
				paragraph(t.next),
				button(t.button, orderUrl),
			]);
		}
		case "ORDER_REFUNDED": {
			const t = copy.orderRefunded;
			return mail(t, [paragraph(t.body), button(t.button, orderUrl)]);
		}
		case "STAGE": {
			const t = copy.stage;
			return mail(t, [
				paragraph(t.body),
				{ type: "box", label: t.boxLabel, value: vars.stage },
				button(t.button, orderUrl),
			]);
		}
		case "DELIVERY_BOOKED": {
			const t = copy.deliveryBooked;
			const tracking = input.delivery?.tracking;
			return mail(t, [
				paragraph(t.body),
				...(tracking
					? [{ type: "box", label: t.boxLabel, value: tracking } as const]
					: []),
				button(t.button, trackUrl),
			]);
		}
		case "PICKED_UP": {
			const t = copy.pickedUp;
			return mail(t, [paragraph(t.body), button(t.button, trackUrl)]);
		}
		case "DELIVERED": {
			const t = copy.delivered;
			return mail(
				t,
				[paragraph(t.body), button(t.button, trackUrl)],
				t.footnote,
			);
		}
		case "DELIVERY_FAILED": {
			const t = copy.deliveryFailed;
			return mail(t, [paragraph(t.body), button(t.button, trackUrl)]);
		}
	}
}
