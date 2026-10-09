import "server-only";
import { APIError, type createAuthMiddleware } from "better-auth/api";
import { checkBotId } from "botid/server";
import { codeRequest, SIGN_IN_PATH } from "@/lib/auth/emailCodeRules";
import { prisma } from "@/lib/catalogue/db";

/** The context Better Auth hands a `hooks.before` body. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * What a wrong code gets, as the plugin itself writes it — `message` before
 * `code`, since the order is in the bytes of the response.
 */
const invalidCode = () =>
	new APIError("BAD_REQUEST", { message: "Invalid OTP", code: "INVALID_OTP" });

/**
 * `hooks.before` for the email-code plugin: the allow-list, and BotID on the
 * request that makes us send mail. Nothing here reads who the address belongs
 * to, so nothing here can answer differently by address: whether a code is
 * mailed is decided in `sendSignInCode`, after the response has gone, and
 * whether a session is made in `refuseStaffCodeSession`.
 */
export async function emailCodeBeforeHook(ctx: HookContext): Promise<void> {
	const kind = codeRequest(ctx.path, ctx.body);
	if (kind === "refuse") {
		throw new APIError("FORBIDDEN", {
			code: "EMAIL_CODE_ROUTE_REFUSED",
			message: "Route not allowed",
		});
	}
	// A server-side call has no request and no browser to challenge.
	if (kind === "send" && ctx.request && (await checkBotId()).isBot) {
		throw new APIError("FORBIDDEN", {
			code: "EMAIL_CODE_BOT",
			message: "Request refused",
		});
	}
}

/**
 * `databaseHooks.session.create.before`: the one place a staff code sign-in
 * is stopped. Up to here the plugin treats a staff address like any other —
 * it stores a code, counts wrong tries, spends the code on a right one — and
 * only a correct guess of a code nobody was mailed ever gets this far.
 *
 * It used to be refused at the request as well, before the plugin ran. That
 * told staff addresses apart: the plugin never counted their tries, so a
 * fourth wrong guess answered 400 where a customer's answers 403, and our
 * refusal did not match the plugin's byte for byte. Do not put it back.
 *
 * Thrown, not `return false`: the plugin does not check for a refused
 * session and would answer 500.
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
