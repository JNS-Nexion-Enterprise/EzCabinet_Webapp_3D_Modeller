#!/usr/bin/env node
/**
 * Talk to GDEX without the app in the way.
 *
 * CI runs `adapters/gdex.ts` against the portal's documented payloads, which is
 * our *belief* about GDEX rather than GDEX. A renamed field passes every test
 * and fails the first real booking. This is what notices.
 *
 *   node --env-file=.env.local scripts/gdex-ping.mjs
 *   pnpm gdex:ping
 *
 * It reads only: the token's validity, the e-wallet balance, and a shipping
 * rate for a small parcel between two real Klang Valley postcodes. It never
 * creates a consignment — that spends credit.
 *
 * Auth is two separate credentials, and confusing them is the whole reason this
 * script exists:
 *
 * - `subscription-key` — the Azure APIM key from the developer portal. GDEX
 *   renamed APIM's default header, so `Ocp-Apim-Subscription-Key` is silently
 *   ignored and the gateway answers "missing subscription key" while you are
 *   busy sending one. Primary and secondary are interchangeable; secondary is
 *   the rotation spare, not a signing secret.
 * - `User-Token` — the User Access Token from the myGDEX *customer portal*, a
 *   different system from the developer portal. This is the one that says which
 *   GDEX account is being billed, and **each environment has its own portal**:
 *
 *     test → https://my-openapi.gdexpress.com/dashboard/MyProfile
 *     live → https://my.gdexpress.com/dashboard/MyProfile
 *
 *   The developer portal's own guide links to both under the same link text,
 *   "myGDEX Portal", which is how you end up holding a production token that
 *   the sandbox has never heard of. It answers "Invalid User Token", which
 *   reads like a bad token and is not — it is a token for the other estate.
 *
 * The two environments are the same host, split by a `/test` path segment, and
 * a key is only valid for the product it was issued against — a Testing key on
 * the live path returns "invalid subscription key", which reads like a bad key
 * and is not.
 */

import { createHash } from "node:crypto";

const LIVE = "https://myopenapi.gdexpress.com/api/MyGDex";
const TEST = "https://myopenapi.gdexpress.com/test/api/MyGDex";

const LIVE_PORTAL = "https://my.gdexpress.com/dashboard/MyProfile";
const TEST_PORTAL = "https://my-openapi.gdexpress.com/dashboard/MyProfile";

const live = process.env.GDEX_LIVE === "1";
const BASE = live ? LIVE : TEST;
const TOKEN_PORTAL = live ? LIVE_PORTAL : TEST_PORTAL;

const USER_TOKEN =
	process.argv[2] ??
	process.env.GDEX_USER_TOKEN ??
	process.env.GDEX_PUBLIC_KEY ??
	"";
const SUBSCRIPTION_KEY =
	process.env.GDEX_PRIMARY_API_KEY ?? process.env.GDEX_API_KEY ?? "";

if (USER_TOKEN === "") {
	console.error(
		"No user token. Run with `node --env-file=.env.local scripts/gdex-ping.mjs`,\n" +
			"or pass one: `pnpm gdex:ping <user_token>`.\n" +
			`The token comes from ${TOKEN_PORTAL} → User Profile.`,
	);
	process.exit(1);
}

/**
 * Recognisable between runs, with none of the value in it: a fragment would
 * also slip past the masking GitHub applies to a whole secret in a job log.
 */
function fingerprint(value) {
	if (value === "") return "unset";
	const hash = createHash("sha256").update(value).digest("hex");
	return `${value.length} chars, sha256 ${hash.slice(0, 8)}`;
}

async function call(method, path, body) {
	// `subscription-key`, not `Ocp-Apim-Subscription-Key`. Both are accepted as
	// header names by APIM in general; this instance only reads the renamed one,
	// and answers "missing subscription key" to the default. A query parameter
	// works too, but keeps the credential in every access log it passes.
	const headers = {
		"User-Token": USER_TOKEN,
		"subscription-key": SUBSCRIPTION_KEY,
		accept: "application/json",
	};
	if (body !== undefined) headers["content-type"] = "application/json";

	const response = await fetch(`${BASE}/${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const text = await response.text();
	let parsed = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		// Left null: a non-JSON body is itself the finding, and the raw text is
		// printed either way.
	}
	return { status: response.status, text, json: parsed };
}

function report(label, result) {
	console.log(`\n── ${label} — HTTP ${result.status}`);
	console.log(result.text.slice(0, 1200) || "(empty body)");
}

console.log("GDEX ping");
console.log(`  base             ${BASE}`);
console.log(`  User-Token       ${fingerprint(USER_TOKEN)}`);
console.log(`  subscription key ${fingerprint(SUBSCRIPTION_KEY)}`);

const validity = await call("GET", "GetUserTokenValidity");
report("GetUserTokenValidity", validity);

// The two 401s mean opposite things and point at different people to ask.
if (validity.status === 401) {
	const message = validity.json?.message ?? "";
	console.error(
		message.includes("subscription")
			? "\nThe gateway rejected the subscription key, so the request never reached GDEX.\n" +
					"Check the portal (myopenplatform.gdexpress.com → User profile) that the key\n" +
					"belongs to an Active subscription for the product this base URL serves:\n" +
					`  ${BASE}`
			: "\nThe gateway let the request through and GDEX rejected the User-Token.\n" +
					"\nEach environment has its own customer portal, and they are separate\n" +
					"accounts. A token from one is invalid on the other. This run used:\n" +
					`  ${BASE}\n` +
					`so the token must come from ${TOKEN_PORTAL}\n` +
					"  → log in, User Profile, generate the User Access token.\n" +
					"\nThe developer portal links to both estates' portals under the same words,\n" +
					'"myGDEX Portal", so a production token here is the usual cause.',
	);
	process.exit(1);
}

report("CheckeWalletBalance", await call("GET", "CheckeWalletBalance"));

// Two real Klang Valley postcodes and a 1kg parcel: the smallest request that
// still proves a number comes back. Note what GetShippingRate does NOT take —
// no dimensions, so GDEX prices this on actual weight alone.
const rate = await call("POST", "GetShippingRate", [
	{
		ReferenceNumber: 1,
		FromPostCode: "46050",
		ToPostCode: "11950",
		ParcelType: "Parcel",
		Weight: 1,
		Country: "MYS",
	},
]);
report("GetShippingRate", rate);

const row = rate.json?.data?.[0];
if (row?.HasError === true) {
	console.error(`\nRate refused: ${row.Error}`);
	process.exit(1);
}
if (typeof row?.Rate === "number" && row.Rate > 0) {
	console.log(`\nRate came back: RM ${row.Rate.toFixed(2)}`);
} else {
	console.error("\nNo rate in the reply. The body above is the evidence.");
	process.exit(1);
}
