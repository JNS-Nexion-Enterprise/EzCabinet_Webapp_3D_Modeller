#!/usr/bin/env node
/**
 * Ask Fiuu's order-ID requery what it holds for one order, without the app
 * in the way, and print its answer verbatim.
 *
 * CI proves `settlingIn` (src/lib/payments/fiuu.ts) reads the answer the spec
 * documents; this shows the answer Fiuu actually gives — in particular for an
 * order with no transactions, which the spec does not show and the retry
 * guard refuses until it is known.
 *
 *   pnpm fiuu:ping                 a made-up order: the "no transactions" answer
 *   pnpm fiuu:ping <order id>      a real order's transactions
 *
 * Not in CI: it needs the merchant's verify key.
 */
import { createHash } from "node:crypto";

const MERCHANT_ID = process.env.FIUU_MERCHANT_ID ?? "";
const VERIFY_KEY = process.env.FIUU_VERIFY_KEY ?? "";
if (MERCHANT_ID === "" || VERIFY_KEY === "") {
	console.error("Set FIUU_MERCHANT_ID and FIUU_VERIFY_KEY in .env.local.");
	process.exit(1);
}

const host = MERCHANT_ID.startsWith("SB_")
	? "https://sandbox-api.fiuu.com"
	: "https://api.fiuu.com";
const orderId = process.argv[2] ?? `ping${Date.now()}`;
const md5 = (text) => createHash("md5").update(text).digest("hex");

const response = await fetch(`${host}/RMS/query/q_oid_batch.php`, {
	method: "POST",
	body: new URLSearchParams({
		oID: orderId,
		domain: MERCHANT_ID,
		skey: md5(orderId + MERCHANT_ID + VERIFY_KEY),
		type: "0",
	}),
	signal: AbortSignal.timeout(15_000),
});
console.log(`${host} → HTTP ${response.status} for order ${orderId}`);
console.log(JSON.stringify(await response.text()));
