# Email Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every email the app sends shares one layout and has final wording in en / ms / zh, and every customer gets order mail: receipts always, production and delivery updates when WhatsApp is off.

**Architecture:** One pure `renderEmail` turns a list of blocks into `{ html, text }`. Each mail is a pure template function that builds blocks from copy. Order mails ride the existing `Notification` outbox through a new `channel` column: `draftsFor` decides which channels an event goes to, and `flush` sends each row by its channel.

**Tech Stack:** TypeScript, Next.js App Router, Prisma (Postgres), Vitest, Resend over `fetch` (`src/lib/email.ts`). No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-08-email-templates-design.md`

**Where to work:** a git worktree with its own database (`superpowers:using-git-worktrees`). Other sessions edit `feature/development` in the main checkout.

## Global Constraints

- No new dependency. No React Email, no Resend hosted templates.
- Brand in mail is `EzCabinet`.
- Customer mails follow `Order.locale` (`en` / `ms` / `zh`). Staff mails are English.
- Order placed, payment confirmed and refunded always go by email. Stage and the four delivery mails go by email only when `whatsappOptIn` is false.
- `renderEmail` escapes every value. Callers pass raw strings.
- A mail has at most one button. The sign-in code mail has none.
- Files under `src/lib/email/` other than `orderMail.ts` must not import `server-only`: the preview script runs them under `tsx`.
- Migrations are hand-written (CLAUDE.md known issue 12) and checked with `prisma migrate diff`.
- Biome formats with tabs. Run `pnpm lint` before each commit.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec, decided while planning

Task 8 writes these back into the spec.

1. **Email copy lives in `src/lib/email/copy.ts`, not `src/lib/copy/{en,ms,zh}.ts`.** The site dictionary is handed whole to the planner's client tree (`CopyProvider`), so mail wording there would ship to every phone.
2. **The eight order mails are one file, `templates/order.ts`, with a switch on the kind**, the shape `draftFor` already has. Three account mails keep a file each.
3. **A failed email send is retried up to `MAX_ATTEMPTS` (5), then `FAILED`**, through the existing `nextState`. The spec said "until the 48-hour expiry"; that would let a permanently refused address fill every cron run.
4. **Order-placed rows come from `summaryLines` and `summaryExtras`** (`src/lib/orders/summary.ts`), the helpers the order page uses, so the mail and the page list the same lines.
5. **`sendEmail` gains nothing; `src/lib/email.ts` gains one export, `emailConfigured()`.**

## Review Focus

1. A customer name or address containing `<`, `&` or quotes: rendered as text in the HTML, never as markup. (Task 1, Task 4)
2. An order whose `breakdown` cannot be parsed (old order, changed shape): the mail still goes out with delivery and total, no cabinet lines, no throw. (Task 4)
3. A delivery mail whose `Delivery` row is gone (a split consumes it): the mail still goes out and its button opens the order page. (Task 4, Task 6)
4. WhatsApp token dead while email is healthy: email rows in the same flush still go out. (Task 6)
5. A stored locale the app no longer serves (`Order.locale` is a free string): the mail falls back to English, as WhatsApp does through `localeOf`. (Task 6)

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/email/layout.ts` (new) | `renderEmail`: blocks to `{ html, text }`, escaping, the shared look |
| `src/lib/email/copy.ts` (new) | Mail wording in three languages, `BRAND` |
| `src/lib/email/templates/staffInvite.ts` (new) | Staff invite content |
| `src/lib/email/templates/staffReset.ts` (new) | Staff password reset content |
| `src/lib/email/templates/signInCode.ts` (new) | Customer sign-in code content |
| `src/lib/email/templates/order.ts` (new) | The eight order mails |
| `src/lib/email/orderMail.ts` (new) | Loads an order for an outbox row, renders, sends |
| `src/lib/email.ts` | + `emailConfigured()` |
| `src/lib/auth/inviteMail.ts`, `passwordReset.ts` | Call the templates; inline HTML removed |
| `src/lib/whatsapp/templates.ts` | `draftsFor`, the overlap rule |
| `src/lib/whatsapp/outbox.ts` | `flush` by channel |
| `prisma/schema.prisma` + migration | `Notification.channel` |
| `src/app/api/orders/[token]/route.ts` | Re-point pending email rows |
| `src/app/admin/orders/[id]/` | Messages panel shows both channels |
| `scripts/preview-emails.ts` (new) | Writes every mail to a folder |

---

### Task 1: The shell, `renderEmail`

**Files:**
- Create: `src/lib/email/layout.ts`
- Create: `src/lib/email/copy.ts` (only `BRAND` and `shared` in this task; Task 2 fills the rest)
- Test: `src/lib/email/__tests__/layout.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Block =
    | { type: "paragraph"; text: string }
    | { type: "box"; label: string; value: string; note?: string }
    | { type: "code"; code: string }
    | { type: "rows"; rows: { label: string; amount: string }[]; total: { label: string; amount: string } }
    | { type: "button"; label: string; href: string };
  export type EmailContent = {
    locale: Locale;
    about: "account" | "order";
    preheader: string;
    heading: string;
    blocks: Block[];
    footnote?: string;
  };
  export function renderEmail(content: EmailContent): { html: string; text: string };
  ```
  From `copy.ts`: `export const BRAND = "EzCabinet"` and `EMAIL_COPY[locale].shared` with `linkFallback`, `questions` (`{phone}`), `serviceOrder`, `serviceAccount`.

- [ ] **Step 1: Write the failing test**

`src/lib/email/__tests__/layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { type EmailContent, renderEmail } from "../layout";

const base: EmailContent = {
	locale: "en",
	about: "order",
	preheader: "Pre",
	heading: "Heading",
	blocks: [],
};

describe("renderEmail", () => {
	it("escapes values in the HTML and leaves them alone in the text", () => {
		const { html, text } = renderEmail({
			...base,
			heading: `<script>alert("x")</script>`,
			blocks: [
				{ type: "paragraph", text: "Tom & <b>Jerry</b>" },
				{ type: "box", label: "L<", value: "V'", note: 'N"' },
			],
			footnote: "<i>foot</i>",
		});
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<b>Jerry</b>");
		expect(html).not.toContain("<i>foot</i>");
		expect(html).toContain("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
		expect(text).toContain("Tom & <b>Jerry</b>");
	});

	it("puts the same link in the HTML and the text", () => {
		const href = "https://x.test/en/order/tok?a=1&b=2";
		const { html, text } = renderEmail({
			...base,
			blocks: [{ type: "button", label: "View your order", href }],
		});
		expect(html).toContain('href="https://x.test/en/order/tok?a=1&amp;b=2"');
		expect(text).toContain(href);
		expect(html).toContain("If the button doesn't work");
	});

	it("renders no link fallback when there is no button", () => {
		const { html, text } = renderEmail({
			...base,
			blocks: [{ type: "code", code: "482916" }],
		});
		expect(html).not.toContain("If the button doesn't work");
		expect(html).toContain("482916");
		expect(text).toContain("482916");
	});

	it("renders receipt rows and the total in both parts", () => {
		const { html, text } = renderEmail({
			...base,
			blocks: [
				{
					type: "rows",
					rows: [{ label: "Delivery", amount: "RM 85.00" }],
					total: { label: "Total", amount: "RM 1,085.00" },
				},
			],
		});
		for (const part of [html, text]) {
			expect(part).toContain("Delivery");
			expect(part).toContain("RM 85.00");
			expect(part).toContain("RM 1,085.00");
		}
	});

	it("adds the questions line to an order mail only", () => {
		expect(renderEmail(base).text).toContain("Questions?");
		expect(renderEmail({ ...base, about: "account" }).text).not.toContain(
			"Questions?",
		);
	});

	it("sets the document language", () => {
		expect(renderEmail({ ...base, locale: "ms" }).html).toContain(
			'<html lang="ms">',
		);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/email/__tests__/layout.test.ts`
Expected: FAIL, cannot resolve `../layout`.

- [ ] **Step 3: Write `src/lib/email/copy.ts` (shared lines only)**

```ts
import type { Locale } from "@/lib/copy/locales";

/**
 * The wording of every customer email, in the three languages the site serves.
 *
 * Not in `lib/copy`: that dictionary is handed whole to the planner's client
 * tree, and nothing in a browser needs the text of a mail.
 */
export const BRAND = "EzCabinet";

const en = {
	shared: {
		linkFallback:
			"If the button doesn't work, paste this link into your browser:",
		questions: "Questions? Reply to this email or call {phone}.",
		serviceOrder:
			"This is a service email about your order, so it can't be unsubscribed from.",
		serviceAccount:
			"This is a service email about your account, so it can't be unsubscribed from.",
	},
};

type Leaves<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Leaves<T[K]>;
};
export type EmailCopy = Leaves<typeof en>;

const ms: EmailCopy = {
	shared: {
		linkFallback:
			"Jika butang tidak berfungsi, tampal pautan ini ke dalam pelayar anda:",
		questions: "Ada soalan? Balas e-mel ini atau hubungi {phone}.",
		serviceOrder:
			"Ini ialah e-mel perkhidmatan tentang pesanan anda, jadi ia tidak boleh dihentikan langganannya.",
		serviceAccount:
			"Ini ialah e-mel perkhidmatan tentang akaun anda, jadi ia tidak boleh dihentikan langganannya.",
	},
};

const zh: EmailCopy = {
	shared: {
		linkFallback: "如果按钮无法使用，请将此链接粘贴到浏览器：",
		questions: "有疑问？请回复此邮件或致电 {phone}。",
		serviceOrder: "这是与您订单相关的服务邮件，因此无法退订。",
		serviceAccount: "这是与您账户相关的服务邮件，因此无法退订。",
	},
};

export const EMAIL_COPY: Record<Locale, EmailCopy> = { en, ms, zh };
```

- [ ] **Step 4: Write `src/lib/email/layout.ts`**

The HTML is the invite mail's (`src/lib/auth/inviteMail.ts`, `inviteHtml`), split into blocks.

```ts
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

function esc(value: string): string {
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

function blockHtml(block: Block, linkFallback: string): string {
	switch (block.type) {
		case "paragraph":
			return `<p class="ink" style="${BODY}">${esc(block.text)}</p>`;
		case "box":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box" bgcolor="#f7f6f3" style="background:#f7f6f3;border-radius:10px;padding:16px 18px;${FONT}">
<p class="muted" style="${LABEL}">${esc(block.label)}</p>
<p class="ink" style="margin:0;font-size:16px;line-height:22px;font-weight:bold;color:#171717;">${esc(block.value)}</p>${
				block.note
					? `\n<p class="muted" style="margin:4px 0 0 0;font-size:13px;line-height:20px;color:#5c574e;">${esc(block.note)}</p>`
					: ""
			}
</td></tr></table>`;
		case "code":
			return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px 0;"><tr>
<td class="box ink" align="center" bgcolor="#f7f6f3" style="background:#f7f6f3;border-radius:10px;padding:20px 18px;font-family:'Courier New',Courier,monospace;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:8px;color:#171717;">${esc(block.code)}</td></tr></table>`;
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
@media (prefers-color-scheme:dark){ .bg{background:#1c1c1a !important;} .card{background:#262624 !important;border-color:#3a3a37 !important;} .ink{color:#f0efe9 !important;} .muted{color:#c4c0b6 !important;} .rule{border-color:#3a3a37 !important;} .box{background:#30302d !important;} .link{color:#8fc4a6 !important;} .logo{background:#f0efe9 !important;color:#171717 !important;} }
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
```

