import { NextResponse } from "next/server";
import { authEnabled } from "@/lib/auth/enabled";
import { currentUser } from "@/lib/auth/session";
import { activeGateway } from "@/lib/payments/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the checkout page needs to draw its payment step before any order
 * exists: which kind of gateway is live (the `payment-gateway` flag) and, for
 * Stripe, its publishable key. Null means bank transfer. Asked at runtime
 * rather than baked into the planner, so the planner stays static and a flag
 * flip needs no redeploy.
 */
export async function GET() {
	const gateway = await activeGateway();
	// `passkeyRequired`: a signed-in customer who still owes the passkey step.
	// The quote screen shows a card for it instead of the form, so nothing a
	// customer types is lost at the detour. One boolean, no other user data.
	const passkeyRequired =
		authEnabled() && (await currentUser())?.mustVerifyPasskey === true;
	return NextResponse.json(
		// `signIn`: whether checkout needs an account. False only with
		// AUTH_ENABLED off, which is local only — see `demoCustomer`.
		{
			client: gateway?.client ?? null,
			signIn: authEnabled(),
			passkeyRequired,
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
