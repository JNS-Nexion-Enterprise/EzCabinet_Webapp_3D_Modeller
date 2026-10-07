# Guarded admin actions + automated refund on cancel

## Context

Two needs raised while demoing FPX payment:

1. **An admin must not cancel an order (or do other money/people actions) by mistake.** Today "Cancel order" is a browser `confirm()`, "Mark paid" has no confirmation, and nothing proves the person at the keyboard is the account owner.
2. **Cancelling a paid order must refund the customer automatically**, and the refund's status must come back from the payment gateway, the same way "paid" does today. Today a paid order cannot be cancelled at all and there is no refund code.

Decisions already made by the user:

- Guard scope: cancel order, mark paid by hand, delete user, reset customer passkey, reset 2FA, remove password, and the new refund.
- Authorisation: **staff passkey**, prompted on each guarded action.
- Refund: **through the gateway**, **full amount only**, **only before production starts**, **superadmin only**.

Out of scope: partial refunds, refunds after production starts, the customer email sign-in design (parked, awaiting its own approval).

## Working arrangement

- Work in a git worktree on `feature/order-refund` with its own local database (other sessions share the main checkout).
- First commit the small uncommitted wording change in `src/app/admin/orders/[id]/OrderDetail.tsx` on `feature/development`, so the branch starts clean.
- Save this design as `docs/superpowers/specs/2026-10-07-order-refund-step-up-design.md` (repo convention).
- TDD: each rule function gets its test first. Two commits/PRs in order: **Part 1 guard**, then **Part 2 refund**.

## Part 1 — Step-up guard (modal + staff passkey)

**Rule:** a guarded route runs only if this session passed a passkey ceremony in the last 5 minutes.

Why a new timestamp: `session.passkeyVerified` is a boolean that stays true for the session's 7 days, and first enrolment flips it without an authentication ceremony. Neither proves recency.

### Server

- `prisma/schema.prisma` — `Session.passkeyVerifiedAt DateTime?`. Add to `session.additionalFields` in `src/lib/auth.ts` (`input: false`).
- `src/lib/auth/passkeyHooks.ts` — `verifiedIfPasskeySession` also sets `passkeyVerifiedAt: new Date()`. Only the authenticate path sets it; enrolment does not.
- New `src/lib/auth/stepUp.ts` — pure `recentStepUp(verifiedAt: Date | null, now: Date): boolean`, `STEP_UP_WINDOW_MS = 5 * 60_000`. Test first.
- `src/lib/auth/session.ts` — `AuthUser.passkeyVerifiedAt` read from the session.
- `src/lib/auth/route.ts` — `withAuth(permission, handler, { stepUp: true })`. When set and `authEnabled()`, a stale/missing step-up answers `403 { error: "step_up_required" }`. Keeps the literal `withAuth` name, so `coverage.test.ts` still recognises every route. `BYPASS_USER` (local, auth off) skips it.
- Apply `{ stepUp: true }` to: `orders/[id]/cancel`, `orders/[id]/paid`, `users/[id]` DELETE, `users/[id]/reset-passkey`, `reset-2fa`, `remove-password`, and Part 2's refund route. `cancel` also gains the actor log the other routes have (`console.info("Order cancelled", { actor, target })`).
- Extend `coverage.test.ts` with an explicit list of routes that must carry `stepUp: true`.

### Staff passkey enrolment and recovery

- New `/admin/security` page (`requirePage`), reusing `src/app/[lang]/(account)/passkeys/PasskeyList.tsx` with the English dictionary. Link from `AdminHeader`.
- The passkey hooks are role-blind already, so staff can enrol and authenticate with no rule change. `needsPasskeyCheck` stays customer-only: staff sign-in is unchanged.
- Recovery: `users/[id]/reset-passkey` currently 404s for staff; allow staff targets, show the button for staff with a passkey in `UsersTable.tsx`. Add `pnpm auth:reset-passkey <email>` (reuses `src/lib/auth/resetPasskeys.ts`) for a sole superadmin who lost their device, mirroring `auth:reset-2fa`.
- Update the "staff are exempt" comments and `docs/ops/customer-passkey-runbook.md`.

### UI

