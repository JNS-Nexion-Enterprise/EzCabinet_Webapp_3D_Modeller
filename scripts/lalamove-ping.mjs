#!/usr/bin/env node
/**
 * Talk to Lalamove without the app in the way.
 *
 * When a comparison comes back empty there are five candidates — no
 * credentials, no pin, a refused payload, a shape we did not expect, a
 * timeout — and only two of them are ours. This answers the other three by
 * calling Lalamove directly with the same signing the adapter uses, and
 * printing what comes back verbatim.
 *
 *   node --env-file=.env.local scripts/lalamove-ping.mjs
 *   pnpm lalamove:ping
 *
 * `GET /v3/cities` is the important one: it lists the service-type keys this
 * account may use in this city, and `SERVICE_TYPE` in the adapter is hardcoded
 * for MY on the strength of the docs. If the keys differ, every quote fails
 * with ERR_INVALID_SERVICE_TYPE no matter what else is right.
 */

import { createHmac, randomUUID } from "node:crypto";

const KEY = process.env.LALAMOVE_API_KEY ?? "";
const SECRET = process.env.LALAMOVE_API_SECRET ?? "";
const MARKET = process.env.LALAMOVE_MARKET ?? "MY";
/** Overridable, because finding out which key this city accepts is the point. */
const SERVICE_TYPE = process.argv[2] ?? "VAN";

if (KEY === "" || SECRET === "") {
	console.error(
		"No credentials. Run with `node --env-file=.env.local scripts/lalamove-ping.mjs`,\n" +
			"or set LALAMOVE_API_KEY and LALAMOVE_API_SECRET in the environment.",
	);
	process.exit(1);
}

// Same rule as the adapter: the key's own prefix decides the host, so a
// production key cannot be pointed at sandbox by accident.
const BASE = KEY.startsWith("pk_test")
	? "https://rest.sandbox.lalamove.com"
	: "https://rest.lalamove.com";

/** The workshop, and a point a few km away — enough for a real quotation. */
const PICKUP = { lat: "2.9848868", lng: "101.861807" };
const DROPOFF = { lat: "3.0733", lng: "101.5185" };

/** `HmacSHA256(<ts>CRLF<VERB>CRLF<path>CRLF CRLF<body>)`, hex. */
function sign(ts, method, path, body) {
	return createHmac("sha256", SECRET)
		.update(`${ts}\r\n${method}\r\n${path}\r\n\r\n${body}`)
		.digest("hex");
}

async function call(method, path, payload) {
	const raw = payload === undefined ? "" : JSON.stringify(payload);
	const ts = String(Date.now());
	const headers = {
		"content-type": "application/json",
		accept: "application/json",
		Authorization: `hmac ${KEY}:${ts}:${sign(ts, method, path, raw)}`,
		Market: MARKET,
		"Request-ID": randomUUID(),
	};

	console.log(`\n${"─".repeat(72)}\n${method} ${BASE}${path}`);
	console.log("headers:", { ...headers, Authorization: "[redacted]" });
	if (raw !== "") console.log("body:", raw);

	const startedAt = Date.now();
	try {
		const response = await fetch(`${BASE}${path}`, {
			method,
			headers,
			body: raw === "" ? undefined : raw,
			signal: AbortSignal.timeout(15_000),
		});
		const text = await response.text();
		console.log(`→ ${response.status} in ${Date.now() - startedAt}ms`);
		try {
			console.dir(JSON.parse(text), { depth: 6 });
		} catch {
			console.log(text);
		}
		return response.ok;
	} catch (error) {
		console.log(`→ failed in ${Date.now() - startedAt}ms:`, error);
		return false;
	}
}

console.log(`market ${MARKET} · ${BASE}`);

// Credentials, host and market in one call — and the list of service types this
// city actually accepts.
await call("GET", "/v3/cities");

await call("POST", "/v3/quotations", {
	data: {
		serviceType: SERVICE_TYPE,
		language: "en_MY",
		stops: [
			{ coordinates: PICKUP, address: "Workshop, Selangor" },
			{ coordinates: DROPOFF, address: "Petaling Jaya, Selangor" },
		],
	},
});

console.log(
	`\n${"─".repeat(72)}\n` +
		"If /v3/cities lists MY service types that are not CAR / VAN / TRUCK330 /\n" +
		"TRUCK550, correct SERVICE_TYPE in src/lib/logistics/adapters/lalamove.ts —\n" +
		"that mismatch fails every quote before the app can be at fault.\n" +
		"Re-run with a key from that list to check one: pnpm lalamove:ping TRUCK330",
);
