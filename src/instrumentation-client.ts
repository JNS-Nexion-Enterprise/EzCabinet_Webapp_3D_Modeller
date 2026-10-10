import { initBotId } from "botid/client/core";

/**
 * Bot protection for the two public endpoints a script would abuse: checkout,
 * where the route calls `checkBotId()` and refuses a script before it becomes
 * an order row an admin has to cancel, and the send-code request, where
 * `emailCodeBeforeHook` refuses one before it becomes mail to a stranger.
 *
 * Only BotID lives here. Analytics deliberately does not — it loads on idle
 * from `lib/analytics.ts` so it never sits on the landing page's first paint.
 */
initBotId({
	protect: [
		{ path: "/api/orders", method: "POST" },
		{ path: "/api/auth/email-otp/send-verification-otp", method: "POST" },
	],
});
