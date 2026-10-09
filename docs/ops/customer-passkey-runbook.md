# Customer passkey runbook

Every customer sets up a passkey after signing in. They sign in with Google, or with a six-digit code we email to their address. A customer who signs in with a code is asked for their name once, before the passkey. A passkey is the fingerprint, face or screen lock on their own phone or laptop. This page is for whoever answers the phone and whoever deploys.

## Resetting a customer's passkey

A reset removes the customer's passkeys and signs them out everywhere. Their next sign-in asks them to set up a new passkey.

- Only a superadmin has the button: **People**, then **Customers**, then **Reset passkey** on the customer's row.
- An admin who takes the call passes it to a superadmin. An admin cannot reset.
- The button works for customers only. Staff accounts have no passkey step.

## Before you reset

Do not trust a caller because they rang you.

1. Look at the phone number on the customer's row. It comes from their order.
2. Ring that number back yourself.
3. Ask for an order number and check it against the row.
4. Only then press **Reset passkey**.

Never reset because of an inbound call, an email or a WhatsApp message.

The phone and order number appear on the row only when the customer has placed an order. If the row shows neither, there is nothing on file to ring back, and no order history to protect. Reset only after you have confirmed the account's email address with the caller. The customer is emailed that their passkeys were reset, so the real owner hears of it even if the caller was not them.

## Stay on the line

Ask the customer to sign in and set up their passkey while you wait. The list does not update by itself, so reload **People**, then **Customers**. When the **Reset passkey** button is back on their row, their new passkey is in place. Between the reset and their new passkey, anyone who can sign in as them could set one up first. That is anyone who holds their Google account, or who can read their email.

## What a passkey does not protect

Until an account has its first passkey, whoever can sign in to it can set it up. That is whoever holds the Google account, or whoever can read the mailbox a sign-in code is sent to. This covers:

- every existing customer on the day this goes live
- any customer just after a reset

A passkey protects the account from the moment it exists, not before.

The account's own email address is told every time a passkey is added or removed, and when staff reset them. The email says what happened and when, and gives our number. It has no link. If a customer rings to say they got one and it was not them, treat it as "a passkey is not theirs" below.

## If a customer says the sign-in code never arrives

Nobody at EzCabinet can see or send a code by hand. Ask them to:

1. Check the junk or spam folder.
2. Read back the address shown above the code box. If it is wrong, press **Use a different email**.
3. Wait for the newest email. Each new code cancels the one before it.

After three codes in an hour, no more are sent to that address until the hour is up, and the screen says so. Anyone who knows an address can use up its three codes, so a customer may be locked out of codes for an hour by a stranger; it gives the stranger no access. If the customer no longer has that mailbox at all, there is no way back into the account: they sign in with an address they do have, which is a new account.

## If a customer says a passkey is not theirs

Reset straight away. Then follow the ring-back steps above before the customer sets up a new one.

## Deploy checklist