- [ ] **Step 5: Run the test**

Run: `pnpm vitest run src/lib/email/__tests__/layout.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
pnpm lint && git add src/lib/email/layout.ts src/lib/email/copy.ts src/lib/email/__tests__/layout.test.ts
git commit -m "feat(email): one shared layout for every mail"
```

---

### Task 2: The wording, three languages

**Files:**
- Modify: `src/lib/email/copy.ts`
- Test: `src/lib/email/__tests__/copy.test.ts`

**Interfaces:**
- Consumes: `EMAIL_COPY`, `EmailCopy` from Task 1.
- Produces: `EMAIL_COPY[locale]` with sections `shared`, `signInCode`, `orderPlaced`, `paymentConfirmed`, `orderRefunded`, `stage`, `deliveryBooked`, `pickedUp`, `delivered`, `deliveryFailed`. Keys are exactly those in the `en` object below. Placeholders are `{name}`, `{ref}`, `{total}`, `{date}`, `{code}`, `{minutes}`, `{stage}`, `{carrier}`, `{siteAddress}`, `{bank}`, `{accountName}`, `{accountNumber}`, `{phone}`.

- [ ] **Step 1: Write the failing test**

`src/lib/email/__tests__/copy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { EMAIL_COPY } from "../copy";

const paths = (value: unknown, prefix = ""): string[] =>
	typeof value === "object" && value !== null
		? Object.entries(value).flatMap(([key, child]) =>
				paths(child, prefix ? `${prefix}.${key}` : key),
			)
		: [prefix];

const at = (dict: unknown, path: string): string =>
	path.split(".").reduce<never>((v, k) => (v as never)[k], dict as never);

const placeholders = (value: string) =>
	[...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("email copy", () => {
	it("covers every mail", () => {
		expect(Object.keys(EMAIL_COPY.en).sort()).toEqual(
			[
				"delivered",
				"deliveryBooked",
				"deliveryFailed",
				"orderPlaced",
				"orderRefunded",
				"paymentConfirmed",
				"pickedUp",
				"shared",
				"signInCode",
				"stage",
			].sort(),
		);
	});

	it.each(["ms", "zh"] as const)("%s has English's keys", (locale) => {
		expect(paths(EMAIL_COPY[locale]).sort()).toEqual(
			paths(EMAIL_COPY.en).sort(),
		);
	});

	// A translation that drops `{ref}` sends a mail with no order number.
	it.each(["ms", "zh"] as const)(
		"%s keeps every placeholder English has",
		(locale) => {
			for (const path of paths(EMAIL_COPY.en)) {
				expect([path, placeholders(at(EMAIL_COPY[locale], path))]).toEqual([
					path,
					placeholders(at(EMAIL_COPY.en, path)),
				]);
			}
		},
	);

	it.each(["ms", "zh"] as const)("%s leaves nothing in English", (locale) => {
		const same = paths(EMAIL_COPY.en).filter(
			(p) => at(EMAIL_COPY[locale], p) === at(EMAIL_COPY.en, p),
		);
		expect(same).toEqual([]);
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/email/__tests__/copy.test.ts`
Expected: FAIL on "covers every mail" (only `shared` exists).

- [ ] **Step 3: Fill in `en`**

In `src/lib/email/copy.ts`, add these sections to the `en` object after `shared`:

```ts
	signInCode: {
		subject: "{code} is your EzCabinet sign-in code",
		heading: "Your sign-in code",
		body: "Type this code into the page where you asked for it:",
		after: "It works once, for {minutes} minutes.",
		footnote:
			"If you didn't ask for this, ignore this email. Nobody can sign in without the code, and we will never ask you for it by phone or WhatsApp.",
	},
	orderPlaced: {
		subject: "We've got your order {ref}",
		heading: "Thank you, {name}",
		body: "We've received your order. Here is what you ordered.",
		boxLabel: "Order number",
		boxNote: "Placed {date}",
		delivery: "Delivery",
		total: "Total",
		bankTransfer:
			"To confirm your order, transfer {total} to {bank}, {accountName}, account {accountNumber}. Use {ref} as the reference.",
		online: "Your payment is being confirmed. We'll email you as soon as it is.",
		address: "Delivering to: {siteAddress}",
		button: "View your order",
	},
	paymentConfirmed: {
		subject: "Payment received for order {ref}",
		heading: "Payment received",
		body: "We've received {total} for order {ref}. Thank you.",
		cabinets: "Cabinets",
		delivery: "Delivery",
		paid: "Paid",
		paidOn: "Paid on {date}",
		next: "What happens next: we'll contact you to arrange a site re-measure, then start making your cabinets. Delivery is normally within 4 to 6 weeks of the re-measure.",
		button: "View your order",
	},
	orderRefunded: {
		subject: "Your refund for order {ref}",
		heading: "Your order has been refunded",
		body: "Order {ref} has been cancelled and {total} has been sent back to you. It can take a few working days to show in your account.",
		button: "View your order",
	},
	stage: {
		subject: "Order {ref}: {stage}",
		heading: "An update on your cabinets",
		body: "Your order {ref} has moved to a new step.",
		boxLabel: "Current step",
		button: "View progress",
	},
	deliveryBooked: {
		subject: "Delivery booked for order {ref}",
		heading: "Your delivery is booked",
		body: "Your order {ref} is ready and delivery is booked with {carrier}.",
		boxLabel: "Tracking number",
		button: "Track delivery",
	},
	pickedUp: {
		subject: "Order {ref} is on its way",
		heading: "On its way",
		body: "Your order {ref} has been picked up and is on its way to {siteAddress}.",
		button: "Track delivery",
	},
	delivered: {
		subject: "Order {ref} has been delivered",
		heading: "Delivered",
		body: "Your order {ref} has been delivered. Thank you for choosing EzCabinet.",
		footnote: "If anything arrived damaged, tell us within 7 days, with photos.",
		button: "View delivery",
	},
	deliveryFailed: {
		subject: "We couldn't deliver order {ref}",
		heading: "We couldn't complete your delivery",
		body: "We weren't able to deliver order {ref}. Our team will contact you to arrange a new time. You don't need to do anything.",
		button: "View delivery",
	},
```

- [ ] **Step 4: Fill in `ms`**

Add after `shared` in the `ms` object:

```ts
	signInCode: {
		subject: "{code} ialah kod log masuk EzCabinet anda",
		heading: "Kod log masuk anda",
		body: "Taip kod ini pada halaman tempat anda memintanya:",
		after: "Kod ini sah untuk satu kali guna, selama {minutes} minit.",
		footnote:
			"Jika anda tidak memintanya, abaikan e-mel ini. Tiada sesiapa boleh log masuk tanpa kod ini, dan kami tidak akan sekali-kali memintanya melalui telefon atau WhatsApp.",
	},
	orderPlaced: {
		subject: "Kami telah menerima pesanan anda {ref}",
		heading: "Terima kasih, {name}",
		body: "Kami telah menerima pesanan anda. Berikut ialah butirannya.",
		boxLabel: "Nombor pesanan",
		boxNote: "Dibuat pada {date}",
		delivery: "Penghantaran",
		total: "Jumlah",
		bankTransfer:
			"Untuk mengesahkan pesanan anda, pindahkan {total} ke {bank}, {accountName}, akaun {accountNumber}. Gunakan {ref} sebagai rujukan.",
		online:
			"Bayaran anda sedang disahkan. Kami akan menghantar e-mel sebaik sahaja ia selesai.",
		address: "Dihantar ke: {siteAddress}",
		button: "Lihat pesanan anda",
	},
	paymentConfirmed: {
		subject: "Bayaran diterima untuk pesanan {ref}",
		heading: "Bayaran diterima",
		body: "Kami telah menerima {total} untuk pesanan {ref}. Terima kasih.",
		cabinets: "Kabinet",
		delivery: "Penghantaran",
		paid: "Dibayar",
		paidOn: "Dibayar pada {date}",
		next: "Langkah seterusnya: kami akan menghubungi anda untuk mengatur ukur semula di tapak, kemudian mula membuat kabinet anda. Penghantaran biasanya dalam masa 4 hingga 6 minggu selepas ukur semula.",
		button: "Lihat pesanan anda",
	},
	orderRefunded: {
		subject: "Bayaran balik untuk pesanan {ref}",
		heading: "Bayaran pesanan anda telah dikembalikan",
		body: "Pesanan {ref} telah dibatalkan dan {total} telah dikembalikan kepada anda. Ia mungkin mengambil beberapa hari bekerja untuk dipaparkan dalam akaun anda.",
		button: "Lihat pesanan anda",
	},
	stage: {
		subject: "Pesanan {ref}: {stage}",
		heading: "Kemas kini kabinet anda",
		body: "Pesanan anda {ref} telah beralih ke langkah baharu.",
		boxLabel: "Langkah semasa",
		button: "Lihat kemajuan",
	},
	deliveryBooked: {
		subject: "Penghantaran ditempah untuk pesanan {ref}",
		heading: "Penghantaran anda telah ditempah",
		body: "Pesanan anda {ref} telah siap dan penghantaran ditempah dengan {carrier}.",
		boxLabel: "Nombor penjejakan",
		button: "Jejak penghantaran",
	},
	pickedUp: {
		subject: "Pesanan {ref} dalam perjalanan",
		heading: "Dalam perjalanan",
		body: "Pesanan anda {ref} telah diambil dan sedang dalam perjalanan ke {siteAddress}.",
		button: "Jejak penghantaran",
	},
	delivered: {
		subject: "Pesanan {ref} telah dihantar",
		heading: "Telah dihantar",
		body: "Pesanan anda {ref} telah dihantar. Terima kasih kerana memilih EzCabinet.",
		footnote:
			"Jika ada yang rosak semasa tiba, maklumkan kami dalam masa 7 hari, bersama gambar.",
		button: "Lihat penghantaran",
	},
	deliveryFailed: {
		subject: "Kami tidak dapat menghantar pesanan {ref}",
		heading: "Kami tidak dapat menyelesaikan penghantaran anda",
		body: "Kami tidak dapat menghantar pesanan {ref}. Pasukan kami akan menghubungi anda untuk mengatur masa baharu. Anda tidak perlu berbuat apa-apa.",
		button: "Lihat penghantaran",
	},
```

- [ ] **Step 5: Fill in `zh`**

Add after `shared` in the `zh` object:

