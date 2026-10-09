# Customer sign-in with any email — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer with any email address can create an account and sign in with a six-digit code mailed to it, beside Google; gives their name once; and hears by mail whenever their passkeys change. A staff account can never be opened with a code.

**Architecture:** Better Auth's `emailOTP` plugin does the code: it stores it hashed in `Verification`, checks it, and creates the `CUSTOMER` row on first use. Everything the plugin leaves open is closed around it in three small modules: pure rules (`emailCodeRules.ts`), request and session guards wired into the two hook slots the passkey feature already uses (`emailCodeHooks.ts`), and a mail module that decides after the response whether a code is mailed at all (`emailCodeMail.ts`). Rate limits move from per-instance memory to a Postgres table, which the per-address cap shares. The name is its own step and its own route, owed by a flag derived on every read (`mustSetName`) and enforced exactly where the passkey step already is. Passkey changes queue a notice to the account's own address from the existing passkey after-hook.

**Tech Stack:** Next.js 16 App Router, Better Auth 1.7.5 (`emailOTP` from `better-auth/plugins`, already installed), Prisma 7 + Postgres, Zod 4, BotID, Resend through `src/lib/email.ts`, Vitest 4, Biome, pnpm. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-customer-email-signin-design.md` (binding; read it with this plan).

**Base:** `feature/development` at `2ed8999`. Every diff below was generated against that commit; no file under `src`, `prisma`, `CLAUDE.md`, `.env.example` or `docs/ops` has changed since `18a6409`. If a file has moved on since, make the same edit by hand; do not force the hunk.

## Global Constraints

- `src/lib/planner` is not touched. Nothing here imports it or is imported by it.
- No new dependencies. `emailOTP`, `emailOTPClient`, `botid` and `better-auth/oauth2` are already in `node_modules`.
- Zod validates every API payload we own. `POST /api/admin/users` keeps `inviteSchema`; `POST /api/account/name` goes through `customerNameSchema`; the plugin's two routes are validated by the plugin and then held to an allow-list in `codeRequest`.
- Every handler under `src/app/api/admin` stays a literal `export const METHOD = withAuth(`. `src/lib/auth/__tests__/coverage.test.ts` fails the build otherwise. `POST /api/account/name` is not under `/api/admin` and reads `currentUser()` itself, as the order routes do.
- `role` stays `input: false`; `/sign-up/email` stays in `disabledPaths`. A code sign-in creates only a `CUSTOMER` with `emailVerified: true`.
- The code: six digits, valid 10 minutes, three wrong attempts end it, single use, stored hashed (`storeOTP: "hashed"`).
- Limits: at most three codes per address per hour; a per-network limit; both counted in the database.
- The send-code response is identical, in body and in timing, for a new address, a known customer, a staff address and a capped one.
- The name: trimmed, 2 to 80 characters, no control or direction-override characters, not a name that poses as the business ("EzCabinet", "admin", "support"). Not unique, not a credential, never used to identify a caller. Asked after the code, never on the first screen.
- A customer who owes a name is stopped wherever a customer who owes a passkey is, and before it.
- A passkey added, a passkey removed and a staff reset each mail the account's own address, for every role. No link in that mail. Sent after the change commits and never blocking it.
- With no `RESEND_API_KEY` a sign-in code is written to the server log and nothing is mailed. With one, the code is never logged. Any mail that carries a name escapes it.
- UI copy is sentence case, in `src/lib/copy/en.ts`, `ms.ts` and `zh.ts`, all three. Customer-facing copy names a provider only on that provider's own button and its own error message.
- The customer messages are the spec's, verbatim: "That code is not right. Check it and try again." / "That code has expired. Send a new one." / "Too many codes requested. Try again in an hour." / the action "Send a new code", available after 30 seconds / "Enter your name." / "Use your own name."
- Comments say why, not what, and match the density of the file they are in.
- Migrations are hand-written (no shadow database, CLAUDE.md known issue 12) and checked with `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, which must print an empty migration.
- Work happens in a git worktree on its own branch with its own local database. Other sessions edit the main checkout at the same time. Never `git add -A`; add the files a task names. Inside the worktree run each git command plain and alone.
- After a Prisma schema change, restart the dev server. A running server keeps the old client and `prisma.rateLimit` is undefined in it.
- Every commit message ends with these two lines, as one final paragraph:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ
```

## Review Focus

The spec says what the sign-in must do. These are the five things a real customer will do to it that the spec does not spell out, most likely first. Each has a test in the task that owns the code.

1. **The customer mistypes the address, or the mail is slow, and sits on "code sent".** The server cannot tell them the address is wrong (its answer must not vary by address). They expect to see the address they typed, a way to change it, a junk-folder hint, and, once they have asked three times, to be told so rather than get a fourth "sent" that mails nothing and kills their third code. Tests: Task 3 (`mails three codes an hour and drops the fourth`), Task 8 (`shows the address a code went to`), Task 9 (`stops the form at the server's cap`, `a failed send`).
2. **The customer closes the tab at the name step and comes back another day.** The account exists with no name. They expect the next sign-in to land on the name step again, and then to carry on to wherever they were going — not to reach an order page, a passkey prompt labelled with a random id, or a dead end. Tests: Task 5 (`asks for the name before the passkey when both are owed`, `401s name_required before the passkey is even asked about`, `sends a customer with no name to the name step first`), Task 9 (`asks again on a later sign-in, however long ago the account was made`, `passes a customer who has a name straight on`).
3. **The name is typed with spaces round it, with an emoji, or in Chinese, Jawi or Tamil.** They expect it accepted, trimmed, and stored exactly as typed. Tests: Task 5 (`accepts %s, stored as typed and trimmed`, `stores a name in %s as typed`).
4. **The address arrives as `Aiman@Outlook.com`, with a trailing space, or in full-width characters from a Chinese keyboard.** They expect one account, the same one every time, and a superadmin promoting them by a capitalised address to find it. Tests: Task 3 (`one address is one account`), Task 7 (`finds the customer when the address is typed with capitals`), Task 9 (`normaliseEmail`).
5. **The code is the first of two mails, or pasted as `482 913`, as the whole sentence from the mail, in full-width digits, or submitted twice (Enter, then the keyboard's autofill).** They expect an older code to be called "not right" with the newer one still working, and otherwise to be signed in once, not shown "not right" for a code that was right. Tests: Task 3 (`refuses an older code once a newer one was sent`, `works once`), Task 9 (`cleanCode`; the form's `inFlight` guard keeps a second submit from being sent).

Three more are pinned beside these: a customer in WhatsApp's or a mail app's built-in browser is told to open Chrome or Safari before a code is mailed (Task 9, `canStart`); a staff member promoted while holding a live code cannot use it (Task 3, `cannot use a code they were mailed as a customer`); and a mail scanner that follows links finds none in either mail (Task 2, `with no link`; Task 6, `says what and when, to the account's own address`).

## Deviations and decisions

Where the spec's wording could not be built exactly as written, the intent is kept and the mechanism is the smallest that is correct. One line each.

1. **Per-address cap has its own counter.** Better Auth's limiter keys on `<ip>|<path>` only, so "three codes per address per hour" is `takeSendSlot` in `emailCodeMail.ts`: one row per address in the same `rateLimit` table, key `email-code|<address>`, a fixed hour from the first send.
2. **"Identical response when rate-limited" and "Too many codes requested" both stand.** The per-address cap is silent on the server. The message is shown for the per-network limit (Better Auth's 429) and by the form itself after its third send, so an honest customer is told and a prober learns nothing.
3. **The per-network limit is 20 send requests an hour.** The spec gives no number. This replaces the plugin's default of 3 per 60 seconds for that one route (`rateLimit.customRules`), because Malaysian mobile networks share addresses. The verify route keeps the plugin's 3 per 60 seconds.
4. **The plugin awaits the mail callback.** So the callback only calls `after()` and returns. The role lookup, the cap and the Resend call all happen after the response.
5. **The plugin stores a code before anyone decides to mail it.** A code that is not mailed (staff address, over the cap) is deleted by `sendSignInCode`. Left in place it could be guessed at, three tries per request, with the cap doing nothing.
6. **`expiresIn` is seconds (`600`), and `allowedAttempts: 3` means three wrong tries.** The fourth call answers 403 `TOO_MANY_ATTEMPTS` even with the right code.
7. **Only the newest code is checked.** `resendStrategy: "reuse"` is unavailable with hashed storage, so a resend replaces the code. An older code is refused as wrong and costs one try.
8. **A code-created row has an empty name until the name step.** The plugin stores `name: ""` and nothing fills it in: no hook, no stand-in. Until the step is done the account menu hides the name line, `/admin/users` labels the row with its address, and a promotion uses the name the superadmin typed. The passkey prompt never sees an empty name, because the name step is enforced before the passkey step.
9. **The sign-in body is still held to `email` and `otp`.** The plugin would copy a posted `name` or `image` onto a new account, so the name arrives by its own route, `POST /api/account/name`, after the code. A posted `role` was already harmless (`input: false` resets it to the default) and is refused with the rest.
10. **How each refusal answers.** A staff sign-in gets 400 `INVALID_OTP`, the same as a wrong code, so staff cannot be told apart. The seven closed routes get 404 from `disabledPaths`. Any other plugin path gets 403. The session-create check throws rather than returning `false`, which the plugin would turn into a 500.
11. **"Fail closed" matches any path containing `email-otp`,** not the spec's two prefixes: `/forget-password/email-otp` sits under neither.
12. **Account linking needs no new mechanism.** Better Auth's default already links Google to an existing row only when Google reports the email verified and our row is verified. `trustedProviders: []` is written down so nobody adds one. Tested by calling the OAuth callback's own function, `handleOAuthUserInfo`.
13. **The name route sets a name once and never renames.** The spec says it "updates that account's own name". It answers 409 for a row that already has one: nothing in the app offers a rename, and a session that has signed in but not passed the passkey step must not be able to relabel a named account.
14. **`mustSetName` is optional on `AuthUser`; absent means not owed.** Like `passkeyVerifiedAt`. A required field would have meant editing the bypass user, the demo customer and a dozen test fixtures to say `false`.
15. **The email form always goes by way of the name step.** Only the server knows whether an account owes a name, so the form navigates to `/[lang]/welcome?next=…` every time and that page passes a customer who owes nothing straight on. One extra redirect for a returning customer; no client-side guess, and a customer who signs in to the home page is still asked.
16. **Two answers for a bad name, as the spec's two messages need.** `name_required` for nothing, too short or not a string; `name_refused` for too long, a hidden character or a business-posing name (`parseCustomerName`). The form shows the server's answer and has no rule of its own.
17. **What "poses as the business" means.** Contains "ezcabinet" after NFKC folding and with spaces, dots, dashes and underscores removed (so "Ez Cabinet" and full-width letters are caught), or starts with "admin" or "support". A name that merely contains those two words ("Badminton Lee") is accepted. Recorded in CLAUDE.md as a rule to narrow if a real name is caught.
18. **Hidden characters are control characters and the direction overrides and isolates only** (U+202A–202E, U+2066–2069). The zero-width joiner is allowed, because emoji are built with it. Length is counted in UTF-16 units, as Zod counts it.
19. **`next` for the code path goes through a new `safeWelcomeNext`.** The Google button passes `next` to Better Auth, which checks it, exactly as today. The code path navigates by itself, so it shares `safeCustomerNext`'s parser: the verify page is an allowed target, the welcome page is not, and `/${lang}` is the fallback.
20. **Passkey mails are scheduled by `queuePasskeyMail`, which never throws.** It calls `after()` inside a try: where there is no request to run after, nothing is sent and the change stands. `pnpm auth:reset-passkey` is such a place and is about to exit, so the script awaits `sendPasskeyChange` itself instead.
21. **"A passkey was removed" is queued on the plugin's own success.** The after-hook sees `/passkey/delete-passkey` return something that is not an error, for a signed-in account. The before-hook has already refused every removal the rules forbid, so there is no second count to take as there is for a registration.
22. **The passkey mail's "contact us" is a number written out, not a link.** `WHATSAPP_SALES_NUMBER`, the variable the WhatsApp help link uses, as "+60…"; `WORKSHOP_PHONE` when it is unset. The time is Malaysia time, with its own zone constant: `passkeyDate.ts` lives under `app/` and formats dates only.
23. **`esc` is exported from `inviteMail.ts`** rather than copied, so there is one escaper for every mail that carries a name. The code mail carries none.
24. **Mail not configured: the passkey mail sends nothing.** `sendEmail` logs the subject line in that case, which names no account and no address.
25. **Promotion uses the password the invite form already posts.** It was ignored for a promotion before. It is hashed with Better Auth's own hasher and written as a `credential` account in the same transaction as the role, with `mustChangePassword`. "No Google account" means no `google` account row. The typed address is lower-cased, and the typed name is used only for a row that has none.
26. **The checkout card and the planner nudge become links to the sign-in page.** The spec wants no provider named there, and one button cannot offer two routes.
27. **`GoogleSignInButton.tsx` keeps its name and is not touched.** With Facebook dropped there is one provider, so generalising it would be a rename for nothing. `errorCallbackURL` and the "back from a provider" messages went with Facebook: a Google sign-in that does not finish lands on Better Auth's error page, as today.
28. **The spec's messages keep their full stops.** House convention stores error strings without one and appends it. The email form's and the name form's strings carry their own, so the spec's wording is stored verbatim.
29. **Two strings outside the spec's table are also de-Googled:** `privacy.recipients` ("Google handles sign-in") and the inline copy in `app/[lang]/not-found.tsx`. Otherwise the copy test could not be strict.
30. **Both mails are in English, and the code is not in the subject.** Neither request carries a locale, and the subject is the one part of a message `sendEmail` ever logs.
31. **BotID runs in `hooks.before`,** since the route is the plugin's. A bot gets 403; "identical response" covers the four kinds of address, not bots.
32. **"Mail not configured" means no `RESEND_API_KEY`,** as the spec words it. A key with no `EMAIL_FROM` mails nothing and logs no code.
33. **`rateLimit.storage: "database"` covers every Better Auth HTTP route,** not only the new ones: two small queries per request to `/api/auth`. The migration must be applied before the code serves traffic, or no one can sign in.
34. **The privacy-notice strings change in the copy task, not the last task.** They must change in the same commit as the copy test or it fails. The last task carries the note that counsel must see them.
35. **An in-app browser sees the "open in Chrome or Safari" notice instead of the email form.** The spec lists in-app browsers only as a limit; this is the cheapest way to not mail a code that cannot be used.
36. **The firewall rule is 60 requests an hour per IP, staged as `log` first.** Three times the app's 20, so the app's own message is always met first. It is a runbook step for a person with project access; no code or config file in the repo carries it.

---

## Before Task 1: worktree and database

- [ ] **Create the worktree and branch.** Use superpowers:using-git-worktrees. Branch `feature/customer-email-signin` from `feature/development`.

- [ ] **Give it its own database.** The main checkout's database belongs to other sessions.

```bash
docker compose exec postgres psql -U cabinet -d cabinet -c "CREATE DATABASE cabinet_email_signin"
```

Copy `.env.local` from the main checkout into the worktree and set, in the worktree's copy only:

```
DATABASE_URL=postgresql://cabinet:cabinet@127.0.0.1:5432/cabinet_email_signin
```

Leave `RESEND_API_KEY` unset in it, so codes are logged rather than mailed.

- [ ] **Confirm the host, then install and migrate.**

```bash
node --env-file=.env.local -e 'console.log(new URL(process.env.DATABASE_URL).host, new URL(process.env.DATABASE_URL).pathname)'
```

Expected: `127.0.0.1:5432 /cabinet_email_signin`. Anything else: STOP and ask the user.

```bash
pnpm install
pnpm exec prisma migrate deploy
pnpm seed:superadmin
pnpm vitest run src/lib/auth
```

Expected: migrations apply; a superadmin row exists for `SUPERADMIN_EMAIL` (the hand checks in Tasks 4 and 9 need one staff address); the auth tests pass. This is the green baseline.

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/auth/emailCodeRules.ts` (new) | Pure, isomorphic: the numbers, the two open paths, the seven closed ones, who may use a code, what a plugin request is |
| `src/lib/auth/emailCodeMail.ts` (new) | After the response: staff check, per-address cap, mail or log |
| `src/lib/auth/emailCodeHooks.ts` (new) | `hooks.before` guard and the session-create refusal |
| `prisma/schema.prisma`, `prisma/migrations/20261009000000_rate_limit/` | The `rateLimit` table |
| `src/lib/auth.ts`, `src/lib/auth/client.ts`, `src/instrumentation-client.ts` | Wiring: plugin, closed paths, database rate limit, composed hooks, linking, BotID |
| `src/lib/auth/customerName.ts` (new) | Pure: what a name is, and whether a row still owes one |
| `src/app/api/account/name/route.ts` (new) | Sets the signed-in customer's own name, once |
| `src/lib/auth/session.ts`, `src/lib/orders/access.ts`, `src/app/[lang]/verify/page.tsx`, the three routes under `src/app/api/orders`, `src/app/api/payments/config/route.ts` | `mustSetName`, enforced where the passkey step is |
| `src/lib/auth/passkeyMail.ts` (new), `src/lib/auth/passkeyHooks.ts`, the reset-passkey route, `prisma/resetPasskey.ts` | The three "your passkey changed" mails and where they are queued |
| `src/app/api/admin/users/route.ts`, `src/app/admin/users/InviteStaff.tsx` | Promotion sets a password when the row has no Google sign-in |
| `src/lib/copy/{en,ms,zh}.ts` and the screens that read them | New strings, de-Googled strings |
| `src/lib/auth/safeCustomerNext.ts` | `safeWelcomeNext` beside the existing function, one shared parser |
| `src/app/[lang]/sign-in/` | `emailCode.ts` (pure form rules), `EmailCodeForm.tsx`, `page.tsx` |
| `src/app/[lang]/welcome/` (new) | The one-field name step |
| `CLAUDE.md`, `docs/ops/customer-passkey-runbook.md`, `.env.example` | Docs, deploy checklist, the Vercel firewall rule |

---

### Task 1: The rules

**Files:**
- Create: `src/lib/auth/emailCodeRules.ts`
- Test: `src/lib/auth/__tests__/emailCodeRules.test.ts`

**Interfaces:**
- Consumes: `type Role` from `@/lib/auth/permissions` (`"SUPERADMIN" | "ADMIN" | "CUSTOMER"`).
- Produces (all from `@/lib/auth/emailCodeRules`, no `server-only`, safe in client components):
  - `SEND_PATH = "/email-otp/send-verification-otp"`, `SIGN_IN_PATH = "/sign-in/email-otp"`
  - `CLOSED_PATHS: string[]` (seven)
  - `CODE_TTL_S = 600`, `CODE_ATTEMPTS = 3`, `CODES_PER_HOUR = 3`, `SEND_WINDOW_S = 3600`, `SENDS_PER_NETWORK = 20`
  - `mayUseCode(row: { role: Role } | null): boolean`
  - `withinSendCap(sendsThisHour: number): boolean`
  - `codeRequest(path: string | undefined, body: unknown): "ignore" | "send" | "sign_in" | "refuse"`

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/emailCodeRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	CLOSED_PATHS,
	CODE_ATTEMPTS,
	CODE_TTL_S,
	CODES_PER_HOUR,
	codeRequest,
	mayUseCode,
	SEND_PATH,
	SEND_WINDOW_S,
	SIGN_IN_PATH,
	withinSendCap,
} from "@/lib/auth/emailCodeRules";

describe("mayUseCode", () => {
	it.each([
		["an address with no account", null, true],
		["a customer", { role: "CUSTOMER" as const }, true],
		["an admin", { role: "ADMIN" as const }, false],
		["a superadmin", { role: "SUPERADMIN" as const }, false],
	])("%s", (_label, row, expected) => {
		expect(mayUseCode(row)).toBe(expected);
	});
});

describe("the spec's numbers", () => {
	it("ten minutes, three tries, three codes an hour", () => {
		expect(CODE_TTL_S).toBe(600);
		expect(CODE_ATTEMPTS).toBe(3);
		expect(CODES_PER_HOUR).toBe(3);
		expect(SEND_WINDOW_S).toBe(3600);
	});
	it.each([
		[1, true],
		[3, true],
		[4, false],
		[40, false],
	])("send number %i in the hour", (n, expected) => {
		expect(withinSendCap(n)).toBe(expected);
	});
});

describe("codeRequest", () => {
	it.each([
		[
			"a sign-in code request",
			SEND_PATH,
			{ email: "a@b.com", type: "sign-in" },
			"send",
		],
		[
			"a code sign-in",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "123456" },
			"sign_in",
		],
		[
			"a verification code request",
			SEND_PATH,
			{ email: "a@b.com", type: "email-verification" },
			"refuse",
		],
		[
			"a reset code request",
			SEND_PATH,
			{ email: "a@b.com", type: "forget-password" },
			"refuse",
		],
		["a send with no type", SEND_PATH, { email: "a@b.com" }, "refuse"],
		["a send with no body", SEND_PATH, undefined, "refuse"],
		[
			"a sign-in posting a role",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "1", role: "SUPERADMIN" },
			"refuse",
		],
		[
			"a sign-in posting a name",
			SIGN_IN_PATH,
			{ email: "a@b.com", otp: "1", name: "x" },
			"refuse",
		],
		["a sign-in with no body", SIGN_IN_PATH, undefined, "refuse"],
		["a route the plugin may add later", "/email-otp/new-thing", {}, "refuse"],
		["a longer sign-in path", "/sign-in/email-otp/extra", {}, "refuse"],
		["Google sign-in", "/sign-in/social", {}, "ignore"],
		["password sign-in", "/sign-in/email", {}, "ignore"],
		["a passkey route", "/passkey/verify-registration", {}, "ignore"],
		["an internal call with no path", undefined, {}, "ignore"],
	])("%s", (_label, path, body, expected) => {
		expect(codeRequest(path, body)).toBe(expected);
	});

	it.each(CLOSED_PATHS)("%s is refused even if it were reached", (path) => {
		expect(codeRequest(path, { email: "a@b.com" })).toBe("refuse");
	});

	it("closes exactly the seven routes the form never calls", () => {
		expect(CLOSED_PATHS).toHaveLength(7);
		expect(CLOSED_PATHS).not.toContain(SEND_PATH);
		expect(CLOSED_PATHS).not.toContain(SIGN_IN_PATH);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeRules.test.ts`
Expected: FAIL, the suite cannot load: `Cannot find module '@/lib/auth/emailCodeRules'` (wording varies by Vite version; the point is no test runs).

- [ ] **Step 3: Write the rules**

Create `src/lib/auth/emailCodeRules.ts`:

```ts
import type { Role } from "@/lib/auth/permissions";

/** The two plugin routes that stay open. Everything else is refused. */
export const SEND_PATH = "/email-otp/send-verification-otp";
export const SIGN_IN_PATH = "/sign-in/email-otp";

/**
 * The plugin's other seven routes, closed in `disabledPaths`. Two of them
 * would put a password on a customer row.
 */
export const CLOSED_PATHS = [
	"/email-otp/verify-email",
	"/email-otp/check-verification-otp",
	"/email-otp/request-password-reset",
	"/email-otp/reset-password",
	"/forget-password/email-otp",
	"/email-otp/request-email-change",
	"/email-otp/change-email",
];

export const CODE_TTL_S = 10 * 60;
export const CODE_ATTEMPTS = 3;
export const CODES_PER_HOUR = 3;
/**
 * One hour, for both limits. Better Auth prunes the rate-limit table by its
 * longest configured window, and the per-address rows live in that table, so
 * the per-network rule must not be given a shorter window than this.
 */
export const SEND_WINDOW_S = 60 * 60;
export const SENDS_PER_NETWORK = 20;

/**
 * May this address be sent a code, and may this row sign in with one. `null`
 * is an address with no account yet: a code sign-in creates it. Staff never
 * qualify — a mailed code would be a way round their password and
 * authenticator.
 */
export function mayUseCode(row: { role: Role } | null): boolean {
	return row === null || row.role === "CUSTOMER";
}

export function withinSendCap(sendsThisHour: number): boolean {
	return sendsThisHour <= CODES_PER_HOUR;
}

const only = (body: unknown, allowed: string[]): boolean =>
	typeof body === "object" &&
	body !== null &&
	Object.keys(body).every((key) => allowed.includes(key));

/**
 * What a request to the plugin is. `refuse` is every plugin route that is not
 * one of the two open ones used exactly as the form uses them — so a route a
 * later plugin version adds is born closed.
 *
 * The sign-in body is held to `email` and `otp`: the plugin would otherwise
 * copy `name`, `image` and any other posted field onto a new account.
 */
export function codeRequest(
	path: string | undefined,
	body: unknown,
): "ignore" | "send" | "sign_in" | "refuse" {
	// Every route the plugin has carries its name, wherever it sits:
	// `/email-otp/…`, `/sign-in/email-otp`, `/forget-password/email-otp`.
	if (!path?.includes("email-otp")) return "ignore";
	if (path === SEND_PATH) {
		return (body as { type?: unknown } | null)?.type === "sign-in" &&
			only(body, ["email", "type"])
			? "send"
			: "refuse";
	}
	if (path === SIGN_IN_PATH) {
		return only(body, ["email", "otp"]) ? "sign_in" : "refuse";
	}
	return "refuse";
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeRules.test.ts`
Expected: PASS, 32 tests.

- [ ] **Step 5: Lint and commit**

```bash
pnpm exec biome check src/lib/auth/emailCodeRules.ts src/lib/auth/__tests__/emailCodeRules.test.ts
```

Expected: no errors.

```bash
git add src/lib/auth/emailCodeRules.ts src/lib/auth/__tests__/emailCodeRules.test.ts
```

```bash
git commit -m "feat(auth): rules for customer sign-in by emailed code" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 2: The rate-limit table and the code mail

**Files:**
- Modify: `prisma/schema.prisma` (after `model Verification`)
- Create: `prisma/migrations/20261009000000_rate_limit/migration.sql`
- Create: `src/lib/auth/emailCodeMail.ts`
- Test: `src/lib/auth/__tests__/emailCodeMail.test.ts`

**Interfaces:**
- Consumes: `mayUseCode`, `withinSendCap`, `CODE_TTL_S`, `SEND_WINDOW_S` from Task 1; `sendEmail(message: { to: string; subject: string; text: string; html?: string }): Promise<boolean>` from `@/lib/email` (never throws); `prisma` from `@/lib/catalogue/db`.
- Produces:
  - Prisma model `RateLimit` (`prisma.rateLimit`): `id String @id`, `key String @unique`, `count Int`, `lastRequest BigInt` (epoch milliseconds). Better Auth's limiter uses it once Task 4 turns on `storage: "database"`.
  - `sendSignInCode(email: string, code: string): Promise<void>` from `@/lib/auth/emailCodeMail`. `email` is already lower-case (the plugin lower-cases it). It mails, logs, or deletes the stored code; it never throws on a refused address.

The plugin stores a code under `Verification.identifier = "sign-in-otp-<email>"` (`node_modules/better-auth/dist/plugins/email-otp/utils.mjs`). That is the row `sendSignInCode` deletes when it decides not to mail.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/emailCodeMail.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const limitDelete = vi.hoisted(() => vi.fn());
const upsert = vi.hoisted(() => vi.fn());
const codeDelete = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			true,
	),
);

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: { findUnique },
		rateLimit: { deleteMany: limitDelete, upsert },
		verification: { deleteMany: codeDelete },
	},
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { sendSignInCode } = await import("@/lib/auth/emailCodeMail");

const logs = () =>
	[console.info, console.log, console.warn, console.error]
		.flatMap((fn) => vi.mocked(fn).mock.calls)
		.flat()
		.map(String)
		.join("\n");

beforeEach(() => {
	vi.clearAllMocks();
	findUnique.mockResolvedValue(null);
	upsert.mockResolvedValue({ count: 1 });
	for (const level of ["info", "log", "warn", "error"] as const) {
		vi.spyOn(console, level).mockImplementation(() => {});
	}
	process.env.RESEND_API_KEY = "test-key";
});

afterEach(() => {
	delete process.env.RESEND_API_KEY;
	vi.restoreAllMocks();
});

describe("sendSignInCode", () => {
	it("mails the code, the site name and the ignore line, with no link", async () => {
		await sendSignInCode("aiman@outlook.com", "482913");
		const message = sendEmail.mock.calls[0][0];
		expect(message.to).toBe("aiman@outlook.com");
		for (const part of [message.text, message.html ?? ""]) {
			expect(part).toContain("482913");
			expect(part).toContain("EzCabinet");
			expect(part).toContain("If you did not ask for this, ignore this email.");
			// A scanner that follows links must find nothing to follow.
			expect(part).not.toMatch(/https?:|href|www\./i);
		}
		expect(message.subject).not.toContain("482913");
	});

	it("never logs the code when mail is configured", async () => {
		await sendSignInCode("aiman@outlook.com", "482913");
		sendEmail.mockResolvedValueOnce(false);
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(logs()).not.toContain("482913");
	});

	it("logs the code instead of mailing when there is no mail key", async () => {
		delete process.env.RESEND_API_KEY;
		await sendSignInCode("aiman@outlook.com", "482913");
		expect(sendEmail).not.toHaveBeenCalled();
		expect(logs()).toContain("482913");
	});

	it.each(["ADMIN", "SUPERADMIN"])(
		"sends a %s nothing, logs nothing, and drops the stored code",
		async (role) => {
			delete process.env.RESEND_API_KEY;
			findUnique.mockResolvedValue({ role });
			await sendSignInCode("boss@x.com", "482913");
			expect(sendEmail).not.toHaveBeenCalled();
			expect(logs()).not.toContain("482913");
			expect(upsert).not.toHaveBeenCalled();
			expect(codeDelete).toHaveBeenCalledWith({
				where: { identifier: "sign-in-otp-boss@x.com" },
			});
		},
	);

	it("mails a known customer", async () => {
		findUnique.mockResolvedValue({ role: "CUSTOMER" });
		await sendSignInCode("cust@x.com", "482913");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(codeDelete).not.toHaveBeenCalled();
	});

	it("counts each send against the address, in an hour's window", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T02:00:00Z") });
		await sendSignInCode("aiman@outlook.com", "482913");
		vi.useRealTimers();
		const now = Date.parse("2026-10-08T02:00:00Z");
		expect(limitDelete).toHaveBeenCalledWith({
			where: {
				key: "email-code|aiman@outlook.com",
				lastRequest: { lt: now - 3_600_000 },
			},
		});
		expect(upsert.mock.calls[0][0]).toMatchObject({
			where: { key: "email-code|aiman@outlook.com" },
			create: {
				key: "email-code|aiman@outlook.com",
				count: 1,
				lastRequest: now,
			},
			update: { count: { increment: 1 } },
		});
	});

	it("mails the third code of the hour and drops the fourth", async () => {
		upsert.mockResolvedValueOnce({ count: 3 });
		await sendSignInCode("aiman@outlook.com", "111111");
		expect(sendEmail).toHaveBeenCalledTimes(1);

		upsert.mockResolvedValueOnce({ count: 4 });
		await sendSignInCode("aiman@outlook.com", "222222");
		expect(sendEmail).toHaveBeenCalledTimes(1);
		expect(codeDelete).toHaveBeenCalledWith({
			where: { identifier: "sign-in-otp-aiman@outlook.com" },
		});
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeMail.test.ts`
Expected: FAIL, the suite cannot load: `Cannot find module '@/lib/auth/emailCodeMail'`.

- [ ] **Step 3: Add the table to the schema**

In `prisma/schema.prisma`:

```diff
--- a/prisma/schema.prisma
+++ b/prisma/schema.prisma
@@ -540,6 +540,22 @@
 
   @@index([identifier])
   @@map("verification")
+}
+
+/// Request counters. Better Auth's rate limiter writes one row per network
+/// and route (`rateLimit.storage: "database"`), keyed `<ip>|<path>`; the
+/// per-address cap on sign-in codes keeps its own rows here, keyed
+/// `email-code|<address>` (`lib/auth/emailCodeMail.ts`). Columns are Better
+/// Auth's (node_modules/@better-auth/core/dist/db/get-tables.mjs).
+/// `lastRequest` is epoch milliseconds. Rows are pruned by the limiter; none
+/// of this is a record of anything.
+model RateLimit {
+  id          String @id
+  key         String @unique
+  count       Int
+  lastRequest BigInt
+
+  @@map("rateLimit")
 }
 
 /// Better Auth's two-factor plugin. `secret` and `backupCodes` are encrypted
```

- [ ] **Step 4: Write the migration by hand**

Create `prisma/migrations/20261009000000_rate_limit/migration.sql`. If another session has already taken that timestamp prefix, use the next free one and use the same name wherever this plan mentions it.

```sql
-- Better Auth's rate-limit counters, moved out of per-instance memory, plus
-- the per-address cap on sign-in codes. Columns are Better Auth's own.
CREATE TABLE "rateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "rateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rateLimit_key_key" ON "rateLimit"("key");
```

- [ ] **Step 5: Apply it and prove it matches the schema**

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma generate
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: `migrate deploy` applies `20261009000000_rate_limit`; `migrate diff` prints `-- This is an empty migration.` and nothing else. Any SQL in that output means the file and the schema disagree: fix the SQL file, never the check.

If a dev server is running in this worktree, restart it now.

- [ ] **Step 6: Write the mail module**

Create `src/lib/auth/emailCodeMail.ts`:

```ts
import "server-only";
import { randomUUID } from "node:crypto";
import {
	CODE_TTL_S,
	mayUseCode,
	SEND_WINDOW_S,
	withinSendCap,
} from "@/lib/auth/emailCodeRules";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";

/**
 * Counts this send against the address and says whether it is within the
 * hourly cap. Better Auth's own limiter is per network; this is the half that
 * stops a flood aimed at one inbox from many networks.
 *
 * The row lives in Better Auth's `rateLimit` table under a key its limiter
 * never uses (`<ip>|<path>` there). The window is fixed from the first send.
 */
async function takeSendSlot(email: string): Promise<boolean> {
	const key = `email-code|${email}`;
	const now = Date.now();
	await prisma.rateLimit.deleteMany({
		where: { key, lastRequest: { lt: now - SEND_WINDOW_S * 1000 } },
	});
	const row = await prisma.rateLimit.upsert({
		where: { key },
		create: { id: randomUUID(), key, count: 1, lastRequest: now },
		update: { count: { increment: 1 } },
	});
	return withinSendCap(row.count);
}

/**
 * Decides whether the code the plugin has just stored is mailed, and mails
 * it. Runs after the response (`after()` in `lib/auth.ts`), so a staff
 * address, a capped address and a customer all got the same answer in the
 * same time.
 *
 * A code that is not mailed is deleted: left in place it could still be
 * guessed at, three tries per request, with the cap doing nothing.
 */
export async function sendSignInCode(
	email: string,
	code: string,
): Promise<void> {
	const row = await prisma.user.findUnique({
		where: { email },
		select: { role: true },
	});
	if (!mayUseCode(row) || !(await takeSendSlot(email))) {
		await prisma.verification.deleteMany({
			where: { identifier: `sign-in-otp-${email}` },
		});
		return;
	}
	// Local and preview have no mail key: the developer reads the code here,
	// and a preview deployment cannot be used to mail strangers. With a key
	// the code is never logged.
	if (!process.env.RESEND_API_KEY) {
		console.info(`Sign-in code for ${email}: ${code}`);
		return;
	}
	const minutes = CODE_TTL_S / 60;
	await sendEmail({
		to: email,
		subject: "Your EzCabinet sign-in code",
		text: [
			`Your EzCabinet sign-in code is ${code}`,
			"",
			`Type it into the page that asked for it. It works once, for ${minutes} minutes.`,
			"",
			"If you did not ask for this, ignore this email.",
		].join("\n"),
		html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#262626;"><p>Your EzCabinet sign-in code is</p><p style="font-size:28px;line-height:34px;font-weight:bold;letter-spacing:4px;color:#171717;">${code}</p><p>Type it into the page that asked for it. It works once, for ${minutes} minutes.</p><p style="font-size:13px;color:#5c574e;">If you did not ask for this, ignore this email.</p></div>`,
	});
}
```

- [ ] **Step 7: Run it to see it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeMail.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm exec biome check src/lib/auth/emailCodeMail.ts src/lib/auth/__tests__/emailCodeMail.test.ts
```

