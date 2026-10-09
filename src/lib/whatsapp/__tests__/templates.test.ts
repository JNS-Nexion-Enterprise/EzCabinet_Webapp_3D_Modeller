import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	deliveryKindFor,
	draftFor,
	draftsFor,
	emailDraftFor,
	localeOf,
	type NotifyOrder,
	templatePayload,
	textPayload,
} from "../templates";

const order: NotifyOrder = {
	id: "ord1",
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah",
	customerPhone: "+60123456789",
	totalRm: 12345.5,
	locale: "ms",
	whatsappOptIn: true,
	customerEmail: "aisyah@example.com",
	user: { email: "account@example.com" },
};
const delivery = { id: "del1", publicToken: "tok_delivery" };

describe("draftFor", () => {
	it("builds nothing for a customer who did not opt in", () => {
		expect(
			draftFor({
				kind: "ORDER_PLACED",
				order: { ...order, whatsappOptIn: false },
			}),
		).toBeNull();
	});

	it("order placed: name, ref, total; button opens the order", () => {
		expect(draftFor({ kind: "ORDER_PLACED", order })).toEqual({
			orderId: "ord1",
			deliveryId: null,
			kind: "ORDER_PLACED",
			channel: "WHATSAPP",
			stage: null,
			dedupeKey: "order:ord1:placed",
			to: "+60123456789",
			template: "order_placed",
			locale: "ms",
			vars: {
				body: ["Aisyah", "IC-20260826-014", "12,345.50"],
				button: "tok_order",
			},
		});
	});

	it("payment confirmed", () => {
		const draft = draftFor({ kind: "PAYMENT_CONFIRMED", order });
		expect(draft?.dedupeKey).toBe("order:ord1:paid");
		expect(draft?.template).toBe("payment_confirmed_cabinet");
		expect(draft?.vars).toEqual({
			body: ["IC-20260826-014"],
			button: "tok_order",
		});
	});

	it("order refunded: the amount that went back", () => {
		const draft = draftFor({ kind: "ORDER_REFUNDED", order });
		expect(draft?.dedupeKey).toBe("order:ord1:refunded");
		expect(draft?.template).toBe("order_refunded");
		expect(draft?.deliveryId).toBeNull();
		expect(draft?.vars.button).toBe("tok_order");
		expect(draft?.vars.body[0]).toBe("IC-20260826-014");
		expect(draft?.vars.body).toHaveLength(2);
	});

	it("stage: one key per stage, label as given", () => {
		const draft = draftFor({
			kind: "STAGE",
			order,
			stage: "ASSEMBLY",
			stageLabel: "Pemasangan",
		});
		expect(draft?.dedupeKey).toBe("order:ord1:stage:ASSEMBLY");
		expect(draft?.stage).toBe("ASSEMBLY");
		expect(draft?.vars.body).toEqual(["IC-20260826-014", "Pemasangan"]);
	});

	it("delivery booked: carrier label and tracking number; button opens tracking", () => {
		const draft = draftFor({
			kind: "DELIVERY_BOOKED",
			order,
			delivery: { ...delivery, carrierId: "lalamove", carrierOrderId: "LLM-9" },
		});
		expect(draft?.dedupeKey).toBe("delivery:del1:booked:LLM-9");
		expect(draft?.deliveryId).toBe("del1");
		expect(draft?.vars).toEqual({
			body: ["IC-20260826-014", "Lalamove", "LLM-9"],
			button: "tok_delivery",
		});
	});

	it("delivery booked, rebooked with a new carrier order: a fresh dedupe key", () => {
		const first = draftFor({
			kind: "DELIVERY_BOOKED",
			order,
			delivery: { ...delivery, carrierId: "lalamove", carrierOrderId: "LLM-9" },
		});
		const rebooked = draftFor({
			kind: "DELIVERY_BOOKED",
			order,
			delivery: {
				...delivery,
				carrierId: "lalamove",
				carrierOrderId: "LLM-10",
			},
		});
		expect(first?.dedupeKey).not.toBe(rebooked?.dedupeKey);
	});

	it("delivery booked, manual carrier: the tracking number shown is the order ref, not the internal id", () => {
		const draft = draftFor({
			kind: "DELIVERY_BOOKED",
			order,
			delivery: {
				...delivery,
				carrierId: "manual",
				carrierOrderId: "manual-ckv9x8z0000",
			},
		});
		expect(draft?.vars.body).toEqual([
			"IC-20260826-014",
			"Own lorry / phoned in",
			"IC-20260826-014",
		]);
	});

	it("the same carrier reading twice gives the same key", () => {
		const event = { kind: "DELIVERED" as const, order, delivery };
		expect(draftFor(event)?.dedupeKey).toBe("delivery:del1:DELIVERED");
		expect(draftFor(event)?.dedupeKey).toBe(draftFor(event)?.dedupeKey);
		expect(draftFor(event)?.template).toBe("delivery_delivered");
	});

	it("falls back to English for a locale we do not serve", () => {
		expect(
			draftFor({ kind: "ORDER_PLACED", order: { ...order, locale: "fr" } })
				?.locale,
		).toBe("en");
	});
});

