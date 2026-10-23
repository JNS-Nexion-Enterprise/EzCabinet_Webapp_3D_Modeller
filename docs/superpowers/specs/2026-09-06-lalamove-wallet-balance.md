# Knowing what is in the Lalamove wallet — spec

> **Decision, 2026-09-06: not built.** Lalamove exposes no wallet endpoint, and
> the only alternative — their `WALLET_BALANCE_CHANGED` webhook — carries a
> payload they do not publish. A balance nobody can verify, shown next to a
> booking button, is worse than no balance. Only the webhook defect this
> research uncovered was fixed (`cf31ac1`). This file stays as the record of
> what was checked, so nobody probes those six paths again.

**Surface:** `/admin/logistics`, `src/lib/logistics/adapters/lalamove.ts`,
`src/app/api/webhooks/[carrier]`.

## Why

Lalamove is prepaid. An order is placed against a wallet topped up in the
Partner Portal, and when the wallet runs dry the booking fails — at the moment
an admin is on the phone to a customer, with a lorry expected. Nothing in this
app knows the balance, so the first sign of an empty wallet is a failed
booking.

## What Lalamove actually offers

Checked against the v3 API reference and probed against the sandbox with our
own credentials on 2026-09-06:

| Path tried                | Result                     |
| ------------------------- | -------------------------- |
| `GET /v3/wallets`         | 404 page not found         |
| `GET /v3/wallet`          | 404                        |
| `GET /v3/citywallets`     | 404                        |
| `GET /v3/wallets/balance` | 404                        |
| `GET /v3/wallet/balance`  | 404                        |
| `GET /v3/account/wallet`  | 404                        |
| `GET /v3/quotations`      | **405 Method Not Allowed** |

The 405 is the control: signing, market header and routing are all working, so
the 404s are "no such route", not a rejected request. The published endpoint
list confirms it — quotations, orders, drivers, priority fee, cities, webhook
configuration, and nothing else.

**There is no wallet endpoint to poll.** What exists is a push:
`WALLET_BALANCE_CHANGED`, one of ten documented webhook events, described in
the reference as "wallet balance change for either addition / deduction to the
balance".

**Its payload is not published.** The endpoint reference names the event and
stops; the webhook slide deck does not carry a payload example. So the shape
has to be learned from the first real event, and the code has to be written to
survive not knowing it.

## What this means for the design

- **No polling, no "check balance" button.** The app cannot ask. It can only
  remember what it was last told, and say when it was told.
- **A displayed balance is a memory, not a reading.** It must always carry its
  age, and say plainly when nothing has ever arrived.
- **The event arrives on the webhook route we already have** —
  `/api/webhooks/lalamove`, verified by `apiKey` equality (Lalamove does not
  sign callbacks).

## The defect this uncovered

`verifyWebhook` parses with a schema that **requires** `data.order.orderId`. A
`WALLET_BALANCE_CHANGED` event has no order, so it fails the parse, returns
null, and the route answers **400 invalid_signature**. Lalamove retries a
non-200 for hours.

So today a wallet event is not merely ignored — it is rejected, repeatedly, and
looks to Lalamove like a broken integration. That is worth fixing whether or
not the balance is ever displayed.

## Scope

- Accept `WALLET_BALANCE_CHANGED`, store what it carries, and keep the raw
  payload so the first one teaches us the shape.
- Show the last known balance and its age on the deliveries screen, with a
  low-balance warning and a link to the Partner Portal, which is the only place
  a top-up can happen.
- Warn — not block — when a booking is about to be confirmed for more than the
  last known balance.
- Answer 200 to any verified event we have nothing to do with, so a carrier
  stops retrying.

## Out of scope

- Topping up from this app. There is no API for it; the Partner Portal is the
  only route, and a link is the honest answer.
- Any other carrier's wallet. Only Lalamove is prepaid, and only Lalamove is
  live.
- Alerting (email, WhatsApp) on a low balance. Worth having once the number is
  trusted; premature while the payload shape is still unproven.
