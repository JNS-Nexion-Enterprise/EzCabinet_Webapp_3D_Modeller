import { vercelAdapter } from "@flags-sdk/vercel";
import { flag } from "flags/next";

/**
 * Feature flags, served by Vercel Flags (dashboard or `vercel flags`), and
 * listed in Flags Explorer through `app/.well-known/vercel/flags`.
 */

/**
 * Which gateway takes new online payments — `lib/payments/registry.ts`.
 *
 * Switches without a redeploy, per environment, and a team member can
 * override it in their own browser from Flags Explorer to try a gateway on a
 * deployment before customers see it. The flag only chooses; keys stay in
 * env vars, so a gateway without them still falls back to bank transfer. It
 * never gates a webhook — a payment started before a switch must still land.
 *
 * When Vercel Flags cannot answer — an outage, or the expired token of a
 * local checkout — the flag answers `PAYMENT_GATEWAY_FALLBACK`, set per
 * environment to the gateway that environment is meant to take payment
 * with. Unset, that is `manual`: bank transfer always works, but an
 * environment selling through a gateway must name it, or a flags outage
 * quietly turns online payment off.
 * Add `fiuu` as a variant (`vercel flags update`) when its adapter exists.
 */
export const paymentGatewayFlag = flag<string>({
	key: "payment-gateway",
	description: "Which gateway takes new online payments",
	defaultValue: process.env.PAYMENT_GATEWAY_FALLBACK || "manual",
	options: [
		{ value: "manual", label: "Bank transfer (manual)" },
		{ value: "stripe", label: "Stripe" },
	],
	adapter: vercelAdapter,
});