```ts
	signInCode: {
		subject: "{code} 是您的 EzCabinet 登录验证码",
		heading: "您的登录验证码",
		body: "请在您申请验证码的页面输入：",
		after: "验证码仅可使用一次，{minutes} 分钟内有效。",
		footnote:
			"如果不是您本人申请，请忽略此邮件。没有验证码，任何人都无法登录；我们绝不会通过电话或 WhatsApp 向您索取验证码。",
	},
	orderPlaced: {
		subject: "我们已收到您的订单 {ref}",
		heading: "谢谢您，{name}",
		body: "我们已收到您的订单，明细如下。",
		boxLabel: "订单编号",
		boxNote: "下单日期 {date}",
		delivery: "送货费",
		total: "总计",
		bankTransfer:
			"请将 {total} 转账至 {bank}，{accountName}，账号 {accountNumber}，并以 {ref} 作为付款参考，以确认您的订单。",
		online: "您的付款正在确认中，确认后我们会立即发邮件通知您。",
		address: "送货地址：{siteAddress}",
		button: "查看订单",
	},
	paymentConfirmed: {
		subject: "订单 {ref} 已收到付款",
		heading: "已收到付款",
		body: "我们已收到订单 {ref} 的款项 {total}，谢谢。",
		cabinets: "橱柜",
		delivery: "送货费",
		paid: "已付",
		paidOn: "付款日期 {date}",
		next: "接下来：我们会联系您安排到场重新测量，然后开始制作您的橱柜。一般在重新测量后 4 至 6 周内送货。",
		button: "查看订单",
	},
	orderRefunded: {
		subject: "订单 {ref} 的退款",
		heading: "您的订单已退款",
		body: "订单 {ref} 已取消，{total} 已退还给您。款项可能需要几个工作日才会显示在您的账户中。",
		button: "查看订单",
	},
	stage: {
		subject: "订单 {ref}：{stage}",
		heading: "您的橱柜进度更新",
		body: "您的订单 {ref} 已进入新的步骤。",
		boxLabel: "当前步骤",
		button: "查看进度",
	},
	deliveryBooked: {
		subject: "订单 {ref} 已安排送货",
		heading: "您的送货已安排",
		body: "您的订单 {ref} 已备妥，并已安排由 {carrier} 送货。",
		boxLabel: "追踪号码",
		button: "追踪送货",
	},
	pickedUp: {
		subject: "订单 {ref} 正在运送途中",
		heading: "正在运送途中",
		body: "您的订单 {ref} 已取货，正送往 {siteAddress}。",
		button: "追踪送货",
	},
	delivered: {
		subject: "订单 {ref} 已送达",
		heading: "已送达",
		body: "您的订单 {ref} 已送达。感谢您选择 EzCabinet。",
		footnote: "如有任何损坏，请在 7 天内附上照片告知我们。",
		button: "查看送货详情",
	},
	deliveryFailed: {
		subject: "订单 {ref} 未能送达",
		heading: "我们未能完成送货",
		body: "我们未能送达订单 {ref}。我们的团队会联系您另约时间，您无需采取任何行动。",
		button: "查看送货详情",
	},
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/email && pnpm typecheck`
Expected: PASS. A missing key in `ms` or `zh` is a type error on its `EmailCopy` annotation.

- [ ] **Step 7: Commit**

```bash
pnpm lint && git add src/lib/email/copy.ts src/lib/email/__tests__/copy.test.ts
git commit -m "feat(email): wording for every customer mail in en, ms and zh"
```

---

### Task 3: Account mails on the shell

**Files:**
- Create: `src/lib/email/templates/staffInvite.ts`, `src/lib/email/templates/staffReset.ts`, `src/lib/email/templates/signInCode.ts`
- Modify: `src/lib/auth/inviteMail.ts` (whole file), `src/lib/auth/passwordReset.ts` (the `select` and the `sendEmail` call in `sendStaffReset`)
- Test: `src/lib/email/__tests__/accountTemplates.test.ts`; existing `src/lib/auth/__tests__/inviteMail.test.ts` and `passwordReset.test.ts` must still pass

**Interfaces:**
- Consumes: `renderEmail`, `EMAIL_COPY`, `fill`.
- Produces:
  ```ts
  type Mail = { subject: string; html: string; text: string };
  staffInvite(input: { name: string; inviterName: string; role: string; roleDescription: string; link: string; to: string; hasPassword: boolean }): Mail
  staffReset(input: { name: string; link: string }): Mail
  signInCode(input: { locale: Locale; code: string; minutes: number }): Mail
  ```
  `signInCode` has no caller yet: `emailCodeMail.ts` from the customer sign-in plan calls it.

- [ ] **Step 1: Write the failing test**

`src/lib/email/__tests__/accountTemplates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signInCode } from "../templates/signInCode";
import { staffInvite } from "../templates/staffInvite";
import { staffReset } from "../templates/staffReset";

describe("staffReset", () => {
	const mail = staffReset({
		name: "Ali",
		link: "https://x.test/admin/reset-password?token=abc",
	});

	it("carries the link in both parts", () => {
		expect(mail.subject).toBe("Reset your EzCabinet admin password");
		expect(mail.text).toContain("https://x.test/admin/reset-password?token=abc");
		expect(mail.html).toContain(
			'href="https://x.test/admin/reset-password?token=abc"',
		);
	});

	it("says the second factor still applies", () => {
		expect(mail.text).toContain("authenticator code");
		expect(mail.text).toContain("one hour");
	});
});

describe("staffInvite", () => {
	const input = {
		name: "Ali",
		inviterName: "Jack",
		role: "Admin",
		roleDescription: "Manage orders.",
		link: "https://x.test/admin/login",
		to: "a@b.com",
		hasPassword: true,
	};

	it("shows the role and the sign-in link", () => {
		const mail = staffInvite(input);
		expect(mail.subject).toBe("You've been invited to EzCabinet Admin");
		expect(mail.text).toContain("Your role: Admin");
		expect(mail.html).toContain('href="https://x.test/admin/login"');
	});

	it("does not mention a password to a Google-only account", () => {
		const mail = staffInvite({ ...input, hasPassword: false });
		expect(mail.text).not.toContain("password");
		expect(mail.html).not.toContain("password");
	});
});

describe("signInCode", () => {
	it.each(["en", "ms", "zh"] as const)(
		"%s: shows the code, no link, nothing unfilled",
		(locale) => {
			const mail = signInCode({ locale, code: "482916", minutes: 10 });
			expect(mail.subject).toContain("482916");
			expect(mail.text).toContain("482916");
			expect(mail.html).toContain("482916");
			expect(mail.text).toContain("10");
			expect(mail.html).not.toContain("<a ");
			expect(mail.subject + mail.text).not.toMatch(/\{\w+\}/);
		},
	);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/email/__tests__/accountTemplates.test.ts`
Expected: FAIL, cannot resolve `../templates/signInCode`.

- [ ] **Step 3: Write the three templates**

`src/lib/email/templates/staffReset.ts`:

```ts
import { renderEmail } from "../layout";

/** Staff only, English only: `sendStaffReset` decides who is ever sent one. */
export function staffReset(input: { name: string; link: string }) {
	const subject = "Reset your EzCabinet admin password";
	return {
		subject,
		...renderEmail({
			locale: "en",
			about: "account",
			preheader:
				"Use this link to choose a new password. It works once, for one hour.",
			heading: "Reset your password",
			blocks: [
				{ type: "paragraph", text: `Hi ${input.name},` },
				{
					type: "paragraph",
					text: "Someone asked to reset the password on your EzCabinet admin account. Choose a new one with the button below.",
				},
				{ type: "button", label: "Choose a new password", href: input.link },
			],
			footnote:
				"This link works once, for one hour. You will still need your authenticator code to sign in. If this wasn't you, ignore this email. Nothing has changed.",
		}),
	};
}
```

`src/lib/email/templates/staffInvite.ts`:

```ts
import { renderEmail } from "../layout";

/**
 * Tells a new staff member that an account exists and where to sign in. The
 * password is deliberately not in it: the superadmin still hands that over
 * themselves, so a mailbox alone never opens a staff account.
 */
export function staffInvite(input: {
	name: string;
	inviterName: string;
	role: string;
	roleDescription: string;
	link: string;
	to: string;
	hasPassword: boolean;
}) {
	const subject = "You've been invited to EzCabinet Admin";
	const how = input.hasPassword
		? "Sign in with Google using this email address, or with the temporary password they will give you. You will be asked to choose your own password and set up an authenticator app."
		: "Keep signing in with Google, using this email address.";
	return {
		subject,
		...renderEmail({
			locale: "en",
			about: "account",
			preheader: `${input.inviterName} invited you to the EzCabinet admin tool as ${input.role}.`,
			heading: subject,
			blocks: [
				{ type: "paragraph", text: `Hi ${input.name},` },
				{
					type: "paragraph",
					text: `${input.inviterName} has given you access to the EzCabinet admin tool. ${how}`,
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
```

`src/lib/email/templates/signInCode.ts`:

```ts
import { fill } from "@/lib/copy/fill";
import type { Locale } from "@/lib/copy/locales";
import { EMAIL_COPY } from "../copy";
import { renderEmail } from "../layout";

/**
 * A code and no link: a link opens in the mail app's own browser, where
 * passkeys do not work.
 */
export function signInCode(input: {
	locale: Locale;
	code: string;
	minutes: number;
}) {
	const t = EMAIL_COPY[input.locale].signInCode;
	const subject = fill(t.subject, { code: input.code });
	return {
		subject,
		...renderEmail({
			locale: input.locale,
			about: "account",
			preheader: subject,
			heading: t.heading,
			blocks: [
				{ type: "paragraph", text: t.body },
				{ type: "code", code: input.code },
				{ type: "paragraph", text: fill(t.after, { minutes: input.minutes }) },
			],
			footnote: t.footnote,
		}),
	};
}
```

- [ ] **Step 4: Replace `src/lib/auth/inviteMail.ts`**

Whole file:

```ts
import "server-only";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { sendEmail } from "@/lib/email";
import { staffInvite } from "@/lib/email/templates/staffInvite";

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
```

- [ ] **Step 5: Wire the reset**

In `src/lib/auth/passwordReset.ts`:

Add the import:
```ts
import { staffReset } from "@/lib/email/templates/staffReset";
```

In `sendStaffReset`'s `prisma.user.findUnique` `select`, add `name: true,` beside `email: true,`.

Replace the whole `await sendEmail({ … });` call at the end of `sendStaffReset` with:
```ts
	await sendEmail({
		to: row.email,
		...staffReset({ name: row.name, link: url }),
	});
```

In `src/lib/auth/__tests__/passwordReset.test.ts`, the mocked user row is built near the top of the file: add `name: "Ali",` to it so the row matches the new `select`.

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/email src/lib/auth/__tests__/inviteMail.test.ts src/lib/auth/__tests__/passwordReset.test.ts && pnpm typecheck`
Expected: PASS. The three existing invite tests pass unchanged (link in text and `href`, no "password" for Google-only, names escaped).

- [ ] **Step 7: Commit**

```bash
pnpm lint && git add src/lib/email/templates src/lib/email/__tests__/accountTemplates.test.ts src/lib/auth/inviteMail.ts src/lib/auth/passwordReset.ts src/lib/auth/__tests__/passwordReset.test.ts
git commit -m "feat(email): staff invite, password reset and sign-in code on the shared layout"
```

---

### Task 4: The eight order mails

**Files:**
- Create: `src/lib/email/templates/order.ts`
- Test: `src/lib/email/__tests__/orderTemplate.test.ts`

**Interfaces:**
- Consumes: `renderEmail`, `EMAIL_COPY`, `fill`; `summaryLines`, `summaryExtras` (`src/lib/orders/summary.ts`); `BANK_TRANSFER` (`src/lib/orders/payment.ts`); `orderRef` (`src/lib/orders/ref.ts`); `NotificationKind` (`@/generated/prisma/enums`).
- Produces:
  ```ts
  export type OrderMailInput = {
    kind: NotificationKind;
    locale: Locale;
    /** Site origin, no trailing slash, e.g. "https://ezcabinet.my". */
    base: string;
    order: {
      number: number; createdAt: Date; publicToken: string;
      customerName: string; siteAddress: string;
      paymentProvider: string; paidAt: Date | null;
      breakdown: unknown; cabinetsRm: number; deliveryRm: number; totalRm: number;
    };
    /** `t.planner.price.lines` for the locale: price line id → label. */
    lineLabels: Record<string, string>;
    /** STAGE only: the site dictionary's word for the stage. */
    stageLabel?: string;
    /** Delivery kinds. Null when the delivery row no longer exists. */
    delivery?: { publicToken: string; carrierLabel: string; tracking: string | null } | null;
  };
  export function orderEmail(input: OrderMailInput): { subject: string; html: string; text: string };
  ```

- [ ] **Step 1: Write the failing test**

`src/lib/email/__tests__/orderTemplate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { NotificationKind } from "@/generated/prisma/enums";
import { type OrderMailInput, orderEmail } from "../templates/order";

