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
	// A failed user read must not take the gateway down with it (the screen
	// would fall back to bank transfer): the server's 401 on Pay is the real check.
	// `nameRequired`: the same for a code customer who has not given a name,
	// which is asked for first.
	let passkeyRequired = false;
	let nameRequired = false;
	if (authEnabled()) {
		try {
			const user = await currentUser();
			nameRequired = user?.mustSetName === true;
			passkeyRequired = user?.mustVerifyPasskey === true;
		} catch (error) {
			console.error("payments/config: could not read the user", error);
		}
	}
	return NextResponse.json(
		// `signIn`: whether checkout needs an account. False only with
		// AUTH_ENABLED off, which is local only — see `demoCustomer`.
		{
			client: gateway?.client ?? null,
			signIn: authEnabled(),
			nameRequired,
			passkeyRequired,
		},
		{ headers: { "Cache-Control": "no-store" } },
	);
}