describe("deliveryKindFor", () => {
	it("messages only the three moments a customer acts on", () => {
		expect(deliveryKindFor("PICKED_UP", "IN_TRANSIT")).toBe("PICKED_UP");
		expect(deliveryKindFor("DELIVERED", "PICKED_UP")).toBe("DELIVERED");
		expect(deliveryKindFor("FAILED", "IN_TRANSIT")).toBe("DELIVERY_FAILED");
		expect(deliveryKindFor("CANCELLED", "BOOKED")).toBe("DELIVERY_FAILED");
		expect(deliveryKindFor("DRIVER_ASSIGNED", "BOOKED")).toBeNull();
		expect(deliveryKindFor("IN_TRANSIT", "BOOKED")).toBeNull();
		expect(deliveryKindFor("BOOKED", "QUOTED")).toBeNull();
	});

	it("a cancel before booking (DRAFT/QUOTED) is not a failed delivery", () => {
		expect(deliveryKindFor("CANCELLED", "DRAFT")).toBeNull();
		expect(deliveryKindFor("CANCELLED", "QUOTED")).toBeNull();
	});

	it("a cancel after delivery is not a failed delivery", () => {
		expect(deliveryKindFor("CANCELLED", "DELIVERED")).toBeNull();
	});
});

describe("payloads", () => {
	it("template: Meta's shape, language code mapped, + stripped", () => {
		expect(
			templatePayload("+60123456789", "production_stage", "zh", {
				body: ["IC-1", "组装"],
				button: "tok",
			}),
		).toEqual({
			messaging_product: "whatsapp",
			to: "60123456789",
			type: "template",
			template: {
				name: "production_stage",
				language: { code: "zh_CN" },
				components: [
					{
						type: "body",
						parameters: [
							{ type: "text", text: "IC-1" },
							{ type: "text", text: "组装" },
						],
					},
					{
						type: "button",
						sub_type: "url",
						index: "0",
						parameters: [{ type: "text", text: "tok" }],
					},
				],
			},
		});
	});

	it("text", () => {
		expect(textPayload("+60123456789", "hi")).toEqual({
			messaging_product: "whatsapp",
			to: "60123456789",
			type: "text",
			text: { body: "hi" },
		});
	});

	it("localeOf keeps a served locale", () => {
		expect(localeOf("zh")).toBe("zh");
		expect(localeOf("")).toBe("en");
	});
});

// WhatsApp is live in these tests unless one says otherwise.
beforeEach(() => {
	vi.stubEnv("WHATSAPP_TOKEN", "t0ken");
	vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("draftsFor", () => {
	const noWhatsapp = { ...order, whatsappOptIn: false };
	const channels = (event: Parameters<typeof draftsFor>[0]) =>
		draftsFor(event)
			.map((draft) => draft.channel)
			.sort();

	it.each(["ORDER_PLACED", "PAYMENT_CONFIRMED", "ORDER_REFUNDED"] as const)(
		"%s goes by email whether or not WhatsApp is on",
		(kind) => {
			expect(channels({ kind, order })).toEqual(["EMAIL", "WHATSAPP"]);
			expect(channels({ kind, order: noWhatsapp })).toEqual(["EMAIL"]);
		},
	);

	it("a stage update goes by one channel only", () => {
		const event = {
			kind: "STAGE",
			stage: "CUTTING",
			stageLabel: "Cutting",
		} as const;
		expect(channels({ ...event, order })).toEqual(["WHATSAPP"]);
		expect(channels({ ...event, order: noWhatsapp })).toEqual(["EMAIL"]);
	});

	it.each(["PICKED_UP", "DELIVERED", "DELIVERY_FAILED"] as const)(
		"%s goes by one channel only",
		(kind) => {
			expect(channels({ kind, order, delivery })).toEqual(["WHATSAPP"]);
			expect(channels({ kind, order: noWhatsapp, delivery })).toEqual([
				"EMAIL",
			]);
		},
	);

	it("delivery booked goes by one channel only", () => {
		const booked = {
			kind: "DELIVERY_BOOKED",
			delivery: { ...delivery, carrierId: "lalamove", carrierOrderId: "LM1" },
		} as const;
		expect(channels({ ...booked, order })).toEqual(["WHATSAPP"]);
		expect(channels({ ...booked, order: noWhatsapp })).toEqual(["EMAIL"]);
	});

	// Before WhatsApp goes live a ticked box would otherwise mean silence.
	it("an opted-in customer still gets mail while WhatsApp cannot send", () => {
		vi.stubEnv("WHATSAPP_TOKEN", "");
		expect(
			channels({
				kind: "STAGE",
				stage: "CUTTING",
				stageLabel: "Cutting",
				order,
			}),
		).toEqual(["EMAIL", "WHATSAPP"]);
		expect(channels({ kind: "DELIVERED", order, delivery })).toEqual([
			"EMAIL",
			"WHATSAPP",
		]);
	});

	it("the two channels never share a dedupe key", () => {
		const [a, b] = draftsFor({ kind: "ORDER_PLACED", order });
		expect(a.dedupeKey).not.toBe(b.dedupeKey);
	});
});

describe("emailDraftFor", () => {
	it("goes to the address typed at checkout", () => {
		expect(emailDraftFor({ kind: "ORDER_PLACED", order })).toMatchObject({
			channel: "EMAIL",
			to: "aisyah@example.com",
			dedupeKey: "order:ord1:placed:email",
			orderId: "ord1",
			kind: "ORDER_PLACED",
			locale: "ms",
		});
	});

	it("falls back to the account's address", () => {
		expect(
			emailDraftFor({
				kind: "ORDER_PLACED",
				order: { ...order, customerEmail: null },
			})?.to,
		).toBe("account@example.com");
	});

	it("keeps the delivery and the stage on the row", () => {
		expect(
			emailDraftFor({
				kind: "DELIVERED",
				order: { ...order, whatsappOptIn: false },
				delivery,
			}),
		).toMatchObject({
			deliveryId: "del1",
			dedupeKey: "delivery:del1:DELIVERED:email",
		});
		expect(
			emailDraftFor({
				kind: "STAGE",
				order: { ...order, whatsappOptIn: false },
				stage: "CUTTING",
				stageLabel: "Cutting",
			}),
		).toMatchObject({ stage: "CUTTING" });
	});
});
