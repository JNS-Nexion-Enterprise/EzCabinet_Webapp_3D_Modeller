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

const FONT = "font-family:Arial,Helvetica,sans-serif;";
const BODY = `margin:0 0 16px 0;${FONT}font-size:15px;line-height:23px;mso-line-height-rule:exactly;color:#262626;`;
const SMALL = `${FONT}font-size:13px;line-height:20px;`;
const LABEL =
	"margin:0 0 4px 0;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#5c574e;";

/** The dark palette, one rule per class. */
const DARK: [selector: string, declarations: string][] = [
	[".bg", "background:#1c1c1a !important;"],
	[".card", "background:#262624 !important;border-color:#3a3a37 !important;"],
	[".ink", "color:#f0efe9 !important;"],
	[".muted", "color:#c4c0b6 !important;"],
	[".rule", "border-color:#3a3a37 !important;"],
	[".box", "background:#30302d !important;border-color:#4a4a45 !important;"],
	[".link", "color:#8fc4a6 !important;"],
	[".logo", "background:#f0efe9 !important;color:#171717 !important;"],
];

/**
 * Outlook (outlook.com and the new desktop apps) ignores the media query
 * and recolours the mail itself, marking what it touched with `data-ogsc`
 * (text) and `data-ogsb` (background). Without these selectors its guess
 * wins: one grey for page, card and box alike.
 */
const outlookDark = (selector: string) =>
	["[data-ogsc] ", "[data-ogsb] "]
		.map((mark) => `${mark}${selector}`)
		.concat(`${selector}[data-ogsc]`, `${selector}[data-ogsb]`)
		.join(",");

const DARK_CSS = `@media (prefers-color-scheme:dark){ ${DARK.map(([s, d]) => `${s}{${d}}`).join(" ")} }
${DARK.map(([s, d]) => `${outlookDark(s)}{${d}}`).join("\n")}`;

function blockHtml(block: Block, linkFallback: string): string {
	switch (block.type) {
		case "paragraph":
			return `<p class="ink" style="${BODY}">${esc(block.text)}</p>`;
		case "box":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box" bgcolor="#f7f6f3" style="background:#f7f6f3;border:1px solid #e3e1db;border-radius:10px;padding:16px 18px;${FONT}">
<p class="muted" style="${LABEL}">${esc(block.label)}</p>
<p class="ink" style="margin:0;font-size:16px;line-height:22px;font-weight:bold;color:#171717;">${esc(block.value)}</p>${
				block.note
					? `\n<p class="muted" style="margin:4px 0 0 0;font-size:13px;line-height:20px;color:#5c574e;">${esc(block.note)}</p>`
					: ""
			}
</td></tr></table>`;
		case "code":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box ink" align="center" bgcolor="#f7f6f3" style="background:#f7f6f3;border:1px solid #e3e1db;border-radius:10px;padding:20px 18px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:8px;color:#171717;">${esc(block.code)}</td></tr></table>`;
		case "rows": {
			const line = (label: string, amount: string, style: string) =>
				`<tr><td class="ink" style="padding:6px 0;${FONT}font-size:14px;line-height:20px;color:#262626;${style}">${esc(label)}</td><td class="ink" align="right" style="padding:6px 0 6px 12px;${FONT}font-size:14px;line-height:20px;color:#262626;white-space:nowrap;${style}">${esc(amount)}</td></tr>`;
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;">
${block.rows.map((row) => line(row.label, row.amount, "")).join("\n")}
<tr><td colspan="2" class="rule" style="border-top:1px solid #ecebe7;font-size:0;line-height:0;height:6px;">&nbsp;</td></tr>
${line(block.total.label, block.total.amount, "font-weight:bold;font-size:16px;color:#171717;")}
</table>`;
		}
		case "button": {
			const href = esc(block.href);
			const label = esc(block.label);
			return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>
<td bgcolor="#1f5138" style="background:#1f5138;border-radius:9999px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="50%" stroke="f" fillcolor="#1f5138"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${label}</center></v:roundrect><![endif]-->
<!--[if !mso]><!--><a href="${href}" style="display:block;padding:13px 28px;${FONT}font-size:15px;font-weight:bold;line-height:20px;color:#ffffff;text-decoration:none;border-radius:9999px;">${label}</a><!--<![endif]-->
</td></tr></table>
<p class="muted" style="margin:0 0 4px 0;${SMALL}color:#5c574e;">${esc(linkFallback)}</p>
<p style="margin:0 0 24px 0;${SMALL}word-break:break-all;"><a href="${href}" class="link" style="color:#1f5138;text-decoration:underline;">${href}</a></p>`;
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

	const footnote = content.footnote
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="rule" style="border-top:1px solid #ecebe7;font-size:0;line-height:0;height:20px;">&nbsp;</td></tr></table>
<p class="muted" style="margin:0;${SMALL}color:#5c574e;">${esc(content.footnote)}</p>`
		: "";

	const html = `<!DOCTYPE html>
<html lang="${content.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${esc(content.heading)}</title>
<!--[if mso]><style>table,td,a,p,h1{font-family:Arial,Helvetica,sans-serif !important;}</style><![endif]-->
<style>
@media (max-width:620px){ .wrap{width:100% !important;} .pad{padding-left:24px !important;padding-right:24px !important;} }
${DARK_CSS}
</style>
</head>
<body style="margin:0;padding:0;background:#f4f3f1;">
<span style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f4f3f1;">${esc(content.preheader)}</span>
<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f3f1;">
<tr><td align="center" style="padding:40px 12px;">
<table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
<tr><td class="pad" style="padding:0 8px 20px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="logo" width="30" height="30" bgcolor="#171717" style="width:30px;height:30px;background:#171717;border-radius:7px;text-align:center;${FONT}font-size:14px;font-weight:bold;color:#ffffff;">${BRAND[0]}</td>
<td style="padding-left:10px;${FONT}font-size:15px;font-weight:bold;color:#171717;" class="ink">${BRAND}</td>
</tr></table>
</td></tr>
<tr><td class="card pad" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:14px;padding:40px 44px;">
<h1 class="ink" style="margin:0 0 14px 0;${FONT}font-size:24px;line-height:30px;mso-line-height-rule:exactly;font-weight:bold;color:#171717;">${esc(content.heading)}</h1>
${content.blocks.map((block) => blockHtml(block, shared.linkFallback)).join("\n")}
${footnote}
</td></tr>
<tr><td class="pad" style="padding:24px 8px 0 8px;${FONT}font-size:12px;line-height:18px;color:#5c574e;">
<p class="muted" style="margin:0 0 6px 0;">${esc(WORKSHOP_ADDRESS)}</p>
<p class="muted" style="margin:0;">${esc([service, questions].filter(Boolean).join(" "))}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

	return { html, text };
}
