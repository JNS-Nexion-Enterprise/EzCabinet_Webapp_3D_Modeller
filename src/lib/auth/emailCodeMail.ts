import "server-only";
import { randomUUID } from "node:crypto";
import {
	CODE_TTL_S,
	mayUseCode,
	SEND_WINDOW_S,
	withinSendCap,
} from "@/lib/auth/emailCodeRules";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";

/**
 * Counts this send against the address and says whether it is within the
 * hourly cap. Better Auth's own limiter is per network; this is the half that
 * stops a flood aimed at one inbox from many networks.
 *
 * The row lives in Better Auth's `rateLimit` table under a key its limiter
 * never uses (`<ip>|<path>` there). The window is fixed from the first send.
 */
async function takeSendSlot(email: string): Promise<boolean> {
	const key = `email-code|${email}`;
	const now = Date.now();
	await prisma.rateLimit.deleteMany({
		where: { key, lastRequest: { lt: now - SEND_WINDOW_S * 1000 } },
	});
	const row = await prisma.rateLimit.upsert({
		where: { key },
		create: { id: randomUUID(), key, count: 1, lastRequest: now },
		update: { count: { increment: 1 } },
	});
	return withinSendCap(row.count);
}

/**
 * Decides whether the code the plugin has just stored is mailed, and mails
 * it. Runs after the response (`after()` in `lib/auth.ts`), so a staff
 * address, a capped address and a customer all got the same answer in the
 * same time.
 *
 * A staff address takes the same path as a customer's — counted against the
 * cap, its code dropped past it — except that nothing is mailed or logged.
 * Under the cap its stored code is left in place on purpose: the plugin then
 * counts wrong tries against it exactly as for a customer, so the tries
 * cannot tell the address apart. Nobody was sent it, and guessing it right
 * still makes no session (`refuseStaffCodeSession`).
 *
 * A customer's code that never went out is deleted instead: nobody can type
 * it, so all it could do for its ten minutes is be guessed at.
 */
export async function sendSignInCode(
	email: string,
	code: string,
): Promise<void> {
	const dropCode = () =>
		prisma.verification.deleteMany({
			where: { identifier: `sign-in-otp-${email}` },
		});
	let staff: boolean;
	let withinCap: boolean;
	try {
		const row = await prisma.user.findUnique({
			where: { email },
			select: { role: true },
		});
		staff = !mayUseCode(row);
		withinCap = await takeSendSlot(email);
	} catch (error) {
		// Not counted, so not sent. The same database may refuse this too.
		await dropCode().catch(() => {});
		throw error;
	}
	if (!withinCap) {
		await dropCode();
		return;
	}
	if (staff) return;
	// Local and preview have no mail key: the developer reads the code here,
	// and a preview deployment cannot be used to mail strangers. With a key
	// the code is never logged.
	if (!process.env.RESEND_API_KEY) {
		console.info(`Sign-in code for ${email}: ${code}`);
		return;
	}
	const minutes = CODE_TTL_S / 60;
	const sent = await sendEmail({
		to: email,
		subject: "Your EzCabinet sign-in code",
		text: [
			`Your EzCabinet sign-in code is ${code}`,
			"",
			`Type it into the page that asked for it. It works once, for ${minutes} minutes.`,
			"",
			"If you did not ask for this, ignore this email.",
		].join("\n"),
		html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#262626;"><p>Your EzCabinet sign-in code is</p><p style="font-size:28px;line-height:34px;font-weight:bold;letter-spacing:4px;color:#171717;">${code}</p><p>Type it into the page that asked for it. It works once, for ${minutes} minutes.</p><p style="font-size:13px;color:#5c574e;">If you did not ask for this, ignore this email.</p></div>`,
	});
	if (!sent) await dropCode();
}