Expected: both clean. `typecheck` is what proves `prisma.rateLimit` exists and takes a number for `lastRequest`.

```bash
git add prisma/schema.prisma prisma/migrations/20261009000000_rate_limit/migration.sql src/lib/auth/emailCodeMail.ts src/lib/auth/__tests__/emailCodeMail.test.ts
```

```bash
git commit -m "feat(auth): rate-limit table and the sign-in code mail" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 3: The hooks, proven on the real plugin

**Files:**
- Create: `src/lib/auth/emailCodeHooks.ts`
- Test: `src/lib/auth/__tests__/emailCodeWiring.test.ts`

**Interfaces:**
- Consumes: `codeRequest`, `mayUseCode`, `SIGN_IN_PATH`, `SEND_PATH`, `CLOSED_PATHS`, the constants (Task 1); `sendSignInCode` (Task 2); `passkeyBeforeHook(ctx)`, `verifiedIfPasskeySession(session, ctx)` from `@/lib/auth/passkeyHooks` (existing); `checkBotId(): Promise<{ isBot: boolean }>` from `botid/server`.
- Produces (from `@/lib/auth/emailCodeHooks`, `server-only`):
  - `emailCodeBeforeHook(ctx: HookContext): Promise<void>`: throws `APIError` to refuse, returns to allow. `HookContext` is `Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]`, the same private alias `passkeyHooks.ts` declares.
  - `refuseStaffCodeSession(session: { userId: string }, ctx: { path?: string } | null): Promise<void>`: throws to refuse.

Facts this test leans on, all read from `node_modules/better-auth/dist`:
- The plugin's stored code is unsalted SHA-256, base64url, followed by `:<attempts>` (`plugins/email-otp/utils.mjs`, `otp-token.mjs`). `plantCode` builds one by hand.
- The plugin checks the newest `Verification` row by `createdAt`. Two sends in the same millisecond tie, so the "older code" test moves the clock between them.
- Rate limiting is off outside production unless `rateLimit.enabled` is set, and the limiter falls back to `127.0.0.1` in tests.
- `handleOAuthUserInfo` (`better-auth/oauth2`) is what the OAuth callback calls once a provider has answered. Calling it directly tests linking without Google.

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/emailCodeWiring.test.ts`:

```ts
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
	db: {} as Record<string, Row[]>,
	/** Every code that reached the mail module, newest last. */
	mailed: [] as { to: string; code: string }[],
	bot: false,
}));

vi.mock("botid/server", () => ({
	checkBotId: async () => ({ isBot: store.bot }),
}));
vi.mock("@/lib/email", () => ({
	sendEmail: async (message: { to: string; text: string }) => {
		store.mailed.push({
			to: message.to,
			code: /\d{6}/.exec(message.text)?.[0] ?? "",
		});
		return true;
	},
}));
// The app's own modules read through Prisma; here they see the same rows the
// plugin writes through the memory adapter.
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: {
			findUnique: async ({ where }: { where: Row }) =>
				store.db.user.find((r) =>
					"id" in where ? r.id === where.id : r.email === where.email,
				) ?? null,
		},
		rateLimit: {
			deleteMany: async ({
				where,
			}: {
				where: { key: string; lastRequest: { lt: number } };
			}) => {
				store.db.rateLimit = store.db.rateLimit.filter(
					(r) =>
						!(
							r.key === where.key &&
							(r.lastRequest as number) < where.lastRequest.lt
						),
				);
			},
			upsert: async ({
				where,
				create,
			}: {
				where: { key: string };
				create: Row;
			}) => {
				const row = store.db.rateLimit.find((r) => r.key === where.key);
				if (!row) {
					store.db.rateLimit.push(create);
					return create;
				}
				row.count = (row.count as number) + 1;
				return row;
			},
		},
		verification: {
			deleteMany: async ({ where }: { where: { identifier: string } }) => {
				store.db.verification = store.db.verification.filter(
					(r) => r.identifier !== where.identifier,
				);
			},
		},
		passkey: { count: async () => 0, findFirst: async () => null },
		session: { update: async () => null },
	},
}));

const { emailCodeBeforeHook, refuseStaffCodeSession } = await import(
	"@/lib/auth/emailCodeHooks"
);
const { sendSignInCode } = await import("@/lib/auth/emailCodeMail");
const {
	CLOSED_PATHS,
	CODE_ATTEMPTS,
	CODE_TTL_S,
	SEND_PATH,
	SEND_WINDOW_S,
	SENDS_PER_NETWORK,
	SIGN_IN_PATH,
} = await import("@/lib/auth/emailCodeRules");
const { passkeyBeforeHook, verifiedIfPasskeySession } = await import(
	"@/lib/auth/passkeyHooks"
);

const ORIGIN = "http://localhost:3000";

/** The same wiring as `lib/auth.ts`, minus `after()` and the cookie plugin. */
function makeAuth(opts: { beforeHook?: boolean; rateLimit?: boolean } = {}) {
	return betterAuth({
		baseURL: ORIGIN,
		secret: "test-secret-test-secret-test-secret-0123",
		database: memoryAdapter(store.db),
		emailAndPassword: { enabled: true },
		disabledPaths: ["/sign-up/email", ...CLOSED_PATHS],
		rateLimit: {
			enabled: opts.rateLimit === true,
			storage: "database",
			customRules: {
				[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },
			},
		},
		user: {
			additionalFields: {
				role: { type: "string", input: false, defaultValue: "CUSTOMER" },
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				if (opts.beforeHook !== false) await emailCodeBeforeHook(ctx);
				await passkeyBeforeHook(ctx);
			}),
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session, ctx) => {
						await refuseStaffCodeSession(session, ctx);
						return verifiedIfPasskeySession(session, ctx);
					},
				},
			},
		},
		plugins: [
			emailOTP({
				otpLength: 6,
				expiresIn: CODE_TTL_S,
				allowedAttempts: CODE_ATTEMPTS,
				storeOTP: "hashed",
				sendVerificationOTP: async ({ email, otp, type }) => {
					if (type === "sign-in") await sendSignInCode(email, otp);
				},
			}),
		],
	});
}

let auth: ReturnType<typeof makeAuth>;

const post = (path: string, body: unknown) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN },
			body: JSON.stringify(body),
		}),
	);

const send = (email: string) => post(SEND_PATH, { email, type: "sign-in" });
const signIn = (email: string, otp: string) =>
	post(SIGN_IN_PATH, { email, otp });
const codeOf = async (res: Response) =>
	((await res.json()) as { code?: string }).code;
const lastCode = () => store.mailed[store.mailed.length - 1].code;

/** A row as an invite would have left it. */
const plant = (email: string, role: string) =>
	store.db.user.push({
		id: `id-${email}`,
		email,
		name: "Planted",
		emailVerified: true,
		role,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

/** The plugin's stored form of a code: unsalted SHA-256, base64url. */
async function plantCode(email: string, code: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(code),
	);
	store.db.verification.push({
		id: `v-${email}`,
		identifier: `sign-in-otp-${email}`,
		value: `${Buffer.from(digest).toString("base64url")}:0`,
		expiresAt: new Date(Date.now() + 60_000),
		createdAt: new Date(),
		updatedAt: new Date(),
	});
}

beforeEach(() => {
	store.db = {
		user: [],
		session: [],
		account: [],
		verification: [],
		rateLimit: [],
	};
	store.mailed = [];
	store.bot = false;
	process.env.RESEND_API_KEY = "test-key";
	auth = makeAuth();
});

afterEach(() => {
	delete process.env.RESEND_API_KEY;
	vi.useRealTimers();
});

describe("a new address", () => {
	it("is mailed a six-digit code, stored hashed", async () => {
		expect((await send("aiman@outlook.com")).status).toBe(200);
		expect(store.mailed).toHaveLength(1);
		expect(lastCode()).toMatch(/^\d{6}$/);
		expect(String(store.db.verification[0].value)).not.toContain(lastCode());
	});

	it("becomes a verified CUSTOMER with no name yet", async () => {
		await send("aiman@outlook.com");
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(200);
		expect(store.db.user).toHaveLength(1);
		expect(store.db.user[0]).toMatchObject({
			email: "aiman@outlook.com",
			// Asked for on the next screen, by its own route.
			name: "",
			role: "CUSTOMER",
			emailVerified: true,
		});
		expect(store.db.session).toHaveLength(1);
		expect(store.db.account).toHaveLength(0);
	});

	it("cannot post its own role, name or picture", async () => {
		await send("aiman@outlook.com");
		for (const extra of [
			{ role: "SUPERADMIN" },
			{ name: "Boss" },
			{ image: "https://evil.example/a.png" },
		]) {
			const res = await post(SIGN_IN_PATH, {
				email: "aiman@outlook.com",
				otp: lastCode(),
				...extra,
			});
			expect(res.status).toBe(403);
		}
		expect(store.db.user).toHaveLength(0);
	});
});

describe("one address is one account", () => {
	it("whatever case it is typed in", async () => {
		await send("Aiman@Outlook.com");
		expect((await signIn("AIMAN@outlook.com", lastCode())).status).toBe(200);
		await send("aiman@outlook.com");
		expect((await signIn("aiman@OUTLOOK.com", lastCode())).status).toBe(200);
		expect(store.db.user).toHaveLength(1);
		expect(store.db.user[0].email).toBe("aiman@outlook.com");
	});

	it("and a padded address is refused rather than made a second one", async () => {
		expect((await send(" aiman@outlook.com ")).status).toBe(400);
		expect(store.mailed).toHaveLength(0);
	});
});

describe("staff", () => {
	it("are sent nothing, and the stored code is dropped", async () => {
		plant("boss@x.com", "ADMIN");
		expect((await send("boss@x.com")).status).toBe(200);
		expect(store.mailed).toHaveLength(0);
		expect(store.db.verification).toHaveLength(0);
	});

	it("cannot sign in with a code that exists anyway", async () => {
		plant("boss@x.com", "SUPERADMIN");
		await plantCode("boss@x.com", "123456");
		const res = await signIn("boss@x.com", "123456");
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(0);
	});

	// Promoted between asking for the code and typing it.
	it("cannot use a code they were mailed as a customer", async () => {
		plant("ali@x.com", "CUSTOMER");
		await send("ali@x.com");
		store.db.user[0].role = "ADMIN";
		const res = await signIn("ali@x.com", lastCode());
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(0);
	});

	// Each refusal is pinned on its own: together, one would hide the other.
	it("are refused by the request hook itself, before the plugin runs", async () => {
		plant("boss@x.com", "ADMIN");
		plant("cust@x.com", "CUSTOMER");
		const ask = (email: string) =>
			emailCodeBeforeHook({
				path: SIGN_IN_PATH,
				body: { email, otp: "123456" },
			} as never);
		await expect(ask("Boss@X.com")).rejects.toMatchObject({
			body: { code: "INVALID_OTP" },
		});
		await expect(ask("cust@x.com")).resolves.toBeUndefined();
		await expect(ask("new@x.com")).resolves.toBeUndefined();
	});

	it("are refused where the session is made, without the request hook", async () => {
		auth = makeAuth({ beforeHook: false });
		plant("boss@x.com", "ADMIN");
		await plantCode("boss@x.com", "123456");
		const res = await signIn("boss@x.com", "123456");
		expect(res.status).toBe(400);
		expect(store.db.session).toHaveLength(0);
	});
});

describe("the send response says nothing about the address", () => {
	it("is identical for new, customer, staff and capped addresses", async () => {
		plant("cust@x.com", "CUSTOMER");
		plant("boss@x.com", "ADMIN");
		for (let i = 0; i < 3; i++) await send("capped@x.com");
		const answers = [];
		for (const email of [
			"new@x.com",
			"cust@x.com",
			"boss@x.com",
			"capped@x.com",
		]) {
			const res = await send(email);
			answers.push([res.status, await res.text()]);
		}
		expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
		expect(answers[0]).toEqual([200, '{"success":true}']);
	});
});

describe("the per-address cap", () => {
	it("mails three codes an hour and drops the fourth", async () => {
		for (let i = 0; i < 4; i++) await send("aiman@outlook.com");
		expect(store.mailed).toHaveLength(3);
		// The fourth request's code is not left to be guessed at.
		expect(store.db.verification).toHaveLength(0);
	});

	it("starts again an hour after the first", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		for (let i = 0; i < 4; i++) await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T01:00:01Z"));
		await send("aiman@outlook.com");
		expect(store.mailed).toHaveLength(4);
	});

	it("is per address", async () => {
		for (let i = 0; i < 4; i++) await send("a@x.com");
		await send("b@x.com");
		expect(store.mailed.filter((m) => m.to === "b@x.com")).toHaveLength(1);
	});
});

describe("the code", () => {
	it("refuses a wrong one and still takes the right one", async () => {
		await send("aiman@outlook.com");
		const wrong = lastCode() === "000000" ? "000001" : "000000";
		const res = await signIn("aiman@outlook.com", wrong);
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect((await signIn("aiman@outlook.com", lastCode())).status).toBe(200);
	});

	it("works once", async () => {
		await send("aiman@outlook.com");
		await signIn("aiman@outlook.com", lastCode());
		const again = await signIn("aiman@outlook.com", lastCode());
		expect(again.status).toBe(400);
		expect(await codeOf(again)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(1);
	});

	it("expires after ten minutes", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T00:10:01Z"));
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("OTP_EXPIRED");
	});

	it("is still good at nine minutes", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T00:09:00Z"));
		expect((await signIn("aiman@outlook.com", lastCode())).status).toBe(200);
	});

	it("is dead after three wrong tries, even for the right code", async () => {
		await send("aiman@outlook.com");
		const wrong = lastCode() === "000000" ? "000001" : "000000";
		for (let i = 0; i < 3; i++) {
			expect(await codeOf(await signIn("aiman@outlook.com", wrong))).toBe(
				"INVALID_OTP",
			);
		}
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(403);
		expect(await codeOf(res)).toBe("TOO_MANY_ATTEMPTS");
		expect(store.db.session).toHaveLength(0);
	});

	// Asked twice, then typed the first mail's code: only the newest counts,
	// and the mistake costs one try, not the code.
	it("refuses an older code once a newer one was sent", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		const first = lastCode();
		// The form's own wait. The plugin picks the newest row by time.
		vi.setSystemTime(new Date("2026-10-08T00:00:31Z"));
		await send("aiman@outlook.com");
		const second = lastCode();
		// One time in a million the two codes are the same number.
		if (first !== second) {
			const res = await signIn("aiman@outlook.com", first);
			expect(res.status).toBe(400);
			expect(await codeOf(res)).toBe("INVALID_OTP");
		}
		expect((await signIn("aiman@outlook.com", second)).status).toBe(200);
	});
});

describe("the plugin's other routes", () => {
	it.each(CLOSED_PATHS)("%s is closed", async (path) => {
		const res = await post(path, {
			email: "aiman@outlook.com",
			otp: "123456",
			password: "a-long-enough-password",
			newEmail: "b@x.com",
			type: "sign-in",
		});
		expect(res.status).toBe(404);
	});

	it.each(["email-verification", "forget-password", "change-email"])(
		"a %s code is not sent",
		async (type) => {
			const res = await post(SEND_PATH, { email: "aiman@outlook.com", type });
			expect(res.status).toBe(403);
			expect(await codeOf(res)).toBe("EMAIL_CODE_ROUTE_REFUSED");
			expect(store.db.verification).toHaveLength(0);
		},
	);

	// What a plugin upgrade's new route would meet. The hook is asked directly
	// because a path the router does not know never reaches a hook.
	it.each(["/email-otp/some-new-route", "/sign-in/email-otp/extra"])(
		"%s is refused",
		async (path) => {
			await expect(
				emailCodeBeforeHook({ path, body: {} } as never),
			).rejects.toMatchObject({ body: { code: "EMAIL_CODE_ROUTE_REFUSED" } });
		},
	);

	it("leaves every other route alone", async () => {
		await expect(
			emailCodeBeforeHook({ path: "/sign-in/social", body: {} } as never),
		).resolves.toBeUndefined();
		await expect(
			emailCodeBeforeHook({ path: undefined, body: {} } as never),
		).resolves.toBeUndefined();
	});
});

describe("abuse", () => {
	it("refuses a bot before anything is stored or mailed", async () => {
		store.bot = true;
		const res = await send("aiman@outlook.com");
		expect(res.status).toBe(403);
		expect(store.db.verification).toHaveLength(0);
		expect(store.mailed).toHaveLength(0);
	});

	it("limits one network across addresses, counted in the database", async () => {
		auth = makeAuth({ rateLimit: true });
		for (let i = 0; i < SENDS_PER_NETWORK; i++) {
			expect((await send(`a${i}@x.com`)).status).toBe(200);
		}
		expect((await send("one-more@x.com")).status).toBe(429);
		expect(
			store.db.rateLimit.some((r) => String(r.key).endsWith(`|${SEND_PATH}`)),
		).toBe(true);
	});
});

describe("Google joining an existing account", () => {
	/** What the OAuth callback does once Google has answered. */
	const arrive = async (email: string, emailVerified: boolean) =>
		handleOAuthUserInfo({ context: await auth.$context } as never, {
			userInfo: { id: "g-1", email, name: "Aiman", emailVerified },
			account: { providerId: "google", accountId: "g-1" },
			callbackURL: "/",
		});

	const codeCustomer = async () => {
		await send("aiman@outlook.com");
		await signIn("aiman@outlook.com", lastCode());
	};

	it("links when Google says the email is verified", async () => {
		await codeCustomer();
		const result = await arrive("Aiman@Outlook.com", true);
		expect(result.error).toBeNull();
		expect(store.db.user).toHaveLength(1);
		expect(store.db.account).toMatchObject([
			{ providerId: "google", userId: store.db.user[0].id },
		]);
	});

	it("is refused when Google does not", async () => {
		await codeCustomer();
		const result = await arrive("aiman@outlook.com", false);
		expect(result.error).toBe("account not linked");
		expect(store.db.user).toHaveLength(1);
		expect(store.db.account).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeWiring.test.ts`
Expected: FAIL, the suite cannot load: `Cannot find module '@/lib/auth/emailCodeHooks'`.

- [ ] **Step 3: Write the hooks**

Create `src/lib/auth/emailCodeHooks.ts`:

```ts
import "server-only";
import { APIError, type createAuthMiddleware } from "better-auth/api";
import { checkBotId } from "botid/server";
import {
	codeRequest,
	mayUseCode,
	SIGN_IN_PATH,
} from "@/lib/auth/emailCodeRules";
import { prisma } from "@/lib/catalogue/db";

/** The context Better Auth hands a `hooks.before` body. */
type HookContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

/**
 * What a wrong code gets, word for word. A staff address must not be told
 * apart from a customer who mistyped.
 */
const invalidCode = () =>
	new APIError("BAD_REQUEST", { code: "INVALID_OTP", message: "Invalid OTP" });

/**
 * `hooks.before` for the email-code plugin: the allow-list, BotID on the
 * request that makes us send mail, and the first refusal of staff. Whether a
 * code is actually mailed is decided later, in `sendSignInCode`, after the
 * response has gone — so nothing here may answer differently by address.
 */
export async function emailCodeBeforeHook(ctx: HookContext): Promise<void> {
	const kind = codeRequest(ctx.path, ctx.body);
	if (kind === "ignore") return;
	if (kind === "refuse") {
		throw new APIError("FORBIDDEN", {
			code: "EMAIL_CODE_ROUTE_REFUSED",
			message: "Route not allowed",
		});
	}
	if (kind === "send") {
		// A server-side call has no request and no browser to challenge.
		if (ctx.request && (await checkBotId()).isBot) {
			throw new APIError("FORBIDDEN", {
				code: "EMAIL_CODE_BOT",
				message: "Request refused",
			});
		}
		return;
	}
	// Even with a correct code: one may exist from before a promotion.
	const email = String((ctx.body as { email?: unknown }).email).toLowerCase();
	const row = await prisma.user.findUnique({
		where: { email },
		select: { role: true },
	});
	if (!mayUseCode(row)) throw invalidCode();
}

/**
 * `databaseHooks.session.create.before`: the same rule a third time, where
 * the session row is made, so it holds even if the hook above is ever
 * bypassed. Thrown, not `return false`: the plugin does not check for a
 * refused session and would answer 500.
 */
export async function refuseStaffCodeSession(
	session: { userId: string },
	ctx: { path?: string } | null,
): Promise<void> {
	if (ctx?.path !== SIGN_IN_PATH) return;
	const row = await prisma.user.findUnique({
		where: { id: session.userId },
		select: { role: true },
	});
	// No row is refused too: here the account always exists already.
	if (row?.role !== "CUSTOMER") throw invalidCode();
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeWiring.test.ts`
Expected: PASS, 37 tests.

- [ ] **Step 5: Prove the two staff refusals are each pinned**

Layered guards hide each other: with both in place, breaking one changes nothing a customer could see. Check each test bites, then undo.

In `emailCodeHooks.ts`, temporarily change `if (!mayUseCode(row)) throw invalidCode();` to `void row;`. Run the test file.
Expected: exactly one failure, `are refused by the request hook itself, before the plugin runs`.

Restore the line. Temporarily change `if (row?.role !== "CUSTOMER") throw invalidCode();` to `void row;`. Run again.
Expected: exactly one failure, `are refused where the session is made, without the request hook`.

Restore the line. Run again. Expected: PASS, 37 tests.

- [ ] **Step 6: Make sure the passkey wiring still holds**

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyWiring.test.ts src/lib/auth/__tests__/passkeyHooks.test.ts`
Expected: PASS. Nothing in those files changed; this is the baseline for Task 4, which touches the slot they share.

- [ ] **Step 7: Lint and commit**

```bash
pnpm exec biome check src/lib/auth/emailCodeHooks.ts src/lib/auth/__tests__/emailCodeWiring.test.ts
```

```bash
git add src/lib/auth/emailCodeHooks.ts src/lib/auth/__tests__/emailCodeWiring.test.ts
```

```bash
git commit -m "feat(auth): guards for the email-code plugin, tested on the real plugin" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 4: Wire it into the app

**Files:**
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/auth/client.ts`
- Modify: `src/instrumentation-client.ts`
- Test: `src/lib/auth/__tests__/emailCodeConfig.test.ts` (new)

**Interfaces:**
- Consumes: everything Tasks 1 to 3 produce; `after` from `next/server` (already imported in `auth.ts`).
- Produces:
  - On `authClient` (`@/lib/auth/client`): `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })` and `authClient.signIn.emailOtp({ email, otp })`, each resolving `{ data, error }` where `error` is `{ status: number; code?: string; message?: string } | null`. Task 9's form calls both.
  - Live routes `POST /api/auth/email-otp/send-verification-otp` and `POST /api/auth/sign-in/email-otp`.

`lib/auth.ts` cannot be imported in a test (it opens a database), and Task 3's test builds its own instance. So the wiring of the real file is checked by reading it as text, the way `coverage.test.ts` reads the admin routes. The test collapses whitespace first, so formatting does not matter but the code's shape does.

BotID needs both halves at the same level: the server check (`emailCodeBeforeHook`, Task 3) and the path in `instrumentation-client.ts`. The path listed there must be the one the browser actually requests, `/api/auth/email-otp/send-verification-otp` with the `/api/auth` prefix. A path checked on the server and not listed in the client refuses every real visitor. Locally `checkBotId` answers "human".

- [ ] **Step 1: Write the failing test**

Create `src/lib/auth/__tests__/emailCodeConfig.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `emailCodeWiring.test.ts` proves the hooks against the real plugin, on an
 * instance it builds itself. This is the other half: that `lib/auth.ts` — which
 * cannot be imported here, it opens a database — is wired the same way. Read
 * as text, like `coverage.test.ts` reads the admin routes.
 */
const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8").replace(/\s+/g, " ");

const auth = read("../../auth.ts");

describe("lib/auth.ts", () => {
	it.each([
		["closes the plugin's other seven routes", "...CLOSED_PATHS,"],
		["keeps password sign-up closed", '"/sign-up/email",'],
		[
			"keeps role out of request bodies",
			'role: { type: "string", input: false,',
		],
		["sends six digits", "otpLength: 6,"],
		["for ten minutes", "expiresIn: CODE_TTL_S,"],
		["with three tries", "allowedAttempts: CODE_ATTEMPTS,"],
		["stored hashed", 'storeOTP: "hashed",'],
		["counts rate limits in the database", 'storage: "database",'],
		[
			"limits code requests per network",
			"[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },",
		],
		["trusts no provider's word past its own", "trustedProviders: []"],
		[
			"runs both request guards in the one before slot",
			"before: createAuthMiddleware(async (ctx) => { await emailCodeBeforeHook(ctx); await passkeyBeforeHook(ctx); }),",
		],
		[
			"refuses a staff code session before stamping a passkey one",
			"before: async (session, ctx) => { await refuseStaffCodeSession(session, ctx); return verifiedIfPasskeySession(session, ctx); },",
		],
		[
			"schedules the mail instead of awaiting it",
			"after(() => sendSignInCode(email, otp).catch(",
		],
		["mails sign-in codes only", 'if (type !== "sign-in") return;'],
	])("%s", (_label, needle) => {
		expect(auth).toContain(needle);
	});

	it("never awaits the mail", () => {
		expect(auth).not.toContain("await sendSignInCode");
	});

	it("keeps nextCookies last", () => {
		expect(auth).toMatch(/emailOTP\(\{.*\}\), nextCookies\(\), \], \}\);\s*$/);
	});
});

