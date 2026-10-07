# Customer sign-in with any email

Status: design approved in conversation on 2026-10-08. Awaiting review of this written spec.

## Why

A customer today can only create an account with Google. Someone whose only
address is Outlook, Yahoo or iCloud can plan a kitchen and see its price, then
cannot order. The account should not depend on one provider.

The Google-only rule (`2026-09-20-rbac-design.md`) existed to avoid passwords,
verification mail and a way for a sign-up request to set its own role. This
design keeps all three properties.

## Decisions already made

| Question | Decision |
| --- | --- |
| How does a non-Google customer prove who they are? | A six-digit code mailed to their address. No password, ever |
| Same email through two routes? | One account. Linked only when both sides proved the address |
| What is asked at sign-up? | The email address only. Name, phone and address stay at checkout |
| Facebook? | Built, hidden until its keys exist (needs EzCabinet's Meta business verification) |
| Passwords, phone codes, Apple sign-in | Out of scope |

## The journey

Aiman has `aiman@outlook.com` and no Google account.

1. He plans and prices anonymously, as today. The design autosaves in his browser (`lib/plannerDraft.ts`).
2. **Place order** sends him to `/[lang]/sign-in?next=…`. The page offers Google, then "or continue with email".
3. He types his address and presses **Continue**. The page says a code was sent.
4. He reads the code in his mailbox and types it into the same tab. He is signed in.
5. First time only, an account is created: role `CUSTOMER`, `emailVerified: true`.
6. He meets the existing passkey step (`/[lang]/verify`) and sets one up.
7. He returns to the quote, fills in contact and delivery details, and pays.
8. Next visit: email, code, passkey prompt.

A code, not a link: a link opens in the mail app's in-app browser, where the
saved design is absent and passkeys do not work (known issue 15).

## Rules

### Account
- A code sign-in can only ever create or open a `CUSTOMER` row. `role` stays `input: false`; `/sign-up/email` stays in `disabledPaths`.
- One email is one account. Google and Facebook link to an existing row only when the provider reports the email as verified. A Facebook account with no email is told to use the email route.
- The passkey rules are unchanged and apply to every route in. `needsPasskeyCheck` does not learn about sign-in methods.

### The code
- Six digits, valid 10 minutes, three wrong attempts end it, single use, stored hashed (`storeOTP: "hashed"`).
- Sent only for sign-in. The mail carries the code, the site name and "if you did not ask for this, ignore it". No link.

### Staff cannot use it
Staff sign in with a password and an authenticator code, or Google. A mailed
code would be a way round both.

- A request for a code for an address whose row is not `CUSTOMER` sends nothing and answers exactly as a customer request does.
- `/sign-in/email-otp` is refused for a non-`CUSTOMER` row even with a correct code, in case a code exists from before a promotion.
- Checked a third time where the session is created: a session born on `/sign-in/email-otp` for a non-`CUSTOMER` user is refused.
- Promotion knock-on: promoting an email-code customer to staff leaves them no sign-in, since promotion keeps "the sign-in it already had" and staff cannot use codes. Promotion of a row with no Google account sets an invite password, as a fresh invite does.

### Plugin surface
Better Auth's `emailOTP` plugin (shipped with 1.7.5, already installed) exposes
nine routes. Two stay open:

- `/email-otp/send-verification-otp`, for type `sign-in` only
- `/sign-in/email-otp`

The other seven go in `disabledPaths`: `/email-otp/verify-email`,
`/email-otp/check-verification-otp`, `/email-otp/request-password-reset`,
`/email-otp/reset-password`, `/forget-password/email-otp`,
`/email-otp/request-email-change`, `/email-otp/change-email`. Two of them
would put a password on a customer row.

A `hooks.before` body refuses any `/email-otp/*` or `/sign-in/email-otp`
request it does not recognise, the same fail-closed rule the passkey hooks
follow. A plugin upgrade that adds a route gets a 403 until it is allow-listed.

### Abuse
- BotID on the send-code request, as on `POST /api/orders`.
- At most three codes per address per hour and a per-network limit, counted in the database (`rateLimit: { storage: "database" }` and its table). This also closes known issue 14, where the memory-backed limit did not hold across serverless instances.
- The send-code response is identical for a new address, a known customer, a staff address and a rate-limited one. Timing too: the mail is scheduled with `after()`, not awaited.

### Mail
- Sent through `lib/email.ts` (Resend). Text and a plain HTML version.
- With no `RESEND_API_KEY` (local, preview) the code is written to the server log and nothing is mailed. Preview deployments therefore cannot be used to mail codes to strangers.
- Before launch EzCabinet's sending domain needs SPF, DKIM and DMARC, or Outlook, Yahoo and iCloud will junk the codes. A junked code is a customer who cannot order.

## Text must not assume Google

Rule: customer-facing copy names a provider only on that provider's own button
and its own error message.

| Where | Change |
| --- | --- |
| Sign-in page | Sub-line says any email works. Email form and its messages added |
| Passkey step, stale session | "sign in with Google again" becomes "sign in again" |
| Privacy notice, what we collect | Covers both routes: a provider gives name, email and photo; the email route gives only the address |
| Privacy notice, where data comes from | "from Google" becomes "from the sign-in provider you choose" |
| Checkout sign-in card, planner sign-in nudge | "Sign in or create an account", no provider named |

Every string in English, Malay and Chinese. The privacy notice change alters
what the notice says EzCabinet collects, so it goes to their counsel with the
rest of the draft. Internal names and comments that say "after Google" are
corrected where they would mislead; admin text stays where it is literally
about Google.

## Components

| Unit | Purpose |
| --- | --- |
| `lib/auth/emailCodeRules.ts` | Pure: may this address be sent a code; may this row sign in by code |
| `lib/auth/emailCodeHooks.ts` | `hooks.before` for the plugin's routes: allow-list, staff refusal, BotID; the session-create check |
| `lib/auth/emailCodeMail.ts` | Builds and sends the code mail, or logs it when mail is not configured |
| `lib/auth.ts` | Wires the plugin, `disabledPaths`, database rate limit, Facebook provider when its keys exist |
| `app/[lang]/sign-in/` | `EmailCodeForm.tsx` (address, then code), provider buttons, page copy |
| `lib/copy/{en,ms,zh}.ts` | New strings and the de-Googled ones |
| `prisma/schema.prisma` | The rate-limit table. Codes use the existing `Verification` table |
| `app/api/admin/users/route.ts` | Promotion sets an invite password when the row has no Google account |

## Errors the customer can see

- Wrong code: "That code is not right. Check it and try again."
- Expired or used up: "That code has expired. Send a new one."
- Too many requests: "Too many codes requested. Try again in an hour."
- Mail not received: a "Send a new code" action, available after 30 seconds.

A staff address sees the same "code sent" screen and never receives one.

## Limits, stated plainly

- Until a customer's first passkey exists, the mailbox is the only lock on the account. The same is true of Google customers today.
- A lost passkey is a staff reset, after confirming the caller by order number and phone. A lost mailbox has no recovery.
- In-app browsers cannot do passkeys (known issue 15).
- Checkout now depends on mail delivery for these customers.

## Testing

- Rule functions: table tests, written first.
- Hooks driven through the real plugin on Better Auth's in-memory adapter, in the style of `passkeyWiring.test.ts`: a new address creates a `CUSTOMER`; a staff address is sent nothing and cannot sign in with a planted code; each closed route answers 404 or 403; an unknown route is refused; wrong, expired and reused codes; the attempt limit; identical responses across address kinds.
- Account linking: a verified provider email joins the existing row; an unverified one is refused.
- Promotion of a code-only customer sets an invite password.
- A copy test that fails if a customer string outside the provider buttons names Google.
- By hand: the whole journey with a real Outlook address once mail is configured; iOS Safari and Android Chrome.

## Out of scope

Passwords, phone or WhatsApp codes, Apple sign-in, profile fields at sign-up,
changing an account's email, staff-entered orders.
