import "server-only";
import { APIError, type createAuthMiddleware } from "better-auth/api";
import { checkBotId } from "botid/server";
import {
	codeRequest,
	mayUseCode,
	SIGN_IN_PATH,
} from "@/lib/auth/emailCodeRules";
import { prisma } from "@/lib/catalogue/db";

/** The context Better Auth hands a `hooks.before` body. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * What a wrong code gets, word for word. A staff address must not be told
 * apart from a customer who mistyped.
 */
const invalidCode = () =>
	new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });

/**
 * `hooks.before` for the email-code plugin: the allow-list, BotID on the
 * request that makes us send mail, and the first refusal of staff. Whether a
 * code is actually mailed is decided later, in `sendSignInCode`, after the
 * response has gone — so nothing here may answer differently by address.
 */
export async function emailCodeBeforeHook(ctx: HookContext): Promise<void> {
	const kind = codeRequest(ctx.path, ctx.body);
	if (kind === "ignore") return;
	if (kind === "refuse") {
		throw new APIError("FORBIDDEN", {
			code: "EMAIL_CODE_ROUTE_REFUSED",
			message: "Route not allowed",
		});
	}
	if (kind === "send") {
		// A server-side call has no request and no browser to challenge.
		if (ctx.request && (await checkBotId()).isBot) {
			throw new APIError("FORBIDDEN", {
				code: "EMAIL_CODE_BOT",
				message: "Request refused",
			});
		}
		return;
	}
	// Even with a correct code: one may exist from before a promotion.
	const email = String((ctx.body as { email?: unknown }).email).toLowerCase();
	const row = await prisma.user.findUnique({
		where: { email },
		select: { role: true },
	});
	if (!mayUseCode(row)) throw invalidCode();
}

/**
 * `databaseHooks.session.create.before`: the same rule a third time, where
 * the session row is made, so it holds even if the hook above is ever
 * bypassed. Thrown, not `return false`: the plugin does not check for a
 * refused session and would answer 500.
 */
export async function refuseStaffCodeSession(
	session: { userId: string },
	ctx: { path?: string } | null,
): Promise<void> {
	if (ctx?.path !== SIGN_IN_PATH) return;
	const row = await prisma.user.findUnique({
		where: { id: session.userId },
		select: { role: true },
	});
	// No row is refused too: here the account always exists already.
	if (row?.role !== "CUSTOMER") throw invalidCode();
}
