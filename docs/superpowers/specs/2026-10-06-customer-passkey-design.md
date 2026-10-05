# Customer passkey, required after Google sign-in

Piece 2 of 2. Built after `2026-10-06-staff-2fa-design.md`.

## Goal

A customer's Google account alone must not be enough to open their orders or
place one. After Google sign-in the customer also proves possession of a
passkey registered to the account.

## Decisions (agreed 2026-10-06)

- The passkey is a mandatory second step, not an alternative sign-in.
- Recovery is a staff reset only. No recovery codes, and no self-service
  re-enrolment through Google — that would let anyone holding the Google
  account skip the passkey, which is the attack this exists to stop.
- A customer may register several passkeys (phone and laptop).

## The rule

A `CUSTOMER` session counts as signed in only when
`session.passkeyVerified = true`.

Applies to `/[lang]/orders`, `/[lang]/order/[token]`, an order-owned
`/[lang]/track/[token]`, `POST /api/orders` and payment start. The planner,
pricing and landing pages stay anonymous.

Exempt: staff roles (they have their own rule in piece 1), and the seeded
demo customer when `AUTH_ENABLED=false`.

## Flow

1. Google sign-in creates a session with `passkeyVerified = false`.
2. Any gated surface redirects to `/[lang]/verify?next=…`.
3. No passkey on the account: enrol. On success the flag is set.
4. A passkey exists: the browser prompts; the plugin's
   `/passkey/verify-authentication` creates a fresh session, which is stamped
   verified.
5. Back to `next`. The planner draft survives the detour the same way it
   survives today's sign-in bounce (`lib/plannerDraft.ts`).

## Server

- New dependency: `@better-auth/passkey@1.7.5` (matches the installed
  `better-auth`; brings `@simplewebauthn/server` and `/browser`).
- `src/lib/auth.ts`: add `passkey()`; add
  `session.additionalFields.passkeyVerified` (`boolean`, `input: false`,
  default `false`). `src/lib/auth/client.ts`: add `passkeyClient()`.
- An `after` hook on `/passkey/verify-authentication` and
  `/passkey/verify-registration` sets `passkeyVerified` on the resulting
  session.
- **Load-bearing guard**, a `before` hook. Out of the box the plugin lets any
  fresh session register another passkey and any session delete one, so a
  Google-only session could add its own passkey and verify with it. Therefore:
  - register (`/passkey/generate-register-options`, `/passkey/verify-registration`):
    allowed only when the account has zero passkeys, or the session is verified;
  - delete and rename: allowed only when the session is verified;
  - delete is refused for the account's last passkey.
- The customer check lives in one place: `viewerOf` in
  `src/lib/orders/access.ts` redirects an unverified customer to
  `/[lang]/verify`, and a route-level twin answers 401
  `passkey_required` for `POST /api/orders` and payment start.
- Migration, hand-written (Known issue 12): the plugin's `passkey` table and
  `session.passkeyVerified`.
- Passkeys are bound to the site's domain (the WebAuthn relying-party id,
  taken from `BETTER_AUTH_URL`). A passkey made on one preview URL does not
  work on another, and changing the production domain invalidates every
  customer's passkey.

## Screens

- `/[lang]/verify`: enrol or prompt. Shows "Lost your device? Contact
  EzCabinet" with the sales number. When the browser has no WebAuthn (common
  in the WhatsApp, Facebook and Instagram in-app browsers) it says to open
  the page in Chrome or Safari.
- Account area, new "Passkeys" page under `app/[lang]/(account)/`: list, add
  another device, rename, remove (never the last).
- `/admin/users`: "Reset passkey" on a customer row, behind `users:manage`.
  `POST /api/admin/users/[id]/reset-passkey` deletes all the user's passkeys
  and sessions. The row shows the customer's order numbers and phone so staff
  can check who is calling.

## Telemetry

`passkey_enrol_started`, `passkey_enrol_completed`, `passkey_enrol_failed`
and `passkey_verify_failed` join the typed union in `lib/analytics.ts`, so
the checkout drop this step causes is measurable. No credential ids or names
in payloads.

## Accepted costs

- A first-time customer meets the enrol step between the quote and Pay.
- Customers arriving from a WhatsApp link must switch browsers to order.
- Existing customers are forced to enrol at their next sign-in.
- A lost device with no second passkey means a call to EzCabinet.

## Tests

- Guard truth table: passkey count × session verified × action.
- Every customer surface refuses an unverified session; a test fails if a
  gated route skips the check.
- The after-hook stamps the session on both verify endpoints.
- Reset route: gated, clears passkeys and sessions.
- Staff and the demo customer are unaffected.

## Out of scope

Recovery codes, WhatsApp-code recovery, passkey as a sign-in that replaces
Google, passkeys for staff.