const order: OrderMailInput["order"] = {
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah",
	siteAddress: "12 Jalan Meranti 4, 47120 Puchong",
	paymentProvider: "manual",
	paidAt: null,
	breakdown: {
		cabinets: [
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 500 },
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 500 },
		],
		categories: [
			{ id: "carcasses", detail: { key: "x" }, amountRm: 1000 },
			{ id: "worktop", detail: { key: "x" }, amountRm: 250 },
		],
	},
	cabinetsRm: 1250,
	deliveryRm: 85,
	totalRm: 1335,
};

const input = (
	kind: NotificationKind,
	extra: Partial<OrderMailInput> = {},
): OrderMailInput => ({
	kind,
	locale: "en",
	base: "https://x.test",
	order,
	lineLabels: { worktop: "Worktop" },
	stageLabel: "Cutting",
	delivery: {
		publicToken: "tok_delivery",
		carrierLabel: "Lalamove",
		tracking: "LM123",
	},
	...extra,
});

const KINDS: NotificationKind[] = [
	"ORDER_PLACED",
	"PAYMENT_CONFIRMED",
	"ORDER_REFUNDED",
	"STAGE",
	"DELIVERY_BOOKED",
	"PICKED_UP",
	"DELIVERED",
	"DELIVERY_FAILED",
];

