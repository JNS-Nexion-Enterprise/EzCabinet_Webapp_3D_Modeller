# Staff two-factor sign-in (TOTP)

Piece 1 of 2. Piece 2 is `2026-10-06-customer-passkey-design.md`; this ships first.

## Goal

Harden the admin surface. A staff password alone must not be enough to mark
orders paid, book carriers or read customer details.

## Decisions (agreed 2026-10-06)

- Method: TOTP from an authenticator app, plus one-time backup codes. No SMS
  or email codes: a staff mailbox is usually the same Google account, so a
  code sent there is not a second factor.
- A forgotten password is reset by an emailed link (Resend). The link resets
  the password only, never the second factor.
- Mandatory for every staff account that has a password. Staff who sign in
  only with Google are exempt: Google carries its own second factor.
- A lost device is fixed by a superadmin reset, not by self-service.

## Who must enrol

A user with a staff role, an `account` row with `providerId = "credential"`,
and `twoFactorEnabled = false`.

The rule is keyed on the account, not on how the current session signed in.
The session row does not record the method, and a staff account with a
password is the exposure whichever door was used today.

Accepted gap: Better Auth's `twoFactor` plugin gates `/sign-in/email` only. A
staff member with both a password and a linked Google account can still enter
through Google without a code. Their password door is closed, which is the
goal; the Google door relies on Google.

## Server

- `src/lib/auth.ts`: add `twoFactor({ issuer: "EzCabinet Admin" })` from
  `better-auth/plugins`. Already shipped inside the installed `better-auth`
  1.7.5. The only new dependency is `uqr`, to draw the enrolment QR code.
- `src/lib/auth/client.ts`: add `twoFactorClient()`.
- Migration, hand-written (Known issue 12) and checked with
  `prisma migrate diff --from-config-datasource --to-schema`:
  - `user.twoFactorEnabled Boolean? @default(false)`
  - `twoFactor` table: `id`, `secret`, `backupCodes`, `userId` (FK, cascade,
    indexed), `verified`, `failedVerificationCount`, `lockedUntil` — the
    plugin's own schema (`node_modules/better-auth/dist/plugins/two-factor/schema.mjs`).
- `AuthUser` gains `mustSetupTwoFactor: boolean`, derived in `currentUser()`
  from the rule above. Never stored.
- Enforcement sits beside `mustChangePassword`, in the same two places:
  - `withAuth` (`lib/auth/route.ts`) answers 403 `two_factor_setup_required`.
  - `requirePage` (`lib/auth/page.ts`) redirects to `/admin/setup-2fa`.
  - Order: a forced password change comes first, then 2FA setup.
- `BYPASS_USER` (`AUTH_ENABLED=false`): `mustSetupTwoFactor: false`.
- Staff cannot disable their own 2FA: add `/two-factor/disable` to
  `disabledPaths`.

## Screens

- `/admin/login`: when `signIn.email` answers `twoFactorRedirect`, the same
  page swaps to a 6-digit code field with a "Use a backup code" link and a
  "Trust this device for 30 days" checkbox (the plugin's built-in trusted
  device cookie). One error message for any wrong code.
- `/admin/setup-2fa`: confirm password → QR code and manual key → enter a
  code to verify → show the backup codes once, with an "I have saved these"
  confirmation before continuing. Like `/admin/change-password`, it reads
  `currentUser()` directly so it cannot redirect to itself.
- `/admin/users`: a "Reset 2FA" action on a staff row, behind `users:manage`.
  `POST /api/admin/users/[id]/reset-2fa` deletes the user's `twoFactor` row,
  clears `twoFactorEnabled`, deletes their sessions and forgets their trusted
  devices. Their next sign-in
  forces enrolment again.
- `/admin/users`: a "Remove password" action on a staff row that has one,
  behind `users:manage`. `POST /api/admin/users/[id]/remove-password` deletes
  the credential account, clears `mustChangePassword` and runs the Reset 2FA
  writes, making the account Google-only. Refused (409) when the user has no
  other linked sign-in. A "2FA not set up" pill marks rows that have a
  password but no second factor.

## Forgot password

Resend is the mail sender. Only staff have passwords, so this is a staff
feature; customers sign in with Google and have nothing to reset.

- One sender, `src/lib/email.ts` (`server-only`), a single `fetch` to
  Resend's HTTP API — no SDK — reading `RESEND_API_KEY` and `EMAIL_FROM`. The verified sending domain is
  still to be supplied; until both are set the sender logs and sends nothing.
  Preview deployments never get `RESEND_API_KEY`, the same rule as
  `WHATSAPP_TOKEN`.
- `emailAndPassword.sendResetPassword` in `src/lib/auth.ts`, with
  `resetPasswordTokenExpiresIn` of one hour and
  `revokeSessionsOnPasswordReset: true`. This replaces the "No reset mail"
  comment there.
- **Guard.** Better Auth's reset creates a credential account when the user
  has none (`node_modules/better-auth/dist/api/routes/password.mjs`), so an
  open reset would let any customer give themselves a password.
  `sendResetPassword` sends only when the user has a staff role, is not
  disabled, already has a credential account, and has 2FA enabled. Otherwise
  it sends nothing. The last condition closes the window before enrolment: a
  stolen mailbox could otherwise set a password, sign in and enrol the
  thief's own authenticator. Unenrolled staff who use Google ask a superadmin to remove their password; there is no way to set another person's password.
  The page shows the same "If that address has an account, we have sent a
  link" either way.
- A reset does not touch `twoFactor`. The new password still needs a code,
  so a stolen mailbox alone does not open the admin surface.
- A successful reset clears `mustChangePassword`.
- Pages: `/admin/forgot-password` (email field) and `/admin/reset-password`
  (new password, 12-character minimum from the existing config). A "Forgot
  password?" link on `/admin/login`.

## Recovery

1. Backup code at the login prompt.
2. Superadmin presses Reset 2FA.
3. The only superadmin has lost both device and codes: a documented script
   (`pnpm auth:reset-2fa <email>`) run against the database. No in-app back
   door.

## Tests

- `mustSetupTwoFactor` truth table: role × has password × enabled.
- `withAuth` refuses and `requirePage` redirects while it is set; the setup
  page stays reachable; password change takes precedence.
- Reset route: gated by `users:manage`, clears the row, the flag and the
  sessions.
- The admin-route coverage test passes with the new route.
- Reset guard truth table: role × disabled × has password. No mail for a
  customer row or a Google-only staff row; the response is identical.
- A reset revokes sessions and leaves the `twoFactor` row intact.

## Rollout

On deploy every staff member with a password meets the setup screen on their
next page load. Tell them first.

## Out of scope

2FA for Google-only staff, SMS or email codes, emailed staff invites,
customer accounts (piece 2).
