import type { PaymentStart } from "@/lib/payments/types";

/**
 * Where checkout goes once the order exists.
 *
 * A hosted-page gateway (Fiuu) is posted to straight away, but only on the
 * press that placed the order: its signed form may already have been paid,
 * and only `/api/orders/[token]/pay` — which asks the gateway first — can
 * tell, so any later press continues on the order page instead of posting
 * the same form twice.
 */
export function checkoutNext(
	payment: PaymentStart | null,
	{ placedNow, stripeReady }: { placedNow: boolean; stripeReady: boolean },
): "confirm" | "gateway" | "order-page" {
	if (payment?.kind === "stripe-elements" && stripeReady) return "confirm";
	if (payment?.kind === "redirect" && placedNow) return "gateway";
	return "order-page";
}

/** Post the gateway's signed form, as if the customer had pressed its button. */
export function postToGateway({
	url,
	method,
	fields,
}: Extract<PaymentStart, { kind: "redirect" }>) {
	const form = document.createElement("form");
	form.action = url;
	form.method = method;
	for (const [name, value] of Object.entries(fields)) {
		const input = document.createElement("input");
		input.type = "hidden";
		input.name = name;
		input.value = value;
		form.append(input);
	}
	document.body.append(form);
	form.submit();
}