describe("the browser side", () => {
	it("has the plugin's client", () => {
		expect(read("../client.ts")).toContain("emailOTPClient(),");
	});

	it("asks BotID to guard the send-code request", () => {
		expect(read("../../../instrumentation-client.ts")).toContain(
			'{ path: "/api/auth/email-otp/send-verification-otp", method: "POST" },',
		);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/emailCodeConfig.test.ts`
Expected: FAIL, 15 of 18 with `expected '…' to contain '…'`. The three that pass are `keeps password sign-up closed`, `keeps role out of request bodies` and `never awaits the mail`, which are already true.

- [ ] **Step 3: Wire `lib/auth.ts`**

The two composed slots are the point of this step. `hooks.before` held `passkeyBeforeHook` alone and `session.create.before` held `verifiedIfPasskeySession` alone; each now runs the email-code guard first and the passkey one second. Neither guard does anything on a path that is not its own.

In `src/lib/auth.ts`:

```diff
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -4,9 +4,22 @@
 import { prismaAdapter } from "better-auth/adapters/prisma";
 import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
 import { nextCookies } from "better-auth/next-js";
-import { twoFactor } from "better-auth/plugins";
+import { emailOTP, twoFactor } from "better-auth/plugins";
 import { after } from "next/server";
 import {
+	emailCodeBeforeHook,
+	refuseStaffCodeSession,
+} from "@/lib/auth/emailCodeHooks";
+import { sendSignInCode } from "@/lib/auth/emailCodeMail";
+import {
+	CLOSED_PATHS,
+	CODE_ATTEMPTS,
+	CODE_TTL_S,
+	SEND_PATH,
+	SEND_WINDOW_S,
+	SENDS_PER_NETWORK,
+} from "@/lib/auth/emailCodeRules";
+import {
 	assertPasskeyOwner,
 	passkeyAfterHook,
 	passkeyBeforeHook,
@@ -22,13 +35,17 @@
 /**
  * One door, gated by who created the row — not by which provider they used.
  *
- * Customers arrive through Google, self-service. Staff sign in with either
- * Google or the password a superadmin set for them, on an account a
- * superadmin created (or promoted from an existing customer row) — public
- * sign-up can only ever produce a CUSTOMER, so there is no code path by
- * which a customer account grants itself a role. A staff row promoted from
- * an existing customer keeps only the sign-in it already had (Google), since
- * the promotion sets no password — see `POST /api/admin/users`.
+ * Customers arrive self-service: through Google, or a six-digit code mailed
+ * to any address (`emailOTP` below — never a password). Staff sign in with either Google or the password a superadmin
+ * set for them, on an account a superadmin created (or promoted from an
+ * existing customer row) — public sign-up can only ever produce a CUSTOMER,
+ * so there is no code path by which a customer account grants itself a role.
+ * Staff can never use a mailed code: it would be a way round both the
+ * password and the authenticator. That is refused three times over — when
+ * the code would be mailed, when it is presented, and when the session is
+ * made (`lib/auth/emailCodeHooks.ts`, `emailCodeMail.ts`). So a promoted
+ * customer row with no Google sign-in is given an invite password — see
+ * `POST /api/admin/users`.
  *
  * `input: false` on every field below is the load-bearing line. Without it a
  * crafted sign-up body could post its own `role`, and the whole model is one
@@ -49,8 +66,8 @@
  */
 export const auth = betterAuth({
 	database: prismaAdapter(prisma, { provider: "postgresql" }),
-	// Nobody signs themselves up with a password: customers use Google, and
-	// staff passwords are set by a superadmin's invite. Left open, a stranger
+	// Nobody signs themselves up with a password: customers use a provider or
+	// a mailed code, and staff passwords are set by a superadmin's invite. Left open, a stranger
 	// could register a password on a future colleague's address and ride the
 	// invite's promotion into the admin surface. `disabledPaths` closes the
 	// HTTP route only — the invite and the seed call `auth.api.signUpEmail`
@@ -59,9 +76,11 @@
 	// `/two-factor/disable`: a second factor a staff member can switch off
 	// with the password alone is not a second factor. Only a superadmin's
 	// Reset 2FA (`lib/auth/resetTwoFactor.ts`) removes one.
-	// Session management: the app calls none of these, and a Google-only
-	// session could otherwise list the owner's session rows or sign the owner
-	// out of every other device.
+	// Session management: the app calls none of these, and a session that
+	// has not passed the passkey step could otherwise list the owner's session
+	// rows or sign the owner out of every other device.
+	// `CLOSED_PATHS`: the email-code plugin registers nine routes and the app
+	// uses two. Two of the other seven would put a password on a customer row.
 	disabledPaths: [
 		"/sign-up/email",
 		"/two-factor/disable",
@@ -70,7 +89,24 @@
 		"/revoke-sessions",
 		"/revoke-other-sessions",
 		"/update-session",
+		...CLOSED_PATHS,
 	],
+	// Counted in Postgres. The default is memory, which on a serverless
+	// deployment is one counter per instance and so no limit at all.
+	// The send-code rule is the per-network half of the code limits; the
+	// per-address half is `takeSendSlot` (`lib/auth/emailCodeMail.ts`), whose
+	// rows share this table — see `SEND_WINDOW_S` before shortening the window.
+	rateLimit: {
+		storage: "database",
+		customRules: {
+			[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },
+		},
+	},
+	// One email is one account, joined only when both sides proved the
+	// address: Better Auth links Google to an existing row only if Google
+	// reports the email verified and our row is verified too. That is its
+	// default; this line is here so that no provider is ever trusted past it.
+	account: { accountLinking: { trustedProviders: [] } },
 	emailAndPassword: {
 		enabled: true,
 		// See the module comment above: this is the line that stops a staff
@@ -145,20 +181,30 @@
 		},
 	},
 	hooks: {
+		// One slot, two guards, each ignoring every path that is not its own.
 		// Every passkey write goes through `checkPasskeyRequest` first — see
-		// that function for why the plugin's defaults are not enough.
-		before: createAuthMiddleware(passkeyBeforeHook),
+		// that function for why the plugin's defaults are not enough — and
+		// every email-code request through `emailCodeBeforeHook`.
+		before: createAuthMiddleware(async (ctx) => {
+			await emailCodeBeforeHook(ctx);
+			await passkeyBeforeHook(ctx);
+		}),
 		after: createAuthMiddleware(passkeyAfterHook),
 	},
 	databaseHooks: {
 		session: {
 			create: {
-				before: verifiedIfPasskeySession,
+				// The refusal first: it throws, and nothing is stamped on a
+				// session that will not exist.
+				before: async (session, ctx) => {
+					await refuseStaffCodeSession(session, ctx);
+					return verifiedIfPasskeySession(session, ctx);
+				},
 				// Stamped on session creation rather than on each request:
 				// /admin/users wants "has anyone used this account lately", not a
 				// precise last-seen, and a write per request would be a write per
 				// page view. This fires for every path that creates a session —
-				// credential sign-in and Google sign-in alike, both funnel through
+				// credential, provider and code sign-in alike, all funnel through
 				// the same `internalAdapter.createSession` — so a Google-only
 				// staff member's row updates too.
 				//
@@ -204,6 +250,25 @@
 				},
 			},
 		}),
+		emailOTP({
+			otpLength: 6,
+			expiresIn: CODE_TTL_S,
+			allowedAttempts: CODE_ATTEMPTS,
+			storeOTP: "hashed",
+			// Scheduled, not awaited, for `sendResetPassword`'s reason: Better
+			// Auth awaits this callback, and whether a code is mailed depends on
+			// who the address belongs to, so awaiting would let response time
+			// tell a requester who is staff. Everything that differs by address
+			// happens inside `sendSignInCode`.
+			sendVerificationOTP: async ({ email, otp, type }) => {
+				if (type !== "sign-in") return;
+				after(() =>
+					sendSignInCode(email, otp).catch((error) =>
+						console.error("Sign-in code not sent", error),
+					),
+				);
+			},
+		}),
 		nextCookies(),
 	],
 });
```

- [ ] **Step 4: Add the client plugin and the BotID path**

In `src/lib/auth/client.ts`:

```diff
--- a/src/lib/auth/client.ts
+++ b/src/lib/auth/client.ts
@@ -1,6 +1,7 @@
 "use client";
 import { passkeyClient } from "@better-auth/passkey/client";
 import {
+	emailOTPClient,
 	inferAdditionalFields,
 	twoFactorClient,
 } from "better-auth/client/plugins";
@@ -11,6 +12,7 @@
 	plugins: [
 		twoFactorClient(),
 		passkeyClient(),
+		emailOTPClient(),
 		// Types `user.role` on the session, as declared in `lib/auth.ts`.
 		inferAdditionalFields({
 			user: { role: { type: "string", input: false } },
```

In `src/instrumentation-client.ts`:

```diff
--- a/src/instrumentation-client.ts
+++ b/src/instrumentation-client.ts
@@ -1,13 +1,17 @@
 import { initBotId } from "botid/client/core";
 
 /**
- * Bot protection for the one public endpoint that writes: checkout. The route
- * calls `checkBotId()` and refuses a script before it becomes an order row an
- * admin has to cancel.
+ * Bot protection for the two public endpoints a script would abuse: checkout,
+ * where the route calls `checkBotId()` and refuses a script before it becomes
+ * an order row an admin has to cancel, and the send-code request, where
+ * `emailCodeBeforeHook` refuses one before it becomes mail to a stranger.
  *
  * Only BotID lives here. Analytics deliberately does not — it loads on idle
  * from `lib/analytics.ts` so it never sits on the landing page's first paint.
  */
 initBotId({
-	protect: [{ path: "/api/orders", method: "POST" }],
+	protect: [
+		{ path: "/api/orders", method: "POST" },
+		{ path: "/api/auth/email-otp/send-verification-otp", method: "POST" },
+	],
 });
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `pnpm vitest run src/lib/auth`
Expected: PASS, every file, including `passkeyWiring.test.ts` and `coverage.test.ts`.

- [ ] **Step 6: Typecheck and lint**

```bash
pnpm typecheck
pnpm exec biome check src/lib/auth.ts src/lib/auth/client.ts src/instrumentation-client.ts src/lib/auth/__tests__/emailCodeConfig.test.ts
```

Expected: both clean. If Biome reorders the imports in `auth.ts`, accept its order (`pnpm exec biome check --write src/lib/auth.ts`) and re-run the config test.

- [ ] **Step 7: Try the two routes by hand**

Restart the dev server (`pnpm dev`): the schema changed in Task 2. Then, with `RESEND_API_KEY` unset:

```bash
curl -s -X POST http://localhost:3000/api/auth/email-otp/send-verification-otp -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"aiman@example.com","type":"sign-in"}'
```

Expected: `{"success":true}`, and the dev server's terminal prints `Sign-in code for aiman@example.com: ` followed by six digits.

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/auth/email-otp/reset-password -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"aiman@example.com","otp":"000000","password":"a-long-enough-password"}'
```

Expected: `404`.

```bash
curl -s -X POST http://localhost:3000/api/auth/email-otp/send-verification-otp -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"aiman@example.com","type":"forget-password"}'
```

Expected: a 403 body with `"code":"EMAIL_CODE_ROUTE_REFUSED"`.

Then send a code for the seeded superadmin's address (`SUPERADMIN_EMAIL` in `.env.local`). Expected: `{"success":true}` again, and no `Sign-in code for` line in the terminal.

- [ ] **Step 8: Commit**

```bash
git add src/lib/auth.ts src/lib/auth/client.ts src/instrumentation-client.ts src/lib/auth/__tests__/emailCodeConfig.test.ts
```

```bash
git commit -m "feat(auth): wire email-code sign-in and database rate limits" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 5: The name: rule, route, and where it is owed

**Files:**
- Create: `src/lib/auth/customerName.ts`
- Test: `src/lib/auth/__tests__/customerName.test.ts`
- Create: `src/app/api/account/name/route.ts`
- Test: `src/app/api/account/name/__tests__/route.test.ts`
- Modify: `src/lib/auth/session.ts`; Test: `src/lib/auth/__tests__/session.test.ts`
- Modify: `src/lib/orders/access.ts`; Test: `src/lib/orders/__tests__/access.test.ts`
- Modify: `src/app/[lang]/verify/page.tsx`; Test: `src/app/[lang]/verify/__tests__/page.test.ts` (new)
- Modify: `src/app/api/orders/route.ts`, `src/app/api/orders/[token]/route.ts`, `src/app/api/orders/[token]/pay/route.ts`, and the `__tests__/route.test.ts` beside each
- Modify: `src/app/api/payments/config/route.ts`; Test: `src/app/api/payments/config/__tests__/route.test.ts`
- Modify: `src/lib/auth/__tests__/coverage.test.ts`

**Interfaces:**
- Consumes: `type Role`; `currentUser(): Promise<AuthUser | null>` from `@/lib/auth/session`; `authEnabled()`; `prisma`.
- Produces:
  - From `@/lib/auth/customerName` (pure, no `server-only`): `customerNameSchema` (Zod string: trimmed, 2 to 80, no hidden characters, not business-posing); `parseCustomerName(input: unknown): { name: string } | { error: "name_required" | "name_refused" }`; `owesName(user: { role: Role; name: string | null }): boolean`.
  - `AuthUser.mustSetName?: boolean`, set by `currentUser()` on every read. Absent means not owed.
  - `POST /api/account/name`, body `{ name }`. Answers `200 { ok: true }`; `401 { error: "sign_in_required" }` signed out; `403 { error: "forbidden" }` for staff; `409 { error: "name_set" }` for a customer who already has a name; `400 { error: "name_required" | "name_refused" }`.
  - `viewerOf` redirects a customer who owes a name to `/${lang}/welcome?next=<path>`, before its passkey redirect. The verify page does the same. The three order routes answer `401 { error: "name_required" }` before their `passkey_required` check.
  - `GET /api/payments/config` adds `nameRequired: boolean` beside `passkeyRequired`.

A code sign-in creates the row with `name: ""` (Task 3 pins that). This task is what makes an empty name mean something: the row owes one, and until it is given the account is stopped in every place an account that owes a passkey is stopped, and first, because the device's passkey prompt shows the name. `/[lang]/welcome` itself is built in Task 9; between this task and that one the redirects point at a page that is not there yet.

`mustSetName` is checked beside `authEnabled()` in the order routes for the same reason `mustVerifyPasskey` is: with `AUTH_ENABLED=false` checkout must keep working locally. The name route has no such bypass. It reads `currentUser()` only, with no demo-customer fallback, so with auth off and nobody signed in it answers 401.

- [ ] **Step 1: Write the rule's failing test**

Create `src/lib/auth/__tests__/customerName.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	customerNameSchema,
	owesName,
	parseCustomerName,
} from "@/lib/auth/customerName";

describe("parseCustomerName", () => {
	it.each([
		["a plain name", "Aiman bin Ali", "Aiman bin Ali"],
		["surrounding spaces", "  Aiman bin Ali \n", "Aiman bin Ali"],
		["a two-letter name", "Li", "Li"],
		["Chinese", "李明", "李明"],
		["Jawi", "أيمن بن علي", "أيمن بن علي"],
		["Tamil", "அருண் குமார்", "அருண் குமார்"],
		["an emoji", "Aiman 🙂", "Aiman 🙂"],
		// Built with a zero-width joiner, which is why that one is allowed.
		["a joined emoji", "Mei 👩‍👧", "Mei 👩‍👧"],
		["an apostrophe and a slash", "Siti a/p D'Cruz", "Siti a/p D'Cruz"],
		["exactly 80 characters", "a".repeat(80), "a".repeat(80)],
		["a name that only contains admin", "Badminton Lee", "Badminton Lee"],
		["a name that only contains support", "Lee Supporter", "Lee Supporter"],
	])("accepts %s, stored as typed and trimmed", (_label, typed, stored) => {
		expect(parseCustomerName(typed)).toEqual({ name: stored });
	});

	it.each([
		["nothing", ""],
		["only spaces", "   "],
		["one letter", "A"],
		["one letter and spaces", "  A  "],
		["no value", undefined],
		["null", null],
		["a number", 42],
		["an object", { name: "Aiman" }],
	])("asks for a name when given %s", (_label, typed) => {
		expect(parseCustomerName(typed)).toEqual({ error: "name_required" });
	});

	it.each([
		["81 characters", "a".repeat(81)],
		["a line break inside", "Aiman\nAli"],
		["a tab inside", "Aiman\tAli"],
		["a NUL", "Aiman\u0000Ali"],
		["a right-to-left override", "Aiman‮ilA"],
		["a left-to-right embedding", "‪Aiman"],
		["a directional isolate", "Aiman⁦Ali⁩"],
		["the business", "EzCabinet"],
		["the business, spaced", "Ez Cabinet Sdn Bhd"],
		["the business, dotted", "ez.cabinet"],
		["the business, full-width", "ＥｚＣａｂｉｎｅｔ"],
		["the business inside a name", "Aiman from EZCABINET"],
		["admin", "admin"],
		["Admin with more", "Administrator Aiman"],
		["support", "Support"],
		["support with more", "support team"],
	])("refuses %s", (_label, typed) => {
		expect(parseCustomerName(typed)).toEqual({ error: "name_refused" });
	});

	it("is the schema's own verdict", () => {
		expect(customerNameSchema.safeParse(" Aiman ").data).toBe("Aiman");
		expect(customerNameSchema.safeParse("A").success).toBe(false);
	});
});

describe("owesName", () => {
	it.each([
		["a code customer with no name yet", "CUSTOMER", "", true],
		["a customer whose name is only spaces", "CUSTOMER", "   ", true],
		["a customer with a null name", "CUSTOMER", null, true],
		["a customer with a name", "CUSTOMER", "Aiman", false],
		// Staff are named by the invite; a blank one must not lock them out.
		["an admin with no name", "ADMIN", "", false],
		["a superadmin with no name", "SUPERADMIN", "", false],
	] as const)("%s", (_label, role, name, expected) => {
		expect(owesName({ role, name })).toBe(expected);
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/customerName.test.ts`
Expected: FAIL, the suite cannot load: `Cannot find module '@/lib/auth/customerName'`.

- [ ] **Step 3: Write the rule**

Create `src/lib/auth/customerName.ts`:

```ts
import { z } from "zod";
import type { Role } from "@/lib/auth/permissions";

/**
 * Control characters, and the Unicode direction overrides and isolates
 * (U+202A–202E, U+2066–2069). A name carrying one can reorder the text
 * around it on a staff screen or in a mail. The zero-width joiner is not
 * here on purpose: emoji are built with it.
 */
const HIDDEN = /[\p{Cc}‪-‮⁦-⁩]/u;

/**
 * A name that would read as the business on a staff screen or in a mail:
 * anything containing "ezcabinet" however it is spaced, or starting with
 * "admin" or "support".
 */
function posesAsBusiness(name: string): boolean {
	const plain = name.normalize("NFKC").toLowerCase();
	return (
		plain.replace(/[\s._-]+/g, "").includes("ezcabinet") ||
		/^(admin|support)/.test(plain)
	);
}

/**
 * The name a customer gives after their first code sign-in. It labels the
 * account and pre-fills checkout; it is not unique, not a credential, and
 * never identifies a caller. Any script is fine — it is stored as typed,
 * trimmed.
 */
export const customerNameSchema = z
	.string()
	.trim()
	.min(2)
	.max(80)
	.refine((name) => !HIDDEN.test(name) && !posesAsBusiness(name));

/**
 * The schema's verdict as the two answers the customer can be given:
 * `name_required` ("Enter your name.") for nothing or too little, and
 * `name_refused` ("Use your own name.") for everything else.
 */
export function parseCustomerName(
	input: unknown,
): { name: string } | { error: "name_required" | "name_refused" } {
	const parsed = customerNameSchema.safeParse(input);
	if (parsed.success) return { name: parsed.data };
	const short = parsed.error.issues.some(
		(issue) => issue.code === "too_small" || issue.code === "invalid_type",
	);
	return { error: short ? "name_required" : "name_refused" };
}

/**
 * Whether this account still has to give a name before it counts as a
 * signed-in customer. Only a code sign-in makes a row without one: Google
 * arrives with a name, and an invite types one.
 */
export function owesName(user: { role: Role; name: string | null }): boolean {
	return user.role === "CUSTOMER" && (user.name ?? "").trim() === "";
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/customerName.test.ts`
Expected: PASS, 43 tests.

- [ ] **Step 5: Write the failing tests for the flag and the route**

In `src/lib/auth/__tests__/session.test.ts`:

```diff
--- a/src/lib/auth/__tests__/session.test.ts
+++ b/src/lib/auth/__tests__/session.test.ts
@@ -32,6 +32,7 @@
 	disabled: false,
 	mustChangePassword: false,
 	mustSetupTwoFactor: false,
+	mustSetName: false,
 	mustVerifyPasskey: false,
 	passkeyVerifiedAt: null,
 };
@@ -181,4 +182,19 @@
 			mustVerifyPasskey: false,
 		});
 	});
+
+	it.each([
+		["a code customer who has not given a name", "CUSTOMER", "", true],
+		["a customer with a name", "CUSTOMER", "Aiman", false],
+		["staff, whatever their name", "ADMIN", "", false],
+	])("mustSetName for %s", async (_label, role, name, expected) => {
+		getSession.mockResolvedValue({
+			user: { id: "u1" },
+			session: { passkeyVerified: false },
+		});
+		findUnique.mockResolvedValue({ ...row, role, name });
+		await expect(currentUser()).resolves.toMatchObject({
+			mustSetName: expected,
+		});
+	});
 });
```

Create `src/app/api/account/name/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { update } } }));

const { POST } = await import("../route");

const nameless = (over: Partial<AuthUser> = {}): AuthUser => ({
	id: "c1",
	email: "aiman@outlook.com",
	name: "",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: true,
	mustSetName: true,
	...over,
});

const post = (body: unknown) =>
	POST(
		new Request("http://x/api/account/name", {
			method: "POST",
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);

beforeEach(() => {
	vi.clearAllMocks();
	currentUser.mockResolvedValue(nameless());
});

describe("POST /api/account/name", () => {
	it("sets the caller's own name, trimmed, and nothing else", async () => {
		const response = await post({
			name: "  Aiman bin Ali ",
			role: "SUPERADMIN",
			email: "boss@x.com",
			id: "someone-else",
		});
		expect(response.status).toBe(200);
		expect(update).toHaveBeenCalledTimes(1);
		expect(update).toHaveBeenCalledWith({
			where: { id: "c1" },
			data: { name: "Aiman bin Ali" },
		});
	});

	it.each([
		["Chinese", "李明"],
		["Jawi", "أيمن بن علي"],
		["an emoji", "Aiman 🙂"],
	])("stores a name in %s as typed", async (_label, name) => {
		expect((await post({ name })).status).toBe(200);
		expect(update.mock.calls[0][0].data).toEqual({ name });
	});

	it("401s a signed-out caller and writes nothing", async () => {
		currentUser.mockResolvedValue(null);
		const response = await post({ name: "Aiman" });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "sign_in_required" });
		expect(update).not.toHaveBeenCalled();
	});

	it.each(["ADMIN", "SUPERADMIN"] as const)(
		"403s %s and writes nothing",
		async (role) => {
			currentUser.mockResolvedValue(
				nameless({ role, mustSetName: false, mustVerifyPasskey: false }),
			);
			expect((await post({ name: "Aiman" })).status).toBe(403);
			expect(update).not.toHaveBeenCalled();
		},
	);

	// No rename: a session that has only signed in must not relabel an account.
	it("409s a customer who already has a name", async () => {
		currentUser.mockResolvedValue(
			nameless({ name: "Aiman", mustSetName: false }),
		);
		const response = await post({ name: "Somebody Else" });
		expect(response.status).toBe(409);
		expect(update).not.toHaveBeenCalled();
	});

	it.each([
		["nothing", { name: "" }, "name_required"],
		["one letter", { name: "A" }, "name_required"],
		["no name key", {}, "name_required"],
		["a body that is not JSON", "not json", "name_required"],
		["a name that is not a string", { name: 42 }, "name_required"],
		["the business", { name: "EzCabinet Support" }, "name_refused"],
		["admin", { name: "admin" }, "name_refused"],
		["a direction override", { name: "Aiman‮ilA" }, "name_refused"],
		["81 characters", { name: "a".repeat(81) }, "name_refused"],
	])("400s %s and writes nothing", async (_label, body, error) => {
		const response = await post(body);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error });
		expect(update).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm vitest run src/lib/auth/__tests__/session.test.ts account/name`
Expected: FAIL. In `session.test.ts`, the three `mustSetName for …` cases and every case that compares against the whole `user` object fail, because `mustSetName` is not in the answer yet. The route's suite cannot load: `Cannot find module '../route'`.

- [ ] **Step 7: Derive the flag**

In `src/lib/auth/session.ts`:

```diff
--- a/src/lib/auth/session.ts
+++ b/src/lib/auth/session.ts
@@ -2,6 +2,7 @@
 import { headers } from "next/headers";
 import type { $Enums } from "@/generated/prisma/client";
 import { auth } from "@/lib/auth";
+import { owesName } from "@/lib/auth/customerName";
 import { needsPasskeyCheck } from "@/lib/auth/passkeyRules";
 import type { Role } from "@/lib/auth/permissions";
 import { needsTwoFactorSetup } from "@/lib/auth/twoFactor";
@@ -20,6 +21,11 @@
 	/** Derived on every read from the session row — see `needsPasskeyCheck`. */
 	mustVerifyPasskey: boolean;
 	/**
+	 * A customer who signed in with a code and has not given a name yet —
+	 * derived on every read, see `owesName`. Absent means not owed.
+	 */
+	mustSetName?: boolean;
+	/**
 	 * When this session passed a passkey authentication, if it ever did —
 	 * what `withAuth`'s `stepUp` reads. Absent means never.
 	 */
@@ -85,6 +91,7 @@
 			hasPassword: accounts.length > 0,
 			twoFactorEnabled: twoFactorEnabled === true,
 		}),
+		mustSetName: owesName(user),
 		mustVerifyPasskey: needsPasskeyCheck({
 			role: user.role,
 			sessionVerified: sessionRow.passkeyVerified === true,
```

- [ ] **Step 8: Write the route**

Create `src/app/api/account/name/route.ts`:

```ts
import { NextResponse } from "next/server";
import { parseCustomerName } from "@/lib/auth/customerName";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/**
 * The name step after a first code sign-in (`/[lang]/welcome`). A code
 * sign-in asks for the address only and the sign-in request is held to
 * `email` and `otp`, so the name arrives here, by itself.
 *
 * It writes `name` on the caller's own row and nothing else, and only while
 * that row has none. There is no rename: nothing in the app offers one, and
 * a session that has signed in but not passed the passkey step must not be
 * able to relabel an account that already has a name.
 *
 * `currentUser()` only: with AUTH_ENABLED off there is no demo-customer
 * fallback here, because the demo customer is already named.
 */
export async function POST(request: Request) {
	const user = await currentUser();
	if (!user) {
		return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
	}
	if (user.role !== "CUSTOMER") {
		return NextResponse.json({ error: "forbidden" }, { status: 403 });
	}
	if (!user.mustSetName) {
		return NextResponse.json({ error: "name_set" }, { status: 409 });
	}
	const body: unknown = await request.json().catch(() => null);
	const parsed = parseCustomerName((body as { name?: unknown } | null)?.name);
	if ("error" in parsed) {
		return NextResponse.json({ error: parsed.error }, { status: 400 });
	}
	await prisma.user.update({
		where: { id: user.id },
		data: { name: parsed.name },
	});
	return NextResponse.json({ ok: true });
}
```

- [ ] **Step 9: Run them to see them pass**

Run: `pnpm vitest run src/lib/auth/__tests__/session.test.ts account/name`
Expected: PASS, 16 tests in `session.test.ts` and 17 in the route's.

- [ ] **Step 10: Write the failing tests for where it is owed**

In `src/lib/orders/__tests__/access.test.ts`:

```diff
--- a/src/lib/orders/__tests__/access.test.ts
+++ b/src/lib/orders/__tests__/access.test.ts
@@ -100,6 +100,32 @@
 		);
 	});
 
+	it("sends a customer with no name to the name step, and back", async () => {
+		currentUser.mockResolvedValue(user({ name: "", mustSetName: true }));
+		await expect(viewerOf("ms", "/ms/order/t1")).rejects.toThrow(
+			"REDIRECT:/ms/welcome?next=%2Fms%2Forder%2Ft1",
+		);
+	});
+
+	// Closed the tab at the name step, came back later: the name is still
+	// asked first, because the passkey prompt shows it.
+	it("asks for the name before the passkey when both are owed", async () => {
+		currentUser.mockResolvedValue(
+			user({ name: "", mustSetName: true, mustVerifyPasskey: true }),
+		);
+		await expect(viewerOf("en", "/en/orders")).rejects.toThrow(
+			"REDIRECT:/en/welcome?next=%2Fen%2Forders",
+		);
+	});
+
+	it("does not ask for a name with AUTH_ENABLED off", async () => {
+		vi.stubEnv("AUTH_ENABLED", "false");
+		currentUser.mockResolvedValue(user({ name: "", mustSetName: true }));
+		await expect(viewerOf("en", "/en/orders")).resolves.toMatchObject({
+			id: "u1",
+		});
+	});
+
 	it("lets a verified customer through", async () => {
 		currentUser.mockResolvedValue(user({}));
 		await expect(viewerOf("en", "/en/orders")).resolves.toMatchObject({
```

Create `src/app/[lang]/verify/__tests__/page.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
const count = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/catalogue/db", () => ({ prisma: { passkey: { count } } }));
vi.mock("next/navigation", () => ({
	notFound: (): never => {
		throw new Error("NOT_FOUND");
	},
	redirect: (url: string): never => {
		throw new Error(`REDIRECT:${url}`);
	},
}));
vi.mock("@/lib/copy/dictionary", () => ({
	getDictionary: async () => ({ passkey: { heading: "h" } }),
}));
vi.mock("../PasskeyGate", () => ({ PasskeyGate: () => null }));

const { default: VerifyPage } = await import("@/app/[lang]/verify/page");

const customer = (over: Partial<AuthUser>): AuthUser => ({
	id: "c1",
	email: "aiman@outlook.com",
	name: "Aiman",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: true,
	mustSetName: false,
	...over,
});

const open = (next?: string) =>
	VerifyPage({
		params: Promise.resolve({ lang: "en" }),
		searchParams: Promise.resolve({ next }),
	});

beforeEach(() => {
	currentUser.mockReset();
	count.mockClear();
});

describe("the passkey step and the name", () => {
	// The device's passkey prompt shows the account's name, so a passkey is
	// never set up on an account that has none.
	it("sends a customer with no name to the name step first, keeping the target", async () => {
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		await expect(open("/en/order/abc")).rejects.toThrow(
			"REDIRECT:/en/welcome?next=%2Fen%2Forder%2Fabc",
		);
		expect(count).not.toHaveBeenCalled();
	});

	it("shows the passkey step to a customer who has a name", async () => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open("/en/order/abc")).resolves.toBeTruthy();
		expect(count).toHaveBeenCalledWith({ where: { userId: "c1" } });
	});

	it("still passes on a customer who owes nothing", async () => {
		currentUser.mockResolvedValue(customer({ mustVerifyPasskey: false }));
		await expect(open("/en/order/abc")).rejects.toThrow(
			"REDIRECT:/en/order/abc",
		);
	});
});
```

In `src/app/api/orders/__tests__/route.test.ts`:

```diff
--- a/src/app/api/orders/__tests__/route.test.ts
+++ b/src/app/api/orders/__tests__/route.test.ts
@@ -71,6 +71,23 @@
 	});
 });
 
+describe("POST /api/orders for a customer who has not given a name", () => {
+	it("401s name_required before the passkey is even asked about", async () => {
+		vi.stubEnv("AUTH_ENABLED", "true");
+		currentUser.mockResolvedValue({
+			id: "u1",
+			role: "CUSTOMER",
+			name: "",
+			mustSetName: true,
+			mustVerifyPasskey: true,
+		});
+		const response = await post();
+		expect(response.status).toBe(401);
+		expect(await response.json()).toEqual({ error: "name_required" });
+		expect(upsert).not.toHaveBeenCalled();
+	});
+});
+
 describe("POST /api/orders terms acceptance", () => {
 	const postBody = (body: unknown) =>
 		POST(
```

In `src/app/api/orders/[token]/__tests__/route.test.ts`:

```diff
--- a/src/app/api/orders/[token]/__tests__/route.test.ts
+++ b/src/app/api/orders/[token]/__tests__/route.test.ts
@@ -132,6 +132,17 @@
 		expect((await edit()).status).toBe(404);
 	});
 
+	it("401s name_required for the owner without a name, writing nothing", async () => {
+		currentUser.mockResolvedValue({
+			...customer("owner"),
+			mustSetName: true,
+		});
+		const response = await edit();
+		expect(response.status).toBe(401);
+		expect(await response.json()).toEqual({ error: "name_required" });
+		expect(orderUpdateMany).not.toHaveBeenCalled();
+	});
+
 	it("401s passkey_required for the owner without a passkey", async () => {
 		currentUser.mockResolvedValue({
 			...customer("owner"),
```

In `src/app/api/orders/[token]/pay/__tests__/route.test.ts`:

```diff
--- a/src/app/api/orders/[token]/pay/__tests__/route.test.ts
+++ b/src/app/api/orders/[token]/pay/__tests__/route.test.ts
@@ -68,6 +68,18 @@
 		expect(startPayment).not.toHaveBeenCalled();
 	});
 
+	it("401s name_required for the owner without a name, starting nothing", async () => {
+		currentUser.mockResolvedValue({
+			...customer("owner"),
+			mustSetName: true,
+			mustVerifyPasskey: true,
+		});
+		const response = await pay();
+		expect(response.status).toBe(401);
+		expect(await response.json()).toEqual({ error: "name_required" });
+		expect(startPayment).not.toHaveBeenCalled();
+	});
+
 	it("401s passkey_required for the owner without a passkey, starting nothing", async () => {
 		currentUser.mockResolvedValue({
 			...customer("owner"),
```

In `src/app/api/payments/config/__tests__/route.test.ts`:

```diff
--- a/src/app/api/payments/config/__tests__/route.test.ts
+++ b/src/app/api/payments/config/__tests__/route.test.ts
@@ -60,6 +60,7 @@
 		expect(await response.json()).toEqual({
 			client: CLIENT,
 			signIn: true,
+			nameRequired: false,
 			passkeyRequired: false,
 		});
 		expect(error).toHaveBeenCalled();
@@ -73,3 +74,30 @@
 		expect(currentUser).not.toHaveBeenCalled();
 	});
 });
+
+describe("GET /api/payments/config, nameRequired", () => {
+	it("is false signed out and for a customer with a name", async () => {
+		currentUser.mockResolvedValue(null);
+		expect((await (await GET()).json()).nameRequired).toBe(false);
+		currentUser.mockResolvedValue(customer(true));
+		expect((await (await GET()).json()).nameRequired).toBe(false);
+	});
+
+	it("is true for a customer who owes a name, beside the passkey", async () => {
+		currentUser.mockResolvedValue({
+			...customer(true),
+			name: "",
+			mustSetName: true,
+		});
+		expect(await (await GET()).json()).toMatchObject({
+			nameRequired: true,
+			passkeyRequired: true,
+		});
+	});
+
+	it("is false with AUTH_ENABLED off", async () => {
+		vi.stubEnv("AUTH_ENABLED", "false");
+		currentUser.mockResolvedValue({ ...customer(false), mustSetName: true });
+		expect((await (await GET()).json()).nameRequired).toBe(false);
+	});
+});
```

In `src/lib/auth/__tests__/coverage.test.ts`:

```diff
--- a/src/lib/auth/__tests__/coverage.test.ts
+++ b/src/lib/auth/__tests__/coverage.test.ts
@@ -171,17 +171,21 @@
 		expect(ungated).toEqual([]);
 	});
 
-	it("checks mustVerifyPasskey in each order route", async () => {
+	it("checks the name and the passkey in each order route", async () => {
 		const routes = (await walk("src/app/api/orders")).filter((f) =>
 			f.endsWith("route.ts"),
 		);
 		expect(routes.length).toBeGreaterThan(1);
 		// Order routes read the signed-in user themselves, outside `viewerOf`.
 		// A new one that forgets the passkey check would pass every other test
-		// and let a Google-only session place or pay for an order.
-		const unchecked = routes.filter(
-			(file) => !readFileSync(file, "utf8").includes("mustVerifyPasskey"),
-		);
+		// and let a session that has only signed in place or pay for an order;
+		// one that forgets the name check lets a nameless account do it.
+		const unchecked = routes.filter((file) => {
+			const source = readFileSync(file, "utf8");
+			return !["mustVerifyPasskey", "mustSetName"].every((flag) =>
+				source.includes(flag),
+			);
+		});
 		expect(unchecked).toEqual([]);
 	});
 });
```

- [ ] **Step 11: Run them to see them fail**

Run: `pnpm vitest run access.test verify/__tests__/page api/orders payments/config coverage`
Expected: FAIL, and only the new cases: the two name cases in `access.test.ts` (`does not ask for a name with AUTH_ENABLED off` passes already); `sends a customer with no name to the name step first` in the verify page's; one `name_required` case in each of the three order route files; `still answers 200 with the gateway` and all three `nameRequired` cases in the config file; and `checks the name and the passkey in each order route`, which lists all three order routes.

- [ ] **Step 12: Enforce it**

In `src/lib/orders/access.ts`:

```diff
--- a/src/lib/orders/access.ts
+++ b/src/lib/orders/access.ts
@@ -23,9 +23,10 @@
 }
 
 /**
- * The signed-in viewer of a customer page, or a trip through Google sign-in
- * that lands back on `path`, or to the passkey step for a customer whose
- * session has not passed one. With AUTH_ENABLED off (local only) the viewer is
+ * The signed-in viewer of a customer page, or a trip through sign-in
+ * that lands back on `path`, or to the name step for a customer who has not
+ * given one, or to the passkey step for a customer whose session has not
+ * passed one. With AUTH_ENABLED off (local only) the viewer is
  * the signed-in account if there is one, else the bypass superadmin.
  */
 export async function viewerOf(lang: string, path: string): Promise<AuthUser> {
@@ -36,7 +37,11 @@
 	if (user === null) {
 		redirect(`/${lang}/sign-in?next=${encodeURIComponent(path)}`);
 	}
-	// A Google session alone is not a signed-in customer: the order's link
+	// The name comes first: it is what the device's passkey prompt will show.
+	if (user.mustSetName) {
+		redirect(`/${lang}/welcome?next=${encodeURIComponent(path)}`);
+	}
+	// A session alone is not a signed-in customer: the order's link
 	// travels over WhatsApp, and so, sometimes, does a phone. The verify page
 	// reads `currentUser()` directly, so this cannot loop.
 	if (user.mustVerifyPasskey) {
```

In `src/app/[lang]/verify/page.tsx` (the two comment changes are because Google is no longer the only way in):

```diff
--- a/src/app/[lang]/verify/page.tsx
+++ b/src/app/[lang]/verify/page.tsx
@@ -6,11 +6,11 @@
 import { isLocale } from "@/lib/copy/locales";
 import { PasskeyGate } from "./PasskeyGate";
 
-/** Never indexed: it exists only between Google sign-in and the page asked for. */
+/** Never indexed: it exists only between sign-in and the page asked for. */
 export const metadata = { robots: { index: false, follow: false } };
 
 /**
- * The second step after Google. Reads `currentUser()` directly rather than
+ * The second step after sign-in. Reads `currentUser()` directly rather than
  * `viewerOf`, which redirects an unverified customer straight back here.
  */
 export default async function VerifyPage({
@@ -30,6 +30,10 @@
 			`/${lang}/sign-in?next=${encodeURIComponent(`/${lang}/verify?next=${encodeURIComponent(target)}`)}`,
 		);
 	}
+	// The name first: it is what the device's passkey prompt will show.
+	if (user.mustSetName) {
+		redirect(`/${lang}/welcome?next=${encodeURIComponent(target)}`);
+	}
 	// Staff, and a customer who has already passed, have nothing to do here.
 	if (!user.mustVerifyPasskey) redirect(target);
 
```

In `src/app/api/orders/route.ts`:

```diff
--- a/src/app/api/orders/route.ts
+++ b/src/app/api/orders/route.ts
@@ -65,8 +65,12 @@
 	if (!user) {
 		return NextResponse.json({ error: "sign_in_required" }, { status: 401 });
 	}
-	// Same boundary as the order pages. `authEnabled()` keeps local checkout
-	// working with AUTH_ENABLED off, where the demo customer never has one.
+	// Same boundary as the order pages, in the same order: the name, then the
+	// passkey. `authEnabled()` keeps local checkout working with AUTH_ENABLED
+	// off, where the demo customer has a name and never a passkey.
+	if (authEnabled() && user.mustSetName) {
+		return NextResponse.json({ error: "name_required" }, { status: 401 });
+	}
 	if (authEnabled() && user.mustVerifyPasskey) {
 		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
 	}
```

In `src/app/api/orders/[token]/route.ts`:

```diff
--- a/src/app/api/orders/[token]/route.ts
+++ b/src/app/api/orders/[token]/route.ts
@@ -22,6 +22,9 @@
 	const { token } = await params;
 	// As at checkout: locally, a signed-out order belongs to the demo customer.
 	const user = (await currentUser()) ?? (await demoCustomer());
+	if (authEnabled() && user?.mustSetName) {
+		return NextResponse.json({ error: "name_required" }, { status: 401 });
+	}
 	if (authEnabled() && user?.mustVerifyPasskey) {
 		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
 	}
```

In `src/app/api/orders/[token]/pay/route.ts`:

```diff
--- a/src/app/api/orders/[token]/pay/route.ts
+++ b/src/app/api/orders/[token]/pay/route.ts
@@ -31,6 +31,9 @@
 ) {
 	const { token } = await params;
 	const viewer = authEnabled() ? await currentUser() : BYPASS_USER;
+	if (authEnabled() && viewer?.mustSetName) {
+		return NextResponse.json({ error: "name_required" }, { status: 401 });
+	}
 	if (authEnabled() && viewer?.mustVerifyPasskey) {
 		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
 	}
```

In `src/app/api/payments/config/route.ts`:

```diff
--- a/src/app/api/payments/config/route.ts
+++ b/src/app/api/payments/config/route.ts
@@ -20,10 +20,15 @@
 	// customer types is lost at the detour. One boolean, no other user data.
 	// A failed user read must not take the gateway down with it (the screen
 	// would fall back to bank transfer): the server's 401 on Pay is the real check.
+	// `nameRequired`: the same for a code customer who has not given a name,
+	// which is asked for first.
 	let passkeyRequired = false;
+	let nameRequired = false;
 	if (authEnabled()) {
 		try {
-			passkeyRequired = (await currentUser())?.mustVerifyPasskey === true;
+			const user = await currentUser();
+			nameRequired = user?.mustSetName === true;
+			passkeyRequired = user?.mustVerifyPasskey === true;
 		} catch (error) {
 			console.error("payments/config: could not read the user", error);
 		}
@@ -34,6 +39,7 @@
 		{
 			client: gateway?.client ?? null,
 			signIn: authEnabled(),
+			nameRequired,
 			passkeyRequired,
 		},
 		{ headers: { "Cache-Control": "no-store" } },
```

- [ ] **Step 13: Run everything this task touched**

Run: `pnpm vitest run src/lib/auth src/lib/orders src/app/api "src/app/\[lang\]/verify"`
Expected: PASS. If the last filter matches nothing in your shell, run `pnpm vitest run verify/__tests__` instead.

- [ ] **Step 14: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm exec biome check src/lib/auth src/lib/orders src/app/api "src/app/[lang]/verify"
```

Expected: both clean.

```bash
git add src/lib/auth/customerName.ts src/lib/auth/__tests__/customerName.test.ts src/app/api/account/name/route.ts src/app/api/account/name/__tests__/route.test.ts src/lib/auth/session.ts src/lib/auth/__tests__/session.test.ts src/lib/orders/access.ts src/lib/orders/__tests__/access.test.ts "src/app/[lang]/verify/page.tsx" "src/app/[lang]/verify/__tests__/page.test.ts" src/app/api/orders/route.ts src/app/api/orders/__tests__/route.test.ts "src/app/api/orders/[token]/route.ts" "src/app/api/orders/[token]/__tests__/route.test.ts" "src/app/api/orders/[token]/pay/route.ts" "src/app/api/orders/[token]/pay/__tests__/route.test.ts" src/app/api/payments/config/route.ts src/app/api/payments/config/__tests__/route.test.ts src/lib/auth/__tests__/coverage.test.ts
```

```bash
git commit -m "feat(auth): a code customer owes a name, enforced where the passkey step is" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 6: The owner hears when the lock changes

**Files:**
- Create: `src/lib/auth/passkeyMail.ts`
- Test: `src/lib/auth/__tests__/passkeyMail.test.ts`
- Modify: `src/lib/auth/inviteMail.ts` (export `esc`)
- Modify: `src/lib/auth/passkeyHooks.ts`; Tests: `src/lib/auth/__tests__/passkeyHooks.test.ts`, `src/lib/auth/__tests__/passkeyWiring.test.ts`
- Modify: `src/app/api/admin/users/[id]/reset-passkey/route.ts`; Test: its `__tests__/route.test.ts`
- Modify: `prisma/resetPasskey.ts`

**Interfaces:**
- Consumes: `sendEmail` (`@/lib/email`, never throws, returns `false` and logs only the subject when mail is not configured); `after` from `next/server`; `WORKSHOP_PHONE` from `@/lib/logistics/carriers`; `process.env.WHATSAPP_SALES_NUMBER`; `passkeyAfterHook`'s existing positive-evidence branch.
- Produces (from `@/lib/auth/passkeyMail`, `server-only`):
  - `type PasskeyChange = "added" | "removed" | "reset"`
  - `sendPasskeyChange(userId: string, change: PasskeyChange, at?: Date): Promise<void>`: looks the account up, mails its own address. Sends nothing if the row is gone.
  - `queuePasskeyMail(userId: string, change: PasskeyChange): void`: schedules that with `after()`. Never throws, returns at once.
  - `esc(value: string): string` is now exported from `@/lib/auth/inviteMail`.

Until an account's first passkey exists, whoever can sign in can enrol their own. This mail cannot stop that; it tells the owner. It applies to every role: staff confirm guarded actions with a passkey too.

Three places queue it. A registration, on the branch of `passkeyAfterHook` that already requires the result not to be an error and the account to hold a passkey. A removal, when `/passkey/delete-passkey` returns something that is not an error: the before-hook has already refused every removal the rules forbid. A staff reset, in the route after `resetPasskeys` returns. No existing passkey rule changes.

`after()` throws when there is no request to run after. `queuePasskeyMail` catches that, so a passkey change can never fail on the mail. The reset script is the one caller with no request: it awaits `sendPasskeyChange` itself, because the process is about to exit.

- [ ] **Step 1: Write the mail's failing test**

Create `src/lib/auth/__tests__/passkeyMail.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findUnique = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() =>
	vi.fn(
		async (_m: { to: string; subject: string; text: string; html?: string }) =>
			true,
	),
);
const after = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("next/server", () => ({ after }));

const { queuePasskeyMail, sendPasskeyChange } = await import(
	"@/lib/auth/passkeyMail"
);

/** 01:30 on 9 October in Malaysia, still 8 October in UTC. */
const AT = new Date("2026-10-08T17:30:00Z");

beforeEach(() => {
	vi.clearAllMocks();
	findUnique.mockResolvedValue({ email: "aiman@outlook.com", name: "Aiman" });
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe("sendPasskeyChange", () => {
	it.each([
		["added", "A passkey was added to your EzCabinet account"],
		["removed", "A passkey was removed from your EzCabinet account"],
		["reset", "EzCabinet staff removed every passkey"],
	] as const)(
		"%s: says what and when, to the account's own address",
		async (change, what) => {
			await sendPasskeyChange("u1", change, AT);
			expect(findUnique).toHaveBeenCalledWith({
				where: { id: "u1" },
				select: { email: true, name: true },
			});
			const message = sendEmail.mock.calls[0][0];
			expect(message.to).toBe("aiman@outlook.com");
			for (const part of [message.text, message.html ?? ""]) {
				expect(part).toContain(what);
				expect(part).toContain("9 Oct 2026");
				expect(part).toContain("1:30");
				expect(part).toContain("Malaysia time");
				expect(part).toContain("If it was not,");
				// Nothing to click, so a forged copy has nothing to phish with.
				expect(part).not.toMatch(/https?:|href|www\.|wa\.me/i);
			}
		},
	);

	it("gives the sales WhatsApp number when there is one", async () => {
		vi.stubEnv("WHATSAPP_SALES_NUMBER", "+60 12-345 6789");
		await sendPasskeyChange("u1", "added", AT);
		expect(sendEmail.mock.calls[0][0].text).toContain(
			"message EzCabinet on WhatsApp at +60123456789",
		);
	});

	it("gives the workshop phone when there is no sales number", async () => {
		vi.stubEnv("WHATSAPP_SALES_NUMBER", "");
		await sendPasskeyChange("u1", "added", AT);
		expect(sendEmail.mock.calls[0][0].text).toMatch(/call EzCabinet on \S+/);
	});

	it("escapes the name in the HTML, and leaves it as typed in the text", async () => {
		findUnique.mockResolvedValue({
			email: "a@b.com",
			name: '<img src=x onerror="alert(1)">',
		});
		await sendPasskeyChange("u1", "added", AT);
		const message = sendEmail.mock.calls[0][0];
		expect(message.html).not.toContain("<img");
		expect(message.html).toContain("&lt;img");
		expect(message.text).toContain("<img");
	});

	it("greets an account with no name yet without one", async () => {
		findUnique.mockResolvedValue({ email: "a@b.com", name: "" });
		await sendPasskeyChange("u1", "added", AT);
		expect(sendEmail.mock.calls[0][0].text.startsWith("Hello,\n")).toBe(true);
	});

	it("sends nothing for an account that no longer exists", async () => {
		findUnique.mockResolvedValue(null);
		await sendPasskeyChange("gone", "reset", AT);
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("does not throw when the mail is not sent", async () => {
		sendEmail.mockResolvedValueOnce(false);
		await expect(sendPasskeyChange("u1", "added", AT)).resolves.toBeUndefined();
	});
});

describe("queuePasskeyMail", () => {
	it("schedules the mail for after the response and sends nothing itself", () => {
		queuePasskeyMail("u1", "added");
		expect(after).toHaveBeenCalledTimes(1);
		expect(sendEmail).not.toHaveBeenCalled();
		expect(findUnique).not.toHaveBeenCalled();
	});

	it("sends to the account once the scheduled work runs", async () => {
		queuePasskeyMail("u1", "removed");
		await after.mock.calls[0][0]();
		expect(sendEmail.mock.calls[0][0].to).toBe("aiman@outlook.com");
		expect(sendEmail.mock.calls[0][0].subject).toContain("removed");
	});

	it("does not throw when there is no request to run after", () => {
		after.mockImplementationOnce(() => {
			throw new Error("after() called outside a request scope");
		});
		expect(() => queuePasskeyMail("u1", "added")).not.toThrow();
		expect(sendEmail).not.toHaveBeenCalled();
	});

	it("swallows a failure inside the scheduled work", async () => {
		findUnique.mockRejectedValueOnce(new Error("database is down"));
		queuePasskeyMail("u1", "reset");
		await expect(after.mock.calls[0][0]()).resolves.toBeUndefined();
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyMail.test.ts`
Expected: FAIL, the suite cannot load: `Cannot find module '@/lib/auth/passkeyMail'`.

- [ ] **Step 3: Export the escaper and write the mail**

In `src/lib/auth/inviteMail.ts`:

```diff
--- a/src/lib/auth/inviteMail.ts
+++ b/src/lib/auth/inviteMail.ts
@@ -11,7 +11,7 @@
 };
 
 /** Names are typed by a person and land in HTML. */
-function esc(value: string): string {
+export function esc(value: string): string {
 	return value.replace(
 		/[&<>"']/g,
 		(c) =>
```

Create `src/lib/auth/passkeyMail.ts`:

```ts
import "server-only";
import { after } from "next/server";
import { esc } from "@/lib/auth/inviteMail";
import { prisma } from "@/lib/catalogue/db";
import { sendEmail } from "@/lib/email";
import { WORKSHOP_PHONE } from "@/lib/logistics/carriers";

export type PasskeyChange = "added" | "removed" | "reset";

const WHAT: Record<PasskeyChange, { subject: string; line: string }> = {
	added: {
		subject: "A passkey was added to your EzCabinet account",
		line: "A passkey was added to your EzCabinet account",
	},
	removed: {
		subject: "A passkey was removed from your EzCabinet account",
		line: "A passkey was removed from your EzCabinet account",
	},
	reset: {
		subject: "Your EzCabinet passkeys were reset",
		line: "EzCabinet staff removed every passkey from your EzCabinet account, and signed it out everywhere",
	},
};

/** As a customer in Malaysia would read it, wherever the server runs. */
function when(at: Date): string {
	const stamp = at.toLocaleString("en-MY", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Kuala_Lumpur",
	});
	return `${stamp} (Malaysia time)`;
}

/**
 * The sales number the WhatsApp help link uses, written out. A number, not a
 * link: this mail carries nothing to click, so a forged copy has nothing to
 * phish with.
 */
function contact(): string {
	const sales = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");
	return sales
		? `message EzCabinet on WhatsApp at +${sales}`
		: `call EzCabinet on ${WORKSHOP_PHONE}`;
}

/**
 * Tells an account's own address that its passkeys changed. Until the first
 * passkey exists the mailbox (or the Google account) is the only lock, and
 * whoever holds it can enrol their own — so the owner hears every time, for
 * every role. It cannot stop the change; it makes it visible.
 */
export async function sendPasskeyChange(
	userId: string,
	change: PasskeyChange,
	at: Date = new Date(),
): Promise<void> {
	const row = await prisma.user.findUnique({
		where: { id: userId },
		select: { email: true, name: true },
	});
	if (!row) return;
	const { subject, line } = WHAT[change];
	const hello = row.name.trim() ? `Hi ${row.name.trim()},` : "Hello,";
	const happened = `${line} on ${when(at)}.`;
	const ifNot = `If this was you, there is nothing to do. If it was not, ${contact()} straight away.`;
	await sendEmail({
		to: row.email,
		subject,
		text: [hello, "", happened, "", ifNot].join("\n"),
		html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#262626;"><p>${esc(hello)}</p><p>${esc(happened)}</p><p>${esc(ifNot)}</p></div>`,
	});
}

/**
 * Schedules the mail for after the response, from inside a request. Never
 * throws and is never awaited: the passkey change has already happened, and
 * no mail problem may undo it or fail the request that made it.
 */
export function queuePasskeyMail(userId: string, change: PasskeyChange): void {
	const at = new Date();
	try {
		after(() =>
			sendPasskeyChange(userId, change, at).catch((error) =>
				console.error("Passkey mail failed", error),
			),
		);
	} catch (error) {
		// No request to run after: nothing is sent, and the change stands.
		console.error("Passkey mail not scheduled", error);
	}
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyMail.test.ts src/lib/auth/__tests__/inviteMail.test.ts`
Expected: PASS, 13 tests in `passkeyMail.test.ts`; the invite mail's tests unchanged.

- [ ] **Step 5: Write the failing tests for where it is queued**

In `src/lib/auth/__tests__/passkeyHooks.test.ts`:

```diff
--- a/src/lib/auth/__tests__/passkeyHooks.test.ts
+++ b/src/lib/auth/__tests__/passkeyHooks.test.ts
@@ -5,6 +5,8 @@
 const sessionUpdate = vi.hoisted(() => vi.fn());
 
 const getSessionFromCtx = vi.hoisted(() => vi.fn());
+const queuePasskeyMail = vi.hoisted(() => vi.fn());
+vi.mock("@/lib/auth/passkeyMail", () => ({ queuePasskeyMail }));
 vi.mock("better-auth/api", async () => ({
 	...(await vi.importActual<typeof import("better-auth/api")>(
 		"better-auth/api",
@@ -248,6 +250,67 @@
 	});
 });
 
+describe("passkeyAfterHook, telling the owner the lock changed", () => {
+	beforeEach(() => {
+		vi.clearAllMocks();
+		vi.spyOn(console, "info").mockImplementation(() => {});
+		getSessionFromCtx.mockResolvedValue({
+			user: { id: "u1", email: "a@x.com" },
+			session: { token: "tok" },
+		});
+	});
+
+	it("queues a mail to the account when a passkey is registered", async () => {
+		count.mockResolvedValue(1);
+		await passkeyAfterHook(hookCtx("/passkey/verify-registration"));
+		expect(queuePasskeyMail).toHaveBeenCalledTimes(1);
+		expect(queuePasskeyMail).toHaveBeenCalledWith("u1", "added");
+	});
+
+	it("queues none when the registration failed", async () => {
+		const { APIError } = await import("better-auth/api");
+		count.mockResolvedValue(1);
+		await passkeyAfterHook(
+			hookCtx("/passkey/verify-registration", new APIError("BAD_REQUEST")),
+		);
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
+	});
+
+	it("queues none when nothing was enrolled, whatever was returned", async () => {
+		count.mockResolvedValue(0);
+		await passkeyAfterHook(hookCtx("/passkey/verify-registration"));
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
+	});
+
+	it("queues a mail to the account when a passkey is removed", async () => {
+		await passkeyAfterHook(hookCtx("/passkey/delete-passkey"));
+		expect(queuePasskeyMail).toHaveBeenCalledTimes(1);
+		expect(queuePasskeyMail).toHaveBeenCalledWith("u1", "removed");
+		// A removal verifies nothing.
+		expect(sessionUpdate).not.toHaveBeenCalled();
+	});
+
+	it("queues none when the removal was refused or nobody is signed in", async () => {
+		const { APIError } = await import("better-auth/api");
+		await passkeyAfterHook(
+			hookCtx("/passkey/delete-passkey", new APIError("BAD_REQUEST")),
+		);
+		getSessionFromCtx.mockResolvedValue(null);
+		await passkeyAfterHook(hookCtx("/passkey/delete-passkey"));
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
+	});
+
+	it.each([
+		"/passkey/update-passkey",
+		"/passkey/list-user-passkeys",
+		"/passkey/generate-register-options",
+		"/sign-in/email-otp",
+	])("queues none for %s", async (path) => {
+		await passkeyAfterHook(hookCtx(path));
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
+	});
+});
+
 describe("passkeyBeforeHook", () => {
 	beforeEach(() => vi.clearAllMocks());
 	const session = (passkeyVerifiedAt: unknown) => ({
```

In `src/lib/auth/__tests__/passkeyWiring.test.ts` (through the real plugin: a registration that fails queues nothing):

```diff
--- a/src/lib/auth/__tests__/passkeyWiring.test.ts
+++ b/src/lib/auth/__tests__/passkeyWiring.test.ts
@@ -42,6 +42,9 @@
 	},
 }));
 
+const queuePasskeyMail = vi.hoisted(() => vi.fn());
+vi.mock("@/lib/auth/passkeyMail", () => ({ queuePasskeyMail }));
+
 const {
 	assertPasskeyOwner,
 	passkeyAfterHook,
@@ -142,6 +145,7 @@
 		const res = await post("/passkey/verify-registration", { name: 5 }, cookie);
 		expect(res.status).toBe(400);
 		expect(sessionRow().passkeyVerified).toBe(false);
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
 	});
 
 	it("does not verify the session when the handler itself fails", async () => {
@@ -156,6 +160,8 @@
 			"CHALLENGE_NOT_FOUND",
 		);
 		expect(sessionRow().passkeyVerified).toBe(false);
+		// No passkey was added, so the owner is told of none.
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
 	});
 
 	it("refuses createSession on registration", async () => {
```

In `src/app/api/admin/users/[id]/reset-passkey/__tests__/route.test.ts`:

```diff
--- a/src/app/api/admin/users/[id]/reset-passkey/__tests__/route.test.ts
+++ b/src/app/api/admin/users/[id]/reset-passkey/__tests__/route.test.ts
@@ -3,6 +3,7 @@
 const requireAuth = vi.hoisted(() => vi.fn());
 const findUnique = vi.hoisted(() => vi.fn());
 const resetPasskeys = vi.hoisted(() => vi.fn());
+const queuePasskeyMail = vi.hoisted(() => vi.fn());
 
 vi.mock("@/lib/auth/requireAuth", async () => {
 	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
@@ -12,6 +13,7 @@
 });
 vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
 vi.mock("@/lib/auth/resetPasskeys", () => ({ resetPasskeys }));
+vi.mock("@/lib/auth/passkeyMail", () => ({ queuePasskeyMail }));
 
 const { POST } = await import("../route");
 const { AuthError } = await import("@/lib/auth/requireAuth");
@@ -67,6 +69,25 @@
 		expect(resetPasskeys).toHaveBeenCalledWith("s1");
 	});
 
+	it("tells the account's own address, after the reset and whatever its role", async () => {
+		requireAuth.mockResolvedValue(superadmin);
+		findUnique.mockResolvedValue({ id: "c1" });
+		await call("c1");
+		expect(queuePasskeyMail).toHaveBeenCalledWith("c1", "reset");
+		expect(resetPasskeys.mock.invocationCallOrder[0]).toBeLessThan(
+			queuePasskeyMail.mock.invocationCallOrder[0],
+		);
+	});
+
+	it("tells nobody when nothing was reset", async () => {
+		requireAuth.mockResolvedValue(superadmin);
+		findUnique.mockResolvedValue(null);
+		await call("ghost");
+		requireAuth.mockRejectedValue(new AuthError(403));
+		await call("c1");
+		expect(queuePasskeyMail).not.toHaveBeenCalled();
+	});
+
 	it("403s without a recent passkey ceremony and resets nothing", async () => {
 		requireAuth.mockResolvedValue({ ...superadmin, passkeyVerifiedAt: null });
 		findUnique.mockResolvedValue({ id: "c1" });
```

- [ ] **Step 6: Run them to see them fail**

Run: `pnpm vitest run passkeyHooks passkeyWiring reset-passkey`
Expected: FAIL on exactly three: `queues a mail to the account when a passkey is registered`, `queues a mail to the account when a passkey is removed`, and `tells the account's own address, after the reset and whatever its role`. Every "queues none" case and every existing case passes.

- [ ] **Step 7: Queue it**

In `src/lib/auth/passkeyHooks.ts` (the three comment changes are because Google is no longer the only way in):

```diff
--- a/src/lib/auth/passkeyHooks.ts
+++ b/src/lib/auth/passkeyHooks.ts
@@ -5,6 +5,7 @@
 	getSessionFromCtx,
 	isAPIError,
 } from "better-auth/api";
+import { queuePasskeyMail } from "@/lib/auth/passkeyMail";
 import { type PasskeyAction, passkeyDecision } from "@/lib/auth/passkeyRules";
 import { recentStepUp } from "@/lib/auth/stepUp";
 import { prisma } from "@/lib/catalogue/db";
@@ -35,8 +36,9 @@
 /**
  * Runs before every Better Auth request (`hooks.before` in `lib/auth.ts`)
  * and throws unless `passkeyDecision` allows it. This is the load-bearing
- * guard of the whole feature: without it, whoever holds only the Google
- * account can register their own passkey or delete the real one.
+ * guard of the whole feature: without it, whoever holds only the sign-in
+ * (the Google account, or the mailbox a code goes to) can register their own
+ * passkey or delete the real one.
  *
  * `verifiedAt` is when this session last authenticated with a passkey
  * (`Session.passkeyVerifiedAt`), null if it never has. Every change after
@@ -84,7 +86,7 @@
 
 /**
  * The plugin signs in whoever owns the presented passkey. Here a passkey is
- * a second step for the account already signed in with Google, so a passkey
+ * a second step for the account already signed in, so a passkey
  * that belongs to anyone else is refused — on a shared family device it
  * would otherwise switch the browser to the other person's account.
  */
@@ -154,8 +156,8 @@
 /**
  * A passkey authentication mints a new session and swaps the cookie to it,
  * leaving the one the request came in with alive in the database. Signing
- * out afterwards would then end only the new one, and the original password
- * or Google session would outlive it. So the old one ends here.
+ * out afterwards would then end only the new one, and the original password,
+ * Google or code session would outlive it. So the old one ends here.
  *
  * Only on positive evidence, like the registration branch: not an API error,
  * and a new session for the same account that is not the old one.
@@ -185,6 +187,14 @@
 	if (ctx.path === "/passkey/verify-authentication") {
 		return endReplacedSession(ctx);
 	}
+	if (ctx.path === "/passkey/delete-passkey") {
+		// The owner is told of every removal — see `passkeyMail.ts`. Only once
+		// the plugin has actually deleted one.
+		if (isAPIError(ctx.context.returned)) return;
+		const owner = await getSessionFromCtx(ctx);
+		if (owner) queuePasskeyMail(owner.user.id, "removed");
+		return;
+	}
 	if (ctx.path !== "/passkey/verify-registration") return;
 	// `instanceof APIError` is not enough: a body that fails validation makes
 	// better-call throw its base APIError, which is not an instance of Better
@@ -202,6 +212,7 @@
 		// Every successful registration, a second device included. Id only: an
 		// enrolment on an account with orders leaves a trace, as a reset does.
 		console.info("Passkey enrolled", { user: current.user.id });
+		queuePasskeyMail(current.user.id, "added");
 	}
 }
 
```

In `src/app/api/admin/users/[id]/reset-passkey/route.ts`:

```diff
--- a/src/app/api/admin/users/[id]/reset-passkey/route.ts
+++ b/src/app/api/admin/users/[id]/reset-passkey/route.ts
@@ -1,4 +1,5 @@
 import { NextResponse } from "next/server";
+import { queuePasskeyMail } from "@/lib/auth/passkeyMail";
 import { resetPasskeys } from "@/lib/auth/resetPasskeys";
 import { withAuth } from "@/lib/auth/route";
 import { prisma } from "@/lib/catalogue/db";
@@ -22,6 +23,9 @@
 			return NextResponse.json({ error: "not_found" }, { status: 404 });
 		}
 		await resetPasskeys(target.id);
+		// The account's own address hears of it: a reset is exactly what
+		// someone talking their way past staff would be after.
+		queuePasskeyMail(target.id, "reset");
 		// Ids only. The one action that removes someone's passkeys leaves a trace.
 		console.info("Passkeys reset", { actor: actor.id, target: target.id });
 		return NextResponse.json({ ok: true });
```

In `prisma/resetPasskey.ts`:

```diff
--- a/prisma/resetPasskey.ts
+++ b/prisma/resetPasskey.ts
@@ -1,3 +1,4 @@
+import { sendPasskeyChange } from "@/lib/auth/passkeyMail";
 import { resetPasskeys } from "@/lib/auth/resetPasskeys";
 import { prisma } from "@/lib/catalogue/db";
 
@@ -18,6 +19,11 @@
 	if (!user) throw new Error(`No user with email ${email}`);
 
 	await resetPasskeys(user.id);
+	// Awaited here, unlike in a request: there is no response to send first,
+	// and the process is about to exit. It never throws on a failed send.
+	await sendPasskeyChange(user.id, "reset").catch((error) =>
+		console.error("Passkey mail failed", error),
+	);
 	console.log(
 		`Removed every passkey for ${email} and signed them out. They set up a new one under Security.`,
 	);
```

- [ ] **Step 8: Run them to see them pass**

Run: `pnpm vitest run src/lib/auth reset-passkey`
Expected: PASS, every file. `passkeyWiring.test.ts` has 8 tests, as before.

- [ ] **Step 9: Typecheck, lint and commit**

```bash
pnpm typecheck
pnpm exec biome check src/lib/auth "src/app/api/admin/users/[id]/reset-passkey" prisma/resetPasskey.ts
pnpm vitest run src/lib/auth/__tests__/coverage.test.ts
```

Expected: all clean. The coverage test confirms the reset route is still a literal `export const POST = withAuth(` with its step-up.

```bash
git add src/lib/auth/passkeyMail.ts src/lib/auth/__tests__/passkeyMail.test.ts src/lib/auth/inviteMail.ts src/lib/auth/passkeyHooks.ts src/lib/auth/__tests__/passkeyHooks.test.ts src/lib/auth/__tests__/passkeyWiring.test.ts "src/app/api/admin/users/[id]/reset-passkey/route.ts" "src/app/api/admin/users/[id]/reset-passkey/__tests__/route.test.ts" prisma/resetPasskey.ts
```

```bash
git commit -m "feat(auth): mail the account when a passkey is added, removed or reset" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 7: Promotion gives a code customer a password

**Files:**
- Modify: `src/app/api/admin/users/route.ts`
- Modify: `src/app/admin/users/InviteStaff.tsx`
- Test: `src/app/api/admin/users/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `auth.$context` (a promise of Better Auth's context, whose `password.hash(password: string): Promise<string>` is the hasher sign-in verifies against); `sendStaffInvite({ to, name, inviterName, role, base, hasPassword })` (existing); `inviteSchema` (unchanged: the form always posts a `password` of 12+ characters).
- Produces: the promotion branch of `POST /api/admin/users` now answers `{ ok: true, id, promoted: true, passwordSet: boolean, emailed: boolean }`. `passwordSet` is true when the promoted row had no `google` account, in which case the posted password is on the row and `mustChangePassword` is set.

Staff cannot use a mailed code (Task 3 refuses it three times). A customer who signed up with a code and is then promoted would have no way in at all. The row is therefore given the same password a fresh invite sets, handed over the same way. A credential account's shape is Better Auth's own: `providerId: "credential"`, `accountId` equal to the user id (`node_modules/better-auth/dist/api/routes/sign-up.mjs`).

- [ ] **Step 1: Write the failing tests**

In `src/app/api/admin/users/__tests__/route.test.ts`:

```diff
--- a/src/app/api/admin/users/__tests__/route.test.ts
+++ b/src/app/api/admin/users/__tests__/route.test.ts
@@ -4,6 +4,15 @@
 const findUnique = vi.hoisted(() => vi.fn());
 const update = vi.hoisted(() => vi.fn());
 const signUpEmail = vi.hoisted(() => vi.fn());
+const hash = vi.hoisted(() => vi.fn(async (_password: string) => "hashed!"));
+const accountFindFirst = vi.hoisted(() => vi.fn());
+const accountCreate = vi.hoisted(() => vi.fn());
+const accountDeleteMany = vi.hoisted(() => vi.fn());
+const sessionDeleteMany = vi.hoisted(() => vi.fn());
+const $transaction = vi.hoisted(() => vi.fn(async (ops: unknown[]) => ops));
+const sendStaffInvite = vi.hoisted(() =>
+	vi.fn(async (_input: { hasPassword: boolean; name: string }) => true),
+);
 
 vi.mock("@/lib/auth/requireAuth", async () => {
 	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
@@ -11,9 +20,24 @@
 	);
 	return { ...actual, requireAuth };
 });
-vi.mock("@/lib/auth", () => ({ auth: { api: { signUpEmail } } }));
+vi.mock("@/lib/auth", () => ({
+	auth: {
+		api: { signUpEmail },
+		$context: Promise.resolve({ password: { hash } }),
+	},
+}));
+vi.mock("@/lib/auth/inviteMail", () => ({ sendStaffInvite }));
 vi.mock("@/lib/catalogue/db", () => ({
-	prisma: { user: { findUnique, update } },
+	prisma: {
+		user: { findUnique, update },
+		account: {
+			findFirst: accountFindFirst,
+			create: accountCreate,
+			deleteMany: accountDeleteMany,
+		},
+		session: { deleteMany: sessionDeleteMany },
+		$transaction,
+	},
 }));
 
 const { POST } = await import("../route");
@@ -30,12 +54,12 @@
 	passkeyVerifiedAt: new Date(),
 };
 
-const invite = () =>
+const invite = (email = "new@x.com") =>
 	POST(
 		new Request("http://x", {
 			method: "POST",
 			body: JSON.stringify({
-				email: "new@x.com",
+				email,
 				name: "New",
 				role: "SUPERADMIN",
 				password: "a-long-enough-password",
@@ -76,4 +100,96 @@
 			data: { role: "SUPERADMIN", invitedById: "boss" },
 		});
 	});
+
+	describe("promoting an existing customer", () => {
+		// Signed up with an emailed code: no Google, no password.
+		const codeCustomer = {
+			id: "c1",
+			email: "aiman@outlook.com",
+			name: "Aiman bin Ali",
+			role: "CUSTOMER",
+		};
+
+		it("gives a code-only customer the invite password, since staff cannot use a code", async () => {
+			findUnique.mockResolvedValueOnce(codeCustomer);
+			accountFindFirst.mockResolvedValueOnce(null);
+			const response = await invite("aiman@outlook.com");
+			expect(response.status).toBe(200);
+			await expect(response.json()).resolves.toMatchObject({
+				promoted: true,
+				passwordSet: true,
+			});
+			expect(accountFindFirst).toHaveBeenCalledWith({
+				where: { userId: "c1", providerId: "google" },
+				select: { id: true },
+			});
+			expect(hash).toHaveBeenCalledWith("a-long-enough-password");
+			expect(accountCreate.mock.calls[0][0].data).toMatchObject({
+				accountId: "c1",
+				providerId: "credential",
+				userId: "c1",
+				password: "hashed!",
+			});
+			expect(update.mock.calls[0][0]).toMatchObject({
+				where: { id: "c1" },
+				data: {
+					role: "SUPERADMIN",
+					emailVerified: true,
+					mustChangePassword: true,
+					// Their own name stays; the form's is for a row without one.
+					name: "Aiman bin Ali",
+				},
+			});
+			// Old sign-ins and sessions go in the same transaction as the role.
+			expect($transaction.mock.calls[0][0]).toHaveLength(4);
+			expect(sendStaffInvite.mock.calls[0][0]).toMatchObject({
+				hasPassword: true,
+				name: "Aiman bin Ali",
+			});
+		});
+
+		it("leaves a Google customer signing in with Google, with no password", async () => {
+			findUnique.mockResolvedValueOnce(codeCustomer);
+			accountFindFirst.mockResolvedValueOnce({ id: "a1" });
+			const response = await invite("aiman@outlook.com");
+			await expect(response.json()).resolves.toMatchObject({
+				promoted: true,
+				passwordSet: false,
+			});
+			expect(hash).not.toHaveBeenCalled();
+			expect(accountCreate).not.toHaveBeenCalled();
+			expect(update.mock.calls[0][0].data).not.toHaveProperty(
+				"mustChangePassword",
+			);
+			expect(sendStaffInvite.mock.calls[0][0]).toMatchObject({
+				hasPassword: false,
+				name: "Aiman bin Ali",
+			});
+		});
+
+		it("finds the customer when the address is typed with capitals", async () => {
+			findUnique.mockResolvedValueOnce(codeCustomer);
+			accountFindFirst.mockResolvedValueOnce(null);
+			await invite("Aiman@Outlook.com");
+			expect(findUnique).toHaveBeenCalledWith({
+				where: { email: "aiman@outlook.com" },
+			});
+		});
+
+		it("uses the typed name for a customer who never gave one", async () => {
+			findUnique.mockResolvedValueOnce({ ...codeCustomer, name: "" });
+			accountFindFirst.mockResolvedValueOnce(null);
+			await invite("aiman@outlook.com");
+			expect(update.mock.calls[0][0].data.name).toBe("New");
+			expect(sendStaffInvite.mock.calls[0][0].name).toBe("New");
+		});
+
+		it("still refuses an address that is already staff", async () => {
+			findUnique.mockResolvedValueOnce({ ...codeCustomer, role: "ADMIN" });
+			const response = await invite("aiman@outlook.com");
+			expect(response.status).toBe(409);
+			expect(accountCreate).not.toHaveBeenCalled();
+			expect(update).not.toHaveBeenCalled();
+		});
+	});
 });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/app/api/admin/users/__tests__/route.test.ts`
Expected: the two existing tests pass. Of the five new ones, four fail: `gives a code-only customer the invite password` (no `passwordSet` in the answer), `leaves a Google customer signing in with Google` (same), `finds the customer when the address is typed with capitals` (looked up as typed), `uses the typed name for a customer who never gave one` (the name is not written). `still refuses an address that is already staff` passes already.

- [ ] **Step 3: Change the route**

In `src/app/api/admin/users/route.ts`:

```diff
--- a/src/app/api/admin/users/route.ts
+++ b/src/app/api/admin/users/route.ts
@@ -1,3 +1,4 @@
+import { randomUUID } from "node:crypto";
 import { NextResponse } from "next/server";
 import { auth } from "@/lib/auth";
 import { inviteSchema } from "@/lib/auth/invite";
@@ -53,7 +54,10 @@
 				{ status: 400 },
 			);
 		}
-		const { email, name, role, password } = parsed.data;
+		const { name, role, password } = parsed.data;
+		// Better Auth stores every address lower-case, whichever way in made the
+		// row, so a typed capital must not miss the customer it means.
+		const email = parsed.data.email.toLowerCase();
 		const invitedById = actor.id === BYPASS_USER.id ? null : actor.id;
 		const mail = {
 			to: email,
@@ -65,15 +69,24 @@
 		const existing = await prisma.user.findUnique({ where: { email } });
 		if (existing) {
 			// Not self-service escalation: this is a superadmin deliberately
-			// granting a role on /admin/users, gated by users:manage. The account
-			// keeps whatever sign-in it already has — if they arrived through
-			// Google there is no password to set, and the `password` field of this
-			// form is ignored.
+			// granting a role on /admin/users, gated by users:manage. A row with a
+			// Google sign-in keeps it and the `password` field of this form is
+			// ignored. A row without one — an emailed-code customer —
+			// would be left with no way in, since staff cannot use a code, so it
+			// gets the invite's password exactly as a fresh invite does.
 			if (existing.role !== "CUSTOMER") {
 				return NextResponse.json({ error: "already_staff" }, { status: 409 });
 			}
-			// A customer row should carry no password — customers sign in with
-			// Google. One that does was made by someone other than the address's
+			const google = await prisma.account.findFirst({
+				where: { userId: existing.id, providerId: "google" },
+				select: { id: true },
+			});
+			// Hashed by Better Auth, so sign-in verifies it like any other.
+			const passwordHash = google
+				? null
+				: await (await auth.$context).password.hash(password);
+			// A customer row should carry no password — customers sign in with a
+			// provider or a code. One that does was made by someone other than the address's
 			// owner (public password sign-up was open until it was closed), so the
 			// password and any session it opened go before the row gains a role.
 			// `emailVerified` then follows the invite's own reasoning below: the
@@ -84,20 +97,43 @@
 					where: { userId: existing.id, providerId: "credential" },
 				}),
 				prisma.session.deleteMany({ where: { userId: existing.id } }),
+				...(passwordHash
+					? [
+							prisma.account.create({
+								data: {
+									id: randomUUID(),
+									// Better Auth's own shape for a password sign-in.
+									accountId: existing.id,
+									providerId: "credential",
+									userId: existing.id,
+									password: passwordHash,
+								},
+							}),
+						]
+					: []),
 				prisma.user.update({
 					where: { id: existing.id },
-					data: { role, invitedById, emailVerified: true },
+					data: {
+						role,
+						invitedById,
+						emailVerified: true,
+						// Empty if they left before the name step.
+						name: existing.name || name,
+						...(passwordHash ? { mustChangePassword: true } : {}),
+					},
 				}),
 			]);
+			const passwordSet = passwordHash !== null;
 			const emailed = await sendStaffInvite({
 				...mail,
-				name: existing.name,
-				hasPassword: false,
+				name: existing.name || name,
+				hasPassword: passwordSet,
 			});
 			return NextResponse.json({
 				ok: true,
 				id: existing.id,
 				promoted: true,
+				passwordSet,
 				emailed,
 			});
 		}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `pnpm vitest run src/app/api/admin/users`
Expected: PASS, 7 tests in `route.test.ts`, and the `[id]` route tests untouched.

- [ ] **Step 5: Show the password in the form when one was set**

In `src/app/admin/users/InviteStaff.tsx`:

```diff
--- a/src/app/admin/users/InviteStaff.tsx
+++ b/src/app/admin/users/InviteStaff.tsx
@@ -20,9 +20,11 @@
 /**
  * Invite creates staff and only staff. Inviting an email that already has a
  * customer row promotes that row instead — the client's decision that an
- * employee who already used the planner with their own Google account must
- * not be locked out of it — so this shows a different success message and
- * never shows a generated password for that path, because it was never used.
+ * employee who already used the planner with their own account must not be
+ * locked out of it — so this shows a different success message. A promoted
+ * row with a Google sign-in keeps it and the generated password is never
+ * used or shown. One without (it signed in with an emailed code, which staff
+ * cannot use) is given the password, and it is shown as for a fresh invite.
  *
  * Inline card, not a dialog: the invite-a-member form sits above the table
  * so a superadmin never leaves the page to add someone.
@@ -36,6 +38,7 @@
 	const [confirming, setConfirming] = useState<Confirm | null>(null);
 	const [result, setResult] = useState<{
 		promoted: boolean;
+		passwordSet: boolean;
 		emailed: boolean;
 		password: string;
 	} | null>(null);
@@ -64,6 +67,8 @@
 		}
 		setResult({
 			promoted: Boolean(data?.promoted),
+			// A fresh invite always sets one; a promotion says whether it did.
+			passwordSet: data?.promoted ? Boolean(data?.passwordSet) : true,
 			emailed: Boolean(data?.emailed),
 			password,
 		});
@@ -77,7 +82,7 @@
 		e.preventDefault();
 		setConfirming({
 			title: `Invite ${name} as ${ROLE_LABELS[role]}?`,
-			body: `${email} gets the ${ROLE_LABELS[role]} role. If that address already has a customer account, that account is given the role instead.`,
+			body: `${email} gets the ${ROLE_LABELS[role]} role. If that address already has a customer account, that account is given the role instead, with this password if it has no Google sign-in.`,
 			confirmLabel: "Invite",
 			stepUp: true,
 			run: invite,
@@ -92,7 +97,7 @@
 			</p>
 			{result ? (
 				<div className="flex flex-col gap-3">
-					{result.promoted ? (
+					{result.promoted && !result.passwordSet ? (
 						<p
 							role="status"
 							className="rounded-lg border border-[#c8d8ce] bg-[#f2f7f4] px-3 py-[9px] text-[#1f5138] text-[12px]"
@@ -109,7 +114,9 @@
 								role="status"
 								className="rounded-lg border border-[#c8d8ce] bg-[#f2f7f4] px-3 py-[9px] text-[#1f5138] text-[12px]"
 							>
-								Staff account created.{" "}
+								{result.promoted
+									? `Role granted. Existing account given the ${ROLE_LABELS[role]} role. It had no Google sign-in and staff cannot sign in with an emailed code, so it now has this password.`
+									: "Staff account created."}{" "}
 								{result.emailed
 									? "They have been emailed the sign-in link, without the password."
 									: "No email was sent, so send them the sign-in link yourself."}{" "}
```

- [ ] **Step 6: Typecheck, lint, and check the route gate**

```bash
pnpm typecheck
pnpm exec biome check src/app/api/admin/users src/app/admin/users/InviteStaff.tsx
pnpm vitest run src/lib/auth/__tests__/coverage.test.ts
```

Expected: all clean. The coverage test is what confirms `POST` is still a literal `export const POST = withAuth(` with its step-up.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/admin/users/route.ts src/app/api/admin/users/__tests__/route.test.ts src/app/admin/users/InviteStaff.tsx
```

```bash
git commit -m "feat(admin): promoting a customer with no Google sign-in sets the invite password" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 8: Copy, and the screens that only change words

**Files:**
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/ms.ts`, `src/lib/copy/zh.ts`
- Modify: `src/app/[lang]/not-found.tsx`
- Modify: `src/app/[lang]/sign-in/page.tsx` (one line; Task 9 rewrites the page)
- Modify: `src/components/planner/QuoteScreen.tsx`
- Modify: `src/components/planner/SignInNudge.tsx` (rewritten)
- Modify: `src/components/AccountMenu.tsx`
- Modify: `src/app/admin/users/UsersTable.tsx`
- Modify: `src/app/[lang]/verify/PasskeyGate.tsx`, `src/lib/auth/passkeyRules.ts`, `src/lib/auth/resetPasskeys.ts`, `src/lib/plannerDraft.ts` (comments)
- Test: `src/lib/copy/__tests__/dictionary.test.ts`

**Interfaces:**
- Consumes: `nameRequired` from `GET /api/payments/config` and the `name_required` answer of `POST /api/orders` (Task 5); `useCopy()`, `useLocale()` from `src/components/planner/CopyContext`.
- Produces, on `Dictionary["signIn"]` (every value a plain string):
  - renamed: `error` becomes `googleError`
  - provider keys, the only two that may name a provider: `continueWithGoogle`, `googleError`
  - the form: `orEmail`, `emailLabel`, `continueEmail`, `codeLabel`, `submitCode`, `resend`, `resendIn` (token `{seconds}`), `changeEmail`
  - the form's messages, each carrying its own full stop: `emailInvalid`, `codeSent` (token `{email}`), `codeHint`, `wrongCode`, `codeExpired`, `tooMany`, `failed`
  - `signInOrCreate`, used by the checkout card and the planner nudge
  - unchanged keys: `heading`, `nudge`, `nudgeDismiss`, `back`, `privacyNote`; `body` gains "Any email address works."
- Produces a new group `Dictionary["welcome"]`: `heading`, `body`, `nameLabel`, `submit`; the messages `nameRequired` ("Enter your name."), `nameRefused` ("Use your own name.") and `failed`, each with its own full stop; and `checkoutHeading`, `checkoutBody`, `checkoutButton` for the quote screen's card.
- Also changed in value: `passkey.sessionStale`, `privacy.account` (now says the email route asks for a name the first time), `privacy.recipients`, `privacy.obligatory`.

`ms.ts` and `zh.ts` are typed against `Dictionary`, so a key added to `en.ts` and missing from either is a compile error, and `dictionary.test.ts` already fails on a value left in English.

The order form's name field is already pre-filled from the account's name and stays editable (`QuoteScreen.tsx`, `setName((current) => current || session.user.name || "")`). Nothing changes there: a code customer reaches the form only after the name step, so there is a name to fill in.

- [ ] **Step 1: Write the failing tests**

In `src/lib/copy/__tests__/dictionary.test.ts`:

```diff
--- a/src/lib/copy/__tests__/dictionary.test.ts
+++ b/src/lib/copy/__tests__/dictionary.test.ts
@@ -1,3 +1,4 @@
+import { readFileSync } from "node:fs";
 import { describe, expect, it } from "vitest";
 import { en } from "../en";
 import { LOCALES } from "../locales";
@@ -26,6 +27,13 @@
 	"orders.unitsOne",
 ]);
 
+/** The only strings that may name a sign-in provider: its button, its error. */
+const PROVIDER_KEYS = new Set([
+	"signIn.continueWithGoogle",
+	"signIn.googleError",
+]);
+const PROVIDER_NAME = /google|谷歌/i;
+
 describe("dictionaries", () => {
 	it("serves exactly the three locales", () => {
 		expect(LOCALES).toHaveLength(3);
@@ -57,4 +65,42 @@
 			}
 		}
 	});
+
+	// A customer can sign in with any email, so nothing outside a provider's
+	// own button may read as if Google were the only way in.
+	it.each([
+		["en", en],
+		["zh", zh],
+		["ms", ms],
+	])(
+		"%s names a sign-in provider only on its own button and error",
+		(_name, dict) => {
+			const naming = paths(dict).filter(
+				(p) => !PROVIDER_KEYS.has(p) && PROVIDER_NAME.test(at(dict, p)),
+			);
+			expect(naming).toEqual([]);
+		},
+	);
+
+	// A customer who mistyped can only notice if the address is shown back.
+	it.each([
+		["en", en],
+		["zh", zh],
+		["ms", ms],
+	])(
+		"%s shows the address a code went to, and the resend countdown",
+		(_name, dict) => {
+			expect(dict.signIn.codeSent).toContain("{email}");
+			expect(dict.signIn.resendIn).toContain("{seconds}");
+		},
+	);
+
+	it("names no provider on the page a wrong-account link lands on", () => {
+		// Its strings are inline, not in the dictionary — see the file's comment.
+		const notFound = readFileSync(
+			new URL("../../../app/[lang]/not-found.tsx", import.meta.url),
+			"utf8",
+		);
+		expect(notFound).not.toMatch(PROVIDER_NAME);
+	});
 });
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run src/lib/copy/__tests__/dictionary.test.ts`
Expected: FAIL. `names a sign-in provider only on its own button and error` lists, for each locale, `privacy.account`, `privacy.recipients`, `privacy.obligatory`, `signIn.error` and `passkey.sessionStale`. `shows the address a code went to` fails because `signIn.codeSent` is undefined. `names no provider on the page a wrong-account link lands on` fails on `Google`.

- [ ] **Step 3: English**

In `src/lib/copy/en.ts`:

```diff
--- a/src/lib/copy/en.ts
+++ b/src/lib/copy/en.ts
@@ -613,16 +613,16 @@
 			"If you tick the box at checkout, we send updates about your order — payment, production steps and delivery — to your phone number on WhatsApp. WhatsApp is operated by Meta Platforms, which processes your number and these messages, possibly outside Malaysia. We send nothing else, and you can stop the updates by blocking the number.",
 		accountHeading: "Your account",
 		account:
-			"When you sign in with Google we receive your name, email address and profile photo, and keep them as your account.",
+			"When you sign in through a sign-in provider we receive your name, email address and profile photo from it. When you sign in with an emailed code we receive your email address, and we ask for your name the first time. We keep these as your account.",
 		ordersHeading: "Your orders",
 		orders:
 			"When you place an order we keep your name, phone number, email, delivery address, the design you ordered and the price, as the record of the sale.",
 		recipientsHeading: "Who else receives your data",
 		recipients:
-			"Our payment processor receives your card and billing details — these never reach our servers. The courier that delivers your order receives your name, phone number and address. Google handles sign-in. Mux streams our tutorial videos and so sees a viewer's IP address. Some of these companies process data outside Malaysia.",
+			"Our payment processor receives your card and billing details — these never reach our servers. The courier that delivers your order receives your name, phone number and address. The sign-in provider you choose handles your sign-in, and our email service delivers sign-in codes to your address. Mux streams our tutorial videos and so sees a viewer's IP address. Some of these companies process data outside Malaysia.",
 		obligatoryHeading: "What you must give us",
 		obligatory:
-			"All of this comes from you directly, or from Google when you sign in. Browsing and planning need none of it. To place an order you must give your name, phone number and delivery address — without them we cannot deliver it. Email and WhatsApp updates are optional.",
+			"All of this comes from you directly, or from the sign-in provider you choose. Browsing and planning need none of it. To place an order you must give your name, phone number and delivery address — without them we cannot deliver it. Email and WhatsApp updates are optional.",
 		retentionHeading: "How long we keep it",
 		retention:
 			"Order records are kept for as long as tax and accounting law requires. An account with no orders is kept until you ask us to delete it.",
@@ -731,16 +731,51 @@
 	/** The one hard stop before checkout — see CLAUDE.md's conversion decision. */
 	signIn: {
 		heading: "Sign in",
-		body: "Save your design and follow your order.",
+		body: "Save your design and follow your order. Any email address works.",
+		/** A provider is named on its own button and its own error, nowhere else. */
 		continueWithGoogle: "Continue with Google",
-		error: "Could not open Google sign-in. Try again",
+		googleError: "Could not open Google sign-in. Try again",
+		orEmail: "or continue with email",
+		emailLabel: "Email address",
+		continueEmail: "Continue",
+		codeLabel: "Code",
+		submitCode: "Sign in",
+		resend: "Send a new code",
+		resendIn: "Send a new code in {seconds}s",
+		changeEmail: "Use a different email",
+		/** The email form's own lines carry their full stop; it adds none. */
+		emailInvalid: "Enter a valid email address.",
+		codeSent: "We sent a 6-digit code to {email}. It works for 10 minutes.",
+		codeHint:
+			"Nothing yet? Check your junk folder, and that the address above is right.",
+		wrongCode: "That code is not right. Check it and try again.",
+		codeExpired: "That code has expired. Send a new one.",
+		tooMany: "Too many codes requested. Try again in an hour.",
+		failed: "Something went wrong. Try again.",
+		/** No provider named: the page it leads to offers every way in. */
+		signInOrCreate: "Sign in or create an account",
 		/** The nudge beside the quote button, once something is placed. */
 		nudge: "Saved on this device. Sign in to check out.",
 		nudgeDismiss: "Not now",
 		back: "Back to home",
 		privacyNote: "By continuing you agree to our",
 	},
-	/** The second step after Google — see docs/superpowers/specs/2026-10-06-customer-passkey-design.md. */
+	/** The name step after a first code sign-in — `/[lang]/welcome`. */
+	welcome: {
+		heading: "What should we call you?",
+		body: "Your name goes on your account and your orders. You can use a different name for a delivery at checkout.",
+		nameLabel: "Your name",
+		submit: "Continue",
+		/** Carry their own full stop, like the email form's lines. */
+		nameRequired: "Enter your name.",
+		nameRefused: "Use your own name.",
+		failed: "Something went wrong. Try again.",
+		checkoutHeading: "One more step before you pay",
+		checkoutBody:
+			"Tell us your name. It takes a few seconds and your design stays as it is.",
+		checkoutButton: "Continue",
+	},
+	/** The second step after sign-in — see docs/superpowers/specs/2026-10-06-customer-passkey-design.md. */
 	passkey: {
 		heading: "One more step",
 		enrolBody:
@@ -752,8 +787,7 @@
 		failed: "That didn't work. Try again",
 		failedHint: "If this keeps happening, open this page in Chrome or Safari",
 		wrongAccount: "That passkey belongs to a different account",
-		sessionStale:
-			"For your security, sign in with Google again to set up your passkey",
+		sessionStale: "For your security, sign in again to set up your passkey",
 		signInAgain: "Sign in again",
 		unsupported:
 			"This browser can't use passkeys. Open this page in Chrome or Safari.",
```

- [ ] **Step 4: Malay**

In `src/lib/copy/ms.ts`:

```diff
--- a/src/lib/copy/ms.ts
+++ b/src/lib/copy/ms.ts
@@ -603,16 +603,16 @@
 			"Jika anda menanda kotak semasa pembayaran, kami akan menghantar kemas kini tentang pesanan anda — bayaran, langkah pengeluaran dan penghantaran — ke nombor telefon anda melalui WhatsApp. WhatsApp dikendalikan oleh Meta Platforms, yang memproses nombor anda dan mesej ini, mungkin di luar Malaysia. Kami tidak menghantar apa-apa lagi, dan anda boleh menghentikan kemas kini dengan menyekat nombor tersebut.",
 		accountHeading: "Akaun anda",
 		account:
-			"Apabila anda log masuk dengan Google, kami menerima nama, alamat e-mel dan foto profil anda, dan menyimpannya sebagai akaun anda.",
+			"Apabila anda log masuk melalui penyedia log masuk, kami menerima nama, alamat e-mel dan foto profil anda daripadanya. Apabila anda log masuk dengan kod yang dihantar melalui e-mel, kami menerima alamat e-mel anda, dan kami meminta nama anda pada kali pertama. Kami menyimpannya sebagai akaun anda.",
 		ordersHeading: "Pesanan anda",
 		orders:
 			"Apabila anda membuat pesanan, kami menyimpan nama, nombor telefon, e-mel, alamat penghantaran, reka bentuk yang dipesan dan harganya sebagai rekod jualan.",
 		recipientsHeading: "Siapa lagi yang menerima data anda",
 		recipients:
-			"Pemproses pembayaran kami menerima butiran kad dan bil anda — butiran ini tidak sampai ke pelayan kami. Syarikat kurier yang menghantar pesanan anda menerima nama, nombor telefon dan alamat anda. Google mengendalikan log masuk. Mux menstrim video tutorial kami dan oleh itu melihat alamat IP penonton. Sebahagian syarikat ini memproses data di luar Malaysia.",
+			"Pemproses pembayaran kami menerima butiran kad dan bil anda — butiran ini tidak sampai ke pelayan kami. Syarikat kurier yang menghantar pesanan anda menerima nama, nombor telefon dan alamat anda. Penyedia log masuk yang anda pilih mengendalikan log masuk anda, dan perkhidmatan e-mel kami menghantar kod log masuk ke alamat anda. Mux menstrim video tutorial kami dan oleh itu melihat alamat IP penonton. Sebahagian syarikat ini memproses data di luar Malaysia.",
 		obligatoryHeading: "Apa yang anda mesti berikan",
 		obligatory:
-			"Semua ini datang terus daripada anda, atau daripada Google apabila anda log masuk. Melayari dan merancang tidak memerlukan apa-apa data. Untuk membuat pesanan, anda mesti memberikan nama, nombor telefon dan alamat penghantaran — tanpanya kami tidak dapat menghantar pesanan. E-mel dan kemas kini WhatsApp adalah pilihan.",
+			"Semua ini datang terus daripada anda, atau daripada penyedia log masuk yang anda pilih. Melayari dan merancang tidak memerlukan apa-apa data. Untuk membuat pesanan, anda mesti memberikan nama, nombor telefon dan alamat penghantaran — tanpanya kami tidak dapat menghantar pesanan. E-mel dan kemas kini WhatsApp adalah pilihan.",
 		retentionHeading: "Tempoh simpanan",
 		retention:
 			"Rekod pesanan disimpan selama yang dikehendaki oleh undang-undang cukai dan perakaunan. Akaun tanpa pesanan disimpan sehingga anda meminta kami memadamnya.",
@@ -718,14 +718,45 @@
 	},
 	signIn: {
 		heading: "Log masuk",
-		body: "Simpan reka bentuk anda dan jejaki pesanan anda.",
+		body: "Simpan reka bentuk anda dan jejaki pesanan anda. Mana-mana alamat e-mel boleh digunakan.",
 		continueWithGoogle: "Teruskan dengan Google",
-		error: "Tidak dapat membuka log masuk Google. Cuba lagi",
+		googleError: "Tidak dapat membuka log masuk Google. Cuba lagi",
+		orEmail: "atau teruskan dengan e-mel",
+		emailLabel: "Alamat e-mel",
+		continueEmail: "Teruskan",
+		codeLabel: "Kod",
+		submitCode: "Sahkan kod",
+		resend: "Hantar kod baharu",
+		resendIn: "Hantar kod baharu dalam {seconds}s",
+		changeEmail: "Guna e-mel lain",
+		emailInvalid: "Masukkan alamat e-mel yang sah.",
+		codeSent:
+			"Kami telah menghantar kod 6 digit ke {email}. Kod ini sah selama 10 minit.",
+		codeHint:
+			"Belum terima? Semak folder spam anda, dan pastikan alamat di atas betul.",
+		wrongCode: "Kod itu tidak betul. Semak dan cuba lagi.",
+		codeExpired: "Kod itu telah tamat tempoh. Hantar kod baharu.",
+		tooMany: "Terlalu banyak kod diminta. Cuba lagi dalam masa sejam.",
+		failed: "Ada sesuatu yang tidak kena. Cuba lagi.",
+		signInOrCreate: "Log masuk atau cipta akaun",
 		nudge: "Disimpan pada peranti ini. Log masuk untuk membuat pesanan.",
 		nudgeDismiss: "Bukan sekarang",
 		back: "Kembali ke laman utama",
 		privacyNote: "Dengan meneruskan, anda bersetuju dengan",
 	},
+	welcome: {
+		heading: "Apakah nama anda?",
+		body: "Nama anda dipaparkan pada akaun dan pesanan anda. Anda boleh menggunakan nama lain untuk penghantaran semasa membuat pesanan.",
+		nameLabel: "Nama anda",
+		submit: "Teruskan",
+		nameRequired: "Masukkan nama anda.",
+		nameRefused: "Gunakan nama anda sendiri.",
+		failed: "Ada sesuatu yang tidak kena. Cuba lagi.",
+		checkoutHeading: "Satu langkah lagi sebelum membayar",
+		checkoutBody:
+			"Beritahu kami nama anda. Ia hanya mengambil beberapa saat dan reka bentuk anda kekal seperti sedia ada.",
+		checkoutButton: "Teruskan",
+	},
 	passkey: {
 		heading: "Satu langkah lagi",
 		enrolBody:
@@ -738,7 +769,7 @@
 		failedHint: "Jika ini berulang, buka halaman ini dalam Chrome atau Safari",
 		wrongAccount: "Kunci laluan itu milik akaun lain",
 		sessionStale:
-			"Demi keselamatan anda, log masuk semula dengan Google untuk menyediakan kunci laluan",
+			"Demi keselamatan anda, log masuk semula untuk menyediakan kunci laluan",
 		signInAgain: "Log masuk semula",
 		unsupported:
 			"Pelayar ini tidak menyokong kunci laluan. Buka halaman ini dalam Chrome atau Safari.",
```

- [ ] **Step 5: Chinese**

In `src/lib/copy/zh.ts`:

```diff
--- a/src/lib/copy/zh.ts
+++ b/src/lib/copy/zh.ts
@@ -564,16 +564,16 @@
 			"如果您在结账时勾选此选项，我们会通过 WhatsApp 向您的电话号码发送订单进度——付款、生产步骤和送货。WhatsApp 由 Meta Platforms 运营，Meta 会处理您的号码和这些信息，处理地点可能在马来西亚境外。我们不会发送其他内容，您可以屏蔽该号码以停止接收通知。",
 		accountHeading: "您的账户",
 		account:
-			"当您使用 Google 登录时，我们会收到您的姓名、电子邮箱和头像，并将其保存为您的账户。",
+			"当您通过登录服务商登录时，我们会从该服务商收到您的姓名、电子邮箱和头像。当您使用邮件验证码登录时，我们会收到您的电子邮箱，并在首次登录时询问您的姓名。我们将这些信息保存为您的账户。",
 		ordersHeading: "您的订单",
 		orders:
 			"当您下单时，我们会保存您的姓名、电话号码、电子邮箱、送货地址、所订购的设计及价格，作为销售记录。",
 		recipientsHeading: "还有谁会收到您的数据",
 		recipients:
-			"我们的支付服务商会收到您的银行卡和账单信息——这些信息不会到达我们的服务器。负责配送的快递公司会收到您的姓名、电话号码和地址。Google 负责登录。Mux 负责播放我们的教程视频，因此会看到观看者的 IP 地址。其中部分公司在马来西亚境外处理数据。",
+			"我们的支付服务商会收到您的银行卡和账单信息——这些信息不会到达我们的服务器。负责配送的快递公司会收到您的姓名、电话号码和地址。您选择的登录服务商负责处理您的登录，我们的邮件服务商负责将登录验证码发送到您的邮箱。Mux 负责播放我们的教程视频，因此会看到观看者的 IP 地址。其中部分公司在马来西亚境外处理数据。",
 		obligatoryHeading: "您必须提供的资料",
 		obligatory:
-			"以上资料均由您直接提供，或在您登录时由 Google 提供。浏览和规划无需任何资料。下单时您必须提供姓名、电话号码和送货地址——否则我们无法送货。电子邮箱和 WhatsApp 通知为可选项。",
+			"以上资料均由您直接提供，或由您选择的登录服务商提供。浏览和规划无需任何资料。下单时您必须提供姓名、电话号码和送货地址——否则我们无法送货。电子邮箱和 WhatsApp 通知为可选项。",
 		retentionHeading: "保存期限",
 		retention:
 			"订单记录将按税务及会计法律要求的期限保存。没有订单的账户会一直保留，直到您要求我们删除。",
@@ -673,14 +673,42 @@
 	},
 	signIn: {
 		heading: "登录",
-		body: "保存您的设计并跟踪您的订单。",
+		body: "保存您的设计并跟踪您的订单。任何电子邮箱都可以使用。",
 		continueWithGoogle: "使用 Google 继续",
-		error: "无法打开 Google 登录，请重试",
+		googleError: "无法打开 Google 登录，请重试",
+		orEmail: "或使用电子邮箱继续",
+		emailLabel: "电子邮箱",
+		continueEmail: "继续",
+		codeLabel: "验证码",
+		submitCode: "确认验证码",
+		resend: "发送新验证码",
+		resendIn: "{seconds} 秒后可发送新验证码",
+		changeEmail: "使用其他电子邮箱",
+		emailInvalid: "请输入有效的电子邮箱。",
+		codeSent: "我们已将 6 位验证码发送至 {email}，10 分钟内有效。",
+		codeHint: "还没收到？请查看垃圾邮件箱，并确认上方的邮箱地址正确。",
+		wrongCode: "验证码不正确。请检查后重试。",
+		codeExpired: "验证码已过期。请发送新的验证码。",
+		tooMany: "请求验证码的次数过多。请一小时后再试。",
+		failed: "出了点问题。请重试。",
+		signInOrCreate: "登录或创建账户",
 		nudge: "已保存在此设备上。登录后即可下单。",
 		nudgeDismiss: "稍后再说",
 		back: "返回主页",
 		privacyNote: "继续即表示您同意我们的",
 	},
+	welcome: {
+		heading: "我们该怎么称呼您？",
+		body: "您的姓名会显示在您的账户和订单上。下单时，您可以为送货填写其他姓名。",
+		nameLabel: "您的姓名",
+		submit: "继续",
+		nameRequired: "请输入您的姓名。",
+		nameRefused: "请使用您本人的姓名。",
+		failed: "出了点问题。请重试。",
+		checkoutHeading: "付款前还差一步",
+		checkoutBody: "请告诉我们您的姓名。只需几秒钟，您的设计会保持原样。",
+		checkoutButton: "继续",
+	},
 	passkey: {
 		heading: "还差一步",
 		enrolBody:
@@ -692,7 +720,7 @@
 		failed: "未能完成，请重试",
 		failedHint: "如果一直失败，请在 Chrome 或 Safari 中打开此页面",
 		wrongAccount: "该通行密钥属于另一个账户",
-		sessionStale: "为了您的安全，请重新使用 Google 登录以设置通行密钥",
+		sessionStale: "为了您的安全，请重新登录以设置通行密钥",
 		signInAgain: "重新登录",
 		unsupported: "此浏览器不支持通行密钥。请在 Chrome 或 Safari 中打开此页面。",
 		otherDevice:
```

- [ ] **Step 6: The page a wrong-account link lands on**

Its strings are inline, not in the dictionary. In `src/app/[lang]/not-found.tsx`:

```diff
--- a/src/app/[lang]/not-found.tsx
+++ b/src/app/[lang]/not-found.tsx
@@ -9,7 +9,7 @@
  * no props, and three dictionaries is the wrong trade for four strings.
  *
  * The body names the likeliest cause. An order or tracking link opened under
- * a different Google account is deliberately the same 404 as a made-up one,
+ * a different account is deliberately the same 404 as a made-up one,
  * so this is the only place a customer can be told to check the account.
  */
 const COPY: Record<
@@ -18,19 +18,19 @@
 > = {
 	en: {
 		title: "We can't find that page",
-		body: "If this is an order or tracking link, check you're signed in with the Google account that placed the order.",
+		body: "If this is an order or tracking link, check you're signed in to the account that placed the order.",
 		orders: "My orders",
 		home: "Back to home",
 	},
 	zh: {
 		title: "找不到该页面",
-		body: "如果这是订单或物流追踪链接，请确认您登录的是下单时使用的 Google 账户。",
+		body: "如果这是订单或物流追踪链接，请确认您登录的是下单时使用的账户。",
 		orders: "我的订单",
 		home: "返回首页",
 	},
 	ms: {
 		title: "Halaman itu tidak ditemui",
-		body: "Jika ini pautan pesanan atau penjejakan, pastikan anda log masuk dengan akaun Google yang membuat pesanan itu.",
+		body: "Jika ini pautan pesanan atau penjejakan, pastikan anda log masuk ke akaun yang membuat pesanan itu.",
 		orders: "Pesanan saya",
 		home: "Kembali ke laman utama",
 	},
```

- [ ] **Step 7: Run the copy tests to see them pass**

Run: `pnpm vitest run src/lib/copy`
Expected: PASS, every file.

- [ ] **Step 8: Follow the renamed key on the sign-in page**

`signIn.error` no longer exists. In `src/app/[lang]/sign-in/page.tsx`, change the one line that reads it. Task 9 replaces this page; this keeps the build green until then.

```tsx
					errorMessage={s.googleError}
```

It replaces:

```tsx
					errorMessage={s.error}
```

- [ ] **Step 9: The checkout cards**

The sign-in card stops being a Google button and becomes a link to the sign-in page, which offers both ways in. A second card, in the pattern of the passkey one, covers a customer who owes a name: it replaces the form rather than following a failed Pay, so nothing typed is lost. Only one of the name and passkey cards shows at a time, since the name step leads on to the passkey step by itself. In `src/components/planner/QuoteScreen.tsx`:

```diff
--- a/src/components/planner/QuoteScreen.tsx
+++ b/src/components/planner/QuoteScreen.tsx
@@ -3,7 +3,6 @@
 import dynamic from "next/dynamic";
 import { useRouter } from "next/navigation";
 import { useEffect, useRef, useState } from "react";
-import { GoogleSignInButton } from "@/app/[lang]/sign-in/GoogleSignInButton";
 import { Spinner } from "@/components/Spinner";
 import { track } from "@/lib/analytics";
 import { authClient } from "@/lib/auth/client";
@@ -135,10 +134,12 @@
 	// False only on a local run with AUTH_ENABLED off, where a signed-out
 	// order goes to the demo customer and the sign-in card would be a lie.
 	const [signInRequired, setSignInRequired] = useState(true);
-	// True for a customer signed in with Google who still owes the passkey
+	// True for a signed-in customer who still owes the passkey
 	// step. Like the sign-in card, it replaces the form rather than following
 	// a failed Pay, so nothing they typed is thrown away by the detour.
 	const [passkeyRequired, setPasskeyRequired] = useState(false);
+	// The same for a code customer who has not given a name, asked for first.
+	const [nameRequired, setNameRequired] = useState(false);
 	useEffect(() => {
 		fetch("/api/payments/config")
 			.then((res) => res.json())
@@ -147,10 +148,12 @@
 					client: PaymentClient | null;
 					signIn?: boolean;
 					passkeyRequired?: boolean;
+					nameRequired?: boolean;
 				}) => {
 					setPayClient(json.client);
 					setSignInRequired(json.signIn !== false);
 					setPasskeyRequired(json.passkeyRequired === true);
+					setNameRequired(json.nameRequired === true);
 				},
 			)
 			.catch(() => setPayClient(null));
@@ -166,7 +169,7 @@
 		payment: PaymentStart | null;
 	} | null>(null);
 
-	// The person paying is not always the person whose Google account it is,
+	// The person paying is not always the person whose account it is,
 	// so this only pre-fills the fields — both stay editable.
 	const { data: session, isPending: sessionPending } = authClient.useSession();
 	const [name, setName] = useState("");
@@ -264,6 +267,13 @@
 				// the existing rehydrate bring it back on the way in.
 				router.push(
 					`/${locale}/sign-in?next=${encodeURIComponent(quoteUrl())}`,
+				);
+				return;
+			}
+			if (res?.status === 401 && body?.error === "name_required") {
+				// Backstop only, like the passkey one below.
+				router.push(
+					`/${locale}/welcome?next=${encodeURIComponent(quoteUrl())}`,
 				);
 				return;
 			}
@@ -342,7 +352,9 @@
 	// Unknown until both the session and the checkout config have answered.
 	const authPending = sessionPending || payClient === undefined;
 	const signedOut = !authPending && signInRequired && !session?.user;
-	const needsPasskey = !authPending && passkeyRequired;
+	const needsName = !authPending && nameRequired;
+	// One card at a time: the name step leads on to the passkey step itself.
+	const needsPasskey = !authPending && passkeyRequired && !nameRequired;
 	const clearError = (key: keyof FieldErrors) =>
 		setFieldErrors((current) =>
 			current[key] ? { ...current, [key]: undefined } : current,
@@ -402,7 +414,7 @@
 
 						{signedOut && (
 							// Before the form, not after it: the old stop was a 401 on
-							// Pay, which sent a customer to Google with every field
+							// Pay, which sent a customer off to sign in with every field
 							// they had just typed thrown away.
 							<div className="flex max-w-[480px] flex-col gap-3 rounded-[14px] border border-[#e5e5e5] bg-white px-5 py-5">
 								<div>
@@ -413,11 +425,30 @@
 										{t.quote.signInBody}
 									</p>
 								</div>
-								<GoogleSignInButton
-									callbackURL={quoteUrl()}
-									label={t.signIn.continueWithGoogle}
-									errorMessage={t.signIn.error}
-								/>
+								<a
+									href={`/${locale}/sign-in?next=${encodeURIComponent(quoteUrl())}`}
+									className="flex items-center justify-center rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white"
+								>
+									{t.signIn.signInOrCreate}
+								</a>
+							</div>
+						)}
+						{needsName && (
+							<div className="flex max-w-[480px] flex-col gap-3 rounded-[14px] border border-[#e5e5e5] bg-white px-5 py-5">
+								<div>
+									<p className="font-semibold text-[15px]">
+										{t.welcome.checkoutHeading}
+									</p>
+									<p className="mt-1 text-[#5c574e] text-[13px] leading-[18px]">
+										{t.welcome.checkoutBody}
+									</p>
+								</div>
+								<a
+									href={`/${locale}/welcome?next=${encodeURIComponent(quoteUrl())}`}
+									className="flex items-center justify-center rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white"
+								>
+									{t.welcome.checkoutButton}
+								</a>
 							</div>
 						)}
 						{needsPasskey && (
@@ -440,7 +471,7 @@
 						)}
 						<form
 							noValidate
-							hidden={authPending || signedOut || needsPasskey}
+							hidden={authPending || signedOut || needsName || needsPasskey}
 							className="flex max-w-[480px] flex-col gap-7"
 							aria-describedby={error ? "order-error" : undefined}
 							onChange={(e) =>
```

- [ ] **Step 10: The planner nudge**

Replace `src/components/planner/SignInNudge.tsx` whole. It no longer starts a Google sign-in itself; it sends the customer to the sign-in page and back to where they were.

```tsx
"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth/client";
import { useCopy, useLocale } from "./CopyContext";

const DISMISSED = "ezcabinet.planner.nudgeDismissed";

/**
 * Appears once the customer has placed something worth keeping, and never
 * before: the planner opens with no account because the conversion decision in
 * CLAUDE.md says a customer trades a phone number *after* sinking time into a
 * design, not before seeing the 3D scene.
 *
 * It is a nudge, not a gate. The design is already safe on disk (plannerDraft);
 * this is about the customer knowing they can come back to it.
 *
 * It renders in the flow of the price footer, directly above the quote
 * button, never as a floating layer. It used to be `fixed` against the
 * viewport, which put it exactly on top of the estimated total — the one
 * number the customer is deciding on — and, at z-30, over the breakdown
 * modal too. Being about checkout, beside the checkout button is where it
 * belongs anyway.
 *
 * The action says "Sign in or create an account" and names no provider: it
 * leads to the sign-in page, which offers every way in. The account is
 * made on first use whichever way that is, so signing up and signing in are
 * the same click — and until they click, a visitor is anonymous and nothing
 * can tell a new one from a returning one.
 */
export function SignInNudge({ cabinetCount }: { cabinetCount: number }) {
	const t = useCopy();
	const locale = useLocale();
	const { data: session, isPending } = authClient.useSession();
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		try {
			setDismissed(localStorage.getItem(DISMISSED) === "1");
		} catch {
			setDismissed(false);
		}
	}, []);

	const visible =
		!isPending && !session?.user && !dismissed && cabinetCount > 0;

	// Fire "shown" once per appearance, not on every re-render (session poll,
	// parent update, ...) — a track call in the render body would fire dozens
	// of times per drag.
	useEffect(() => {
		if (visible) track("sign_in_nudge", { action: "shown" });
	}, [visible]);

	if (!visible) return null;

	return (
		<div className="flex flex-col gap-2 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-3 py-2.5">
			<p className="text-[12px] text-neutral-700 leading-4">{t.signIn.nudge}</p>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<button
					type="button"
					onClick={() => {
						// Fired beside a navigation, so it can be lost — known issue 8.
						track("sign_in_nudge", { action: "accepted" });
						// Read at the click: the planner's URL moves as the customer works.
						const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
						window.location.assign(
							`/${locale}/sign-in?next=${encodeURIComponent(here)}`,
						);
					}}
					className="whitespace-nowrap rounded-[8px] bg-neutral-900 px-3 py-1.5 font-medium text-[12px] text-white"
				>
					{t.signIn.signInOrCreate}
				</button>
				<button
					type="button"
					onClick={() => {
						track("sign_in_nudge", { action: "dismissed" });
						setDismissed(true);
						try {
							localStorage.setItem(DISMISSED, "1");
						} catch {}
					}}
					className="whitespace-nowrap text-[12px] text-neutral-500 hover:text-neutral-900"
				>
					{t.signIn.nudgeDismiss}
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 11: Where an empty name would show**

A customer who left before the name step has none. The account menu hides the empty line (the address is on the next one). In `src/components/AccountMenu.tsx`:

```diff
--- a/src/components/AccountMenu.tsx
+++ b/src/components/AccountMenu.tsx
@@ -99,7 +99,10 @@
 					className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-60 flex-col rounded-xl border border-[#e5e5e5] bg-white p-1.5 shadow-[0_12px_32px_rgba(23,23,23,.12)]"
 				>
 					<div className="mb-1 border-[#ecebe7] border-b px-2.5 pt-2.5 pb-3">
-						<p className="truncate font-semibold text-[13px]">{user.name}</p>
+						{/* Empty for a customer who left before the name step. */}
+						{user.name && (
+							<p className="truncate font-semibold text-[13px]">{user.name}</p>
+						)}
 						<p className="truncate text-[#5c574e] text-[12px]">{user.email}</p>
 					</div>
 					{/* A shortcut, not a gate: every admin page calls `requireAuth`. */}
```

On the staff screen the address labels the row and its dialogs instead. In `src/app/admin/users/UsersTable.tsx`:

```diff
--- a/src/app/admin/users/UsersTable.tsx
+++ b/src/app/admin/users/UsersTable.tsx
@@ -279,7 +279,10 @@
 					<span />
 				</div>
 				<ul>
-					{shown.map((user) => {
+					{shown.map((row) => {
+						// A code customer who left before the name step has none;
+						// the address labels the row and its dialogs instead.
+						const user = { ...row, name: row.name || row.email };
 						const isSelf = user.id === selfId;
 						return (
 							<li
```

- [ ] **Step 12: Comments that would now mislead**

These say Google is the only way a customer signs in. No behaviour changes. Admin files and anything literally about Google (staff sign-in, `removePassword.ts`, `twoFactor.ts`, `inviteMail.ts`) are left alone. `verify/page.tsx`, `orders/access.ts` and `passkeyHooks.ts` had theirs corrected in Tasks 5 and 6.

```diff
--- a/src/app/[lang]/verify/PasskeyGate.tsx
+++ b/src/app/[lang]/verify/PasskeyGate.tsx
@@ -65,8 +65,8 @@
 				{ reason },
 			);
 			if (reason === "stale") {
-				// Enrolling needs a session under a day old; a new Google sign-in
-				// makes one and lands back here.
+				// Enrolling needs a session under a day old; signing in again, by
+				// whichever route, makes one and lands back here.
 				setStale(true);
 				setBusy(false);
 				return;
```

```diff
--- a/src/lib/auth/passkeyRules.ts
+++ b/src/lib/auth/passkeyRules.ts
@@ -24,7 +24,7 @@
  * What a session may do to its account's passkeys.
  *
  * The plugin's defaults let any fresh session register another passkey and
- * any session delete one — so whoever held only the Google account could add
+ * any session delete one — so whoever held only the sign-in could add
  * their own and verify with it. Hence: the first passkey is free (there is
  * nothing to verify against yet), every later change needs a passkey
  * ceremony in the last few minutes, and the last passkey is never deleted
@@ -36,7 +36,7 @@
  * caller derives `recentPasskey` with `recentStepUp` (`stepUp.ts`).
  *
  * `authenticate` needs a signed-in account because the passkey is a second
- * step after Google, never a sign-in on its own.
+ * step after sign-in, never a sign-in on its own.
  */
 export function passkeyDecision(s: {
 	action: PasskeyAction;
```

```diff
--- a/src/lib/auth/resetPasskeys.ts
+++ b/src/lib/auth/resetPasskeys.ts
@@ -3,9 +3,9 @@
 
 /**
  * A customer lost every device that held a passkey. Their account goes back
- * to "no passkey", so the next Google sign-in enrols a new one.
+ * to "no passkey", so the next sign-in enrols a new one.
  *
- * That is exactly what an attacker holding the Google account wants, which
+ * That is exactly what an attacker holding the sign-in wants, which
  * is why this is a staff action and not a button on the verify page: the
  * check is a person at EzCabinet confirming who is calling (order number and
  * the phone on the order — both shown on the row).
```

```diff
--- a/src/lib/plannerDraft.ts
+++ b/src/lib/plannerDraft.ts
@@ -1,10 +1,11 @@
 /**
  * The customer's work-in-progress design, kept in the browser.
  *
- * Signing in navigates away from the page — Google's redirect takes the whole
- * document, and with it the R3F scene and every piece of React state. So the
- * layout is written down on every change rather than at the moment we happen
- * to ask for an account. That also survives a refresh, a crash and a closed
+ * Signing in navigates away from the page — to the sign-in page, and from
+ * there perhaps to a provider — which takes the whole document, and with it
+ * the R3F scene and every piece of React state. So the layout is written
+ * down on every change rather than at the moment we happen to ask for an
+ * account. That also survives a refresh, a crash and a closed
  * tab, which no amount of prompting earlier would have.
  *
  * Deliberately NOT in `lib/planner`: that folder is the pure engine Phase 4
```

- [ ] **Step 13: Typecheck, lint, full tests**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all clean. `typecheck` is what catches a reader of `signIn.error` that this task missed, or a key missing from `ms.ts` or `zh.ts`.

- [ ] **Step 14: Commit**

```bash
git add src/lib/copy/en.ts src/lib/copy/ms.ts src/lib/copy/zh.ts src/lib/copy/__tests__/dictionary.test.ts "src/app/[lang]/not-found.tsx" "src/app/[lang]/sign-in/page.tsx" src/components/planner/QuoteScreen.tsx src/components/planner/SignInNudge.tsx src/components/AccountMenu.tsx src/app/admin/users/UsersTable.tsx "src/app/[lang]/verify/PasskeyGate.tsx" src/lib/auth/passkeyRules.ts src/lib/auth/resetPasskeys.ts src/lib/plannerDraft.ts
```

```bash
git commit -m "feat(copy): sign-in and name-step text, and no provider named off its own button" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 9: The sign-in page and the name step

**Files:**
- Modify: `src/lib/auth/safeCustomerNext.ts`; Test: `src/lib/auth/__tests__/safeCustomerNext.test.ts`
- Create: `src/app/[lang]/sign-in/emailCode.ts`; Test: `src/app/[lang]/sign-in/__tests__/emailCode.test.ts`
- Create: `src/app/[lang]/sign-in/EmailCodeForm.tsx`
- Modify: `src/app/[lang]/sign-in/page.tsx` (rewritten)
- Create: `src/app/[lang]/welcome/page.tsx`, `src/app/[lang]/welcome/WelcomeForm.tsx`
- Test: `src/app/[lang]/welcome/__tests__/page.test.ts`

**Interfaces:**
- Consumes: `CODES_PER_HOUR` (Task 1); the two `authClient` calls (Task 4); `AuthUser.mustSetName` and `POST /api/account/name` with its answers (Task 5); `Dictionary["signIn"]` and `Dictionary["welcome"]` (Task 8); `passkeysSupported(win): boolean` from `src/app/[lang]/verify/passkeySupport.ts` (existing); `fill(template, values)` from `@/lib/copy/fill`; `Spinner`; `GoogleSignInButton` (existing, untouched: props `callbackURL`, `label`, `errorMessage`).
- Produces:
  - `safeWelcomeNext(next: string | string[] | undefined, lang: string): string` from `@/lib/auth/safeCustomerNext`: a same-site path, the verify page allowed, the welcome page not, falling back to `/${lang}`. `safeCustomerNext` keeps its signature and behaviour.
  - From `./emailCode` (pure): `RESEND_AFTER_S = 30`, `normaliseEmail`, `looksLikeEmail`, `cleanCode`, `type FormMessage`, `sendFailure`, `verifyFailure`, `maySendAgain`, `canStart`.
  - `<EmailCodeForm next copy unsupported />`
  - `/[lang]/welcome?next=…`, with `<WelcomeForm next copy />` and `nameMessage(status: number, error: unknown): "nameRequired" | "nameRefused" | "failed" | null`.

`next` is handled as today for the Google button: the raw `?next=` goes to Better Auth as `callbackURL`, which checks it against trusted origins. The code path is new and navigates by itself with `window.location.assign`, so it gets a checked value. `safeCustomerNext` cannot be reused as it is: it refuses the verify page, and a customer whose session lapsed on the verify page is sent here with exactly that as `next`. `safeCustomerNext` was broken twice in review, so the change is a refactor to one shared parser, told which page may not be the target, with the whole hostile-input table run against the new function too.

After the code is accepted the form always goes to `/[lang]/welcome?next=<checked next>`. Only the server knows whether the account owes a name. The welcome page redirects a customer who owes nothing straight to the target, so a returning customer never sees it; a new one gives their name and carries on, usually into the passkey step. A customer who closes the tab at the name step meets it again at their next sign-in by the same road, and Task 5's gates cover every other way in.

- [ ] **Step 1: Write the failing tests**

In `src/lib/auth/__tests__/safeCustomerNext.test.ts`:

```diff
--- a/src/lib/auth/__tests__/safeCustomerNext.test.ts
+++ b/src/lib/auth/__tests__/safeCustomerNext.test.ts
@@ -1,5 +1,5 @@
 import { describe, expect, it } from "vitest";
-import { safeCustomerNext } from "@/lib/auth/safeCustomerNext";
+import { safeCustomerNext, safeWelcomeNext } from "@/lib/auth/safeCustomerNext";
 
 describe("safeCustomerNext", () => {
 	it("keeps a same-site path", () => {
@@ -49,3 +49,50 @@
 		);
 	});
 });
+
+describe("safeWelcomeNext", () => {
+	it("never sends the customer back to the name step itself", () => {
+		for (const next of [
+			"/en/welcome?next=/en/orders",
+			"/en/WELCOME",
+			"/en/%77elcome",
+			"/en/./welcome",
+		]) {
+			expect(safeWelcomeNext(next, "en")).toBe("/en");
+		}
+	});
+	it("keeps a same-site path, the verify bounce included", () => {
+		expect(safeWelcomeNext("/en/planner/kitchen?a=1#quote", "en")).toBe(
+			"/en/planner/kitchen?a=1#quote",
+		);
+		expect(safeWelcomeNext("/ms/verify?next=%2Fms%2Forder%2Fabc", "ms")).toBe(
+			"/ms/verify?next=%2Fms%2Forder%2Fabc",
+		);
+	});
+	it.each([
+		["nothing", undefined],
+		["empty", ""],
+		["another site", "https://evil.example/x"],
+		["protocol-relative", "//evil.example/x"],
+		["backslash trick", "/\\evil.example"],
+		["no leading slash", "en/orders"],
+		["javascript", "javascript:alert(1)"],
+		["tab after the slash", "/\t/evil.example"],
+		["newline after the slash", "/\n/evil.example"],
+		["carriage return after the slash", "/\r/evil.example"],
+		["double backslash", "\\\\evil.example"],
+		["malformed encoding", "/%E0%A4%A"],
+		["dot segments leave an empty one", "/a/..//evil.example"],
+		["current dir then empty segment", "/.//evil.example"],
+		["parent dir then empty segment", "/..//evil.example"],
+		["dot segments with a path", "/en/..//evil.example/path"],
+		["empty segment in the middle", "/en///orders"],
+		["empty segment before verify", "/en//verify"],
+		["dot slash only", "/./"],
+		["bare slash", "/"],
+		["a repeated parameter", ["/en/orders", "/en/order/x"]],
+		["a non-string", 42],
+	] as [string, never][])("falls back to home for %s", (_label, next) => {
+		expect(safeWelcomeNext(next, "zh")).toBe("/zh");
+	});
+});
```

Create `src/app/[lang]/sign-in/__tests__/emailCode.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	canStart,
	cleanCode,
	looksLikeEmail,
	maySendAgain,
	normaliseEmail,
	RESEND_AFTER_S,
	sendFailure,
	verifyFailure,
} from "../emailCode";

describe("normaliseEmail", () => {
	it.each([
		["Aiman@Outlook.com", "aiman@outlook.com"],
		["  aiman@outlook.com ", "aiman@outlook.com"],
		["aiman@outlook.com\n", "aiman@outlook.com"],
		// Full-width, from a Chinese keyboard.
		["ａｉｍａｎ＠ｏｕｔｌｏｏｋ．ｃｏｍ", "aiman@outlook.com"],
	])("%j", (typed, expected) => {
		expect(normaliseEmail(typed)).toBe(expected);
	});
});

describe("looksLikeEmail", () => {
	it.each([
		["aiman@outlook.com", true],
		["a.b+c@mail.example.my", true],
		["aiman@outlook", false],
		["aiman outlook.com", false],
		["aiman@@outlook.com", false],
		["@outlook.com", false],
		["", false],
	])("%j", (address, expected) => {
		expect(looksLikeEmail(address)).toBe(expected);
	});
});

describe("cleanCode", () => {
	it.each([
		["482913", "482913"],
		["482 913", "482913"],
		[" 482913\n", "482913"],
		["482-913", "482913"],
		["Your EzCabinet sign-in code is 482913", "482913"],
		["４８２９１３", "482913"],
		["4829137", "482913"],
		["", ""],
	])("%j", (typed, expected) => {
		expect(cleanCode(typed)).toBe(expected);
	});
});

describe("what the customer is told", () => {
	it.each([
		[{ status: 400, code: "INVALID_OTP" }, "wrongCode"],
		[{ status: 400, code: "OTP_EXPIRED" }, "codeExpired"],
		[{ status: 403, code: "TOO_MANY_ATTEMPTS" }, "codeExpired"],
		[{ status: 429 }, "codeExpired"],
		[{ status: 500 }, "failed"],
		// The request never left the phone.
		[{}, "failed"],
	])("a failed code %j", (error, expected) => {
		expect(verifyFailure(error)).toBe(expected);
	});

	it.each([
		[429, "tooMany"],
		[403, "failed"],
		[500, "failed"],
		[undefined, "failed"],
	])("a failed send, status %s", (status, expected) => {
		expect(sendFailure(status)).toBe(expected);
	});

	it("stops the form at the server's cap, before the request that would be dropped", () => {
		expect(maySendAgain(0)).toBe(true);
		expect(maySendAgain(2)).toBe(true);
		expect(maySendAgain(3)).toBe(false);
	});

	it("holds the resend back thirty seconds", () => {
		expect(RESEND_AFTER_S).toBe(30);
	});
});

// WhatsApp's, Facebook's and most mail apps' built-in browsers have no
// passkeys, so the journey cannot finish there.
describe("canStart", () => {
	it.each([
		["before the browser has been asked", null, "wait"],
		["a browser with passkeys", true, "go"],
		["an in-app browser", false, "blocked"],
	] as const)("%s", (_label, supported, expected) => {
		expect(canStart(supported)).toBe(expected);
	});
});
```

Create `src/app/[lang]/welcome/__tests__/page.test.ts`. It calls the page function and reads the `next` it hands its form off the returned tree, as the account pages' tests call theirs.

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("next/navigation", () => ({
	notFound: (): never => {
		throw new Error("NOT_FOUND");
	},
	redirect: (url: string): never => {
		throw new Error(`REDIRECT:${url}`);
	},
}));
vi.mock("@/lib/copy/dictionary", () => ({
	getDictionary: async () => ({ welcome: { heading: "h", body: "b" } }),
}));

const { default: WelcomePage } = await import("@/app/[lang]/welcome/page");
const { nameMessage, WelcomeForm } = await import(
	"@/app/[lang]/welcome/WelcomeForm"
);

const customer = (over: Partial<AuthUser>): AuthUser => ({
	id: "c1",
	email: "aiman@outlook.com",
	name: "Aiman",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: true,
	mustSetName: false,
	...over,
});

const open = (next?: string | string[], lang = "en") =>
	WelcomePage({
		params: Promise.resolve({ lang }),
		searchParams: Promise.resolve({ next }),
	});

/** The `next` the page hands its form, read off the rendered tree. */
const formNext = (tree: unknown): string | undefined => {
	const seen: unknown[] = [tree];
	while (seen.length) {
		const node = seen.pop() as {
			type?: unknown;
			props?: { next?: string; children?: unknown };
		} | null;
		if (!node || typeof node !== "object") continue;
		if (node.type === WelcomeForm) return node.props?.next;
		const children = node.props?.children;
		if (Array.isArray(children)) seen.push(...children);
		else seen.push(children);
	}
	return undefined;
};

beforeEach(() => currentUser.mockReset());

describe("the name step", () => {
	it("asks a customer with no name, and remembers where they were going", async () => {
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		const tree = await open("/en/planner/kitchen?a=1#quote");
		expect(formNext(tree)).toBe("/en/planner/kitchen?a=1#quote");
	});

	// Closed the tab at this step and signed in again another day: the code
	// form always comes through here, so the step is simply met again.
	it("asks again on a later sign-in, however long ago the account was made", async () => {
		currentUser.mockResolvedValue(customer({ name: "  ", mustSetName: true }));
		const tree = await open("/en/verify?next=%2Fen%2Forder%2Fabc");
		expect(formNext(tree)).toBe("/en/verify?next=%2Fen%2Forder%2Fabc");
	});

	it("passes a customer who has a name straight on, never showing the form", async () => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open("/ms/orders", "ms")).rejects.toThrow(
			"REDIRECT:/ms/orders",
		);
	});

	it("passes staff straight on", async () => {
		currentUser.mockResolvedValue(
			customer({ role: "ADMIN", name: "", mustVerifyPasskey: false }),
		);
		await expect(open("/en/orders")).rejects.toThrow("REDIRECT:/en/orders");
	});

	it("sends a signed-out visitor to sign in, keeping the target", async () => {
		currentUser.mockResolvedValue(null);
		await expect(open("/en/orders")).rejects.toThrow(
			"REDIRECT:/en/sign-in?next=%2Fen%2Forders",
		);
	});

	it.each([
		["another site", "https://evil.example/x"],
		["a protocol-relative URL", "//evil.example"],
		["this page again", "/en/welcome?next=/en/orders"],
		["a repeated parameter", ["/en/orders", "/en/x"]],
		["nothing", undefined],
	])("goes home instead of following %s", async (_label, next) => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open(next)).rejects.toThrow("REDIRECT:/en");
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		expect(formNext(await open(next))).toBe("/en");
	});

	it("404s an unknown language", async () => {
		await expect(open("/xx/orders", "xx")).rejects.toThrow("NOT_FOUND");
	});
});

describe("nameMessage", () => {
	it.each([
		[200, undefined, null],
		[400, "name_required", "nameRequired"],
		[400, "name_refused", "nameRefused"],
		[401, "sign_in_required", "failed"],
		[500, undefined, "failed"],
	])("status %i, error %j", (status, error, expected) => {
		expect(nameMessage(status, error)).toBe(expected);
	});
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm vitest run safeCustomerNext sign-in/__tests__/emailCode welcome/__tests__/page`
Expected: FAIL. `safeWelcomeNext` cases fail with `safeWelcomeNext is not a function`; the existing `safeCustomerNext` cases pass; the other two suites cannot load (`Cannot find module '../emailCode'`, and the welcome page's module).

- [ ] **Step 3: One parser, two callers**

Replace `src/lib/auth/safeCustomerNext.ts` whole. The body of the old function becomes `sameSitePath`, returning `null` where it returned the fallback; the refused page is the only thing that depends on the caller.

```ts
const BASE = "https://site.invalid";

/**
 * A `next` from the query string is attacker-supplied: only a path on this
 * site is followed. Returns the parsed path, or null when it is not one.
 *
 * Checking prefixes is not enough: a browser strips tab, LF and CR from
 * anywhere in a URL, so "/\t/evil.example" reads as `//evil.example`. So the
 * input is parsed the way a browser will, must stay on our origin, and what
 * is returned is the parsed form, never the raw string.
 *
 * Dot segments are the other trap: "/a/..//evil.example" resolves to
 * "//evil.example", so an empty path segment is refused outright and the
 * result must re-parse to itself on our origin.
 */
function sameSitePath(next: unknown, refused: string[]): string | null {
	// A repeated `?next=a&next=b` arrives as an array: not ours to guess at.
	if (typeof next !== "string" || !next.startsWith("/")) return null;
	// Control characters and backslashes are never in a path we link to.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
	if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;

	let url: URL;
	let segments: string[];
	try {
		url = new URL(next, BASE);
		segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
	} catch {
		return null;
	}
	if (url.origin !== BASE) return null;
	// The asking page itself, however it is spelled (%76erify, VERIFY, ./, //).
	if (refused.includes(segments[1]?.toLowerCase())) return null;
	// Dot segments are resolved but an empty segment survives them:
	// "/a/..//evil.example" parses to "//evil.example", which a browser reads
	// as another site. Refuse any empty segment rather than repair it.
	if (url.pathname === "/" || url.pathname.includes("//")) return null;

	// Second, independent proof: what we return must re-parse to itself, on
	// our origin.
	const result = url.pathname + url.search + url.hash;
	try {
		const again = new URL(result, BASE);
		if (
			again.origin !== BASE ||
			again.pathname + again.search + again.hash !== result
		)
			return null;
	} catch {
		return null;
	}
	return result;
}

/** Where the verify page sends a customer afterwards. */
export function safeCustomerNext(
	next: string | string[] | undefined,
	lang: string,
): string {
	return sameSitePath(next, ["verify"]) ?? `/${lang}/orders`;
}

/**
 * Where the name step (`/[lang]/welcome`) sends a customer afterwards, and
 * so where a code sign-in is headed: the email form always goes through that
 * page, which passes a customer who owes no name straight on. The provider
 * buttons hand `next` to Better Auth, which checks it; this path navigates
 * by itself, so it gets the same check here.
 *
 * The verify page is allowed — a customer whose session lapsed there is sent
 * to sign in with it as `next` — and re-checks its own `next`. The welcome
 * page is not: it would only send them round again.
 */
export function safeWelcomeNext(
	next: string | string[] | undefined,
	lang: string,
): string {
	return sameSitePath(next, ["welcome"]) ?? `/${lang}`;
}
```

- [ ] **Step 4: The email form's pure rules**

Create `src/app/[lang]/sign-in/emailCode.ts`:

```ts
import { CODES_PER_HOUR } from "@/lib/auth/emailCodeRules";

/**
 * Seconds before "Send a new code" is offered. Mail is rarely slower than
 * this, and a second code makes the first one useless — so the customer is
 * held back from asking again while the first is probably still on its way.
 */
export const RESEND_AFTER_S = 30;

/**
 * What the customer typed, as the address the server will use. NFKC first: a
 * Chinese keyboard left in full-width mode types `＠` and `．`, which look
 * right and match nothing.
 */
export function normaliseEmail(input: string): string {
	return input.normalize("NFKC").trim().toLowerCase();
}

/** Loose on purpose: the code arriving is the real check. */
export function looksLikeEmail(address: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
}

/**
 * The six digits out of whatever landed in the box: a paste with spaces
 * ("482 913"), a whole pasted sentence, or full-width digits.
 */
export function cleanCode(input: string): string {
	return input.normalize("NFKC").replace(/\D/g, "").slice(0, 6);
}

/** Keys of `signIn` in the dictionary. */
export type FormMessage = "wrongCode" | "codeExpired" | "tooMany" | "failed";

/** 429 is Better Auth's per-network limit; anything else is ours or the network's. */
export function sendFailure(status: number | undefined): FormMessage {
	return status === 429 ? "tooMany" : "failed";
}

/**
 * A used-up code and a rate-limited try get the "expired" message: either
 * way the next step is a new code, which is what that message says.
 */
export function verifyFailure(error: {
	status?: number;
	code?: string;
}): FormMessage {
	if (error.code === "INVALID_OTP") return "wrongCode";
	if (
		error.code === "OTP_EXPIRED" ||
		error.code === "TOO_MANY_ATTEMPTS" ||
		error.status === 429
	) {
		return "codeExpired";
	}
	return "failed";
}

/**
 * The server drops a fourth code in the hour without saying so (its answer
 * must not differ by address), and that request would also kill the third
 * code. So the form counts its own sends and says "too many" itself.
 */
export function maySendAgain(sent: number): boolean {
	return sent < CODES_PER_HOUR;
}

/**
 * Whether the form may be used at all. `supported` is `passkeysSupported`,
 * null until the browser has been asked. An in-app browser cannot do the
 * passkey step that follows sign-in, so a code asked for there would be mail
 * the customer can do nothing with: they are told before, not after.
 */
export function canStart(supported: boolean | null): "wait" | "blocked" | "go" {
	if (supported === null) return "wait";
	return supported ? "go" : "blocked";
}
```

- [ ] **Step 5: The email form**

Create `src/app/[lang]/sign-in/EmailCodeForm.tsx`:

```tsx
"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { passkeysSupported } from "@/app/[lang]/verify/passkeySupport";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import {
	canStart,
	cleanCode,
	type FormMessage,
	looksLikeEmail,
	maySendAgain,
	normaliseEmail,
	RESEND_AFTER_S,
	sendFailure,
	verifyFailure,
} from "./emailCode";

const FIELD =
	"min-h-10 rounded-[9px] border border-neutral-300 px-3 py-2.5 text-sm";
const PRIMARY =
	"flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60";
const QUIET =
	"text-left text-[12px] text-neutral-500 hover:text-neutral-900 disabled:hover:text-neutral-500";

/**
 * Sign-in for a customer with any email: the address, then the six-digit
 * code mailed to it, typed into this same tab. A code and not a link — a link
 * opens in the mail app's own browser, where the saved design is absent and
 * passkeys do not work.
 *
 * The server answers a code request the same way whoever the address belongs
 * to, so "code sent" is all this can say. What it can do for a customer who
 * mistyped is keep the address in front of them with a way back.
 */
export function EmailCodeForm({
	next,
	copy,
	unsupported,
}: {
	/** The name step, with a checked target: this form navigates by itself. */
	next: string;
	copy: Dictionary["signIn"];
	/** `passkey.unsupported`, for a browser that cannot finish the journey. */
	unsupported: string;
}) {
	// Unknown until mounted: the server cannot see the browser's capabilities.
	const [supported, setSupported] = useState<boolean | null>(null);
	const [step, setStep] = useState<"address" | "code">("address");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<FormMessage | "emailInvalid" | null>(
		null,
	);
	const [sent, setSent] = useState(0);
	const [wait, setWait] = useState(0);
	// `busy` is state, so two submits in one tick (Enter, then autofill) would
	// both read it false. The second would spend the code the first is using.
	const inFlight = useRef(false);

	useEffect(() => {
		setSupported(passkeysSupported(window));
	}, []);

	useEffect(() => {
		if (wait <= 0) return;
		const timer = setTimeout(() => setWait((s) => s - 1), 1000);
		return () => clearTimeout(timer);
	}, [wait]);

	const address = normaliseEmail(email);

	async function requestCode() {
		if (inFlight.current) return;
		if (!looksLikeEmail(address)) {
			setMessage("emailInvalid");
			return;
		}
		if (!maySendAgain(sent)) {
			setMessage("tooMany");
			return;
		}
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: { status?: number } | null = null;
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: address,
				type: "sign-in",
			});
			failure = error ?? null;
		} catch {
			failure = {};
		}
		inFlight.current = false;
		setBusy(false);
		if (failure) {
			setMessage(sendFailure(failure.status));
			return;
		}
		setSent((n) => n + 1);
		setCode("");
		setWait(RESEND_AFTER_S);
		setStep("code");
	}

	async function submitCode() {
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: { status?: number; code?: string } | null = null;
		try {
			const { error } = await authClient.signIn.emailOtp({
				email: address,
				otp: cleanCode(code),
			});
			failure = error ?? null;
		} catch {
			failure = {};
		}
		if (failure) {
			inFlight.current = false;
			setBusy(false);
			setMessage(verifyFailure(failure));
			return;
		}
		// A full navigation, so the next page renders against the new session.
		// `busy` stays set: the browser is leaving.
		window.location.assign(next);
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (step === "address") requestCode();
		else submitCode();
	}

	const start = canStart(supported);
	if (start === "blocked") {
		return (
			<p role="alert" className="text-[14px] text-neutral-700 leading-5">
				{unsupported}
			</p>
		);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
			{step === "address" ? (
				<label className="flex flex-col gap-1 text-[13px]">
					{copy.emailLabel}
					<input
						type="email"
						name="email"
						autoComplete="email"
						inputMode="email"
						autoCapitalize="none"
						spellCheck={false}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className={FIELD}
					/>
				</label>
			) : (
				<>
					<p className="text-[13px] text-neutral-700 leading-[18px]">
						{fill(copy.codeSent, { email: address })}
					</p>
					<label className="flex flex-col gap-1 text-[13px]">
						{copy.codeLabel}
						<input
							type="text"
							name="code"
							autoComplete="one-time-code"
							inputMode="numeric"
							required
							value={code}
							onChange={(e) => setCode(e.target.value)}
							className={`${FIELD} tracking-[0.3em]`}
						/>
					</label>
				</>
			)}

			{message && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700"
				>
					{copy[message]}
				</p>
			)}

			<button
				type="submit"
				disabled={busy || start === "wait"}
				className={PRIMARY}
			>
				{busy && <Spinner />}
				{step === "address" ? copy.continueEmail : copy.submitCode}
			</button>

			{step === "code" && (
				<div className="flex flex-col gap-1.5">
					<p className="text-[12px] text-neutral-500 leading-4">
						{copy.codeHint}
					</p>
					<button
						type="button"
						onClick={requestCode}
						disabled={busy || wait > 0}
						className={QUIET}
					>
						{wait > 0 ? fill(copy.resendIn, { seconds: wait }) : copy.resend}
					</button>
					<button
						type="button"
						onClick={() => {
							setStep("address");
							setSent(0);
							setCode("");
							setMessage(null);
						}}
						disabled={busy}
						className={QUIET}
					>
						{copy.changeEmail}
					</button>
				</div>
			)}
		</form>
	);
}
```

- [ ] **Step 6: The sign-in page**

Replace `src/app/[lang]/sign-in/page.tsx` whole. `GoogleSignInButton.tsx` is not changed.

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { safeWelcomeNext } from "@/lib/auth/safeCustomerNext";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { EmailCodeForm } from "./EmailCodeForm";
import { GoogleSignInButton } from "./GoogleSignInButton";

/** Never indexed: it exists to bounce a customer back into checkout. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * Checkout's one hard stop. Browsing, planning and pricing stay anonymous —
 * the conversion decision in CLAUDE.md — so this page is reached from a 401
 * at `POST /api/orders`, and also wherever the order, tracking or My-orders
 * pages send a signed-out visitor; `?next=` is where it sends the customer
 * back to in every case. The design itself is already safe in
 * `plannerDraft`'s localStorage, not carried through this redirect.
 *
 * Two ways in, one account per email: Google, and a code mailed to any
 * address, whose first sign-in is followed by the name step
 * (`/[lang]/welcome`).
 */
export default async function SignInPage({
	params,
	searchParams,
}: {
	params: Promise<{ lang: string }>;
	searchParams: Promise<{ next?: string }>;
}) {
	const [{ lang }, { next }] = await Promise.all([params, searchParams]);
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const s = t.signIn;

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] px-6 text-neutral-900">
			<div className="flex w-full max-w-[360px] flex-col gap-5 rounded-[14px] border border-neutral-200 bg-white px-7 py-8">
				<div>
					<h1 className="font-semibold text-[22px]">{s.heading}</h1>
					<p className="mt-1.5 text-[14px] text-neutral-500 leading-5">
						{s.body}
					</p>
				</div>

				<GoogleSignInButton
					callbackURL={next || `/${lang}`}
					label={s.continueWithGoogle}
					errorMessage={s.googleError}
				/>

				<p className="text-center text-[12px] text-neutral-500">{s.orEmail}</p>
				<EmailCodeForm
					// Always by way of the name step: only the server knows whether
					// this account owes one, and that page passes straight on if not.
					next={`/${lang}/welcome?next=${encodeURIComponent(safeWelcomeNext(next, lang))}`}
					copy={s}
					unsupported={t.passkey.unsupported}
				/>

				<p className="text-center text-[12px] text-neutral-500 leading-[17px]">
					{s.privacyNote}{" "}
					<Link href={`/${lang}/privacy`} className="underline">
						{t.privacy.title}
					</Link>
				</p>

				<Link
					href={`/${lang}`}
					className="text-center text-[12px] text-neutral-500 hover:text-neutral-900"
				>
					{s.back}
				</Link>
			</div>
		</main>
	);
}
```

