import { beforeEach, describe, expect, it, vi } from "vitest";

const deliverEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			"sent" as "sent" | "refused" | "unavailable",
	),
);
const orderFind = vi.hoisted(() => vi.fn());
const deliveryFind = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({ deliverEmail }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		order: { findUnique: orderFind },
		delivery: { findUnique: deliveryFind },
	},
}));

const { sendOrderEmail } = await import("../orderMail");

const order = {
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah",
	siteAddress: "12 Jalan Meranti 4",
	paymentProvider: "manual",
	paidAt: null,
	breakdown: { cabinets: [], categories: [] },
	cabinetsRm: 1000,
	deliveryRm: 85,
	totalRm: 1085,
};
const row = {
	orderId: "o1",
	deliveryId: null,
	kind: "ORDER_PLACED" as const,
	stage: null,
	to: "a@example.com",
	locale: "ms",
};

beforeEach(() => {
	deliverEmail.mockClear();
	orderFind.mockReset().mockResolvedValue(order);
	deliveryFind.mockReset().mockResolvedValue(null);
});

describe("sendOrderEmail", () => {
	it("mails the row's address in the row's language", async () => {
		await expect(sendOrderEmail(row, "https://x.test")).resolves.toBe("sent");
		const mail = deliverEmail.mock.calls[0][0];
		expect(mail.to).toBe("a@example.com");
		expect(mail.subject).toContain("IC-20260826-014");
		expect(mail.html).toContain('<html lang="ms">');
		expect(mail.text).toContain("https://x.test/ms/order/tok_order");
	});

	it("falls back to English for a locale the site no longer serves", async () => {
		await sendOrderEmail({ ...row, locale: "fr" }, "https://x.test");
		expect(deliverEmail.mock.calls[0][0].html).toContain('<html lang="en">');
	});

	it("names the stage in the order's language", async () => {
		await sendOrderEmail(
			{ ...row, kind: "STAGE", stage: "CUTTING", locale: "en" },
			"https://x.test",
		);
		expect(deliverEmail.mock.calls[0][0].subject).toContain("Cutting");
	});

	it("links the tracking page and hides a by-hand tracking number", async () => {
		deliveryFind.mockResolvedValue({
			publicToken: "tok_delivery",
			carrierId: "manual",
			carrierOrderId: "manual-abc",
		});
		await sendOrderEmail(
			{ ...row, kind: "DELIVERY_BOOKED", deliveryId: "d1", locale: "en" },
			"https://x.test",
		);
		const mail = deliverEmail.mock.calls[0][0];
		expect(mail.text).toContain("https://x.test/en/track/tok_delivery");
		expect(mail.text).not.toContain("manual-abc");
	});

	it("still sends when the delivery row is gone", async () => {
		await sendOrderEmail(
			{ ...row, kind: "DELIVERED", deliveryId: "gone", locale: "en" },
			"https://x.test",
		);
		expect(deliverEmail.mock.calls[0][0].text).toContain(
			"https://x.test/en/order/tok_order",
		);
	});

	it("passes on that the mail service could not be reached", async () => {
		deliverEmail.mockResolvedValueOnce("unavailable");
		await expect(sendOrderEmail(row, "https://x.test")).resolves.toBe(
			"unavailable",
		);
	});

	it("reports refused, sending nothing, when the order is gone", async () => {
		orderFind.mockResolvedValue(null);
		await expect(sendOrderEmail(row, "https://x.test")).resolves.toBe(
			"refused",
		);
		expect(deliverEmail).not.toHaveBeenCalled();
	});
});
