import { describe, expect, it } from "vitest";
import type { PaymentStart } from "@/lib/payments/types";
import { checkoutNext } from "../checkoutNext";

const hosted: PaymentStart = {
	kind: "redirect",
	ref: "order1",
	url: "https://sandbox-payment.fiuu.com/RMS/pay/SB_ACME/",
	method: "POST",
	fields: { orderid: "order1" },
};
const intent: PaymentStart = {
	kind: "stripe-elements",
	ref: "pi_1",
	publishableKey: "pk_test",
	clientSecret: "pi_1_secret",
};

describe("checkoutNext", () => {
	it("posts to a hosted-page gateway on the press that placed the order", () => {
		expect(checkoutNext(hosted, { placedNow: true, stripeReady: false })).toBe(
			"gateway",
		);
	});

	it("sends a later press to the order page, which asks the gateway first", () => {
		// The form from the first press may already have been paid; only
		// `/pay`'s requery can tell, so it is never posted twice.
		expect(checkoutNext(hosted, { placedNow: false, stripeReady: false })).toBe(
			"order-page",
		);
	});

	it("confirms a Stripe intent here when the Payment Element is ready", () => {
		expect(checkoutNext(intent, { placedNow: true, stripeReady: true })).toBe(
			"confirm",
		);
	});

	it("continues on the order page when the Payment Element is not ready", () => {
		expect(checkoutNext(intent, { placedNow: true, stripeReady: false })).toBe(
			"order-page",
		);
	});

	it("continues on the order page for bank transfer", () => {
		expect(checkoutNext(null, { placedNow: true, stripeReady: false })).toBe(
			"order-page",
		);
	});
});