- [ ] `BETTER_AUTH_URL` is the one production address. A passkey is tied to that exact hostname, and `www.example.com` and `example.com` are different to a passkey. Redirect every other hostname to this one before launch. Never change it afterwards: every customer's passkey would stop working.
- [ ] `WHATSAPP_SALES_NUMBER` is set. The "Lost your device?" link on the passkey screen needs it.
- [ ] Sales staff know what the screen looks like.
- [ ] The database migration `20261009000000_rate_limit` is applied **before** the new code serves traffic (`pnpm exec prisma migrate deploy`). Every sign-in request counts itself in that table, so without it nobody can sign in, staff included.
- [ ] Before deploy, no staff row has an unverified email: `SELECT count(*) FROM "user" WHERE role <> 'CUSTOMER' AND "emailVerified" = false;` answers 0. Fix any row found by confirming the address with its owner and setting `emailVerified` to true. (A correct code on such a row would otherwise wipe its sign-ins; the app refuses the request, but the row should not exist.)
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` are set in production, and the sending domain has SPF, DKIM and DMARC. Send a sign-in code to an Outlook address and a Yahoo address and check both arrive in the inbox, not junk. Without the key, codes are written to the server log and no customer receives one. Checkout depends on this mail for every customer without Google.
- [ ] `RESEND_API_KEY` is stored as a sensitive variable, so it cannot be read back from the dashboard: `vercel env add RESEND_API_KEY production --sensitive`. The secrets already in the project should be stored the same way: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `MUX_TOKEN_SECRET`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `FLAGS_SECRET` and each carrier's secret or token. To change one, remove it and add it again with `--sensitive`.
- [ ] The firewall rule in front of the sign-in code route exists and is published (next section). Stage it counting only first.
- [ ] BotID's two halves agree: the send-code request in the browser's Network tab is exactly `/api/auth/email-otp/send-verification-otp`, the path in `src/instrumentation-client.ts`, and answers 200; the same request from `curl` answers 403 `EMAIL_CODE_BOT`.
- [ ] After the first sign-in in production, check the `rateLimit` table: the keys for the code route start with a visitor's address, a different one for each visitor. A key starting `no-trusted-ip` means every visitor shares one counter. Tell the developer before launch.
- [ ] Everyone knows what to expect on launch day. Every existing customer is asked to set up a passkey at their next order page. A customer whose sign-in is more than a day old is asked to sign in once more first.
- [ ] Section J of `docs/ops/staff-2fa-test-checklist.md` has been run on a Vercel preview. The checkout step cannot be tried on a local production build, because the bot check only runs on Vercel.

## The firewall rule in front of sign-in codes

The app already limits code requests: three an hour to one address, twenty an hour from one network. The per-network limit is a rolling count, so a busy shared network can be refused for an hour; that is accepted. This rule is the wall outside the app. It stops a flood before it reaches a function or the database. It is set at sixty an hour, three times the app's limit, so a real customer always meets the app's own message first and never this.

Someone with access to the Vercel project runs these, in the linked project folder.

1. Stage the rule, counting only. Nothing is blocked yet.

   ```bash
   vercel firewall rules add "Sign-in code requests" --condition '{"type":"path","op":"eq","value":"/api/auth/email-otp/send-verification-otp"}' --condition '{"type":"method","op":"eq","value":"POST"}' --action rate_limit --rate-limit-window 3600 --rate-limit-requests 60 --rate-limit-keys ip --rate-limit-action log --description "Outer wall for emailed sign-in codes. Looser than the app's 20 per hour per network."
   ```

2. Read what was staged, then make it live.

   ```bash
   vercel firewall diff
   vercel firewall publish
   ```

3. Ask for a code on the live site, then check the rule saw it and blocked nothing: `vercel firewall rules inspect "Sign-in code requests"` and `vercel firewall traffic`.

4. Switch it from counting to refusing, read the change, and publish.

   ```bash
   vercel firewall rules edit "Sign-in code requests" --rate-limit-action deny
   vercel firewall diff
   vercel firewall publish
   ```

If a customer is ever refused by this rule rather than by the app, raise the number. Never lower it below the app's own.

## Staff passkeys

Staff sign in with a password and code, or Google, as before. A passkey is
what confirms an action that moves money or access: cancel order, mark paid,
refund through the gateway, mark refunded, invite a member, change a role,
suspend or restore, delete user, reset passkey, reset 2FA, remove password.
The prompt appears when no passkey was used in the last five minutes.

- Set one up under **Security** in the admin header, on each device you work
  from. The first one needs a sign-in from the last day.
- Lost the device: a superadmin presses **Reset passkey** on your row in
  People. You are signed out and set up a new one.
- The only superadmin lost theirs: `pnpm auth:reset-passkey <email>`, run by
  someone with database credentials.
- Before resetting a colleague's passkey, confirm it is them asking, by voice
  or in person. Whoever signs in to that account next can enrol their own.

Deploy-day checklist:

- [ ] Every staff member enrols a passkey under **Security** on the day this
  ships. Until an account has one, the passkey step protects nothing for it:
  a first passkey needs no confirmation, so whoever holds that session could
  set one up and confirm any guarded action with it.
