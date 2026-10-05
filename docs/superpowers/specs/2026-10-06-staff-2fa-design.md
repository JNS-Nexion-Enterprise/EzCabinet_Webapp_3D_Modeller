# Staff two-factor sign-in (TOTP)

Piece 1 of 2. Piece 2 is `2026-10-06-customer-passkey-design.md`; this ships first.

## Goal

Harden the admin surface. A staff password alone must not be enough to mark
orders paid, book carriers or read customer details.

## Decisions (agreed 2026-10-06)

- Method: TOTP from an authenticator app, plus one-time backup codes. No SMS
  or email codes — the app runs no messaging vendor for staff.
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
  1.7.5 — no new dependency.
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
  clears `twoFactorEnabled` and deletes their sessions. Their next sign-in
  forces enrolment again.

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

## Rollout

On deploy every staff member with a password meets the setup screen on their
next page load. Tell them first.

## Out of scope

2FA for Google-only staff, SMS or email codes, customer accounts (piece 2).
