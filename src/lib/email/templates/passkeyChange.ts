import { type MailCompany, renderEmail } from "../layout";

export type PasskeyChange = "added" | "removed" | "reset";

const WHAT = (
	brand: string,
): Record<
	PasskeyChange,
	{ subject: string; heading: string; line: string }
> => ({
	added: {
		subject: `A passkey was added to your ${brand} account`,
		heading: "Passkey added",
		line: `A passkey was added to your ${brand} account`,
	},
	removed: {
		subject: `A passkey was removed from your ${brand} account`,
		heading: "Passkey removed",
		line: `A passkey was removed from your ${brand} account`,
	},
	reset: {
		subject: `Your ${brand} passkeys were reset`,
		heading: "Passkeys reset",
		line: `${brand} staff removed every passkey from your ${brand} account, and signed it out everywhere`,
	},
});

/**
 * English only, every role. Nothing to click: a forged copy of this mail has
 * nothing to phish with, so `contact` is a number written out, never a link.
 */
export function passkeyChange(input: {
	company: MailCompany;
	change: PasskeyChange;
	name: string;
	/** When it happened, already worded for the reader. */
	when: string;
	/** How to reach us, as the middle of a sentence: "call the company on …". */
	contact: string;
}) {
	const { subject, heading, line } = WHAT(input.company.brand)[input.change];
	const name = input.name.trim();
	return {
		subject,
		...renderEmail({
			locale: "en",
			company: input.company,
			about: "account",
			preheader: subject,
			heading,
			blocks: [
				{ type: "paragraph", text: name ? `Hi ${name},` : "Hello," },
				{ type: "paragraph", text: `${line} on ${input.when}.` },
				{
					type: "paragraph",
					text: `If this was you, there is nothing to do. If it was not, ${input.contact} straight away.`,
				},
			],
		}),
	};
}
