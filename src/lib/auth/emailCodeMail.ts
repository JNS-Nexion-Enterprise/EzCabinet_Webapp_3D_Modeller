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
import { signInCode } from "@/lib/email/templates/signInCode";

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
 * A code the mail provider refused is left in place too, for the same
 * symmetry: a staff address is never mailed and keeps its row, so deleting a
 * customer's undelivered one would let the fourth wrong guess tell them
 * apart whenever mail is down. It simply expires: nobody was sent it, it is
 * stored hashed, and it takes three tries in ten minutes.
 *
 * Every delete below happens for staff and customer alike: when the lookup
 * or the count throws (the role is unknown, or not consulted), and past the
 * cap.
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
	// the code is never logged. Nor in production without one: a missing key
	// there is a fault, and function logs are no place for a working code or
	// for who asked for it.
	if (!process.env.RESEND_API_KEY) {
		if (process.env.VERCEL_ENV === "production") {
			console.error("Sign-in code not sent: RESEND_API_KEY is not set");
		} else {
			console.info(`Sign-in code for ${email}: ${code}`);
		}
		return;
	}
	// English until the send request carries the page's language.
	const mail = signInCode({ locale: "en", code, minutes: CODE_TTL_S / 60 });
	await sendEmail({
		to: email,
		// Not the template's subject: that one carries the code.
		subject: "Your EzCabinet sign-in code",
		text: mail.text,
		html: mail.html,
	});
}
