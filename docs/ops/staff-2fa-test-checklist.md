# Staff 2FA and password reset — dev test checklist

Tick each box as you go. Every step says what you should see; anything else is a bug — note it at the bottom.

Design: `docs/superpowers/specs/2026-10-06-staff-2fa-design.md`.

## 0. Configuration

### Local (`.env.local`)

- [ ] `AUTH_ENABLED=true` — with `false` the admin opens without sign-in and no 2FA screen ever appears
- [ ] `BETTER_AUTH_URL=http://localhost:3000`
- [ ] `RESEND_API_KEY` set
- [ ] `EMAIL_FROM` set, on a domain that shows **Verified** in Resend → Domains
- [ ] Google OAuth client has redirect URI `http://localhost:3000/api/auth/callback/google` (only needed for section G)

`.env.local` reloads by itself; no restart needed after editing it.

### Vercel — still to do before production

- [ ] Production: `DATABASE_URL`
- [ ] Production: `BETTER_AUTH_SECRET` — it encrypts every authenticator secret. Once staff enrol, never rotate it
- [ ] Production: `BETTER_AUTH_URL` — the emailed reset link is built from it
- [ ] Production: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- [ ] Production only, never Preview: `RESEND_API_KEY`, `EMAIL_FROM`

## 1. Setup (once)

The local superadmin signs in with Google only, so 2FA does not apply to it. You need a staff account that has a password.

- [ ] Get into `/admin/users`: sign in with Google, or set `AUTH_ENABLED=false` for a moment
- [ ] Invite a staff member: a second email of yours, role **Superadmin**, a password of 12+ characters
- [ ] `AUTH_ENABLED=true` again, sign out
- [ ] Authenticator app installed on your phone (Google Authenticator, Microsoft Authenticator, 1Password)

Test account email: `______________________`

## A. Forced enrolment

- [ ] Sign in at `/admin/login` with the invited email and password → asked to change the password first
- [ ] After changing it → lands on `/admin/setup-2fa`, not the admin
- [ ] Type `/admin/users` in the address bar → sent back to `/admin/setup-2fa`
- [ ] Wrong password on the setup screen → "That password is incorrect."
- [ ] Right password → QR code and a manual key appear
- [ ] Reload the page now → back at the password step (an abandoned enrolment still owes setup)
- [ ] Password again → scan the QR → enter the code → ten backup codes shown
- [ ] **Continue** does nothing until "I have saved these codes" is ticked
- [ ] Save the codes, tick, continue → the admin opens
- [ ] Open `/admin/setup-2fa` again → redirected to the admin
- [ ] `/admin/users`: the test account no longer shows "2FA not set up"

## B. Sign-in needs the code

- [ ] Sign out, sign in with the password → a code field, not the admin
- [ ] In a new tab open `/admin/users` → login page (no session exists yet)
- [ ] Wrong code → "That code didn't work. Try again."
- [ ] Right code → in
- [ ] Sign out, sign in, paste the code with a space (`123 456`) → accepted
- [ ] Sign out, sign in, **Use a backup code** → in
- [ ] Sign out, sign in, the same backup code again → refused
- [ ] Sign in ticking **Trust this device for 30 days** → sign out → sign in → no code asked
- [ ] In a private window (untrusted) → code is asked

## C. Things that must fail

- [ ] Four wrong codes quickly → "Too many attempts…" (not "That code didn't work")
- [ ] Keep going to ten wrong codes → locked; the right code is refused too. Wait 15 minutes, or Reset 2FA from another superadmin
- [ ] Signed in as the test account, in the browser console:

  ```js
  fetch("/api/auth/two-factor/disable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "x" }),
  }).then((r) => r.status);
  ```

  → `404`. Staff cannot switch their own second factor off
- [ ] Signed in as a **customer** (Google, non-staff), open `/admin/users` → 404 page
- [ ] Signed out, open `/admin/setup-2fa` → login page
- [ ] Signed out, open `/admin/users` → login page

## D. Reset 2FA (lost phone)

- [ ] `/admin/users` → test account row → **Reset 2FA** → button becomes **Confirm reset**
- [ ] Click elsewhere → back to **Reset 2FA** (nothing happened)
- [ ] **Reset 2FA** → **Confirm reset** on your own row → signed out
- [ ] Sign in with the password, on the browser you trusted in B → no code asked, straight to `/admin/setup-2fa`
- [ ] Enrol again, sign out, sign in → a code **is** asked (the old "trusted device" is forgotten)
- [ ] Dev server terminal shows a `Two-factor reset` line with actor and target ids

## E. Forgot password