- New `src/components/admin/ConfirmDialog.tsx` on the native `<dialog>` element (focus trap and Escape for free). Props: title, body, confirm label, `danger`, `stepUp`, optional children (e.g. a reason field), async `onConfirm`.
- With `stepUp`: confirm runs `authClient.signIn.passkey()`, then the action. No passkey yet → message with a link to `/admin/security`. Server `step_up_required` → "Confirm with your passkey again". Reuse `failureReason` from `src/app/[lang]/verify/failureReason.ts` for cancelled/stale.
- Replace: `confirm()` in `OrderDetail.tsx` (cancel), add dialog to Mark paid; the four `ArmedButton` actions in `UsersTable.tsx`.
- Unguarded deletes get the same dialog without `stepUp`: `LogisticsManager.tsx` (native `confirm`) and `TutorialManager.tsx` (no confirmation today). `CabinetDesignsClient.tsx` keeps its inline confirm.

### Known limits (to record in CLAUDE.md)

- A staff member's first passkey is enrolled by whoever holds their session, same limit as customers. Enrolment is logged.
- The window is "a ceremony within 5 minutes", not a proof bound to one specific action.
- The plugin verifies presence, not user verification; set `authenticatorSelection.userVerification: "required"` if the plugin option exists (check at implementation).

## Part 2 — Cancel and refund through the gateway

### States

```
PAID ──request──▶ REFUND_PENDING ──gateway says refunded──▶ REFUNDED
                        └──────── gateway says failed ────▶ PAID (refundError kept)
```

Only the gateway's signed webhook moves an online order to `REFUNDED`, mirroring `markOrderPaid`.

### Schema (one hand-written migration, verified with `prisma migrate diff --from-config-datasource --to-schema`)

- `OrderStatus` += `REFUND_PENDING`, `REFUNDED`. `NotificationKind` += `ORDER_REFUNDED`.
- `Order` += `refundRef`, `refundRequestedAt`, `refundedAt`, `refundedByUserId` (SetNull), `refundedByName`, `refundReason`, `refundError`.

### Gateway contract — `src/lib/payments/types.ts`, `stripe.ts`

- `PaymentGateway.refund?(order: { id, ref, paymentRef }): Promise<{ ref: string; settled: boolean }>`.
- Stripe: `stripe.refunds.create({ payment_intent, metadata: { orderId, orderRef }, reason: "requested_by_customer" }, { idempotencyKey: \`refund-${order.id}\` })`. No amount = full refund. The idempotency key makes a retry safe.
- `PaymentEvent` gains outcomes `refunded` / `refund_failed`, carrying `paymentRef` (the intent) and optional `orderId`. `eventOf` handles `refund.created` / `refund.updated` / `refund.failed` as a `Stripe.Refund` (today it hard-casts everything to a PaymentIntent).

### Orders — new `src/lib/orders/refund.ts`

- `refundRefusal(order)` pure rule: `not_paid` | `production_started` | `has_delivery` | null. Same boundary as `EDITABLE_ORDER` in `editDetails.ts`. Test first.
- `requestRefund(id, actor, reason, bankRef?)`:
  1. Claim in a transaction: conditional `updateMany` from `PAID` (or `REFUND_PENDING` with no `refundRef`, the retry case) with `productionStage: null`, `deliveries: { none: {} }` → `REFUND_PENDING` + actor, reason, time.
  2. Outside the transaction, call `gatewayById(order.paymentProvider).refund()`. Never hold a transaction across a network call.
  3. Success → store `refundRef`; if already settled, call `markOrderRefunded`. Thrown error → back to `PAID` with `refundError`, route answers 502.
  - **Manual (bank transfer) orders** have nothing to call: the dialog requires a bank reference and the order goes straight to `REFUNDED`, recorded with the same fields.
- `markOrderRefunded(id, { refundRef })` — conditional update from `PAID`/`REFUND_PENDING`, `enqueue` the `ORDER_REFUNDED` WhatsApp draft in the same transaction, `flushSoon` after. Same shape as `src/lib/orders/markPaid.ts`.
- `markRefundFailed(id, error)` — `REFUND_PENDING` → `PAID`.

### Routes

