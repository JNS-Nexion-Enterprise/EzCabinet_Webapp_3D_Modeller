import { describe, expect, it } from "vitest";
import type { NotificationKind } from "@/generated/prisma/enums";
import { type OrderMailInput, orderEmail } from "../templates/order";

const order: OrderMailInput["order"] = {
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah",
	siteAddress: "12 Jalan Meranti 4, 47120 Puchong",
	paymentProvider: "manual",
	paidAt: null,
	breakdown: {
		cabinets: [
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 500 },
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 500 },
		],
		categories: [
			{ id: "carcasses", detail: { key: "x" }, amountRm: 1000 },
			{ id: "worktop", detail: { key: "x" }, amountRm: 250 },
		],
	},
	cabinetsRm: 1250,
	deliveryRm: 85,
	totalRm: 1335,
};

const input = (
	kind: NotificationKind,
	extra: Partial<OrderMailInput> = {},
): OrderMailInput => ({
	kind,
	locale: "en",
	base: "https://x.test",
	order,
	lineLabels: { worktop: "Worktop" },
	stageLabel: "Cutting",
	delivery: {
		publicToken: "tok_delivery",
		carrierLabel: "Lalamove",
		tracking: "LM123",
	},
	...extra,
});

const KINDS: NotificationKind[] = [
	"ORDER_PLACED",
	"PAYMENT_CONFIRMED",
	"ORDER_REFUNDED",
	"STAGE",
	"DELIVERY_BOOKED",
	"PICKED_UP",
	"DELIVERED",
	"DELIVERY_FAILED",
];

describe("orderEmail", () => {
	it.each(
		KINDS.flatMap((kind) =>
			(["en", "ms", "zh"] as const).map((locale) => [kind, locale] as const),
		),
	)("%s in %s: has the ref and nothing unfilled", (kind, locale) => {
		const mail = orderEmail(input(kind, { locale }));
		expect(mail.subject).toContain("IC-20260826-014");
		expect(mail.subject + mail.text).not.toMatch(/\{\w+\}/);
		expect(mail.html).toContain(`<html lang="${locale}">`);
	});

	it("order placed: counted lines, extras, delivery, total, bank details", () => {
		const { text, html } = orderEmail(input("ORDER_PLACED"));
		expect(text).toContain("BC 800mm — Shaker × 2: RM 1,000.00");
		expect(text).toContain("Worktop: RM 250.00");
		expect(text).toContain("Delivery: RM 85.00");
		expect(text).toContain("Total: RM 1,335.00");
		expect(text).toContain("transfer RM 1,335.00");
		expect(text).toContain("Delivering to: 12 Jalan Meranti 4");
		expect(html).toContain('href="https://x.test/en/order/tok_order"');
	});

	it("order placed, online: says the payment is being confirmed", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", {
				order: { ...order, paymentProvider: "stripe" },
			}),
		);
		expect(text).toContain("being confirmed");
		expect(text).not.toContain("transfer RM");
	});

	it("order placed, already paid: no payment paragraph at all", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", { order: { ...order, paidAt: new Date() } }),
		);
		expect(text).not.toContain("being confirmed");
		expect(text).not.toContain("transfer RM");
	});

	it("order placed with an unreadable breakdown still totals", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", { order: { ...order, breakdown: "garbage" } }),
		);
		expect(text).toContain("Delivery: RM 85.00");
		expect(text).toContain("Total: RM 1,335.00");
	});

	it("payment confirmed: the receipt and the paid date in Malaysia time", () => {
		const { text } = orderEmail(
			input("PAYMENT_CONFIRMED", {
				// 17:30 UTC on the 26th is already the 27th in Kuala Lumpur.
				order: { ...order, paidAt: new Date("2026-08-26T17:30:00Z") },
			}),
		);
		expect(text).toContain("Cabinets: RM 1,250.00");
		expect(text).toContain("Paid: RM 1,335.00");
		expect(text).toContain("Paid on 27 August 2026");
	});

	it("stage: names the step", () => {
		const mail = orderEmail(input("STAGE"));
		expect(mail.subject).toBe("Order IC-20260826-014: Cutting");
		expect(mail.text).toContain("Current step: Cutting");
	});

	it("delivery booked: carrier, tracking number, tracking link", () => {
		const { text, html } = orderEmail(input("DELIVERY_BOOKED"));
		expect(text).toContain("booked with Lalamove");
		expect(text).toContain("Tracking number: LM123");
		expect(html).toContain('href="https://x.test/en/track/tok_delivery"');
	});

	it("delivery booked by hand: no tracking box", () => {
		const { text } = orderEmail(
			input("DELIVERY_BOOKED", {
				delivery: {
					publicToken: "tok_delivery",
					carrierLabel: "Own lorry",
					tracking: null,
				},
			}),
		);
		expect(text).not.toContain("Tracking number");
	});

	it("a delivery mail whose delivery is gone opens the order page", () => {
		const { html, text } = orderEmail(input("DELIVERED", { delivery: null }));
		expect(html).toContain('href="https://x.test/en/order/tok_order"');
		expect(text).toContain("has been delivered");
	});

	it("escapes what the customer typed", () => {
		const { html } = orderEmail(
			input("ORDER_PLACED", {
				order: {
					...order,
					customerName: "<img src=x>",
					siteAddress: '"><script>',
				},
			}),
		);
		expect(html).not.toContain("<img src=x>");
		expect(html).not.toContain("<script>");
	});

	it("leaves a customer's own braces alone", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", {
				order: { ...order, customerName: "{total}", siteAddress: "{ref} Rd" },
			}),
		);
		expect(text).toContain("Thank you, {total}");
		expect(text).toContain("Delivering to: {ref} Rd");
	});
});