- [ ] **Step 7: The name step**

Create `src/app/[lang]/welcome/WelcomeForm.tsx`:

```tsx
"use client";

import { type FormEvent, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import type { Dictionary } from "@/lib/copy/en";

type Message = "nameRequired" | "nameRefused" | "failed";

/** The server's answer as a key of `welcome` in the dictionary. */
export function nameMessage(status: number, error: unknown): Message | null {
	if (status === 200) return null;
	if (error === "name_required") return "nameRequired";
	if (error === "name_refused") return "nameRefused";
	return "failed";
}

/**
 * One required field. The server decides what is a name
 * (`lib/auth/customerName.ts`); this only shows its answer, so the two cannot
 * drift. On success a full navigation, so the next page — usually the passkey
 * step — renders against the account as it now is.
 */
export function WelcomeForm({
	next,
	copy,
}: {
	/** Already checked by `safeWelcomeNext`. */
	next: string;
	copy: Dictionary["welcome"];
}) {
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<Message | null>(null);
	// `busy` is state, so two submits in one tick would both read it false.
	const inFlight = useRef(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: Message | null = "failed";
		try {
			const res = await fetch("/api/account/name", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			const body = await res.json().catch(() => null);
			// 409: the name was set in another tab. Nothing is owed; carry on.
			failure =
				res.status === 409 ? null : nameMessage(res.status, body?.error);
		} catch {
			// The request never left the phone.
		}
		if (failure) {
			inFlight.current = false;
			setBusy(false);
			setMessage(failure);
			return;
		}
		// `busy` stays set: the browser is leaving.
		window.location.assign(next);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
			<label className="flex flex-col gap-1 text-[13px]">
				{copy.nameLabel}
				<input
					type="text"
					name="name"
					autoComplete="name"
					required
					maxLength={80}
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="min-h-10 rounded-[9px] border border-neutral-300 px-3 py-2.5 text-sm"
				/>
			</label>
			{message && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700"
				>
					{copy[message]}
				</p>
			)}
			<button
				type="submit"
				disabled={busy}
				className="flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
			>
				{busy && <Spinner />}
				{copy.submit}
			</button>
		</form>
	);
}
```

