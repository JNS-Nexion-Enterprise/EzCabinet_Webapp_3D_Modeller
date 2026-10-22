import "server-only";
import { after } from "next/server";
import { when } from "@/lib/auth/passkeyMail";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";
import { bankChange } from "@/lib/email/templates/bankChange";
import { type CompanyDetails, lastFour } from "./details";

/**
 * A changed bank account is how money gets diverted, so every superadmin
 * hears of it, the one who saved it included. It cannot stop the change; it
 * makes it visible.
 */
export async function sendBankChange(
	previous: CompanyDetails,
	next: CompanyDetails,
	actorName: string,
	at: Date,
): Promise<void> {
	const admins = await prisma.user.findMany({
		where: { role: "SUPERADMIN", disabled: false },
		select: { email: true },
	});
	const mail = bankChange({
		company: next,
		actorName,
		when: when(at),
		before: {
			bankName: previous.bankName,
			last4: lastFour(previous.bankAccountNumber),
		},
		after: {
			bankName: next.bankName,
			last4: lastFour(next.bankAccountNumber),
		},
	});
	for (const { email } of admins) {
		// One refused address must not keep the others from hearing.
		try {
			await sendEmail({ to: email, ...mail });
		} catch (error) {
			console.error("Bank change mail failed", error);
		}
	}
}

/**
 * Schedules the mail for after the response. Never throws and is never
 * awaited: the save has already committed, and no mail problem may undo it.
 */
export function queueBankChangeMail(
	previous: CompanyDetails,
	next: CompanyDetails,
	actorName: string,
): void {
	const at = new Date();
	try {
		after(() =>
			sendBankChange(previous, next, actorName, at).catch((error) =>
				console.error("Bank change mail failed", error),
			),
		);
	} catch (error) {
		console.error("Bank change mail not scheduled", error);
	}
}