- [ ] Signed out: `/admin/login` → **Forgot password?** opens `/admin/forgot-password`
- [ ] Submit the enrolled test account's email → "If that address has a staff account…"
- [ ] Submit a customer's email → the identical sentence
- [ ] Submit a made-up email → the identical sentence
- [ ] A mail arrives only for the enrolled staff address
- [ ] The link opens `/admin/reset-password?token=…`
- [ ] A 5-character password → refused
- [ ] A 12+ character password → "Password changed. You have been signed out everywhere"
- [ ] Sign in with the **old** password → refused
- [ ] Sign in with the new password → the code is **still** asked (a mailbox alone is not enough)
- [ ] On the browser trusted in B → the code is asked there too (a reset forgets trusted devices)
- [ ] Open the same emailed link again → "This link has expired or was already used", no form
- [ ] Open `/admin/reset-password` with no token → the same message, no form
- [ ] Request five links in a row → mails 1–3 arrive, 4 and 5 do not
- [ ] Reset 2FA on the test account, then request a reset link before enrolling again → no mail (not enrolled = no reset by email)

No mail at all? Look at the dev server terminal:
`Email not configured` = a variable is missing; `Resend refused an email 403` = the domain is not verified in Resend.

## F. Remove password (Google-only escape hatch)

- [ ] On a staff row with no Google account linked: **Remove password** → **Confirm** → refused: "This account has no other way to sign in. Link Google first."
- [ ] On a staff row that has both a password and Google: **Remove password** → works
- [ ] That row loses "2FA not set up" and the Remove password button
- [ ] That person signs in with Google → straight into the admin, no setup screen
- [ ] Their password no longer signs in
- [ ] Dev server terminal shows a `Password removed` line with actor and target ids

## G. Google-only staff are exempt

- [ ] Sign in as the Google-only superadmin → straight in: no setup screen, no code
- [ ] Their row shows neither "2FA not set up" nor Reset 2FA

## H. Admins cannot do superadmin things

Invite one more account with role **Admin**, enrol it, sign in as it.

- [ ] `/admin/users` → 404
- [ ] In the console: `fetch("/api/admin/users/ANY_ID/reset-2fa", { method: "POST" }).then((r) => r.status)` → `403`

## Customer passkey

A customer who signs in with Google must also prove a passkey before their session counts. Design: `docs/superpowers/specs/2026-10-06-customer-passkey-design.md`. Sections continue the lettering above.

### Setup (this part)

- [ ] `AUTH_ENABLED=true` in `.env.local`, and `BETTER_AUTH_URL=http://localhost:3000` (a passkey is bound to the hostname; `localhost` is allowed over http)
- [ ] A customer Google account that is **not** staff, and has never signed in here (or whose passkeys were reset)
- [ ] A browser with a passkey provider: Chrome with the device's screen lock or Touch ID. To test without a second device, use Chrome DevTools → **More tools → WebAuthn → Enable virtual authenticator environment** and add an authenticator (CTAP2, internal, resident key and user verification on). A second virtual authenticator stands in for "another device"
- [ ] A second customer Google account, for the "different account" step in section K

## I. Enrolling and signing in

- [ ] Sign in with the customer Google account for the first time → lands on `/en/verify` ("One more step"), not My orders
- [ ] **Set up passkey** → the browser sheet opens; approve it → lands on My orders
- [ ] Repeat on a fresh account, cancel the browser sheet → stays on the verify page with "That didn't work. Try again"; **Set up passkey** works the second time
- [ ] Sign out, sign in with Google again → the verify page now says "Confirm it's you with your passkey." with **Use passkey**; approve → lands on My orders
- [ ] Open the order link in a private window, sign in with Google, and do not approve the passkey prompt → the order page does not open
- [ ] While signed in but unverified (verify page showing), open each of `/en/orders`, an `/en/order/<token>` of that customer, and `/en/track/<token>` of one of their deliveries → each bounces to `/en/verify`
- [ ] Verify, then open the same three pages → all open
- [ ] A **staff** account (invited, with password and 2FA) signs in → never sent to `/en/verify`; opening `/en/verify` while signed in as staff redirects away to My orders

## J. Checkout

- [ ] Signed out, build a design, sign in with Google from the quote screen → back on the quote screen with the checkout form
- [ ] Press **Place order** (or **Pay**) as a customer who has not passed a passkey → sent to `/en/verify`
- [ ] Complete the passkey → returns to the quote screen with the design intact
- [ ] Press **Place order** (or **Pay**) again → the order is placed and its order page opens
- [ ] Signed in but unverified, press **Place order** (or **Pay**) on the quote screen → sent to `/en/verify`, not an order. (The API answer `401 passkey_required` is covered by tests; a bare console `fetch` to `/api/orders` is stopped by the bot check first, so it is not a useful manual step)

## K. Things that must fail

Run these from the console while signed in as the customer, on any `/en/...` page.

- [ ] Unverified session (Google just done, verify page still showing) that **already has a passkey**, ask for registration options:

  ```js
  fetch("/api/auth/passkey/generate-register-options", { credentials: "include" }).then((r) => r.status);
  ```

  → `403` (only the first passkey may be registered unverified)