Create `src/app/[lang]/welcome/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { safeWelcomeNext } from "@/lib/auth/safeCustomerNext";
import { currentUser } from "@/lib/auth/session";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { WelcomeForm } from "./WelcomeForm";

/** Never indexed: it exists only between a first sign-in and the page asked for. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The name step. A code sign-in asks for the address only, so a new account
 * has no name; it is asked for here, once, before the passkey step — whose
 * prompt would otherwise label the account with a random id.
 *
 * Every code sign-in comes through this page, because only the server knows
 * whether the account owes a name: one that does not is passed straight on.
 * Reads `currentUser()` directly rather than `viewerOf`, which redirects a
 * nameless customer straight back here.
 */
export default async function WelcomePage({
	params,
	searchParams,
}: {
	params: Promise<{ lang: string }>;
	searchParams: Promise<{ next?: string | string[] }>;
}) {
	const [{ lang }, { next }] = await Promise.all([params, searchParams]);
	if (!isLocale(lang)) notFound();
	const target = safeWelcomeNext(next, lang);

	const user = await currentUser();
	// Straight to the target: signing in by code leads back through here
	// anyway, and signing in with a provider needs no name.
	if (!user) redirect(`/${lang}/sign-in?next=${encodeURIComponent(target)}`);
	if (!user.mustSetName) redirect(target);

	const t = await getDictionary(lang);
	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] px-6 text-neutral-900">
			<div className="flex w-full max-w-[380px] flex-col gap-5 rounded-[14px] border border-neutral-200 bg-white px-7 py-8">
				<div>
					<h1 className="font-semibold text-[22px]">{t.welcome.heading}</h1>
					<p className="mt-1.5 text-[14px] text-neutral-500 leading-5">
						{t.welcome.body}
					</p>
				</div>
				<WelcomeForm next={target} copy={t.welcome} />
			</div>
		</main>
	);
}
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `pnpm vitest run safeCustomerNext sign-in/__tests__/emailCode welcome/__tests__/page`
Expected: PASS: 52 tests in `safeCustomerNext.test.ts`, 34 in `emailCode.test.ts`, 16 in the welcome page's. Every existing `safeCustomerNext` case still passes unchanged.

- [ ] **Step 9: Typecheck, lint, full tests**

```bash
pnpm typecheck
pnpm lint
pnpm test
```

Expected: all clean.

- [ ] **Step 10: Walk it in a browser**

`pnpm dev`, `RESEND_API_KEY` unset, Chrome. Codes appear in the dev server's terminal as `Sign-in code for <address>: <code>`.

1. Open `/en/sign-in`. Expected: heading, "Any email address works", a Google button, "or continue with email", an email field.
2. Type `  New.Customer@Example.com ` and press **Continue**. Expected: "We sent a 6-digit code to new.customer@example.com", a code field, "Send a new code in 30s" counting down, "Use a different email".
3. Type a wrong code. Expected: "That code is not right. Check it and try again."
4. Paste the right code with a space in the middle (`482 913`). Expected: signed in, and the browser lands on the name step, "What should we call you?".
5. Press **Continue** with the field empty. Expected: "Enter your name." Type `EzCabinet Support`. Expected: "Use your own name."
6. Close the tab. Open `/en/orders` in a new one. Expected: the name step again, not the orders list and not the passkey step. Open `/en/verify`. Expected: the name step again.
7. Type `  李明 🙂 ` and press **Continue**. Expected: the passkey step, and the device's passkey prompt names the account "李明 🙂". Set one up. Expected: `/en/orders`. The account menu shows the name with the address under it.
8. Sign out and sign in again with the same address. Expected: no name step; straight to the passkey prompt and on.
9. Sign out. Open `/en/sign-in?next=https://evil.example/` and sign in by code. Expected: ends on `/en`, never off-site.
10. On the code step, wait for the countdown and press **Send a new code** twice more. Press it a third time. Expected: "Too many codes requested. Try again in an hour.", and the Network tab shows no request for that press.
11. Press **Use a different email**. Expected: back on the address field with the address still in it.
12. Type the seeded superadmin's address. Expected: the same "We sent a 6-digit code" screen, and no `Sign-in code for` line in the terminal.
13. On the code step, type a right code and press Enter twice as fast as you can. Expected: one `sign-in/email-otp` request in the Network tab, and no "not right" flash before the page changes.
14. Repeat steps 1 to 5 at `/ms/sign-in` and `/zh/sign-in`. Expected: every string translated, "Google" only on its button.
15. In the planner, place a cabinet. Expected: the nudge reads "Sign in or create an account"; pressing it opens the sign-in page with `next` set to the planner URL. Open the quote signed out. Expected: the card's button reads the same and does the same.
16. With a fresh address, sign in by code from the quote's card and close the tab at the name step. Reopen the quote. Expected: a card "One more step before you pay" asking for the name, in place of the form; after the name and the passkey, the quote again with the name field filled in and editable.
17. In `/admin/users`, **Customers**: an account that has not given a name shows its address where the name would be.
18. Add a second passkey under **Passkeys**, then remove one. With no `RESEND_API_KEY` the terminal prints `Email not configured; nothing sent` with the mail's subject each time, and nothing else about the account.
19. Sign in with Google on the address used in step 2, if that address has a Google account. Expected: the same account, its orders intact (linking). Skip if no such address is to hand; Task 3's test covers the rule.

