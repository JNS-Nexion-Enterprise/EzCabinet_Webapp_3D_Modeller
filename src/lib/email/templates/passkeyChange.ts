import { renderEmail } from "../layout";

export type PasskeyChange = "added" | "removed" | "reset";

const WHAT: Record<
	PasskeyChange,
	{ subject: string; heading: string; line: string }
> = {
	added: {
		subject: "A passkey was added to your EzCabinet account",
		heading: "Passkey added",
		line: "A passkey was added to your EzCabinet account",
	},
	removed: {
		subject: "A passkey was removed from your EzCabinet account",
		heading: "Passkey removed",
		line: "A passkey was removed from your EzCabinet account",
	},
	reset: {
		subject: "Your EzCabinet passkeys were reset",
		heading: "Passkeys reset",
		line: "EzCabinet staff removed every passkey from your EzCabinet account, and signed it out everywhere",
	},
};

/**
 * English only, every role. Nothing to click: a forged copy of this mail has
 * nothing to phish with, so `contact` is a number written out, never a link.
 */
export function passkeyChange(input: {
	change: PasskeyChange;
	name: string;
	/** When it happened, already worded for the reader. */
	when: string;
	/** How to reach us, as the middle of a sentence: "call EzCabinet on …". */
	contact: string;
}) {
	const { subject, heading, line } = WHAT[input.change];
	const name = input.name.trim();
	return {
		subject,
		...renderEmail({
			locale: "en",
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
