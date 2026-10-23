import "server-only";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { getCompany } from "@/lib/company/store";
import { sendEmail } from "@/lib/email";
import { staffInvite } from "@/lib/email/templates/staffInvite";

/** One escaper for every mail that carries a typed name. */
export { esc } from "@/lib/email/layout";

const ROLE_DESCRIPTIONS: Partial<Record<Role, string>> = {
	SUPERADMIN:
		"Everything an admin can do, plus inviting and managing staff accounts.",
	ADMIN:
		"Manage cabinet designs and prices, orders, deliveries, site content and tutorials.",
};

/**
 * Tells a new staff member that an account exists and where to sign in. The
 * password is deliberately not in it: the superadmin still hands that over
 * themselves, so a mailbox alone never opens a staff account.
 *
 * Layout is the Claude Design `emails/admin-invite.html`; its "accept invite
 * to set your password" and expiry lines are dropped because an invite here
 * creates the account at once and carries no token.
 */
export async function sendStaffInvite(input: {
	to: string;
	name: string;
	inviterName: string;
	role: Role;
	base: string;
	hasPassword: boolean;
}): Promise<boolean> {
	const company = await getCompany();
	return sendEmail({
		to: input.to,
		...staffInvite({
			company,
			name: input.name,
			inviterName: input.inviterName,
			role: ROLE_LABELS[input.role],
			roleDescription: ROLE_DESCRIPTIONS[input.role] ?? "",
			link: `${input.base.replace(/\/+$/, "")}/admin/login`,
			to: input.to,
			hasPassword: input.hasPassword,
		}),
	});
}