- [ ] **Step 11: Commit**

```bash
git add src/lib/auth/safeCustomerNext.ts src/lib/auth/__tests__/safeCustomerNext.test.ts "src/app/[lang]/sign-in/emailCode.ts" "src/app/[lang]/sign-in/__tests__/emailCode.test.ts" "src/app/[lang]/sign-in/EmailCodeForm.tsx" "src/app/[lang]/sign-in/page.tsx" "src/app/[lang]/welcome/page.tsx" "src/app/[lang]/welcome/WelcomeForm.tsx" "src/app/[lang]/welcome/__tests__/page.test.ts"
```

```bash
git commit -m "feat(sign-in): continue with any email, then your name, in the same tab" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

---

### Task 10: Docs, the Vercel side, and the whole journey

**Files:**
- Modify: `CLAUDE.md` (Auth section, two cross-references, known issue 14, Open questions)
- Modify: `docs/ops/customer-passkey-runbook.md`
- Modify: `.env.example`

**Interfaces:**
- Consumes: the names every earlier task produced. Nothing here is code.
- Produces: the house record of the feature, and the deploy checklist the operator works from, including the firewall rule.

- [ ] **Step 1: CLAUDE.md**

The on-disk file is the one to edit; it has moved on from any copy quoted elsewhere. Known issue 14 is one long line, replaced whole.

```diff
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -523,7 +523,7 @@
 own orders; `/[lang]/order/[token]` and — for a delivery that belongs to an
 order — `/[lang]/track/[token]` open only for that account or staff with
 `orders:read` (`lib/orders/access.ts`). The token in the URL is an address,
