# Stripe integration — remaining steps

Stripe is the **sandbox-test gateway**, taking payment through the **Payment
Element** on a one-page checkout. EzCabinet may replace it with Fiuu (a
Malaysian gateway, account in progress), so Stripe is one adapter behind a
gateway contract, chosen by a Vercel feature flag — see
[Swapping gateways](#swapping-gateways--adding-fiuu).

It replaced an embedded Stripe **Checkout Session** (the Checkout Studio
parameters that used to be listed here). Checkout Sessions always draw their
own contact and shipping blocks, so the customer typed their name and address
twice. The Payment Element draws only the payment method.

## Values to Replace

No placeholders remain in code. Set these per environment.

**Files containing placeholders:**
- [.env.example](.env.example): copy the names into `.env.local` (local) and the Vercel project (Preview/Production)

| Field                    | Current Value | What to Set                                                                                              |
| ------------------------ | ------------- | -------------------------------------------------------------------------------------------------------- |
| `STRIPE_SECRET_KEY`      | _(empty)_     | `sk_test_…` from https://dashboard.stripe.com/test/apikeys. Server only.                                 |
| `STRIPE_PUBLISHABLE_KEY` | _(empty)_     | `pk_test_…`. Served to the browser by `GET /api/payments/config`, so no `NEXT_PUBLIC_` prefix is needed. |
| `STRIPE_WEBHOOK_SECRET`  | _(empty)_     | `whsec_…` from `stripe listen` locally, or from the Dashboard destination for a deployed URL.            |

`mode`/`line_items` no longer exist. The PaymentIntent's amount is the
order's stored `totalRm` in sen, priced on the server by `POST /api/orders`.

## Configured Parameters

**Files containing these parameters:**
- [src/lib/payments/stripe.ts](src/lib/payments/stripe.ts): the PaymentIntent
- [src/components/planner/StripePayment.tsx](src/components/planner/StripePayment.tsx): Elements and the Payment Element

| Parameter                | Value                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| PaymentIntent `currency` | `myr`                                                                                                                             |
| `payment_method_types`   | `fpx`, `grabpay`, `alipay`, `link`, `card`. Listed in both files above and must match.                                            |
| `metadata`               | `orderId`, `orderRef`. The webhook finds the order by `orderId`.                                                                  |
| `receipt_email`          | the order's email (required on the form when paying online)                                                                       |
| Payment Element layout   | accordion, radios `always`                                                                                                        |
| `fields.billingDetails`  | `never` on checkout (name, email, phone and address are passed from our form in `confirmPayment`), `auto` on the order-page retry |
| `wallets`                | Apple Pay, Google Pay and Link `auto`. Link asks for the email and phone again, though our form has them                          |
| appearance               | `flat`, Geist, `#171717` primary, `#d4d4d4` borders                                                                               |

## Setup

1. **Stripe Dashboard → Settings → Payment methods:** activate **FPX** (Stripe warns it is shown in test mode but hidden in live mode until activated), **GrabPay**, **Alipay**, **Link**, **Apple Pay**, **Google Pay** and **Cards**. Apple Pay and Google Pay also need every checkout hostname registered under **Payment method domains**, once per Stripe account or sandbox; they stay hidden on an unregistered domain.
2. **Which gateway is live** is the `payment-gateway` Vercel flag, not an env var. See [Gateway feature flag](#gateway-feature-flag).
3. **Local webhooks:**

   ```
   stripe listen --events payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,refund.created,refund.updated,refund.failed --forward-to localhost:3000/api/webhooks/payment/stripe
   ```

   Put the printed `whsec_…` in `STRIPE_WEBHOOK_SECRET` and restart the dev server.
4. **Deployed URL:** in the Dashboard, create an event destination → Webhook endpoint → `https://<host>/api/webhooks/payment/stripe`. Select exactly those six events, three `payment_intent.*` and three `refund.*`, and put its signing secret in that environment's `STRIPE_WEBHOOK_SECRET`. On a preview URL, deployment protection blocks Stripe's calls unless you add a bypass.
5. Dependencies: `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js`.

## Project structure

```
src/flags.ts                        payment-gateway flag (Vercel Flags)
src/lib/payments/
  types.ts        the PaymentGateway contract: client / start / verify / ack
  registry.ts     flag → adapter; gatewayById keeps old gateways' webhooks alive
  start.ts        start or resume paying for an order; records paymentProvider + paymentRef
  stripe.ts       the Stripe adapter: PaymentIntent, webhook events
src/lib/orders/markPaid.ts                        the one AWAITING_PAYMENT → PAID write (+ WhatsApp)
src/app/api/payments/config/route.ts              which payment step to draw, before an order exists
src/app/api/orders/route.ts                       creates the order, then starts its payment
src/app/api/orders/[token]/pay/route.ts           retry from the order page (resumes the same intent)
src/app/api/webhooks/payment/[gateway]/route.ts   verify → amount check → markOrderPaid
src/components/planner/StripePayment.tsx          Elements + Payment Element (Stripe-only)
src/components/planner/QuoteScreen.tsx            one-page checkout
src/app/[lang]/order/[token]/OnlinePayment.tsx    order-page retry
```

## How it works

1. The quote page asks `GET /api/payments/config`, and the flag answers `stripe-elements` + publishable key. The page mounts the Payment Element in **deferred mode**, built from the amount; no intent exists yet.
2. On **Pay**:
   - our fields and the re-measure box are validated;
   - `elements.submit()` validates Stripe's fields;
   - `POST /api/orders` re-prices the design, creates the order (`AWAITING_PAYMENT`), and opens a PaymentIntent for the stored total. It returns `{ token, payment: { clientSecret, … } }`;
   - `stripe.confirmPayment` runs with our name/email/phone/address as billing and shipping details.
3. **Card:** 3-D Secure opens over the page. **FPX / GrabPay / Alipay:** the customer goes to the bank, Grab or Alipay and comes back. Either way success lands on `/[lang]/order/[token]?redirect_status=succeeded` ("Confirming your payment").
4. **Declined or cancelled:** the customer stays on the quote page with every field kept, under the "Payment didn't go through" banner. Pay again resumes the **same** order and intent.
5. `/api/webhooks/payment/stripe` is the source of truth:
   - `payment_intent.succeeded` → amount checked against the order → `PAID`, `paymentRef = pi_…`, WhatsApp queued;
   - `processing` and `payment_failed` change nothing;
   - `refund.*` → the refund is re-read from Stripe and recorded on the cancelled order.
6. **Order page:**
   - `redirect_status=processing` → "Waiting for your bank";
   - `failed` → the banner plus a retry form;
   - no gateway → bank transfer details.

**One intent per order.** `start.ts` stores the intent id on the order, and a retry resumes it. An intent already `processing` or `succeeded` refuses a new one (409 `payment_in_progress`), so two presses or two tabs can never charge twice.

## Testing

- `4242 4242 4242 4242`, any future expiry, any CVC → paid.
- `4000 0025 0000 3155` → 3-D Secure challenge.
- `4000 0000 0000 0002` → declined; the banner shows, nothing is charged, and Pay again works on the same intent.
- FPX / GrabPay in test mode → Stripe's test authorise/fail page.
- `pnpm exec vitest run src/app/api/webhooks/payment` covers forged signature, amount mismatch, matching payment and an unknown gateway.
- Verified in a browser on 2026-09-27: the order-page retry path (decline, then 4242 on the same intent → webhook → "Order confirmed"). **Not yet exercised: Pay on the quote page itself**, which needs a signed-in session. It is the only path with `billingDetails: "never"`, where the address parts we don't collect (city, postcode, state) are sent blank. If Stripe rejects that, the error shows in the banner.

## Gateway feature flag

`payment-gateway` (string) on Vercel Flags, declared in [src/flags.ts](src/flags.ts):

| Environment | Serves                   |
| ----------- | ------------------------ |
| development | `stripe`                 |
| preview     | `stripe`                 |
| production  | `manual` (bank transfer) |
- **Switch with no redeploy:** `vercel flags set payment-gateway --environment production --variant stripe`, or from the dashboard.
- **Try before customers:** a team member can override the flag in their own browser from Flags Explorer on a preview deployment.
- **Safe defaults:** if Vercel Flags cannot answer, the flag serves `manual`. A variant with no adapter, or without keys, also falls back to bank transfer: the quote page shows **Place order** and the order page shows bank details.
- **The flag only picks where new payments start.** Webhooks ignore it (`gatewayById`), so payments begun before a switch still land.
- **Local:** evaluated with `VERCEL_OIDC_TOKEN` from `.env.local`, which expires after about 12 hours; a stale one silently serves `manual`. Refresh it by pulling to another file and copying that one line. **Never `vercel env pull` straight into `.env.local`**, because it overwrites local-only secrets.

## Swapping gateways / adding Fiuu

Every gateway is one adapter implementing `PaymentGateway`. It owns only what differs between gateways:
- `client`: what the checkout draws;
- `start`;
- `verify`;
- `ack`.

The rules that must not differ live in the webhook route:
- the amount must match;
- one write path;
- idempotent;
- the return URL is never trusted.

**Fiuu (POC, sandbox)** — built: `src/lib/payments/fiuu.ts`, hosted payment page.

- **Out:** the order page posts a signed form (`vcode`, extended format: amount, merchant ID, order id, verify key, currency) to `https://sandbox-payment.fiuu.com/RMS/pay/<merchant>/`. A merchant ID starting `SB_` picks the sandbox hosts; any other picks production.
- **In:** `/api/webhooks/payment/fiuu` takes the Notification URL (`nbcb=2`) and Callback URL (`nbcb=1`) posts, checks `skey`, maps `00` paid / `11` failed / `22` pending. Ack: `CBTOKEN:MPSTATOK` for a callback; the IPN post back (`treq=1`) for a notification.
- **Back:** `/api/payments/fiuu/return` takes the browser's return POST and 303s to `/[lang]/order/[token]?redirect_status=…`. Display only.
- **No double charge:** a retry first asks Fiuu's `q_oid_batch` for the order; a `00` or `22` transaction refuses it (409 `payment_in_progress`), and an answer it cannot read refuses it too.
- **No refunds through Fiuu yet:** a cancelled Fiuu order is refunded in Fiuu's portal, then **Mark refunded**. FPX refunds need the customer's bank details (Fiuu error PR014).

Setup, in order:
1. Keys in `.env.local` and on Vercel (Preview, branch `feature/fiuu`): `FIUU_MERCHANT_ID`, `FIUU_VERIFY_KEY`, `FIUU_SECRET_KEY`.
2. `pnpm fiuu:ping` — prints Fiuu's requery answer for an order with no transactions. **Not in the spec; until `settlingIn` accepts it, every retry is refused.** Paste it into a test in `fiuu.test.ts`.
3. Sandbox portal (`sandbox-portal.fiuu.com`) → Transactions → Settings:
   - turn on **Use extended format for Verify Payment**;
   - Notification URL and Callback URL: `https://<preview host>/api/webhooks/payment/fiuu?x-vercel-protection-bypass=<secret>`, **Enable IPN** on both;
   - Return URL: `https://<preview host>/api/payments/fiuu/return?x-vercel-protection-bypass=<secret>`. Fiuu's return is a cross-site POST, which carries no Vercel login cookie.
4. Portal → Domain Registration: the preview host (it differs from the company's website). Merchant Profile → Profile Settings: whitelist the tester's IP, or the demo bank refuses.
5. Flag: `vercel flags update payment-gateway` to add a `fiuu` variant, then override it in Flags Explorer on the preview, or set `PAYMENT_GATEWAY_FALLBACK=fiuu` for the branch.
6. Before production: CSP already allows `pay.fiuu.com`; production keys, URLs and IPN settings repeat on the production portal, and `vercel flags set payment-gateway --environment production --variant fiuu`. Keep Stripe's keys until in-flight Stripe payments have settled.

**Removing Stripe:**
1. Delete `lib/payments/stripe.ts` and its line in `registry.ts`.
2. Delete `StripePayment.tsx` and the `stripe-elements` branches in `QuoteScreen.tsx` and `OnlinePayment.tsx`.
3. Delete the Stripe hosts in `next.config.ts` and the `STRIPE_*` variables.
4. Run `pnpm remove stripe @stripe/stripe-js @stripe/react-stripe-js`.

## Next steps

- Fiuu refunds through its Refund API (`refund` on the adapter); Stripe's are built.
- Fiuu's page is English; `langcode=cn` would serve Chinese, but `PaymentOrder` does not carry the locale yet.
- Fields edited after a failed attempt reach Stripe but not the stored order (a `ponytail:` note in `QuoteScreen.tsx`).
- "Confirming your payment" relies on the customer refreshing the page; add polling if webhooks prove slow.
- `lib/orders/payment.ts` `BANK_TRANSFER` is still a placeholder; it remains the fallback whenever no gateway is set.

## Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
- Fiuu: https://github.com/FiuuPayment/Cheatsheet-BestPractices-Fiuu_API
