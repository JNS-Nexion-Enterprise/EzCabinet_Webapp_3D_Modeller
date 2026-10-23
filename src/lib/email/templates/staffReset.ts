import { type MailCompany, renderEmail } from "../layout";

/** Staff only, English only: `sendStaffReset` decides who is ever sent one. */
export function staffReset(input: {
	company: MailCompany;
	name: string;
	link: string;
}) {
	const { brand } = input.company;
	const subject = `Reset your ${brand} admin password`;
	return {
		subject,
		...renderEmail({
			locale: "en",
			company: input.company,
			about: "account",
			preheader:
				"Use this link to choose a new password. It works once, for one hour.",
			heading: "Reset your password",
			blocks: [
				{ type: "paragraph", text: `Hi ${input.name},` },
				{
					type: "paragraph",
					text: `Someone asked to reset the password on your ${brand} admin account. Choose a new one with the button below.`,
				},
				{ type: "button", label: "Choose a new password", href: input.link },
			],
			footnote:
				"This link works once, for one hour. You will still need your authenticator code to sign in. If this wasn't you, ignore this email. Nothing has changed.",
		}),
	};
}