-not a key: signed out, it bounces through Google sign-in and back; signed in
+not a key: signed out, it bounces through sign-in and back; signed in
 as anyone else, it is the same 404 as a made-up token. A standalone
 admin-booked delivery keeps link access — its recipient has no account.
 
@@ -543,7 +543,7 @@
 reads the session in the browser so the statically rendered landing page,
 which also shows it, stays static. Profile, WhatsApp number, saved addresses
 and saved designs are later pieces of the Claude Design "Customer Account"
-file; customer sign-in stays Google only.
+file. How a customer signs in is under [Auth](#auth).
 
 **Not yet built.** Save writes the layout to Postgres under a `nanoid` slug, returns a short URL, creates the lead record, and attaches the screenshot. Then a `wa.me` deep link with the design URL prefilled.
 
@@ -579,14 +579,109 @@
 ## Auth
 
 Accounts, with three roles: `SUPERADMIN`, `ADMIN`, `CUSTOMER`. Customers sign
-in with Google. Staff are invited by a superadmin and can use either Google or
-the password that superadmin set. A staff account promoted from an existing
-customer row keeps only the sign-in it already had, so a Google-only staff
+in with Google, or with a six-digit code mailed to any address — never a
+password. Staff are invited by a superadmin and can use either Google or the
+password that superadmin set. A staff account promoted from an existing
+customer row that has a Google sign-in keeps only that, so a Google-only staff
 member has no password fallback — the OAuth-misconfigured escape hatch only
-exists for a row the superadmin created directly. Public sign-up can only ever
+exists for a row that was given a password. A promoted row with no Google
+sign-in is given the invite's password (below). Public sign-up can only ever
 produce a `CUSTOMER`; a role is granted only by a superadmin acting on
 `/admin/users`.
+
+**A customer can sign in with any email.** Better Auth's `emailOTP` plugin:
+the address, then a code typed into the same tab — six digits, ten minutes,
+three wrong tries, single use, stored hashed in `Verification`. A code and
+not a link, because a link opens in the mail app's in-app browser, where the
+saved design is absent and passkeys do not work. The first code sign-in
+creates the row: `CUSTOMER`, `emailVerified: true`, and no name. The passkey
+rules are unchanged and do not know how the customer signed in.
+
+**A code customer gives their name next, once.** `/[lang]/welcome`, one
+required field, posted to `POST /api/account/name`, which writes `name` on
+the caller's own row and only while it has none — there is no rename. Asked
+after the code and never on the first screen: that screen serves new and
+returning customers alike, and a name field shown only to new ones would say
+which addresses have accounts. `AuthUser.mustSetName` is derived on every
+read (`owesName`, `lib/auth/customerName.ts`) and enforced exactly where the
+passkey step is, and before it, because the device's passkey prompt shows
+the name: `viewerOf` redirects to the welcome page, the verify page does the
+same, the three order routes answer 401 `name_required` (the coverage test
+requires both checks in every route under `api/orders`), and
+`/api/payments/config` reports `nameRequired` so the quote screen shows a
+card instead of losing the form. The email form always navigates by way of
+the welcome page, which passes a customer who owes nothing straight on — only
+the server knows which is which. A customer who closes the tab there meets
+the step again at their next sign-in. `customerNameSchema` is the whole rule
+for a name: trimmed, 2 to 80 characters, any script, no control or
+direction-override characters, and not one that poses as the business. It is
+not unique, not a credential, and never identifies a caller. Until it is
+given, the name is empty: the account menu hides the line and `/admin/users`
+labels the row with its address. Any mail that carries a name escapes it
+(`esc`, `lib/auth/inviteMail.ts`).
+
+**Staff cannot use a code**, because it would be a way round both the
+password and the authenticator. It is refused three times, and none of the
+three may be removed to make a flow easier: no code is mailed for an address
+whose row is not `CUSTOMER` (`sendSignInCode`, `lib/auth/emailCodeMail.ts`);
+`/sign-in/email-otp` is refused for such a row even with a correct code, in
+case one exists from before a promotion (`emailCodeBeforeHook`); and a session
+born on that route for such a user is refused where it is created
+(`refuseStaffCodeSession`). So **promoting a customer with no Google sign-in
+sets the invite's password** on the row, with `mustChangePassword`, and the
+form shows it for handing over exactly as for a fresh invite.
+
+**The plugin registers nine routes and two are open**:
+`/email-otp/send-verification-otp` (type `sign-in` only) and
+`/sign-in/email-otp` (body `email` and `otp` only — the plugin would copy a
+posted `name` or `image` onto a new account, which is why the name has its
+own route). The other seven are in `disabledPaths` (`CLOSED_PATHS`,
+`lib/auth/emailCodeRules.ts`); two of them would put a password on a customer
+row. `emailCodeBeforeHook` refuses any other request to a path containing
+`email-otp`, so a route a plugin upgrade adds is a 403 until it is
+allow-listed — the passkey hooks' rule. `hooks.before` and
+`session.create.before` each hold two guards now; both are composed in
+`lib/auth.ts` and `__tests__/emailCodeConfig.test.ts` reads that file to
+check it, since `__tests__/emailCodeWiring.test.ts` drives the real plugin on
+an instance of its own. Keep both passing.
 
+**The answer to a code request never depends on the address.** New,
+customer, staff and over-the-cap addresses all get `{ success: true }` in the
+same time: the plugin awaits its mail callback, so the callback only
+schedules `sendSignInCode` with `after()`, and everything that differs by
+address happens there. A code that is not mailed is deleted, so it cannot be
+guessed at. Abuse limits: BotID on the send request; three codes per address
+per hour (`takeSendSlot`); twenty send requests per network per hour (Better
+Auth's limiter, the only one that answers 429); and, outside the app, a
+Vercel firewall rule on the same route set looser than that
+(`docs/ops/customer-passkey-runbook.md`). Both app counters are rows in
+`RateLimit` — `rateLimit.storage: "database"`, which every Better Auth route
+now uses. The per-address rows share that table and Better Auth prunes it by
+its longest configured window, so the send rule's window must not drop below
+`SEND_WINDOW_S`. Because the cap is silent, the form counts its own sends and
+shows "too many" itself (`maySendAgain`).
+
+**One email is one account.** Google joins an existing row only when Google
+reports the email verified and our row is verified too — Better Auth's
+default, with `trustedProviders: []` written down so no provider is ever
+trusted past it.
+
+**The owner hears when the lock changes.** Before the first passkey the
+mailbox or the Google account is the only lock, and whoever holds it can
+enrol their own. So the account's own address is mailed every time, for
+every role: a passkey added, a passkey removed, passkeys reset by staff
+(`lib/auth/passkeyMail.ts`). What happened, when in Malaysia time, and the
+sales contact as a number — no link, so a forged copy has nothing to phish
+with. `queuePasskeyMail` schedules it with `after()` from `passkeyAfterHook`
+and the reset route, never throws and is never awaited; `pnpm
+auth:reset-passkey` has no request to run after, so it awaits the send
+itself. It cannot stop a change, only make it visible.
+
+**Customer-facing text names a provider only on that provider's own button
+and error.** `copy/__tests__/dictionary.test.ts` fails on any other string
+that says Google. With no `RESEND_API_KEY` (local, preview) the code is
+written to the server log and nothing is mailed; with one it is never logged.
+
 `lib/auth/permissions.ts` is the whole access model: ten permissions and a
 `Role → Permission[]` constant, with a table-driven test that is its
 specification. The permission names outlive the roles that motivated them —
@@ -684,8 +779,8 @@
 to enrol an authenticator. The link never touches the second factor.
 `RESEND_API_KEY` and `EMAIL_FROM` are production-only, like `WHATSAPP_TOKEN`.
 
-**A customer's Google session is not enough; a passkey is.** After Google
-sign-in a `CUSTOMER` session counts only once `session.passkeyVerified` is
+**Signing in is not enough for a customer; a passkey is.** After sign-in, by
+either route, a `CUSTOMER` session counts only once `session.passkeyVerified` is
 set, which only a passkey ceremony does (`@better-auth/passkey`).
 `AuthUser.mustVerifyPasskey` is derived on every read in
 `lib/auth/session.ts` from `needsPasskeyCheck` (`lib/auth/passkeyRules.ts`)
@@ -701,8 +796,9 @@
 form, as it does for sign-in, and nothing typed is lost at the detour. The
 401 `passkey_required` handling there is only the backstop.
 
-**The limit: the first passkey is enrolled by whoever holds the Google
-account.** Until an account has a passkey, anyone who can sign in to it can
+**The limit: the first passkey is enrolled by whoever can sign in.** That is
+whoever holds the Google account, or the mailbox a code is sent to. Until an
+account has a passkey, anyone who can sign in to it can
 set one up; that covers every existing customer on launch day and any
 customer just after a reset. A passkey protects the account from then on,
 not before. Operators read `docs/ops/customer-passkey-runbook.md` (reset
@@ -747,10 +843,10 @@
   and lookups by credential id are unordered, so a duplicate id registered on
   another account could break the real owner's passkey step.
 
-Enrolling needs a Google session under one day old — Better Auth's
+Enrolling needs a session under one day old — Better Auth's
 fresh-session rule, kept deliberately so that a stolen old session cannot
 enrol the thief's passkey. The verify screen sends a stale session back
-through Google sign-in; adding another device from the Passkeys page renews
+through sign-in; adding another device from the Passkeys page renews
 the session with a passkey prompt instead.
 
 `safeCustomerNext` (`lib/auth/safeCustomerNext.ts`) decides where the verify
@@ -765,7 +861,8 @@
 confirm who is calling. It needs `users:manage`, which only `SUPERADMIN`
 holds: an `ADMIN` cannot reset a customer's passkey or see the phone line.
 There is deliberately no self-service path: anything a customer could do
-with only their Google account, so could whoever took it.
+with only their sign-in, so could whoever took it. A lost mailbox has no
+recovery at all.
 
 Passkeys are bound to the site's hostname (from `BETTER_AUTH_URL`). Changing
 the production domain invalidates every customer's passkey, and a passkey
@@ -812,7 +909,7 @@
 11. **`advance` takes its actor from the session; `book` and `split` still take a client-typed one.** `DeliveryDetail.tsx`'s name field feeds `bookedBy` and `split`'s `actor`, and `split` falls back to the literal `"Admin"` when the field is left blank — so the delivery activity log has mixed provenance, a session user's real name on some rows and whatever an admin typed (or nothing) on others. Narrowed, not closed.
 12. **`prisma.config.ts` sets no `shadowDatabaseUrl`.** That is why `prisma migrate dev` refuses non-interactively and `prisma migrate diff --from-migrations` cannot run — both need a shadow database to diff against. Until it is set, a migration written outside an interactive terminal has to be hand-written and independently verified (`prisma migrate diff --from-config-datasource --to-schema`) rather than generated. The fix is two lines in `prisma.config.ts` pointing at a disposable shadow database URL; not done here.
 13. **FedEx's sandbox cannot check our requests.** It answers only its own canned inputs — any request that differs from a documented example returns `SERVICE.PACKAGECOMBINATION.INVALID`, and its canned Malaysian rates are USD — so `adapters/fedex.ts` is tested against fixtures built from FedEx's documented shapes, not against FedEx. `pnpm fedex:ping` against **production** checks only the token, rate and track calls — it never ships. Ship, pickup, both cancels and the label fetch are first exercised by the first real booking: run it once production credentials exist, watch it with FedEx Ship Manager open, and cancel it there if anything looks wrong. Production also needs label certification with FedEx, which can take weeks.
-14. **Forgot-password throttling is per account, not per network.** `sendStaffReset` runs after the response (`after()`), so the answer and its timing are the same whoever asked, and it sends nothing once an account has more than three live reset links (about three mails an hour). What remains: Better Auth's own limit on `/request-password-reset` is per IP and memory-backed, so it does not hold across serverless instances, and a requester can still create unsent reset tokens in the `verification` table for any address. The three-link cap counts those unsent requests too, so about four requests an hour from anyone suppress a staff member's own reset mail while the page still says it was sent. Low value with three staff; the fix is `rateLimit: { storage: "database" }` and its table.
+14. **Resolved: Better Auth's rate limits are counted in the database.** `rateLimit.storage: "database"` and the `RateLimit` table, added with customer email sign-in, so the per-network limit on `/request-password-reset` (and every other route) holds across serverless instances. What is left is by design: `sendStaffReset` still sends nothing once an account has more than three live reset links, and that count includes requests anyone made, so about four requests an hour for a staff address suppress that staff member's own reset mail while the page still says it was sent. Kept as a numbered entry so references to later issues stay valid.
 15. **In-app browsers cannot do passkeys.** A customer who opens an order or
     tracking link inside WhatsApp, Facebook or Instagram is told to open it
     in Chrome or Safari (`passkeySupport.ts`); they cannot order from inside
@@ -825,7 +922,7 @@
     can no longer add its own passkey or remove the owner's without a fresh
     passkey ceremony (five minutes), so it cannot make itself permanent. It
     can still act as the customer for its seven days. That is outside this
-    feature's threat (someone holding only the Google account), recorded so
+    feature's threat (someone holding only the sign-in), recorded so
     it is not mistaken for covered.
 
 ## Open questions — resolve before trusting pricing.ts
@@ -874,6 +971,15 @@
 - Does Prisma Postgres offer an ap-southeast region? If not, quote submission eats a transpacific round trip.
 - Does EzCabinet have an EasyParcel account, and who tops up the wallet? `submit_orders` deducts at booking time and a shipment cannot be booked against an empty wallet.
 - **City-Link: a live host, credentials, and whether a rate API exists.** The guide we hold documents only the test server (`devsvr2019a.citylinkexpress.com:21145`) and its credentials page is blank — ask for the company code, account number and meter number, the live URL, and whether anything prices a shipment. Without a rate call an admin compares City-Link blind on price.
+- **Mail for sign-in codes needs EzCabinet's sending domain set up.** SPF,
+  DKIM and DMARC on the domain in `EMAIL_FROM`, or Outlook, Yahoo and iCloud
+  will junk the codes — and a junked code is a customer who cannot order.
+  Checkout now depends on mail delivery for every customer without Google.
+  Test with a real Outlook address before launch.
+- **Is "starts with admin or support" too wide for a name?** The name step
+  refuses it so nobody labels their account as the business. If a real
+  customer's name is caught, narrow `posesAsBusiness`
+  (`lib/auth/customerName.ts`).
 - **WhatsApp go-live is waiting on EzCabinet.** Meta Business verification, a dedicated number, a system-user token, a payment method, 24 template approvals, the factory's real stage names, the sales number and counsel's privacy sign-off. Checklist and template copy: `docs/ops/whatsapp-ezcabinet-setup.md`.
 - **Which Malaysian payment gateway?** Stripe is wired as the sandbox-test gateway, chosen by the `payment-gateway` Vercel flag (`src/flags.ts`: Stripe on development and preview, manual on production); Fiuu is the likely production one, account in progress. Both are adapters behind `lib/payments` — swap plan in `STRIPE_INTEGRATION_TODO.md`. Only the verified webhook marks an order paid, never the customer's return. With no gateway set, orders fall back to manual bank transfer, and `BANK_TRANSFER` in `lib/orders/payment.ts` is still a placeholder account the confirmation page shows customers.
 - **The delivery fee.** `RATES.deliveryFlatRm` is `85`, the figure from the client's Order Confirmation design; set the real one in the catalogue settings. It is flat — one fee whatever the load or the distance.
```

- [ ] **Step 2: The operator runbook**

It named Google as the only route in five places. It also gains the deploy steps this feature needs and the firewall rule, written for whoever runs them. In `docs/ops/customer-passkey-runbook.md`:

````diff
--- a/docs/ops/customer-passkey-runbook.md
+++ b/docs/ops/customer-passkey-runbook.md
@@ -1,6 +1,6 @@
 # Customer passkey runbook
 
-Every customer sets up a passkey after signing in with Google. A passkey is the fingerprint, face or screen lock on their own phone or laptop. This page is for whoever answers the phone and whoever deploys.
+Every customer sets up a passkey after signing in. They sign in with Google, or with a six-digit code we email to their address. A customer who signs in with a code is asked for their name once, before the passkey. A passkey is the fingerprint, face or screen lock on their own phone or laptop. This page is for whoever answers the phone and whoever deploys.
 
 ## Resetting a customer's passkey
 
@@ -21,21 +21,33 @@
 
 Never reset because of an inbound call, an email or a WhatsApp message.
 
-The phone and order number appear on the row only when the customer has placed an order. If the row shows neither, there is nothing on file to ring back, and no order history to protect. Reset only after you have confirmed the Google account's email address with the caller.
+The phone and order number appear on the row only when the customer has placed an order. If the row shows neither, there is nothing on file to ring back, and no order history to protect. Reset only after you have confirmed the account's email address with the caller. The customer is emailed that their passkeys were reset, so the real owner hears of it even if the caller was not them.
 
 ## Stay on the line
 
-Ask the customer to sign in and set up their passkey while you wait. The list does not update by itself, so reload **People**, then **Customers**. When the **Reset passkey** button is back on their row, their new passkey is in place. Between the reset and their new passkey, anyone who holds their Google account could set one up first.
+Ask the customer to sign in and set up their passkey while you wait. The list does not update by itself, so reload **People**, then **Customers**. When the **Reset passkey** button is back on their row, their new passkey is in place. Between the reset and their new passkey, anyone who can sign in as them could set one up first. That is anyone who holds their Google account, or who can read their email.
 
 ## What a passkey does not protect
 
-Until an account has its first passkey, whoever can sign in to that Google account can set it up. This covers:
+Until an account has its first passkey, whoever can sign in to it can set it up. That is whoever holds the Google account, or whoever can read the mailbox a sign-in code is sent to. This covers:
 
 - every existing customer on the day this goes live
 - any customer just after a reset
 
 A passkey protects the account from the moment it exists, not before.
 
+The account's own email address is told every time a passkey is added or removed, and when staff reset them. The email says what happened and when, and gives our number. It has no link. If a customer rings to say they got one and it was not them, treat it as "a passkey is not theirs" below.
+
+## If a customer says the sign-in code never arrives
+
+Nobody at EzCabinet can see or send a code by hand. Ask them to:
+
+1. Check the junk or spam folder.
+2. Read back the address shown above the code box. If it is wrong, press **Use a different email**.
+3. Wait for the newest email. Each new code cancels the one before it.
+
+After three codes in an hour, no more are sent to that address until the hour is up, and the screen says so. If they no longer have that mailbox at all, there is no way back into the account: they sign in with an address they do have, which is a new account.
+
 ## If a customer says a passkey is not theirs
 
 Reset straight away. Then follow the ring-back steps above before the customer sets up a new one.
@@ -45,7 +57,43 @@
 - [ ] `BETTER_AUTH_URL` is the one production address. A passkey is tied to that exact hostname, and `www.example.com` and `example.com` are different to a passkey. Redirect every other hostname to this one before launch. Never change it afterwards: every customer's passkey would stop working.
 - [ ] `WHATSAPP_SALES_NUMBER` is set. The "Lost your device?" link on the passkey screen needs it.
 - [ ] Sales staff know what the screen looks like.
-- [ ] Everyone knows what to expect on launch day. Every existing customer is asked to set up a passkey at their next order page. A customer whose Google sign-in is more than a day old is sent through Google once more first.
+- [ ] The database migration `20261009000000_rate_limit` is applied **before** the new code serves traffic (`pnpm exec prisma migrate deploy`). Every sign-in request counts itself in that table, so without it nobody can sign in, staff included.
+- [ ] `RESEND_API_KEY` and `EMAIL_FROM` are set in production, and the sending domain has SPF, DKIM and DMARC. Send a sign-in code to an Outlook address and a Yahoo address and check both arrive in the inbox, not junk. Without the key, codes are written to the server log and no customer receives one.
+- [ ] `RESEND_API_KEY` is stored as a sensitive variable, so it cannot be read back from the dashboard: `vercel env add RESEND_API_KEY production --sensitive`. The secrets already in the project should be stored the same way: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `MUX_TOKEN_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `FLAGS_SECRET` and each carrier's secret or token. To change one, remove it and add it again with `--sensitive`.
+- [ ] The firewall rule in front of the sign-in code route exists and is published (next section).
+- [ ] After the first sign-in in production, check the `rateLimit` table: the keys for the code route start with a visitor's address, a different one for each visitor. A key starting `no-trusted-ip` means every visitor shares one counter. Tell the developer before launch.
+
+## The firewall rule in front of sign-in codes
+
+The app already limits code requests: three an hour to one address, twenty an hour from one network. This rule is the wall outside the app. It stops a flood before it reaches a function or the database. It is set at sixty an hour, three times the app's limit, so a real customer always meets the app's own message first and never this.
+
+Someone with access to the Vercel project runs these, in the linked project folder.
+
+1. Stage the rule, counting only. Nothing is blocked yet.
+
+   ```bash
+   vercel firewall rules add "Sign-in code requests" --condition '{"type":"path","op":"eq","value":"/api/auth/email-otp/send-verification-otp"}' --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit --rate-limit-window 3600 --rate-limit-requests 60 --rate-limit-keys ip --rate-limit-action log --description "Outer wall for emailed sign-in codes. Looser than the app's 20 per hour per network."
+   ```
+
+2. Read what was staged, then make it live.
+
+   ```bash
+   vercel firewall diff
+   vercel firewall publish
+   ```
+
+3. Ask for a code on the live site, then check the rule saw it and blocked nothing: `vercel firewall rules inspect "Sign-in code requests"` and `vercel firewall traffic`.
+
+4. Switch it from counting to refusing, read the change, and publish.
+
+   ```bash
+   vercel firewall rules edit "Sign-in code requests" --rate-limit-action deny
+   vercel firewall diff
+   vercel firewall publish
+   ```
+
+If a customer is ever refused by this rule rather than by the app, raise the number. Never lower it below the app's own.
+- [ ] Everyone knows what to expect on launch day. Every existing customer is asked to set up a passkey at their next order page. A customer whose sign-in is more than a day old is asked to sign in once more first.
 - [ ] Section J of `docs/ops/staff-2fa-test-checklist.md` has been run on a Vercel preview. The checkout step cannot be tried on a local production build, because the bot check only runs on Vercel.
 
 ## Staff passkeys
````

- [ ] **Step 3: `.env.example`**

```diff
--- a/.env.example
+++ b/.env.example
@@ -8,8 +8,10 @@
 # Read once by `pnpm seed:superadmin`.
 SUPERADMIN_EMAIL=
 SUPERADMIN_PASSWORD=
-# Resend — staff password-reset mail. Production only, never set in preview.
-# Unset, the reset page still answers but nothing is sent.
+# Resend — customer sign-in codes, passkey-change notices, staff invites and
+# password-reset mail. Production only, never set in preview. Unset, the pages
+# still answer but nothing is sent, and a customer's sign-in code is written
+# to the server log instead — which is how you sign in with an email locally.
 RESEND_API_KEY=
 # An address on a domain verified in Resend, e.g. EzCabinet <no-reply@example.com>
 EMAIL_FROM=
```

- [ ] **Step 4: The whole suite**

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
```

Expected: lint and typecheck clean; every test passes; the diff prints `-- This is an empty migration.`

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/ops/customer-passkey-runbook.md .env.example
```

```bash
git commit -m "docs: customers sign in with any email and give a name; staff cannot use codes" -m $'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01Sf6WzEGocpitLL31ex4uQQ'
```

- [ ] **Step 6: On a Vercel preview**

None of this can be checked locally. Do it on a preview before merging to `main`, and report each line to the user as checked or not checked. A preview has no `RESEND_API_KEY`, so codes are read from the function logs there.

1. Apply the migration to the preview database before the preview serves traffic. Then sign in by code once and give a name. Expected: it works, which also proves `after()` runs inside the plugin's callback on Vercel.
2. **BotID, both halves.** In the browser's Network tab, find the send-code request. Expected: its path is exactly `/api/auth/email-otp/send-verification-otp`, the string in `src/instrumentation-client.ts`, and it answers 200. Then send the same request with `curl` from a terminal. Expected: 403 with `EMAIL_CODE_BOT`. A real browser refused means the client path does not match what is requested; `curl` allowed means the server check is not running.
3. **One address per visitor.** Vercel overwrites `x-forwarded-for` and does not pass on a value the client sent, so a forged header cannot dodge the per-network limit. What is left to confirm is only that Better Auth reads it. Look at the `rateLimit` table after two people on different networks have each asked for a code. Expected: two keys ending `|/email-otp/send-verification-otp`, each starting with a different address, and `email-code|<address>` rows. A key starting `no-trusted-ip` means every visitor shares one bucket: stop and tell the user.
4. Open the preview's sign-in page from a link inside WhatsApp on a phone. Expected: "This browser can't use passkeys. Open this page in Chrome or Safari." in place of the email form.
5. On iOS Safari and Android Chrome: request a code, switch to the mail app (or the logs), come back. Expected: the tab still shows the code step; the keyboard offers the code where mail is real.

- [ ] **Step 7: For a person with access to the Vercel project**

These change the live project, not the repo. Do not run them yourself: hand them to the user, with the runbook section they come from (`docs/ops/customer-passkey-runbook.md`, "Deploy checklist" and "The firewall rule in front of sign-in codes").

1. Store the mail key as a sensitive variable, so it cannot be read back from the dashboard:

   ```bash
   vercel env add RESEND_API_KEY production --sensitive
   ```

   The secrets already in the project should be stored the same way: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `MUX_TOKEN_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `FLAGS_SECRET` and each carrier's secret or token. Changing one means removing it and adding it again with `--sensitive`.

2. Put the firewall rule in front of the code route. It is keyed by IP and set at 60 requests an hour, three times the app's own 20, so a real customer always meets the app's message first and never this. Stage it counting only:

   ```bash
   vercel firewall rules add "Sign-in code requests" --condition '{"type":"path","op":"eq","value":"/api/auth/email-otp/send-verification-otp"}' --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit --rate-limit-window 3600 --rate-limit-requests 60 --rate-limit-keys ip --rate-limit-action log --description "Outer wall for emailed sign-in codes. Looser than the app's 20 per hour per network."
   ```

   Read what was staged, then make it live:

   ```bash
   vercel firewall diff
   vercel firewall publish
   ```

   Ask for a code on the live site and confirm the rule saw the request and refused nothing (`vercel firewall rules inspect "Sign-in code requests"`, `vercel firewall traffic`). Only then switch it from counting to refusing:

   ```bash
   vercel firewall rules edit "Sign-in code requests" --rate-limit-action deny
   vercel firewall diff
   vercel firewall publish
   ```

3. Once production mail is configured, the spec's last check: the whole journey with a real Outlook address, and a look at whether the code and the "passkey was added" mail landed in the inbox or in junk.

- [ ] **Step 8: Tell the user what is theirs to do**

In the hand-off message, not in a file:
- The privacy notice now says the email route collects an address and asks for a name. It goes to EzCabinet's counsel with the rest of the draft.
- EzCabinet's sending domain needs SPF, DKIM and DMARC before launch.
- The migration `20261009000000_rate_limit` must be applied before the new code serves production traffic.
- Step 7 is waiting on someone with project access.
- Any PostHog insight built on `sign_in_nudge` `accepted` now counts a click through to the sign-in page, not a click on a Google button.

---

## Spec coverage

| Spec requirement | Where |
| --- | --- |
| Plugin wired; two routes open; seven in `disabledPaths` | Task 1 (`CLOSED_PATHS`), Task 4 (wiring), Task 3 (`is closed` ×7) |
| `hooks.before` fails closed on unrecognised plugin requests, composed with the passkey hook | Task 1 (`codeRequest`), Task 3 (hook, `is refused`), Task 4 (composition, config test) |
| Send only for type `sign-in` | Task 1, Task 3 (`a %s code is not sent`), Task 4 (callback) |
| No code for a non-customer address; same response, same timing | Task 2 (`sendSignInCode`), Task 3 (`are sent nothing`, `is identical`), Task 4 (`after()`, `never awaits the mail`) |
| `/sign-in/email-otp` refused for staff even with a valid code | Task 3 (`cannot sign in with a code that exists anyway`, `cannot use a code they were mailed as a customer`) |
| Session born on that route for staff refused, composed with `verifiedIfPasskeySession` | Task 3 (`are refused where the session is made`), Task 4 |
| Only a `CUSTOMER`, `emailVerified: true`; `role` `input: false`; `/sign-up/email` closed | Task 3 (`becomes a verified CUSTOMER with no name yet`, `cannot post its own role`), Task 4 (config test) |
| Six digits, 10 minutes, 3 attempts, single use, hashed | Task 1 (numbers), Task 3 (`the code` block), Task 4 |
| BotID on send; client protect list; both halves | Task 3 (`refuses a bot`), Task 4, Task 10 Step 6 |
| Three codes per address per hour; per-network limit; database | Task 2 (table, `takeSendSlot`), Task 3 (`the per-address cap`, `limits one network`), Task 4 |
| Mail through `lib/email.ts`; log when unconfigured; never log when configured | Task 2 |
| Google links only on a verified email; no trusted provider | Task 3 (`Google joining an existing account`), Task 4 (`trustedProviders`) |
| The name: schema, `owesName` | Task 5 (`customerName.ts` and its table) |
| The name: its own route, signed-in customer only, writes only `name` | Task 5 (route and its test) |
| The name: owed before the passkey step; `viewerOf`, verify page, order routes, config | Task 5 |
| The name: asked after the code, one field, a returning customer never sees it | Task 9 (welcome page and its test, form routing) |
| The name: prefills checkout | Task 8 (already the case; noted), Task 9 Step 10 item 16 |
| Any mail that includes a name escapes it | Task 6 (`escapes the name in the HTML`); the code mail has none |
| Passkey added, removed, reset: mail to the account's own address, every role, no link, after the change, never blocking | Task 6 |
| Promotion sets an invite password | Task 7 |
| Sign-in page: form, 30-second resend, messages, Google button, sub-line, `next` | Task 8 (strings), Task 9 |
| Copy in three languages; de-Googled strings; the test | Task 8 |
| Passkey step's stale-session path generic | Task 8 (`passkey.sessionStale`, `PasskeyGate` comment; the link was already to the sign-in page) |
| On Vercel: firewall rule, BotID pairing, sensitive variables, one address per visitor, `after()` | Task 10 Steps 6 and 7, the runbook |
| Tests the spec names | Tasks 1, 2, 3, 5, 6, 7, 8 |
| Docs | Task 10 |
| By-hand journey | Task 9 Step 10, Task 10 Steps 6 and 7 |