- [ ] Same unverified session, delete a passkey:

  ```js
  fetch("/api/auth/passkey/delete-passkey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "anything" }),
  }).then((r) => r.status);
  ```

  → `403`
- [ ] Verified session, customer with exactly one passkey, same delete call → `400` ("An account keeps at least one passkey")
Unknown passkey routes are refused by default; this cannot be provoked by hand and is covered by `src/lib/auth/__tests__/passkeyHooks.test.ts`.

- [ ] On a device that holds a passkey for **another** account (second Google account enrolled on the same browser or virtual authenticator), sign in as the first account and press **Use passkey**, choosing the other account's passkey → "That passkey belongs to a different account"; still not verified, still the first account

## L. Passkeys page

- [ ] My orders → "Your account" side nav → **Passkeys** (`/en/passkeys`) lists the passkey with an "Added …" date
- [ ] The date is the Malaysia date: change the machine clock or compare after 16:00 UTC; the page loads with no hydration warning in the console
- [ ] **Rename** → type a name → **Save** → the new name shows after reload
- [ ] **Add another device** → the browser sheet opens → a second passkey is listed
- [ ] With two passkeys, **Remove** one → gone. With one left, **Remove** is disabled and hovering it shows "You need at least one passkey" as a tooltip (the server refusal is the console check in section K)
- [ ] Verified session older than a day: age it, then reload the Passkeys page (do not sign out):

  ```sql
  UPDATE "session"
  SET "createdAt" = now() - interval '2 days'
  WHERE "userId" = (SELECT "id" FROM "user" WHERE "email" = 'customer@example.com')
    AND "passkeyVerified" IS TRUE;
  ```

  Press **Add another device** → the browser first asks for an existing passkey (this renews the session), then asks to register the new one → a second passkey is listed, with no sign-out

## M. Stale session on the verify screen

Enrolling needs a Google session under one day old. To provoke it locally, age the session in the local database (there is no UI for it). Use a customer with **no** passkey, sign in with Google, stop on the verify page, then run:

```sql
UPDATE "session"
SET "createdAt" = now() - interval '2 days'
WHERE "userId" = (SELECT "id" FROM "user" WHERE "email" = 'customer@example.com')
  AND "passkeyVerified" IS NOT TRUE;
```

- [ ] Press **Set up passkey** → the page shows "For your security, sign in with Google again to set up your passkey" and a **Sign in again** link
- [ ] **Sign in again** → Google → back on the verify page with a new session; **Set up passkey** now works

## N. Redirects

- [ ] Verified customer opens `/en/verify?next=//example.com` → lands on `/en/orders`, not another site
- [ ] `/en/verify?next=/a/..//example.com` → lands on `/en/orders`
- [ ] `/en/verify?next=/en/passkeys` → lands on `/en/passkeys` (a same-site path is followed)

## O. Lost device — Reset passkey

- [ ] As a **superadmin**, `/admin/users` opens on the **Staff** filter: press **Customers** first. The customer's row shows **Reset passkey** once they hold a passkey, and the order-number-and-phone line only if they have placed at least one order (use one who has, or expect no line)
- [ ] As an **Admin** (not superadmin) → `/admin/users` is 404, so neither the phone line nor **Reset passkey** is visible; in the console `fetch("/api/admin/users/ANY_ID/reset-passkey", { method: "POST" }).then((r) => r.status)` → `403`
- [ ] A customer with no passkey has no **Reset passkey** button
- [ ] **Reset passkey** → **Confirm reset** → the customer is signed out in their open browser (next page load goes to sign-in)
- [ ] The customer signs in with Google → on `/en/verify` with **Set up passkey** (enrolling again, not "Use passkey")
- [ ] Dev server terminal shows a `Passkeys reset` line with actor and target ids

## P. Browsers and languages

- [ ] Open `/en/verify` inside an in-app browser (WhatsApp, Facebook or Instagram link) → "This browser can't use passkeys. Open this page in Chrome or Safari." and no button
- [ ] `/zh/verify` and `/ms/verify` render translated, as do the Passkeys page and its error messages
- [ ] Known and accepted: a customer inside an in-app browser cannot order there at all

## Known and accepted

- A staff member with both a password and a linked Google account can still enter through Google without a code. Their password door is closed; the Google door relies on Google.
- Backup codes are shown once. Lost them and the phone → a superadmin resets 2FA.
- The last superadmin locked out → `pnpm auth:reset-2fa <email>` against the database.
- Not fixed yet: an unenrolled staff member who holds a customer order link can still open that order page.

## Already checked by script

39 HTTP checks against a production build passed on 2026-10-06: forced setup, the closed disable route, enrolment, the code prompt, single-use backup codes, trusted devices, Reset 2FA, the reset link's single use and 12-character floor, sessions revoked on reset, the second factor left intact by a reset. What a script cannot check is what you are checking here: that the screens render, the QR scans with a real phone, and the wording is right.

## Bugs found

| Step | What happened | Expected |
| --- | --- | --- |
|  |  |  |
