# Customer passkey runbook

Every customer sets up a passkey after signing in with Google. A passkey is the fingerprint, face or screen lock on their own phone or laptop. This page is for whoever answers the phone and whoever deploys.

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

The phone and order number appear on the row only when the customer has placed an order. If the row shows neither, there is nothing on file to ring back, and no order history to protect. Reset only after you have confirmed the Google account's email address with the caller.

## Stay on the line

Ask the customer to sign in and set up their passkey while you wait. The list does not update by itself, so reload **People**, then **Customers**. When the **Reset passkey** button is back on their row, their new passkey is in place. Between the reset and their new passkey, anyone who holds their Google account could set one up first.

## What a passkey does not protect

Until an account has its first passkey, whoever can sign in to that Google account can set it up. This covers:

- every existing customer on the day this goes live
- any customer just after a reset

A passkey protects the account from the moment it exists, not before.

## If a customer says a passkey is not theirs

Reset straight away. Then follow the ring-back steps above before the customer sets up a new one.

## Deploy checklist

- [ ] `BETTER_AUTH_URL` is the one production address. A passkey is tied to that exact hostname, and `www.example.com` and `example.com` are different to a passkey. Redirect every other hostname to this one before launch. Never change it afterwards: every customer's passkey would stop working.
- [ ] `WHATSAPP_SALES_NUMBER` is set. The "Lost your device?" link on the passkey screen needs it.
- [ ] Sales staff know what the screen looks like.
- [ ] Everyone knows what to expect on launch day. Every existing customer is asked to set up a passkey at their next order page. A customer whose Google sign-in is more than a day old is sent through Google once more first.
- [ ] Section J of `docs/ops/staff-2fa-test-checklist.md` has been run on a Vercel preview. The checkout step cannot be tried on a local production build, because the bot check only runs on Vercel.

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
