import { type MailCompany, renderEmail } from "../layout";

type Account = { bankName: string; last4: string };

const show = (a: Account) =>
	`${a.bankName}, ${a.last4 ? `account ending ${a.last4}` : "no account number"}`;

/**
 * English only, to every superadmin. Nothing to click, for the reason
 * `passkeyMail.ts` gives: a forged copy of this mail has nothing to phish
 * with. Only the last four digits are printed — enough to tell the accounts
 * apart, never enough to pay into one.
 */
export function bankChange(input: {
	company: MailCompany;
	actorName: string;
	/** When it happened, already worded for the reader. */
	when: string;
	before: Account;
	after: Account;
}) {
	const subject = "The bank account for customer payments was changed";
	return {
		subject,
		...renderEmail({
			locale: "en",
			company: input.company,
			about: "account",
			preheader: subject,
			heading: "Bank account changed",
			blocks: [
				{
					type: "paragraph",
					text: `${input.actorName} changed the bank account customers pay into on ${input.when}.`,
				},
				{ type: "paragraph", text: `Before: ${show(input.before)}` },
				{ type: "paragraph", text: `Now: ${show(input.after)}` },
			],
			footnote: `If nobody at ${input.company.brand} meant to change it, sign in to the admin, put the old account back and find out who saved it.`,
		}),
	};
}
