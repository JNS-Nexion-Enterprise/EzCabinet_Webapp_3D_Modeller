import "server-only";
import { after } from "next/server";
import { esc } from "@/lib/auth/inviteMail";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";
import { WORKSHOP_PHONE } from "@/lib/logistics/carriers";

export type PasskeyChange = "added" | "removed" | "reset";

const WHAT: Record<PasskeyChange, { subject: string; line: string }> = {
	added: {
		subject: "A passkey was added to your EzCabinet account",
		line: "A passkey was added to your EzCabinet account",
	},
	removed: {
		subject: "A passkey was removed from your EzCabinet account",
		line: "A passkey was removed from your EzCabinet account",
	},
	reset: {
		subject: "Your EzCabinet passkeys were reset",
		line: "EzCabinet staff removed every passkey from your EzCabinet account, and signed it out everywhere",
	},
};

/** As a customer in Malaysia would read it, wherever the server runs. */
function when(at: Date): string {
	const stamp = at.toLocaleString("en-MY", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Kuala_Lumpur",
	});
	return `${stamp} (Malaysia time)`;
}

/**
 * The sales number the WhatsApp help link uses, written out. A number, not a
 * link: this mail carries nothing to click, so a forged copy has nothing to
 * phish with.
 */
function contact(): string {
	const sales = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");
	return sales
		? `message EzCabinet on WhatsApp at +${sales}`
		: `call EzCabinet on ${WORKSHOP_PHONE}`;
}

/**
 * Tells an account's own address that its passkeys changed. Until the first
 * passkey exists the mailbox (or the Google account) is the only lock, and
 * whoever holds it can enrol their own — so the owner hears every time, for
 * every role. It cannot stop the change; it makes it visible.
 */
export async function sendPasskeyChange(
	userId: string,
	change: PasskeyChange,
	at: Date = new Date(),
): Promise<void> {
	const row = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true, name: true },
	});
	if (!row) return;
	const { subject, line } = WHAT[change];
	const hello = row.name.trim() ? `Hi ${row.name.trim()},` : "Hello,";
	const happened = `${line} on ${when(at)}.`;
	const ifNot = `If this was you, there is nothing to do. If it was not, ${contact()} straight away.`;
	await sendEmail({
		to: row.email,
		subject,
		text: [hello, "", happened, "", ifNot].join("\n"),
		html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#262626;"><p>${esc(hello)}</p><p>${esc(happened)}</p><p>${esc(ifNot)}</p></div>`,
	});
}

/**
 * Schedules the mail for after the response, from inside a request. Never
 * throws and is never awaited: the passkey change has already happened, and
 * no mail problem may undo it or fail the request that made it.
 */
export function queuePasskeyMail(userId: string, change: PasskeyChange): void {
	const at = new Date();
	try {
		after(() =>
			sendPasskeyChange(userId, change, at).catch((error) =>
				console.error("Passkey mail failed", error),
			),
		);
	} catch (error) {
		// No request to run after: nothing is sent, and the change stands.
		console.error("Passkey mail not scheduled", error);
	}
}
