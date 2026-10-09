# Admin hardening: audit trail, mandatory staff passkey, money alerts

Status: scope agreed in conversation on 2026-10-09. Awaiting review of this written spec.

## Why

The passkey step-up and the gateway refund (merged 2026-10-08) left three
gaps their own reviews named:

1. Guarded actions are recorded only as a `console.info` line, which the host
   discards within days. A refund or a role change has no durable "who".
2. A staff account is unprotected until its owner enrols a passkey, and a
   first enrolment needs no proof. Until then the step-up adds nothing.
3. Money that needs a person (a payment landing on a cancelled order, a refund
   that failed after it was reported successful, a mismatched amount) reaches
   only the server log.

## 1. Audit trail

- New table `AuditLog`: `id`, `at`, `actorId` (nullable, `SetNull` so the row
  outlives the account), `actorName`, `action`, `targetType` (`order` | `user`),
  `targetId`, `detail Json?`.
- `recordAudit(tx, entry)` in `lib/audit.ts`, written in the same transaction
  as the change wherever the change has one, and immediately after it where it
  does not. An audit failure never undoes the action; it is logged.
- `action` is a closed list, one per guarded route: `order.cancel`,
  `order.mark_paid`, `order.mark_refunded`, `order.refund_request`,
  `order.refund_check`, `user.invite`, `user.promote`, `user.role_change`,
  `user.suspend`, `user.restore`, `user.delete`, `user.reset_passkey`,
  `user.reset_2fa`, `user.remove_password`. Gateway-driven changes are recorded
  too, with no actor: `order.paid_by_gateway`, `order.refunded_by_gateway`,
  `order.refund_failed`.
- `detail` holds what a reader needs and nothing secret: the cancel reason,
  the refund reference, the old and new role. Never a password, a code, or a
  customer's contact details.
- Read side: an **Activity** card on the admin order page (that order's rows),
  and `/admin/audit` for a superadmin (`users:manage`): the latest 200, newest
  first, filter by action. Read-only; there is no edit or delete.
- A test lists the guarded routes (the same list the step-up coverage test
  holds) and fails if one does not call `recordAudit`.
- The existing `console.info` lines stay; they cost nothing.

## 2. Staff must hold a passkey

- `AuthUser.mustSetupPasskey`, derived on every read: a staff role with no
  passkey. Enforced beside `mustChangePassword` and `mustSetupTwoFactor`, and
  after both: `withAuth` answers 403 `passkey_setup_required`, `requirePage`
  redirects to `/admin/setup-passkey`. Order: password, then authenticator,
  then passkey.
- `/admin/setup-passkey` reads `currentUser()` directly, as the other two
  setup pages do, and enrols one passkey.
- Enrolment proof. A staff account's **first** passkey may be registered only
  by a session created in the last 10 minutes, so the person has just passed
  the password and authenticator code, or Google. An older session is told to
  sign out and in again. (Customers keep the existing one-day rule.) This is a
  rule in `passkeyDecision`, which gains the role and the session's age.
- `AUTH_ENABLED=false` skips it, as it skips the step-up.
- Recovery is unchanged: a superadmin's Reset passkey, or
  `pnpm auth:reset-passkey` for a sole superadmin. After a reset the account
  owes the setup step again at next sign-in.
- Deploy: every staff member meets the setup page at their next request. No
  one is locked out, because the setup page is the only thing they can reach.
  An in-app browser or a device with no authenticator cannot enrol; the page
  says so.

## 3. Money alerts

- `lib/alert.ts`: `alertOps(event, fields)`. Posts one line to a Slack
  incoming webhook (`OPS_SLACK_WEBHOOK`, production only, like
  `WHATSAPP_TOKEN`), and always `console.error`s the same line. One `fetch`, no
  SDK, never throws, never blocks the caller (`after()`).
- Fields are ids, order references and amounts. Never a name, phone, address
  or email.
- Raised for:
  - a payment arriving on a cancelled order;
  - a refund reported failed after it was recorded as refunded;
  - a refund or payment event whose amount, currency or payment does not match
    its order;
  - a gateway refusing or not acknowledging a refund request;
  - a code or passkey mail bouncing, if the mail provider reports it (Resend
    webhook: out of scope here, noted for later).
- Admin orders list: a **Needs attention** marker, derived, never stored: a
  cancelled order that was paid and is not refunded, or any order with a
  `refundError`. A filter chip shows only those.

## Out of scope

End-to-end passkey tests in CI, a platform firewall rule on the code route,
"sign out of all devices" for customers, mail bounce handling. Each is worth
doing and none is needed for launch.

## Testing

- `recordAudit`: writes inside the caller's transaction; a failing audit
  write does not fail the action; `detail` for each action holds only its
  listed fields.
- Coverage: every guarded route records an audit entry.
- `mustSetupPasskey`: the derivation table; `withAuth` and `requirePage`
  ordering against the two existing gates.
- `passkeyDecision`: a staff first registration on a session older than 10
  minutes is refused, on a fresh one allowed; customer rules unchanged;
  `passkeyWiring.test.ts` stays green.
- `alertOps`: posts when configured, logs always, never throws, carries no
  personal data for each event's fields.
- Needs-attention derivation: table test.
