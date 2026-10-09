import "server-only";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
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

/** Mails the invite; the wording and layout are `staffInvite`. */
export function sendStaffInvite(input: {
	to: string;
	name: string;
	inviterName: string;
	role: Role;
	base: string;
	hasPassword: boolean;
}): Promise<boolean> {
	return sendEmail({
		to: input.to,
		...staffInvite({
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
