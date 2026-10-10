import { fill } from "@/lib/copy/fill";
import type { Locale } from "@/lib/copy/locales";
import { WORKSHOP_ADDRESS, WORKSHOP_PHONE } from "@/lib/logistics/carriers";
import { BRAND, EMAIL_COPY } from "./copy";

/**
 * The one look every email shares, and the plain-text part beside it.
 *
 * Both parts are built from the same blocks, so they cannot drift. Every
 * value is escaped here: a caller passes what a person typed, as typed.
 */
export type Block =
	| { type: "paragraph"; text: string }
	| { type: "box"; label: string; value: string; note?: string }
	| { type: "code"; code: string }
	| {
			type: "rows";
			rows: { label: string; amount: string }[];
			total: { label: string; amount: string };
	  }
	| { type: "button"; label: string; href: string };

export type EmailContent = {
	locale: Locale;
	/** Picks the footer: an order mail also says how to reach us. */
	about: "account" | "order";
	preheader: string;
	heading: string;
	blocks: Block[];
	/** The grey line under the rule. */
	footnote?: string;
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
 * The JNS Cabinet Configurator email design (Claude Design, v2): a navy
 * header band, an off-white body on a cool grey page, and blue buttons.
 */
const C = {
	page: "#F3F5FA",
	hero: "#0A0F1F",
	eyebrow: "#5CE1FF",
	heroInk: "#F3F5FA",
	body: "#FCFCFD",
	ink: "#0A0F1F",
	text: "#3C4757",
	muted: "#5B6478",
	rule: "#E2E5EC",
	box: "#EEF1F6",
	accent: "#2B5BFF",
} as const;

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const BODY = `margin:0 0 16px 0;${FONT}font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:${C.text};`;
const SMALL = `${FONT}font-size:13px;line-height:20px;`;
const LABEL = `margin:0 0 4px 0;font-size:12px;line-height:16px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:${C.muted};`;

function blockHtml(block: Block, linkFallback: string): string {
	switch (block.type) {
		case "paragraph":
			return `<p class="txt" style="${BODY}">${esc(block.text)}</p>`;
		case "box":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box" bgcolor="${C.box}" style="background-color:${C.box};border-radius:6px;padding:16px 20px;${FONT}">
<p class="muted" style="${LABEL}">${esc(block.label)}</p>
<p class="ink" style="margin:0;font-size:16px;line-height:22px;font-weight:bold;color:${C.ink};">${esc(block.value)}</p>${
				block.note
					? `\n<p class="muted" style="margin:4px 0 0 0;font-size:13px;line-height:20px;color:${C.muted};">${esc(block.note)}</p>`
					: ""
			}
</td></tr></table>`;
		case "code":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box ink" align="center" bgcolor="${C.box}" style="background-color:${C.box};border-radius:6px;padding:20px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:8px;color:${C.ink};">${esc(block.code)}</td></tr></table>`;
		case "rows": {
			const line = (label: string, amount: string, style: string) =>
				`<tr><td class="txt" style="padding:12px 0;border-bottom:1px solid ${C.rule};${FONT}font-size:15px;line-height:22px;color:${C.text};${style}">${esc(label)}</td><td class="txt" align="right" style="padding:12px 0 12px 12px;border-bottom:1px solid ${C.rule};${FONT}font-size:15px;line-height:22px;color:${C.text};white-space:nowrap;${style}">${esc(amount)}</td></tr>`;
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px 0;">
${block.rows.map((row) => line(row.label, row.amount, "")).join("\n")}
${line(block.total.label, block.total.amount, `border-bottom:0;font-weight:bold;font-size:16px;color:${C.ink};`).replace(/class="txt"/g, 'class="ink"')}
</table>`;
		}
		case "button": {
			const href = esc(block.href);
			const label = esc(block.label);
			return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>
<td bgcolor="${C.accent}" style="background-color:${C.accent};border-radius:6px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:48px;v-text-anchor:middle;width:260px;" arcsize="12%" stroke="f" fillcolor="${C.accent}"><center style="color:#FFFFFF;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" style="display:block;padding:14px 28px;${FONT}font-size:16px;line-height:20px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;">${label}</a><!--<![endif]-->
</td></tr></table>
<p class="muted" style="margin:0 0 4px 0;${SMALL}color:${C.muted};">${esc(linkFallback)}</p>
<p style="margin:0 0 24px 0;${SMALL}word-break:break-all;"><a href="${href}" class="link" style="color:${C.accent};text-decoration:underline;">${href}</a></p>`;
		}
	}
}

function blockText(block: Block): string {
	switch (block.type) {
		case "paragraph":
			return block.text;
		case "box":
			return [`${block.label}: ${block.value}`, block.note]
				.filter(Boolean)
				.join("\n");
		case "code":
			return block.code;
		case "rows":
			return [...block.rows, block.total]
				.map((row) => `${row.label}: ${row.amount}`)
				.join("\n");
		case "button":
			return `${block.label}:\n${block.href}`;
	}
}

export function renderEmail(content: EmailContent): {
	html: string;
	text: string;
} {
	const shared = EMAIL_COPY[content.locale].shared;
	const service =
		content.about === "order" ? shared.serviceOrder : shared.serviceAccount;
	const questions =
		content.about === "order"
			? fill(shared.questions, { phone: WORKSHOP_PHONE })
			: null;

	const text = [
		content.heading,
		...content.blocks.map(blockText),
		content.footnote,
		questions,
		WORKSHOP_ADDRESS,
	]
		.filter(Boolean)
		.join("\n\n");

	const eyebrow =
		content.about === "order" ? shared.eyebrowOrder : shared.eyebrowAccount;

	const footnote = content.footnote
		? `<tr><td class="pad muted" style="padding:20px 40px 32px 40px;border-top:1px solid ${C.rule};${SMALL}color:${C.muted};">${esc(content.footnote)}</td></tr>`
		: "";

	const html = `<!DOCTYPE html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(content.heading)}</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
a{color:${C.accent}}
@media screen and (max-width:620px){ .wrap{width:100% !important;} .pad{padding-left:24px !important;padding-right:24px !important;} .h1{font-size:28px !important;line-height:34px !important;} }
@media (prefers-color-scheme:dark){ .bg{background-color:#05080F !important;} .card{background-color:#121929 !important;} .ink{color:#F3F5FA !important;} .txt{color:#D5DBE6 !important;} .muted{color:#A3ACBF !important;} .txt,.ink,.muted{border-color:#2A3348 !important;} .box{background-color:#1A2236 !important;} .link{color:#8FB0FF !important;} .logo{background-color:#F3F5FA !important;color:${C.ink} !important;} }
</style>
</head>
<body style="margin:0;padding:0;background-color:${C.page};">
<span style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(content.preheader)}</span>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
<tr><td align="center" style="padding:32px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="pad" style="padding:0 40px 24px 40px;" align="left">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="logo" width="32" height="32" align="center" bgcolor="${C.hero}" style="width:32px;height:32px;background-color:${C.hero};border-radius:6px;${FONT}font-size:15px;font-weight:bold;color:#FFFFFF;">${BRAND[0]}</td>
<td class="ink" style="padding-left:10px;${FONT}font-size:18px;font-weight:bold;color:${C.ink};">${BRAND}</td>
</tr></table>
</td></tr>
<tr><td bgcolor="${C.hero}" style="background-color:${C.hero};border-radius:8px 8px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:40px 40px 12px 40px;${FONT}font-size:12px;line-height:16px;mso-line-height-rule:exactly;letter-spacing:2px;text-transform:uppercase;font-weight:bold;color:${C.eyebrow};">${esc(eyebrow)}</td></tr>
<tr><td class="pad" style="padding:0 40px 36px 40px;"><h1 class="h1" style="margin:0;${FONT}font-size:34px;line-height:40px;mso-line-height-rule:exactly;font-weight:bold;color:${C.heroInk};">${esc(content.heading)}</h1></td></tr>
</table>
</td></tr>
<tr><td class="card" bgcolor="${C.body}" style="background-color:${C.body};border-radius:0 0 8px 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td class="pad" style="padding:40px 40px 16px 40px;">
${content.blocks.map((block) => blockHtml(block, shared.linkFallback)).join("\n")}
</td></tr>
${footnote}
</table>
</td></tr>
<tr><td class="pad muted" style="padding:24px 40px 0 40px;${FONT}font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:${C.muted};" align="left">
${esc(WORKSHOP_ADDRESS)}<br>
${esc([service, questions].filter(Boolean).join(" "))}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	return { html, text };
}
