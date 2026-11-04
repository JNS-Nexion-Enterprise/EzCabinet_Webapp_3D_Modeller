import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import {
	BadSignature,
	type PaymentEvent,
	type PaymentGateway,
	PaymentInProgress,
	toSen,
} from "./types";

/**
 * Fiuu (formerly Razer Merchant Services), through its hosted payment page:
 * the order page posts a signed form to Fiuu, the customer picks FPX, Touch
 * 'n Go, GrabPay or card there, and Fiuu tells us the outcome server to
 * server. Formulas and hosts are from "Fiuu API Spec for Merchant" v13.97.
 *
 * Three URLs are set once in Fiuu's merchant portal (Transactions →
 * Settings), not per request: Notification URL and Callback URL →
 * `/api/webhooks/payment/fiuu`, both with IPN on; Return URL →
 * `/api/payments/fiuu/return`. A per-request return URL is a feature Fiuu
 * enables only for selected merchants, and a fixed one is what lets a
 * preview deployment carry its protection-bypass token.
 *
 * `server-only`: the secret key signs what Fiuu tells us; with it anyone can
 * forge a paid notification.
 */

const md5 = (text: string) => createHash("md5").update(text).digest("hex");

const OUTCOMES: Record<string, "paid" | "failed" | "pending"> = {
	"00": "paid",
	"11": "failed",
	// Pending, or an FPX B2B authorisation still waiting on a second approver.
	"22": "pending",
};

export function fiuuGateway(): PaymentGateway | null {
	const merchantId = process.env.FIUU_MERCHANT_ID;
	const verifyKey = process.env.FIUU_VERIFY_KEY;
	const secretKey = process.env.FIUU_SECRET_KEY;
	if (!merchantId || !verifyKey || !secretKey) return null;
	// Fiuu prefixes every sandbox merchant ID with SB_, and a sandbox ID only
	// exists on the sandbox hosts — so the ID picks the hosts, and the two
	// cannot disagree.
	const sandbox = merchantId.startsWith("SB_");
	const payHost = sandbox
		? "https://sandbox-payment.fiuu.com"
		: "https://pay.fiuu.com";
	const apiHost = sandbox
		? "https://sandbox-api.fiuu.com"
		: "https://api.fiuu.com";

	return {
		id: "fiuu",
		client: { kind: "redirect" },

		async start(order, { returnUrl }) {
			// Fiuu has no payment object to resume: every form posted is a new
			// transaction. So before handing out another form for an order that
			// already had one, ask Fiuu whether an earlier one went through.
			if (order.previousRef) {
				await refuseWhilePaying(apiHost, merchantId, verifyKey, order.id);
			}
			const amount = order.totalRm.toFixed(2);
			const currency = "MYR";
			return {
				kind: "redirect",
				// Fiuu's own id (tranID) exists only once the customer pays; until
				// then the order is known to Fiuu by our id.
				ref: order.id,
				url: `${payHost}/RMS/pay/${merchantId}/`,
				method: "POST",
				fields: {
					amount,
					orderid: order.id,
					currency,
					country: "MY",
					bill_name: order.customerName,
					bill_email: order.customerEmail ?? "",
					bill_mobile: order.customerPhone,
					bill_desc: `${order.brand} order ${order.ref}`,
					// Abandoning on Fiuu's page creates no transaction; back to the
					// order page, which offers Pay again.
					cancelurl: returnUrl,
					// "Use extended format for Verify Payment" must be on in the
					// portal: the currency is part of the hash.
					vcode: md5(amount + merchantId + order.id + verifyKey + currency),
				},
			};
		},

		async verify(rawBody) {
			const field = new URLSearchParams(rawBody);
			const get = (name: string) => field.get(name) ?? "";
			// Hashed with our merchant ID, not the posted `domain`, so a body
			// signed for another merchant fails here too.
			const preSkey = md5(
				get("tranID") +
					get("orderid") +
					get("status") +
					merchantId +
					get("amount") +
					get("currency"),
			);
			const skey = md5(
				get("paydate") + merchantId + preSkey + get("appcode") + secretKey,
			);
			if (!sameHex(get("skey"), skey)) throw new BadSignature("fiuu skey");

			const outcome = OUTCOMES[get("status")];
			if (!outcome) return null;
			return {
				outcome,
				orderId: get("orderid"),
				ref: get("tranID"),
				amountSen: toSen(Number(get("amount"))),
				currency: get("currency").toLowerCase(),
			} satisfies PaymentEvent;
		},

		async ack(rawBody) {
			const nbcb = new URLSearchParams(rawBody).get("nbcb");
			// Callback URL (nbcb=1): Fiuu stops retrying on this exact text.
			if (nbcb === "1") return new Response("CBTOKEN:MPSTATOK");
			// Notification URL (nbcb=2): the ack is a post back of everything
			// Fiuu sent, plus treq=1. Unacknowledged, Fiuu retries to the
			// Callback URL, which `markOrderPaid` takes as a no-op — so a failed
			// post back is logged, never thrown.
			if (nbcb === "2") {
				try {
					await fetch(`${payHost}/RMS/API/chkstat/returnipn.php`, {
						method: "POST",
						headers: { "content-type": "application/x-www-form-urlencoded" },
						body: `${rawBody}&treq=1`,
						signal: AbortSignal.timeout(10_000),
					});
				} catch (error) {
					console.error("fiuu: IPN acknowledgement failed", error);
				}
			}
			return new Response("OK");
		},
	};
}

const sameHex = (given: string, expected: string) =>
	given.length === expected.length &&
	timingSafeEqual(Buffer.from(given.toLowerCase()), Buffer.from(expected));

/**
 * Throws `PaymentInProgress` when Fiuu holds a successful or pending payment
 * for this order — paid at the bank, notification not landed yet — so a
 * retry can never become a second charge. Anything Fiuu answers that this
 * cannot read throws too: refusing a retry is recoverable, a double charge
 * is a refund.
 *
 * `q_oid_batch` (the ten latest transactions for one order ID) answers in
 * plain text, one transaction per line, tab-separated:
 * TranID, BillingDate, StatCode, StatName, Amount, …
 */
export async function refuseWhilePaying(
	apiHost: string,
	merchantId: string,
	verifyKey: string,
	orderId: string,
) {
	const response = await fetch(`${apiHost}/RMS/query/q_oid_batch.php`, {
		method: "POST",
		body: new URLSearchParams({
			oID: orderId,
			domain: merchantId,
			skey: md5(orderId + merchantId + verifyKey),
			type: "0",
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) throw new Error(`fiuu requery: HTTP ${response.status}`);
	const settling = settlingIn(await response.text());
	if (settling) throw new PaymentInProgress(settling);
}

/** The tranID of a successful or pending transaction in a requery answer, if any. */
export function settlingIn(answer: string): string | null {
	// Fiuu's answer for an order it holds no transaction for — a customer who
	// left the payment page without paying. Not in the spec; seen with
	// `pnpm fiuu:ping` on the sandbox, 2026-11-04.
	if (/^Error Q203\b/.test(answer.trim())) return null;
	const lines = answer
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== "" && !/^TranID\b/.test(line));
	// Anything else that is not transaction rows — another error, such as
	// Q202 for a wrong key — is unreadable, and the retry is refused.
	if (lines.some((line) => !/^\d+\t/.test(line))) {
		throw new Error("fiuu requery: unreadable answer");
	}
	const live = lines
		.map((line) => line.split(/\t+/))
		.find(([, , code]) => code === "00" || code === "22");
	return live ? live[0] : null;
}
