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