describe("orderEmail", () => {
	it.each(
		KINDS.flatMap((kind) =>
			(["en", "ms", "zh"] as const).map((locale) => [kind, locale] as const),
		),
	)("%s in %s: has the ref and nothing unfilled", (kind, locale) => {
		const mail = orderEmail(input(kind, { locale }));
		expect(mail.subject).toContain("IC-20260826-014");
		expect(mail.subject + mail.text).not.toMatch(/\{\w+\}/);
		expect(mail.html).toContain(`<html lang="${locale}">`);
	});

	it("order placed: counted lines, extras, delivery, total, bank details", () => {
		const { text, html } = orderEmail(input("ORDER_PLACED"));
		expect(text).toContain("BC 800mm — Shaker × 2: RM 1,000.00");
		expect(text).toContain("Worktop: RM 250.00");
		expect(text).toContain("Delivery: RM 85.00");
		expect(text).toContain("Total: RM 1,335.00");
		expect(text).toContain("transfer RM 1,335.00");
		expect(text).toContain("Delivering to: 12 Jalan Meranti 4");
		expect(html).toContain('href="https://x.test/en/order/tok_order"');
	});

	it("order placed, online: says the payment is being confirmed", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", {
				order: { ...order, paymentProvider: "stripe" },
			}),
		);
		expect(text).toContain("being confirmed");
		expect(text).not.toContain("transfer RM");
	});

	it("order placed, already paid: no payment paragraph at all", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", { order: { ...order, paidAt: new Date() } }),
		);
		expect(text).not.toContain("being confirmed");
		expect(text).not.toContain("transfer RM");
	});

	it("order placed with an unreadable breakdown still totals", () => {
		const { text } = orderEmail(
			input("ORDER_PLACED", { order: { ...order, breakdown: "garbage" } }),
		);
		expect(text).toContain("Delivery: RM 85.00");
		expect(text).toContain("Total: RM 1,335.00");
	});

	it("payment confirmed: the receipt and the paid date in Malaysia time", () => {
		const { text } = orderEmail(
			input("PAYMENT_CONFIRMED", {
				// 17:30 UTC on the 26th is already the 27th in Kuala Lumpur.
				order: { ...order, paidAt: new Date("2026-08-26T17:30:00Z") },
			}),
		);
		expect(text).toContain("Cabinets: RM 1,250.00");
		expect(text).toContain("Paid: RM 1,335.00");
		expect(text).toContain("Paid on 27 August 2026");
	});

	it("stage: names the step", () => {
		const mail = orderEmail(input("STAGE"));
		expect(mail.subject).toBe("Order IC-20260826-014: Cutting");
		expect(mail.text).toContain("Current step: Cutting");
	});

	it("delivery booked: carrier, tracking number, tracking link", () => {
		const { text, html } = orderEmail(input("DELIVERY_BOOKED"));
		expect(text).toContain("booked with Lalamove");
		expect(text).toContain("Tracking number: LM123");
		expect(html).toContain('href="https://x.test/en/track/tok_delivery"');
	});

	it("delivery booked by hand: no tracking box", () => {
		const { text } = orderEmail(
			input("DELIVERY_BOOKED", {
				delivery: {
					publicToken: "tok_delivery",
					carrierLabel: "Own lorry",
					tracking: null,
				},
			}),
		);
		expect(text).not.toContain("Tracking number");
	});

	it("a delivery mail whose delivery is gone opens the order page", () => {
		const { html, text } = orderEmail(input("DELIVERED", { delivery: null }));
		expect(html).toContain('href="https://x.test/en/order/tok_order"');
		expect(text).toContain("has been delivered");
	});

	it("escapes what the customer typed", () => {
		const { html } = orderEmail(
			input("ORDER_PLACED", {
				order: {
					...order,
					customerName: "<img src=x>",
					siteAddress: '"><script>',
				},
			}),
		);
		expect(html).not.toContain("<img src=x>");
		expect(html).not.toContain("<script>");
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/email/__tests__/orderTemplate.test.ts`
Expected: FAIL, cannot resolve `../templates/order`.

- [ ] **Step 3: Write `src/lib/email/templates/order.ts`**

```ts
import type { NotificationKind } from "@/generated/prisma/enums";
import { fill } from "@/lib/copy/fill";
import type { Locale } from "@/lib/copy/locales";
import { BANK_TRANSFER } from "@/lib/orders/payment";
import { orderRef } from "@/lib/orders/ref";
import { summaryExtras, summaryLines } from "@/lib/orders/summary";
import { EMAIL_COPY } from "../copy";
import { type Block, renderEmail } from "../layout";

/**
 * The eight order mails: one per event the outbox reports. Pure — the row is
 * loaded by `orderMail.ts`, and whether a mail is owed at all is `draftsFor`.
 */
export type OrderMailInput = {
	kind: NotificationKind;
	locale: Locale;
	/** Site origin, no trailing slash. */
	base: string;
	order: {
		number: number;
		createdAt: Date;
		publicToken: string;
		customerName: string;
		siteAddress: string;
		paymentProvider: string;
		paidAt: Date | null;
		breakdown: unknown;
		cabinetsRm: number;
		deliveryRm: number;
		totalRm: number;
	};
	/** `t.planner.price.lines` for the locale: price line id → label. */
	lineLabels: Record<string, string>;
	/** STAGE only. */
	stageLabel?: string;
	/** Delivery kinds. Null when the delivery row no longer exists. */
	delivery?: {
		publicToken: string;
		carrierLabel: string;
		/** Null for a delivery booked by hand, which has no tracking number. */
		tracking: string | null;
	} | null;
};

const money = (amount: number) =>
	`RM ${amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`;

const DATE_LOCALE: Record<Locale, string> = {
	en: "en-MY",
	ms: "ms-MY",
	zh: "zh-CN",
};

/** Pinned to Malaysia: the server runs in UTC and a receipt's day must not. */
const day = (date: Date, locale: Locale) =>
	date.toLocaleDateString(DATE_LOCALE[locale], {
		day: "numeric",
		month: "long",
		year: "numeric",
		timeZone: "Asia/Kuala_Lumpur",
	});

export function orderEmail(input: OrderMailInput): {
	subject: string;
	html: string;
	text: string;
} {
	const { order, locale } = input;
	const copy = EMAIL_COPY[locale];
	const ref = orderRef(order.number, order.createdAt);
	const total = money(order.totalRm);
	const orderUrl = `${input.base}/${locale}/order/${order.publicToken}`;
	// A split consumes the delivery row; the order page still shows where it is.
	const trackUrl = input.delivery
		? `${input.base}/${locale}/track/${input.delivery.publicToken}`
		: orderUrl;
	const vars = {
		ref,
		total,
		name: order.customerName,
		siteAddress: order.siteAddress,
		stage: input.stageLabel ?? "",
		carrier: input.delivery?.carrierLabel ?? "",
	};

	const mail = (
		t: { subject: string; heading: string },
		blocks: Block[],
		footnote?: string,
	) => {
		const subject = fill(t.subject, vars);
		return {
			subject,
			...renderEmail({
				locale,
				about: "order",
				preheader: subject,
				heading: fill(t.heading, vars),
				blocks,
				footnote,
			}),
		};
	};
	const paragraph = (text: string): Block => ({
		type: "paragraph",
		text: fill(text, vars),
	});
	const button = (label: string, href: string): Block => ({
		type: "button",
		label,
		href,
	});

	switch (input.kind) {
		case "ORDER_PLACED": {
			const t = copy.orderPlaced;
			const payment = order.paidAt
				? []
				: order.paymentProvider === "manual"
					? [paragraph(fill(t.bankTransfer, { ...BANK_TRANSFER }))]
					: [paragraph(t.online)];
			return mail(t, [
				paragraph(t.body),
				{
					type: "box",
					label: t.boxLabel,
					value: ref,
					note: fill(t.boxNote, { date: day(order.createdAt, locale) }),
				},
				{
					type: "rows",
					rows: [
						...summaryLines(order.breakdown).map((line) => ({
							label: line.qty > 1 ? `${line.name} × ${line.qty}` : line.name,
							amount: money(line.amountRm),
						})),
						...summaryExtras(order.breakdown).map((line) => ({
							label: input.lineLabels[line.id] ?? line.id,
							amount: money(line.amountRm),
						})),
						{ label: t.delivery, amount: money(order.deliveryRm) },
					],
					total: { label: t.total, amount: total },
				},
				...payment,
				paragraph(t.address),
				button(t.button, orderUrl),
			]);
		}
		case "PAYMENT_CONFIRMED": {
			const t = copy.paymentConfirmed;
			return mail(t, [
				paragraph(t.body),
				{
					type: "rows",
					rows: [
						{ label: t.cabinets, amount: money(order.cabinetsRm) },
						{ label: t.delivery, amount: money(order.deliveryRm) },
					],
					total: { label: t.paid, amount: total },
				},
				...(order.paidAt
					? [paragraph(fill(t.paidOn, { date: day(order.paidAt, locale) }))]
					: []),
				paragraph(t.next),
				button(t.button, orderUrl),
			]);
		}
		case "ORDER_REFUNDED": {
			const t = copy.orderRefunded;
			return mail(t, [paragraph(t.body), button(t.button, orderUrl)]);
		}
		case "STAGE": {
			const t = copy.stage;
			return mail(t, [
				paragraph(t.body),
				{ type: "box", label: t.boxLabel, value: vars.stage },
				button(t.button, orderUrl),
			]);
		}
		case "DELIVERY_BOOKED": {
			const t = copy.deliveryBooked;
			const tracking = input.delivery?.tracking;
			return mail(t, [
				paragraph(t.body),
				...(tracking
					? [{ type: "box", label: t.boxLabel, value: tracking } as const]
					: []),
				button(t.button, trackUrl),
			]);
		}
		case "PICKED_UP": {
			const t = copy.pickedUp;
			return mail(t, [paragraph(t.body), button(t.button, trackUrl)]);
		}
		case "DELIVERED": {
			const t = copy.delivered;
			return mail(
				t,
				[paragraph(t.body), button(t.button, trackUrl)],
				t.footnote,
			);
		}
		case "DELIVERY_FAILED": {
			const t = copy.deliveryFailed;
			return mail(t, [paragraph(t.body), button(t.button, trackUrl)]);
		}
	}
}
```

Note for the implementer: `paragraph` fills `vars` a second time over an already-filled bank-transfer string. That is harmless (`fill` leaves text with no `{token}` alone) unless a customer's own name contains `{ref}`-style text, in which case it is substituted with the order's own values, never anything secret.

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/lib/email && pnpm typecheck`
Expected: PASS. If "payment confirmed" fails on the date string, print `mail.text` and match the test to what `en-MY` produces in this Node version; the day (27, not 26) is the assertion that matters.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add src/lib/email/templates/order.ts src/lib/email/__tests__/orderTemplate.test.ts
git commit -m "feat(email): the eight order mails"
```

---

### Task 5: `Notification.channel` and the overlap rule

**Files:**
- Modify: `prisma/schema.prisma` (`Notification` model, new enum)
- Create: `prisma/migrations/20261009000000_notification_channel/migration.sql`
- Modify: `src/lib/whatsapp/templates.ts`
- Modify (call sites, same one-line change each): `src/app/api/orders/route.ts`, `src/lib/orders/markPaid.ts`, `src/lib/orders/cancel.ts`, `src/app/api/admin/orders/[id]/stage/route.ts`, `src/app/api/admin/deliveries/[id]/book/route.ts`, `src/app/api/admin/deliveries/[id]/advance/route.ts`, `src/lib/logistics/store.ts`
- Test: `src/lib/whatsapp/__tests__/templates.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // NotifyOrder and NOTIFY_ORDER_SELECT gain:
  customerEmail: string | null;
  user: { email: string };
  // NotificationDraft gains:
  channel: "WHATSAPP" | "EMAIL";
  export function emailDraftFor(event: NotifyEvent): NotificationDraft | null;
  export function draftsFor(event: NotifyEvent): NotificationDraft[];
  ```
  `draftFor` stays exported and still returns the WhatsApp draft or null.

- [ ] **Step 1: Schema and migration**

In `prisma/schema.prisma`, next to `enum NotificationStatus`:

```prisma
/// How a notification reaches the customer. WhatsApp needs their opt-in;
/// email carries the receipts, and the rest when WhatsApp is off.
enum NotificationChannel {
  WHATSAPP
  EMAIL
}
```

In `model Notification`, after the `kind` line:

```prisma
  channel       NotificationChannel @default(WHATSAPP)
```

Update the two field comments in the model that are now half-true: `to` becomes `/// E.164 for WhatsApp, an address for email. Snapshotted — the order's details can be corrected later.` and `vars` gains `Empty for email: a mail is rendered from the order when it is sent.`

`prisma/migrations/20261009000000_notification_channel/migration.sql`:

```sql
-- Order updates by email as well as WhatsApp. Every existing row is a
-- WhatsApp message, which is the default.
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'EMAIL');

ALTER TABLE "Notification" ADD COLUMN "channel" "NotificationChannel" NOT NULL DEFAULT 'WHATSAPP';
```

Run:
```bash
pnpm prisma migrate deploy && pnpm prisma generate
pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```
Expected: the diff prints an empty migration (no SQL statements). Anything else means the hand-written SQL and the schema disagree: fix the SQL.

- [ ] **Step 2: Write the failing tests**

In `src/lib/whatsapp/__tests__/templates.test.ts`:

Add `draftsFor` and `emailDraftFor` to the import from `"../templates"`. Add two fields to the `order` fixture:

```ts
	customerEmail: "aisyah@example.com",
	user: { email: "account@example.com" },
```

In the existing test "order placed: name, ref, total; button opens the order", add `channel: "WHATSAPP",` to the expected object.

Append:

```ts
describe("draftsFor", () => {
	const noWhatsapp = { ...order, whatsappOptIn: false };
	const channels = (event: Parameters<typeof draftsFor>[0]) =>
		draftsFor(event)
			.map((draft) => draft.channel)
			.sort();

	it.each(["ORDER_PLACED", "PAYMENT_CONFIRMED", "ORDER_REFUNDED"] as const)(
		"%s goes by email whether or not WhatsApp is on",
		(kind) => {
			expect(channels({ kind, order })).toEqual(["EMAIL", "WHATSAPP"]);
			expect(channels({ kind, order: noWhatsapp })).toEqual(["EMAIL"]);
		},
	);

	it("a stage update goes by one channel only", () => {
		const event = {
			kind: "STAGE",
			stage: "CUTTING",
			stageLabel: "Cutting",
		} as const;
		expect(channels({ ...event, order })).toEqual(["WHATSAPP"]);
		expect(channels({ ...event, order: noWhatsapp })).toEqual(["EMAIL"]);
	});

	it.each(["PICKED_UP", "DELIVERED", "DELIVERY_FAILED"] as const)(
		"%s goes by one channel only",
		(kind) => {
			expect(channels({ kind, order, delivery })).toEqual(["WHATSAPP"]);
			expect(channels({ kind, order: noWhatsapp, delivery })).toEqual([
				"EMAIL",
			]);
		},
	);

	it("delivery booked goes by one channel only", () => {
		const booked = {
			kind: "DELIVERY_BOOKED",
			delivery: { ...delivery, carrierId: "lalamove", carrierOrderId: "LM1" },
		} as const;
		expect(channels({ ...booked, order })).toEqual(["WHATSAPP"]);
		expect(channels({ ...booked, order: noWhatsapp })).toEqual(["EMAIL"]);
	});

	it("the two channels never share a dedupe key", () => {
		const [a, b] = draftsFor({ kind: "ORDER_PLACED", order });
		expect(a.dedupeKey).not.toBe(b.dedupeKey);
	});
});

describe("emailDraftFor", () => {
	it("goes to the address typed at checkout", () => {
		expect(emailDraftFor({ kind: "ORDER_PLACED", order })).toMatchObject({
			channel: "EMAIL",
			to: "aisyah@example.com",
			dedupeKey: "order:ord1:placed:email",
			orderId: "ord1",
			kind: "ORDER_PLACED",
			locale: "ms",
		});
	});

	it("falls back to the account's address", () => {
		expect(
			emailDraftFor({
				kind: "ORDER_PLACED",
				order: { ...order, customerEmail: null },
			})?.to,
		).toBe("account@example.com");
	});

	it("keeps the delivery and the stage on the row", () => {
		expect(
			emailDraftFor({
				kind: "DELIVERED",
				order: { ...order, whatsappOptIn: false },
				delivery,
			}),
		).toMatchObject({
			deliveryId: "del1",
			dedupeKey: "delivery:del1:DELIVERED:email",
		});
		expect(
			emailDraftFor({
				kind: "STAGE",
				order: { ...order, whatsappOptIn: false },
				stage: "CUTTING",
				stageLabel: "Cutting",
			}),
		).toMatchObject({ stage: "CUTTING" });
	});
});
```

- [ ] **Step 3: Run them and watch them fail**

Run: `pnpm vitest run src/lib/whatsapp/__tests__/templates.test.ts`
Expected: FAIL, `draftsFor` is not exported.

- [ ] **Step 4: Implement in `src/lib/whatsapp/templates.ts`**

Add to `NOTIFY_ORDER_SELECT`:
```ts
	customerEmail: true,
	user: { select: { email: true } },
```

Add to `NotifyOrder`:
```ts
	customerEmail: string | null;
	user: { email: string };
```

Add to `NotificationDraft`, after `kind`:
```ts
	channel: "WHATSAPP" | "EMAIL";
```

In `draftFor`, add `channel: "WHATSAPP" as const,` to the `base` object.

Append after `draftFor`:

```ts
/** The mails that are a record of money: sent whatever else the customer gets. */
const RECEIPTS = new Set<NotificationKind>([
	"ORDER_PLACED",
	"PAYMENT_CONFIRMED",
	"ORDER_REFUNDED",
]);

/**
 * The email row for an event, or null when WhatsApp already carries it.
 *
 * Receipts always go by email. Production and delivery updates go by email
 * only to a customer who did not opt in to WhatsApp, so nobody hears each
 * step twice. The mail itself is rendered when it is sent
 * (`lib/email/orderMail.ts`), so the row carries no variables.
 */
export function emailDraftFor(event: NotifyEvent): NotificationDraft | null {
	const { order } = event;
	if (order.whatsappOptIn && !RECEIPTS.has(event.kind)) return null;
	// The same event as the WhatsApp row, so the same key with a suffix.
	const whatsapp = draftFor({
		...event,
		order: { ...order, whatsappOptIn: true },
	});
	if (!whatsapp) return null;
	return {
		...whatsapp,
		channel: "EMAIL",
		dedupeKey: `${whatsapp.dedupeKey}:email`,
		to: order.customerEmail ?? order.user.email,
		vars: { body: [], button: "" },
	};
}

/** Every row an event owes, across channels. */
export function draftsFor(event: NotifyEvent): NotificationDraft[] {
	return [draftFor(event), emailDraftFor(event)].filter(
		(draft): draft is NotificationDraft => draft !== null,
	);
}
```

- [ ] **Step 5: Switch the seven call sites**

Each one calls `enqueue(tx, [draftFor({ … })])`. Change every one to `enqueue(tx, draftsFor({ … }))` (drop the array brackets, keep the argument) and change its import of `draftFor` to `draftsFor`:

- `src/app/api/orders/route.ts` — `draftsFor({ kind: "ORDER_PLACED", order })`
- `src/lib/orders/markPaid.ts` — `draftsFor({ kind: "PAYMENT_CONFIRMED", order })`
- `src/lib/orders/cancel.ts` — `draftsFor({ kind: "ORDER_REFUNDED", order })`
- `src/app/api/admin/orders/[id]/stage/route.ts` — `draftsFor({ kind: "STAGE", order, stage, stageLabel })`
- `src/app/api/admin/deliveries/[id]/book/route.ts` — `draftsFor({ kind: "DELIVERY_BOOKED", order, delivery: { … } })`
- `src/app/api/admin/deliveries/[id]/advance/route.ts` — `draftsFor({ kind, order: delivery.order, delivery: { … } })`
- `src/lib/logistics/store.ts` — `draftsFor({ kind, order: current.order, delivery: { … } })`

Then: `grep -rn "draftFor(" src | grep -v __tests__` must list only `src/lib/whatsapp/templates.ts`.

- [ ] **Step 6: Run everything**

Run: `pnpm typecheck && pnpm test`
Expected: PASS. Typecheck names any test fixture that builds a `NotifyOrder` or mocks a `NOTIFY_ORDER_SELECT` row without the two new fields; add `customerEmail: null, user: { email: "c@example.com" }` to each. A test asserting the exact array passed to `enqueue` for an opted-out order now sees one email draft where it saw none: update the assertion to expect it.

- [ ] **Step 7: Commit**

```bash
pnpm lint && git add prisma src
git commit -m "feat(notifications): queue order mail beside WhatsApp, receipts always"
```

---

### Task 6: Send email rows from the outbox

**Files:**
- Modify: `src/lib/email.ts` (add `emailConfigured`)
- Create: `src/lib/email/orderMail.ts`
- Modify: `src/lib/whatsapp/outbox.ts` (`flush`, header comment)
- Test: `src/lib/whatsapp/__tests__/outbox.test.ts`, `src/lib/email/__tests__/orderMail.test.ts`

**Interfaces:**
- Consumes: `orderEmail`, `OrderMailInput` (Task 4); `Notification.channel` (Task 5); `sendEmail`; `localeOf`; `getDictionary`; `CARRIER_LABEL`.
- Produces:
  ```ts
  // src/lib/email.ts
  export const emailConfigured: () => boolean;
  // src/lib/email/orderMail.ts
  export async function sendOrderEmail(
    row: { orderId: string; deliveryId: string | null; kind: NotificationKind; stage: ProductionStage | null; to: string; locale: string },
    base: string,
  ): Promise<boolean>;
  ```

- [ ] **Step 1: `emailConfigured`**

Append to `src/lib/email.ts`:

```ts
/** Whether a send would even be attempted. The outbox asks before claiming a row. */
export const emailConfigured = (): boolean =>
	Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
```

- [ ] **Step 2: Write the failing test for `sendOrderEmail`**

`src/lib/email/__tests__/orderMail.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			true,
	),
);
const orderFind = vi.hoisted(() => vi.fn());
const deliveryFind = vi.hoisted(() => vi.fn());

vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		order: { findUnique: orderFind },
		delivery: { findUnique: deliveryFind },
	},
}));

const { sendOrderEmail } = await import("../orderMail");

const order = {
	number: 14,
	createdAt: new Date("2026-08-26T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah",
	siteAddress: "12 Jalan Meranti 4",
	paymentProvider: "manual",
	paidAt: null,
	breakdown: { cabinets: [], categories: [] },
	cabinetsRm: 1000,
	deliveryRm: 85,
	totalRm: 1085,
};
const row = {
	orderId: "o1",
	deliveryId: null,
	kind: "ORDER_PLACED" as const,
	stage: null,
	to: "a@example.com",
	locale: "ms",
};

beforeEach(() => {
	sendEmail.mockClear();
	orderFind.mockReset().mockResolvedValue(order);
	deliveryFind.mockReset().mockResolvedValue(null);
});

describe("sendOrderEmail", () => {
	it("mails the row's address in the row's language", async () => {
		await expect(sendOrderEmail(row, "https://x.test")).resolves.toBe(true);
		const mail = sendEmail.mock.calls[0][0];
		expect(mail.to).toBe("a@example.com");
		expect(mail.subject).toContain("IC-20260826-014");
		expect(mail.html).toContain('<html lang="ms">');
		expect(mail.text).toContain("https://x.test/ms/order/tok_order");
	});

	it("falls back to English for a locale the site no longer serves", async () => {
		await sendOrderEmail({ ...row, locale: "fr" }, "https://x.test");
		expect(sendEmail.mock.calls[0][0].html).toContain('<html lang="en">');
	});

	it("names the stage in the order's language", async () => {
		await sendOrderEmail(
			{ ...row, kind: "STAGE", stage: "CUTTING", locale: "en" },
			"https://x.test",
		);
		expect(sendEmail.mock.calls[0][0].subject).toContain("Cutting");
	});

	it("links the tracking page and hides a by-hand tracking number", async () => {
		deliveryFind.mockResolvedValue({
			publicToken: "tok_delivery",
			carrierId: "manual",
			carrierOrderId: "manual-abc",
		});
		await sendOrderEmail(
			{ ...row, kind: "DELIVERY_BOOKED", deliveryId: "d1", locale: "en" },
			"https://x.test",
		);
		const mail = sendEmail.mock.calls[0][0];
		expect(mail.text).toContain("https://x.test/en/track/tok_delivery");
		expect(mail.text).not.toContain("manual-abc");
	});

	it("still sends when the delivery row is gone", async () => {
		await sendOrderEmail(
			{ ...row, kind: "DELIVERED", deliveryId: "gone", locale: "en" },
			"https://x.test",
		);
		expect(sendEmail.mock.calls[0][0].text).toContain(
			"https://x.test/en/order/tok_order",
		);
	});

	it("reports false, sending nothing, when the order is gone", async () => {
		orderFind.mockResolvedValue(null);
		await expect(sendOrderEmail(row, "https://x.test")).resolves.toBe(false);
		expect(sendEmail).not.toHaveBeenCalled();
	});
});
```

Run: `pnpm vitest run src/lib/email/__tests__/orderMail.test.ts`
Expected: FAIL, cannot resolve `../orderMail`.

- [ ] **Step 3: Write `src/lib/email/orderMail.ts`**

```ts
import "server-only";
import type {
	NotificationKind,
	ProductionStage,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { sendEmail } from "@/lib/email";
import { LABEL as CARRIER_LABEL } from "@/lib/logistics/carriers";
import { orderEmail } from "./templates/order";

/**
 * Send the mail an outbox row stands for.
 *
 * Rendered now, from the order as it is, not from anything stored on the
 * row: a receipt needs the breakdown the order already keeps as charged.
 */
export async function sendOrderEmail(
	row: {
		orderId: string;
		deliveryId: string | null;
		kind: NotificationKind;
		stage: ProductionStage | null;
		to: string;
		locale: string;
	},
	base: string,
): Promise<boolean> {
	const order = await prisma.order.findUnique({
		where: { id: row.orderId },
		select: {
			number: true,
			createdAt: true,
			publicToken: true,
			customerName: true,
			siteAddress: true,
			paymentProvider: true,
			paidAt: true,
			breakdown: true,
			cabinetsRm: true,
			deliveryRm: true,
			totalRm: true,
		},
	});
	if (!order) return false;

	// A bare id, not a relation: a split consumes the delivery, and the mail
	// about it then points at the order page instead.
	const delivery = row.deliveryId
		? await prisma.delivery.findUnique({
				where: { id: row.deliveryId },
				select: { publicToken: true, carrierId: true, carrierOrderId: true },
			})
		: null;

	const locale = isLocale(row.locale) ? row.locale : "en";
	const t = await getDictionary(locale);
	const mail = orderEmail({
		kind: row.kind,
		locale,
		base: base.replace(/\/+$/, ""),
		order,
		lineLabels: t.planner.price.lines,
		stageLabel: row.stage ? t.order.stages[row.stage] : undefined,
		delivery: delivery && {
			publicToken: delivery.publicToken,
			carrierLabel:
				CARRIER_LABEL[delivery.carrierId ?? ""] ?? delivery.carrierId ?? "",
			// A by-hand delivery's `carrierOrderId` is our own `manual-<cuid>`.
			tracking:
				delivery.carrierId === "manual" ? null : delivery.carrierOrderId,
		},
	});
	return sendEmail({ to: row.to, ...mail });
}
```

Run: `pnpm vitest run src/lib/email/__tests__/orderMail.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 4: Write the failing outbox tests**

In `src/lib/whatsapp/__tests__/outbox.test.ts`:

Add `channel: "WHATSAPP" | "EMAIL";` to the `Row` type and `channel: "WHATSAPP",` to the `pending` helper's object.

Replace the mock's `findMany` so it honours the channel filter `flush` now sends:

```ts
			findMany: async ({
				where,
			}: {
				where: { channel?: { in: string[] } };
			}) =>
				rows
					.filter(
						(r) =>
							r.status === "PENDING" &&
							(where.channel?.in.includes(r.channel) ?? true),
					)
					.map((r) => ({ ...r })),
```

Add beside the existing `vi.mock` (above the `import { flush }` line):

```ts
const sendOrderEmail = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/email/orderMail", () => ({ sendOrderEmail }));
```

In `beforeEach` add:
```ts
	sendOrderEmail.mockReset().mockResolvedValue(true);
	vi.stubEnv("RESEND_API_KEY", "re_test");
	vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
	vi.stubEnv("BETTER_AUTH_URL", "https://x.test");
```
and in `afterEach` add `vi.unstubAllEnvs();`.

Append:

```ts
const email = (id: string): Row => ({
	...pending(id),
	channel: "EMAIL",
	to: "a@example.com",
});

describe("flush with email rows", () => {
	it("sends one and marks it sent", async () => {
		rows.push(email("e"));
		await expect(flush()).resolves.toEqual({ sent: 1, failed: 0 });
		expect(sendOrderEmail).toHaveBeenCalledWith(
			expect.objectContaining({ id: "e", to: "a@example.com" }),
			"https://x.test",
		);
		expect(rows[0].status).toBe("SENT");
	});

	it("still sends mail while the WhatsApp token is dead", async () => {
		rows.push(pending("w1"), email("e"), pending("w2"));
		const fetchMock = metaAnswers(401, 190);

		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(rows.map((r) => [r.id, r.status, r.attempts])).toEqual([
			["w1", "PENDING", 0],
			["e", "SENT", 1],
			["w2", "PENDING", 0],
		]);
	});

	it("sends mail with WhatsApp not configured at all", async () => {
		// Not `= undefined`: assigning that to `process.env` stores the string.
		vi.stubEnv("WHATSAPP_TOKEN", "");
		rows.push(pending("w"), email("e"));
		await flush();
		expect(rows.map((r) => r.status)).toEqual(["PENDING", "SENT"]);
	});

	it("leaves mail pending and untouched with email not configured", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		rows.push(email("e"));
		await flush();
		expect(sendOrderEmail).not.toHaveBeenCalled();
		expect([rows[0].status, rows[0].attempts]).toEqual(["PENDING", 0]);
	});

	it("leaves mail pending with no site address to link to", async () => {
		vi.stubEnv("BETTER_AUTH_URL", "");
		rows.push(email("e"));
		await flush();
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});

	it("retries a failed send, then gives up at the attempt limit", async () => {
		sendOrderEmail.mockResolvedValue(false);
		rows.push(email("e"));
		await flush();
		expect([rows[0].status, rows[0].attempts]).toEqual(["PENDING", 1]);
		rows[0].attempts = 4;
		await flush();
		expect(rows[0].status).toBe("FAILED");
	});

	it("survives a send that throws", async () => {
		sendOrderEmail.mockRejectedValue(new Error("db down"));
		rows.push(email("e1"), email("e2"));
		await expect(flush()).resolves.toEqual({ sent: 0, failed: 2 });
		expect(rows[0].lastError).toContain("db down");
	});
});
```

Run: `pnpm vitest run src/lib/whatsapp/__tests__/outbox.test.ts`
Expected: the new tests FAIL (email rows are sent to Meta as WhatsApp templates); the two existing ones still pass.

- [ ] **Step 5: Rewrite `flush` in `src/lib/whatsapp/outbox.ts`**

Add imports:
```ts
import { emailConfigured } from "@/lib/email";
import { sendOrderEmail } from "@/lib/email/orderMail";
```

Replace the file's header comment's first line `* The WhatsApp outbox.` with:
```ts
 * The notification outbox: WhatsApp messages and order emails.
```

Replace the whole `flush` function with:

```ts
/**
 * Send pending rows: the given ids, or — from the cron — everything pending
 * that nobody has touched for a minute.
 *
 * Each row is claimed by bumping `attempts` conditionally before it is sent,
 * so the post-response flush and a cron run cannot both send it. The cron's
 * one-minute settle keeps it off rows a request is still flushing.
 *
 * A channel that is not configured is not looked at: its rows wait, unclaimed
 * and unexpired, until it is. Local dev and preview have neither.
 */
export async function flush(
	ids?: string[],
): Promise<{ sent: number; failed: number }> {
	// Order mail links back to the site; the cron has no request to read an
	// origin from, so without this there is nothing to link to.
	const base = process.env.BETTER_AUTH_URL;
	const channels = [
		...(whatsappConfigured() ? (["WHATSAPP"] as const) : []),
		...(emailConfigured() && base ? (["EMAIL"] as const) : []),
	];
	if (channels.length === 0) {
		// Never a throw — a missing token must not break checkout.
		if (ids?.length) console.warn("No channel configured; left pending");
		return { sent: 0, failed: 0 };
	}

	const now = Date.now();
	await prisma.notification.updateMany({
		where: {
			status: "PENDING",
			channel: { in: [...channels] },
			queuedAt: { lt: new Date(now - EXPIRE_MS) },
		},
		data: { status: "FAILED", lastError: "expired" },
	});

	const rows = await prisma.notification.findMany({
		where: {
			channel: { in: [...channels] },
			...(ids
				? { id: { in: ids }, status: "PENDING" }
				: { status: "PENDING", updatedAt: { lt: new Date(now - SETTLE_MS) } }),
		},
		orderBy: { queuedAt: "asc" },
		take: MAX_PER_RUN,
	});

	let sent = 0;
	let failed = 0;
	// Set by a dead WhatsApp token: every later WhatsApp row would be refused
	// the same way, so they are left unclaimed. Email rows still go.
	let whatsappBlocked = false;
	// ponytail: a send that succeeds and is then followed by a failed DB update
	// (the `notification.update` below) leaves the row PENDING with `attempts`
	// already bumped, so the next flush re-sends it — at-least-once, not
	// exactly-once. Fine for a template message or a receipt; upgrade to a
	// two-phase claim (mark SENDING before the API call, verify before
	// re-sending) if a duplicate ever matters.
	for (const row of rows) {
		if (row.channel === "WHATSAPP" && whatsappBlocked) continue;
		const claimed = await prisma.notification.updateMany({
			where: { id: row.id, status: "PENDING", attempts: row.attempts },
			data: { attempts: { increment: 1 } },
		});
		if (claimed.count === 0) continue;

		if (row.channel === "EMAIL") {
			// `sendEmail` never throws, but loading the order can.
			const error = await sendOrderEmail(row, base as string).then(
				(ok) => (ok ? null : "email not sent"),
				(cause: Error) => cause.message,
			);
			await prisma.notification.update({
				where: { id: row.id },
				data:
					error === null
						? { status: "SENT", sentAt: new Date(), lastError: null }
						: nextState(
								{ ok: false, retryable: true, error },
								row.attempts + 1,
								new Date(),
							),
			});
			if (error === null) {
				sent++;
			} else {
				failed++;
				console.error(
					JSON.stringify({
						type: "EMAIL_SEND_FAILED",
						notificationId: row.id,
						kind: row.kind,
						message: error,
					}),
				);
			}
			continue;
		}

		const result = await sendMessage(
			templatePayload(
				row.to,
				row.template,
				localeOf(row.locale),
				row.vars as unknown as TemplateVars,
			),
		);
		await prisma.notification.update({
			where: { id: row.id },
			data: nextState(result, row.attempts + 1, new Date()),
		});
		if (result.ok) {
			sent++;
			continue;
		}
		failed++;
		if (result.blocked) {
			// They stay pending and go out on the first run after the token is
			// replaced.
			console.error(
				JSON.stringify({
					type: "WHATSAPP_TOKEN_INVALID",
					message: result.error,
				}),
			);
			whatsappBlocked = true;
			continue;
		}
		console.error(
			JSON.stringify({
				type: TEMPLATE_CODES.has(errorCode(result.error))
					? "WHATSAPP_TEMPLATE_REJECTED"
					: "WHATSAPP_SEND_FAILED",
				notificationId: row.id,
				template: row.template,
				retryable: result.retryable,
				message: result.error,
			}),
		);
	}
	return { sent, failed };
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm vitest run src/lib/whatsapp src/lib/email && pnpm typecheck`
Expected: PASS, including the two pre-existing outbox tests ("dead token" still reports one fetch and both rows at `attempts` 0).

- [ ] **Step 7: Commit**

```bash
pnpm lint && git add src/lib/email.ts src/lib/email/orderMail.ts src/lib/email/__tests__/orderMail.test.ts src/lib/whatsapp/outbox.ts src/lib/whatsapp/__tests__/outbox.test.ts
git commit -m "feat(notifications): send order mail from the outbox, per channel"
```

---

### Task 7: Corrected details reach queued mail; admin sees both channels

**Files:**
- Modify: `src/app/api/orders/[token]/route.ts` (the `tx.notification.updateMany` inside the transaction)
- Modify: `src/app/admin/orders/[id]/page.tsx` (notification `select`), `src/app/admin/orders/[id]/OrderDetail.tsx` (props type, the "WhatsApp" card)
- Modify: `src/app/api/admin/orders/[id]/notifications/[notificationId]/resend/route.ts` (comment only)
- Test: `src/app/api/orders/[token]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `Notification.channel` (Task 5).

- [ ] **Step 1: Update the route test**

In `src/app/api/orders/[token]/__tests__/route.test.ts`, replace the test "re-points queued WhatsApp messages, and only queued ones" with:

```ts
	it("re-points queued messages by channel, and only queued ones", async () => {
		await edit();
		expect(notificationUpdateMany).toHaveBeenCalledWith({
			where: { orderId: "o1", status: "PENDING", channel: "WHATSAPP" },
			data: { to: "+60123456789" },
		});
		expect(notificationUpdateMany).toHaveBeenCalledWith({
			where: { orderId: "o1", status: "PENDING", channel: "EMAIL" },
			data: { to: "a@example.com" },
		});
	});

	it("a cleared email sends queued mail to the account's address", async () => {
		await edit({ ...details, email: null });
		expect(notificationUpdateMany).toHaveBeenCalledWith({
			where: { orderId: "o1", status: "PENDING", channel: "EMAIL" },
			data: { to: "owner@x.com" },
		});
	});
```

Run: `pnpm vitest run "src/app/api/orders/[token]/__tests__/route.test.ts"`
Expected: both FAIL (the call has no `channel`).

- [ ] **Step 2: Implement**

In `src/app/api/orders/[token]/route.ts`, replace the comment and the single `tx.notification.updateMany` call with:

```ts
		// `Notification.to` is a snapshot. A queued message must not go to the
		// number or address the customer has just told us is wrong; sent ones
		// are history. Without an order email, mail goes to the account's.
		await tx.notification.updateMany({
			where: { orderId: order.id, status: "PENDING", channel: "WHATSAPP" },
			data: { to: phone },
		});
		await tx.notification.updateMany({
			where: { orderId: order.id, status: "PENDING", channel: "EMAIL" },
			data: { to: details.email ?? user.email },
		});
```

`user` is already in scope (`const user = (await currentUser()) ?? (await demoCustomer())`) and is non-null past the ownership check above the transaction; if TypeScript still sees it as nullable there, the existing check `user?.id !== order.userId` returns before this point, so narrow with the pattern the file already uses rather than `!`.

Run: `pnpm vitest run "src/app/api/orders/[token]/__tests__/route.test.ts"`
Expected: PASS.

- [ ] **Step 3: Admin panel**

In `src/app/admin/orders/[id]/page.tsx`, add `channel: true,` to the `notifications` `select`.

In `src/app/admin/orders/[id]/OrderDetail.tsx`:

Add `NotificationChannel` to the type import from `@/generated/prisma/enums`, and `channel: NotificationChannel;` to the `notifications` item type.

Add beside `KIND_LABEL`:
```ts
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
	WHATSAPP: "WhatsApp",
	EMAIL: "Email",
};
```

Replace the card's heading and its first branch. The card currently opens:
```tsx
						<h2 className={EYEBROW}>WhatsApp</h2>
						{!order.whatsappOptIn ? (
							<p className="text-[12px] text-neutral-500">
								Customer did not opt in to WhatsApp.
							</p>
						) : order.notifications.length === 0 ? (
							<p className="text-[12px] text-neutral-500">No messages yet.</p>
						) : (
```
Change it to:
```tsx
						<h2 className={EYEBROW}>Messages</h2>
						{!order.whatsappOptIn && (
							<p className="text-[12px] text-neutral-500">
								No WhatsApp opt-in: updates go by email.
							</p>
						)}
						{order.notifications.length === 0 ? (
							<p className="text-[12px] text-neutral-500">No messages yet.</p>
						) : (
```

In the list item, change
```tsx
											{KIND_LABEL[n.kind]}
```
to
```tsx
											{CHANNEL_LABEL[n.channel]} · {KIND_LABEL[n.kind]}
```

In `resend/route.ts`, change the comment's first line from `Put a failed WhatsApp message back in the queue.` to `Put a failed message — WhatsApp or email — back in the queue.` The code needs no change: it resets the row and `flush` picks the channel.

- [ ] **Step 4: Run and look**

Run: `pnpm typecheck && pnpm test`
Expected: PASS.

Then `pnpm dev`, open `/admin/orders/<any order id>` and check the card reads "Messages", shows the no-opt-in line for an order without WhatsApp, and each row starts with its channel.

- [ ] **Step 5: Commit**

```bash
pnpm lint && git add src/app
git commit -m "feat(orders): corrected email reaches queued mail; admin lists both channels"
```

---

### Task 8: Preview script, privacy line, docs

**Files:**
- Create: `scripts/preview-emails.ts`
- Modify: `package.json` (one script)
- Modify: `src/lib/copy/en.ts`, `ms.ts`, `zh.ts` (`privacy` section), `src/app/[lang]/privacy/page.tsx`
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-08-email-templates-design.md`

- [ ] **Step 1: The preview script**

`scripts/preview-emails.ts`:

```ts
/**
 * Writes every email the app sends, in every language, to a folder, so the
 * wording and layout can be read in a browser before anything is mailed.
 *
 *   pnpm email:preview <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NotificationKind } from "../src/generated/prisma/enums";
import { en } from "../src/lib/copy/en";
import { LOCALES } from "../src/lib/copy/locales";
import { ms } from "../src/lib/copy/ms";
import { zh } from "../src/lib/copy/zh";
import { type OrderMailInput, orderEmail } from "../src/lib/email/templates/order";
import { signInCode } from "../src/lib/email/templates/signInCode";
import { staffInvite } from "../src/lib/email/templates/staffInvite";
import { staffReset } from "../src/lib/email/templates/staffReset";

const dir = process.argv[2];
if (!dir) {
	console.error("usage: pnpm email:preview <dir>");
	process.exit(1);
}
mkdirSync(dir, { recursive: true });

const dictionaries = { en, ms, zh };
const base = "https://example.test";
const order: OrderMailInput["order"] = {
	number: 14,
	createdAt: new Date("2026-10-08T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah binti Rahman",
	siteAddress: "12 Jalan Meranti 4, Taman Meranti Jaya, 47120 Puchong",
	paymentProvider: "manual",
	paidAt: new Date("2026-10-08T06:00:00Z"),
	breakdown: {
		cabinets: [
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 620 },
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 620 },
			{ label: "WC 600mm", doorLabel: "Shaker", amountRm: 410 },
		],
		categories: [
			{ id: "worktop", detail: { key: "x" }, amountRm: 540 },
			{ id: "endPanels", detail: { key: "x" }, amountRm: 180 },
		],
	},
	cabinetsRm: 2370,
	deliveryRm: 85,
	totalRm: 2455,
};

const KINDS: NotificationKind[] = [
	"ORDER_PLACED",
	"PAYMENT_CONFIRMED",
	"ORDER_REFUNDED",
	"STAGE",
	"DELIVERY_BOOKED",
	"PICKED_UP",
	"DELIVERED",
	"DELIVERY_FAILED",
];

const mails: Record<string, { subject: string; html: string; text: string }> = {
	"staff-invite": staffInvite({
		name: "Ali",
		inviterName: "Jack Ooi",
		role: "Admin",
		roleDescription:
			"Manage cabinet designs and prices, orders, deliveries, site content and tutorials.",
		link: `${base}/admin/login`,
		to: "ali@example.test",
		hasPassword: true,
	}),
	"staff-reset": staffReset({
		name: "Ali",
		link: `${base}/admin/reset-password?token=abc123`,
	}),
};
for (const locale of LOCALES) {
	mails[`sign-in-code.${locale}`] = signInCode({
		locale,
		code: "482916",
		minutes: 10,
	});
	for (const kind of KINDS) {
		mails[`${kind.toLowerCase().replaceAll("_", "-")}.${locale}`] = orderEmail({
			kind,
			locale,
			base,
			// Order placed is previewed unpaid, so the bank details show.
			order: kind === "ORDER_PLACED" ? { ...order, paidAt: null } : order,
			lineLabels: dictionaries[locale].planner.price.lines,
			stageLabel: dictionaries[locale].order.stages.CUTTING,
			delivery: {
				publicToken: "tok_delivery",
				carrierLabel: "Lalamove",
				tracking: "LM-20261008-7731",
			},
		});
	}
}

for (const [name, mail] of Object.entries(mails)) {
	writeFileSync(join(dir, `${name}.html`), mail.html);
	writeFileSync(join(dir, `${name}.txt`), `${mail.subject}\n\n${mail.text}`);
}
console.log(`${Object.keys(mails).length} mails written to ${dir}`);
```

In `package.json` `scripts`, add:
```json
		"email:preview": "tsx scripts/preview-emails.ts",
```

Run: `pnpm email:preview /tmp/email-preview`
Expected: `29 mails written to /tmp/email-preview` (2 staff + 9 × 3). If `tsx` fails on a `server-only` import, something under `src/lib/email/templates`, `layout.ts` or `copy.ts` imports a server-only module: remove that import, do not stub it.

Open four files in a browser, in light and dark (`prefers-color-scheme` in dev tools), at 375 px and 600 px wide: `order-placed.en.html`, `payment-confirmed.zh.html`, `sign-in-code.ms.html`, `staff-invite.html`. Check: no horizontal scroll at 375 px, the receipt's amounts stay on one line, the button is readable in dark mode, Chinese text renders.

- [ ] **Step 2: Privacy notice**

Add two keys to the `privacy` section of each dictionary, directly after the `whatsapp` value.

`src/lib/copy/en.ts`:
```ts
		emailHeading: "Order emails",
		email:
			"When you place an order we email you a confirmation, a receipt when your payment arrives and a notice if the order is refunded. If you did not choose WhatsApp updates, production and delivery updates come by email too. These are service messages about your order, not marketing, so they cannot be switched off. They are sent through Resend, our email provider, which processes your address and the messages, possibly outside Malaysia.",
```

`src/lib/copy/ms.ts`:
```ts
		emailHeading: "E-mel pesanan",
		email:
			"Apabila anda membuat pesanan, kami menghantar e-mel pengesahan, resit apabila bayaran anda diterima dan notis jika pesanan dibayar balik. Jika anda tidak memilih kemas kini WhatsApp, kemas kini pengeluaran dan penghantaran juga dihantar melalui e-mel. Ini ialah mesej perkhidmatan tentang pesanan anda, bukan pemasaran, jadi ia tidak boleh dimatikan. E-mel dihantar melalui Resend, pembekal e-mel kami, yang memproses alamat anda dan mesej tersebut, mungkin di luar Malaysia.",
```

`src/lib/copy/zh.ts`:
```ts
		emailHeading: "订单邮件",
		email:
			"您下单后，我们会通过电子邮件向您发送订单确认、收到付款后的收据，以及订单退款时的通知。如果您没有选择 WhatsApp 通知，生产和送货进度也会通过电子邮件发送。这些是与您订单相关的服务信息，并非营销内容，因此无法关闭。邮件通过我们的邮件服务商 Resend 发送，Resend 会处理您的邮箱地址和这些邮件，处理地点可能在马来西亚境外。",
```

In `src/app/[lang]/privacy/page.tsx`, add one row to the sections array directly after `[p.whatsappHeading, p.whatsapp],`:
```ts
		[p.emailHeading, p.email],
```

Do not change the `obligatory` paragraph ("Email and WhatsApp updates are optional"). It is now inexact, and it is legal wording: it goes to counsel with the rest of the draft (Step 3 records it).

Run: `pnpm vitest run src/lib/copy && pnpm typecheck`
Expected: PASS (the dictionary parity tests cover the two new keys).

- [ ] **Step 3: CLAUDE.md**

Make these edits to `CLAUDE.md`:

1. In **Status**, replace `Opted-in customers get WhatsApp updates for the order, each admin-advanced production stage and the delivery (`lib/whatsapp`, Meta Cloud API); go-live waits on EzCabinet — see Open questions.` with:
   `Customers get order updates for the order, each admin-advanced production stage and the delivery: by WhatsApp when they opted in (`lib/whatsapp`, Meta Cloud API; go-live waits on EzCabinet — see Open questions), and by email (`lib/email`, Resend) — receipts always, the rest when WhatsApp is off.`

2. In the **Directory layout** block, after the `lib/whatsapp/` group, add:
   ```text
     lib/email/             ← every email the app sends
       layout.ts            ← one look: blocks → { html, text }, escaping included
       copy.ts              ← mail wording, en / ms / zh; server-side, never in the site dictionary
       templates/           ← one pure function per mail; order.ts holds the eight order mails
       orderMail.ts         ← an outbox row → its order → a sent mail
   ```
   and change the `outbox.ts` line under `lib/whatsapp/` to `← enqueue in the state change's transaction; flush after, by channel`.

3. In **Non-negotiables**, replace the bullet starting `**A WhatsApp message is queued in the same transaction…` with:
   `**A customer notification is queued in the same transaction as the change it reports**, deduplicated by `dedupeKey`, one row per channel (`Notification.channel`) — except delivery booked, which queues after the booking commits so a failed insert can never roll back money spent at a carrier. `draftsFor` (`lib/whatsapp/templates.ts`) is the one place that decides channels: order placed, payment confirmed and refunded always go by email; stage and delivery mails only when WhatsApp is off. Preview deployments never get `WHATSAPP_TOKEN` or `RESEND_API_KEY`.`

4. In **Where assets live** nothing changes.

5. In **Known issues**, add as the next number:
   `**Order mail has no bounce handling and no second chance on a dead WhatsApp.** Resend accepting a mail is recorded as sent; a mailbox that then rejects it is never seen. A customer with WhatsApp on gets no stage or delivery mail even when their WhatsApp sends are failing. A failed mail is retried five times, then shown as failed on the order's Messages card, where staff can resend it. `pnpm email:preview <dir>` writes every mail in every language for a read-through.`

6. In **Open questions**, add:
   `- **Order emails print placeholders.** `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE` and `BANK_TRANSFER` now appear in mail a customer keeps, and "Reply to this email" needs `EMAIL_FROM` to be a mailbox someone reads. The ms and zh mail wording (`lib/email/copy.ts`) needs a native read, as the WhatsApp templates do. The privacy notice's "Email and WhatsApp updates are optional" is no longer exact — order emails are not optional — and goes to counsel with the new "Order emails" paragraph.`

- [ ] **Step 4: Bring the spec in line**

In `docs/superpowers/specs/2026-10-08-email-templates-design.md`:

- "One file per mail": change the first sentence to say the three account mails have a file each under `src/lib/email/templates/` and the eight order mails are one file, `order.ts`, switching on the kind; and that customer wording lives in `src/lib/email/copy.ts`, kept out of the site dictionary because that dictionary ships to the browser.
- In the outbox section, replace the bullet `sendEmail returns only true or false. A false is retried by the cron until the 48-hour expiry…` with: `A failed send is retried up to five times through the existing `nextState`, then marked failed and shown on the order's Messages card for a staff resend.`
- In "D. Order placed", replace `The rows are the order's own breakdown.categories lines…` with: `The rows are `summaryLines` and `summaryExtras` of the stored breakdown — the lines the order page shows — then delivery, then the total.`
- In Components, replace the `lib/copy/{en,ms,zh}.ts` row with `lib/email/copy.ts | Mail wording in three languages` and add `lib/email/orderMail.ts | Loads the order for an outbox row, renders and sends`. Change "`lib/email.ts` (`sendEmail`) is unchanged." to "`lib/email.ts` gains `emailConfigured()`; `sendEmail` is unchanged."

- [ ] **Step 5: Full check and commit**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all PASS.

```bash
git add scripts/preview-emails.ts package.json src/lib/copy "src/app/[lang]/privacy/page.tsx" CLAUDE.md docs/superpowers/specs/2026-10-08-email-templates-design.md
git commit -m "feat(email): preview script, privacy paragraph, docs"
```

---

## After the last task

By hand, once `RESEND_API_KEY`, `EMAIL_FROM` and `BETTER_AUTH_URL` are set somewhere safe (not preview):

1. Place an order with the WhatsApp box unticked. Expect the order-placed mail.
2. Mark it paid. Expect the receipt.
3. Advance one production stage. Expect the stage mail.
4. Place a second order with the box ticked; mark paid; advance a stage. Expect two mails (placed, paid) and no stage mail.
5. Cancel and refund the first order. Expect the refund mail.
6. Read all of them in Gmail, Outlook and iOS Mail, light and dark.

Not built here, by the spec: bounce handling, a `reply_to`, the design image in the mail, a PDF receipt, mail to staff about new orders.
