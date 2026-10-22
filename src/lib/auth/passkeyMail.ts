import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/catalogue/db";
import { getCompany } from "@/lib/company/store";
import { sendEmail } from "@/lib/email";
import {
	type PasskeyChange,
	passkeyChange,
} from "@/lib/email/templates/passkeyChange";

export type { PasskeyChange };

/** As a customer in Malaysia would read it, wherever the server runs. */
export function when(at: Date): string {
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
function contact(company: { brand: string; phone: string }): string {
	const sales = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");
	return sales
		? `message ${company.brand} on WhatsApp at +${sales}`
		: `call ${company.brand} on ${company.phone}`;
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
	const company = await getCompany();
	await sendEmail({
		to: row.email,
		...passkeyChange({
			company,
			change,
			name: row.name,
			when: when(at),
			contact: contact(company),
		}),
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
