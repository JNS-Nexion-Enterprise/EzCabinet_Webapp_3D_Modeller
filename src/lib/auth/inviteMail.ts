import "server-only";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email";
import { WORKSHOP_ADDRESS } from "@/lib/logistics/carriers";

const ROLE_DESCRIPTIONS: Partial<Record<Role, string>> = {
	SUPERADMIN:
		"Everything an admin can do, plus inviting and managing staff accounts.",
	ADMIN:
		"Manage cabinet designs and prices, orders, deliveries, site content and tutorials.",
};

/** Names are typed by a person and land in HTML. */
export function esc(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			] as string,
	);
}

/**
 * Tells a new staff member that an account exists and where to sign in. The
 * password is deliberately not in it: the superadmin still hands that over
 * themselves, so a mailbox alone never opens a staff account.
 *
 * Layout is the Claude Design `emails/admin-invite.html`; its "accept invite
 * to set your password" and expiry lines are dropped because an invite here
 * creates the account at once and carries no token.
 */
export function sendStaffInvite(input: {
	to: string;
	name: string;
	inviterName: string;
	role: Role;
	base: string;
	hasPassword: boolean;
}): Promise<boolean> {
	const link = `${input.base.replace(/\/+$/, "")}/admin/login`;
	const role = ROLE_LABELS[input.role];
	const roleDescription = ROLE_DESCRIPTIONS[input.role] ?? "";
	const intro = `${input.inviterName} has given you access to the EzCabinet admin tool.`;
	const how = input.hasPassword
		? "Sign in with Google using this email address, or with the temporary password they will give you. You will be asked to choose your own password and set up an authenticator app."
		: "Keep signing in with Google, using this email address.";
	const footer = `This invite was sent to ${input.to}. If you weren't expecting it, you can ignore this email.`;

	return sendEmail({
		to: input.to,
		subject: "You've been invited to EzCabinet Admin",
		text: [
			`Hi ${input.name},`,
			"",
			intro,
			how,
			"",
			`Your role: ${role}`,
			roleDescription,
			"",
			"Sign in here:",
			link,
			"",
			footer,
		].join("\n"),
		html: inviteHtml({
			name: esc(input.name),
			intro: esc(intro),
			how,
			role,
			roleDescription,
			link: esc(link),
			footer: esc(footer),
			preheader: esc(
				`${input.inviterName} invited you to the EzCabinet admin tool as ${role}.`,
			),
		}),
	});
}

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const BODY = `margin:0 0 16px 0;${FONT}font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:#262626;`;
const SMALL = `${FONT}font-size:13px;line-height:20px;`;

/** Every value arrives already escaped. */
function inviteHtml(v: {
	name: string;
	intro: string;
	how: string;
	role: string;
	roleDescription: string;
	link: string;
	footer: string;
	preheader: string;
}): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>You've been invited to EzCabinet Admin</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
@media (max-width:620px){ .wrap{width:100% !important;} .pad{padding-left:24px !important;padding-right:24px !important;} }
@media (prefers-color-scheme:dark){ .bg{background:#1c1c1a !important;} .card{background:#262624 !important;border-color:#3a3a37 !important;} .ink{color:#f0efe9 !important;} .muted{color:#c4c0b6 !important;} .rule{border-color:#3a3a37 !important;} .box{background:#30302d !important;} .link{color:#8fc4a6 !important;} .logo{background:#f0efe9 !important;color:#171717 !important;} }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f3f1;">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f3f1;">${v.preheader}</span>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3f1;">
<tr><td align="center" style="padding:40px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="pad" style="padding:0 8px 20px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="logo" width="30" height="30" bgcolor="#171717" style="width:30px;height:30px;background:#171717;border-radius:7px;text-align:center;${FONT}font-size:14px;font-weight:bold;color:#ffffff;">E</td>
<td style="padding-left:10px;${FONT}font-size:15px;font-weight:bold;color:#171717;" class="ink">EzCabinet</td>
</tr></table>
</td></tr>
<tr><td class="card pad" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:14px;padding:40px 44px;">
<h1 class="ink" style="margin:0 0 14px 0;${FONT}font-size:24px;line-height:30px;mso-line-height-rule:exactly;font-weight:bold;color:#171717;">You've been invited to EzCabinet Admin</h1>
<p class="ink" style="${BODY}">Hi ${v.name},</p>
<p class="ink" style="${BODY}">${v.intro} ${v.how}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box" bgcolor="#f7f6f3" style="background:#f7f6f3;border-radius:10px;padding:16px 18px;${FONT}">
<p class="muted" style="margin:0 0 4px 0;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#5c574e;">Your role</p>
<p class="ink" style="margin:0 0 4px 0;font-size:16px;line-height:22px;font-weight:bold;color:#171717;">${v.role}</p>
<p class="muted" style="margin:0;font-size:13px;line-height:20px;color:#5c574e;">${v.roleDescription}</p>
</td></tr></table>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>
<td bgcolor="#1f5138" style="background:#1f5138;border-radius:9999px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${v.link}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="#1f5138"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Sign in</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${v.link}" style="display:block;padding:13px 28px;${FONT}font-size:15px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:9999px;">Sign in</a><!--<![endif]-->
</td></tr></table>
<p class="muted" style="margin:0 0 4px 0;${SMALL}color:#5c574e;">If the button doesn't work, paste this link into your browser:</p>
<p style="margin:0 0 24px 0;${SMALL}word-break:break-all;"><a href="${v.link}" class="link" style="color:#1f5138;text-decoration:underline;">${v.link}</a></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ecebe7;font-size:0;line-height:0;height:20px;">&nbsp;</td></tr></table>
<p class="muted" style="margin:0;${SMALL}color:#5c574e;">${v.footer}</p>
</td></tr>
<tr><td class="pad" style="padding:24px 8px 0 8px;${FONT}font-size:12px;line-height:18px;color:#5c574e;">
<p class="muted" style="margin:0 0 6px 0;">${esc(WORKSHOP_ADDRESS)}</p>
<p class="muted" style="margin:0;">This is a service email about your account, so it can't be unsubscribed from.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
