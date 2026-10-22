import { type MailCompany, renderEmail } from "../layout";

/**
 * Tells a new staff member that an account exists and where to sign in. The
 * password is deliberately not in it: the superadmin still hands that over
 * themselves, so a mailbox alone never opens a staff account.
 */
export function staffInvite(input: {
	company: MailCompany;
	name: string;
	inviterName: string;
	role: string;
	roleDescription: string;
	link: string;
	to: string;
	hasPassword: boolean;
}) {
	const { brand } = input.company;
	const subject = `You've been invited to ${brand} Admin`;
	const how = input.hasPassword
		? "Sign in with Google using this email address, or with the temporary password they will give you. You will be asked to choose your own password and set up an authenticator app."
		: "Keep signing in with Google, using this email address.";
	return {
		subject,
		...renderEmail({
			locale: "en",
			company: input.company,
			about: "account",
			preheader: `${input.inviterName} invited you to the ${brand} admin tool as ${input.role}.`,
			heading: subject,
			blocks: [
				{ type: "paragraph", text: `Hi ${input.name},` },
				{
					type: "paragraph",
					text: `${input.inviterName} has given you access to the ${brand} admin tool. ${how}`,
				},
				{
					type: "box",
					label: "Your role",
					value: input.role,
					note: input.roleDescription || undefined,
				},
				{ type: "button", label: "Sign in", href: input.link },
			],
			footnote: `This invite was sent to ${input.to}. If you weren't expecting it, you can ignore this email.`,
		}),
	};
}