- New `POST /api/admin/orders/[id]/refund` — `withAuth("orders:refund", …, { stepUp: true })`, zod body `{ reason: string 1..500, bankRef?: string }`.
- `src/lib/auth/permissions.ts` — add `orders:refund`, held by `SUPERADMIN` only (ADMIN's list is derived by filter, so exclude it explicitly). Update the table test.
- `src/app/api/webhooks/payment/[gateway]/route.ts` — handle the two new outcomes: find the order by `orderId`, else by `(paymentProvider, paymentRef)` so a refund issued in the Stripe dashboard also reports back. Require `myr` and the full order total; a partial or mismatched refund is logged and acked, never applied.

### Two existing gaps this exposes (fix at the root)

- `orders/[id]/stage/route.ts` — its conditional update filters on `productionStage` only; add `status: "PAID"` so production cannot start on an order mid-refund.
- `orders/[id]/paid/route.ts` — a hand-marked order keeps `paymentProvider: "stripe"` with the admin's typed text as `paymentRef`. Set `paymentProvider: "manual"` there, so a refund never asks Stripe about a bank transfer.

### Everything that reads order status

- `src/lib/orders/card.ts`, `(account)/PaymentBadge.tsx`, `src/app/admin/orders/status.ts` — new badges/labels (compile errors point at each).
- `src/lib/orders/editDetails.ts` — `EDITABLE_ORDER` allows only `AWAITING_PAYMENT`/`PAID`.
- `src/app/[lang]/(account)/order/[token]/page.tsx` + `src/lib/copy/{en,ms,zh}.ts` — headings and bodies for refund in progress and refunded (today any unknown status reads "awaiting payment").
- `src/app/admin/orders/[id]/OrderDetail.tsx` + `page.tsx` — on a paid order with no production stage and no delivery, superadmins see **Cancel and refund** (dialog with required reason, step-up). Panels for refund pending (with Retry when no `refundRef`), refunded (who, when, reason, ref) and a visible `refundError`.
- Delivery create and stage advance already refuse anything not `PAID`; no change.

### WhatsApp

- `src/lib/whatsapp/templates.ts` — `ORDER_REFUNDED` in the event union, `TEMPLATE`, an explicit `case` in `draftFor` (the `default:` branch assumes a delivery), dedupe key `order:${id}:refunded`. `KIND_LABEL` in `OrderDetail.tsx`.
- `docs/ops/whatsapp-ezcabinet-setup.md` — the template copy; it joins the list awaiting Meta approval.

### Docs

- `CLAUDE.md`: status paragraph, auth section (staff passkeys, step-up), "no refund or cancel flow" lines, open question on re-measure refunds stays open.
- `STRIPE_INTEGRATION_TODO.md`: refunds section; `stripe listen` command with `--events` and the three refund events; the same events on the dashboard webhook endpoint.
- Refund policy wording already says "full refund before production starts"; meaning unchanged, so `TERMS_VERSION` stays.

## Verification

Automated:
- `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec biome check`.
- New tests: `stepUp`, `withAuth` step-up branch, `refundRefusal`, `requestRefund` (claim, gateway error reverts, manual path, retry), `markOrderRefunded`, permissions table, webhook route with real signed `refund.updated` / `refund.failed` events (same style as the existing webhook test), `templates` case, coverage list, `passkeyWiring` still green with the new session field.

End to end on localhost:
1. `stripe listen --events payment_intent.succeeded,payment_intent.processing,payment_intent.payment_failed,refund.created,refund.updated,refund.failed --forward-to localhost:3000/api/webhooks/payment/stripe`.
2. Pay a test order by FPX; order shows Paid.
3. As superadmin, enrol a passkey at `/admin/security` (Touch ID, or Chrome DevTools → WebAuthn virtual authenticator).
4. Cancel and refund: modal → reason → passkey prompt → order shows Refund pending → webhook lands → Refunded. Check the customer order page and the Stripe dashboard agree.
5. Negative cases: wait past 5 minutes and retry a guarded action (403 `step_up_required`); order with a production stage (button absent, route 409); `ADMIN` account (no button, 403); refund issued from the Stripe dashboard (order flips to Refunded); manual order (bank reference required, straight to Refunded).
6. Unpaid order: Cancel order and Mark paid both show the modal and passkey prompt.
