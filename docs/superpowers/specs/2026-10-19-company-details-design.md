# Company details, edited by the client

Status: built 2026-10-22 (plan docs/superpowers/plans/2026-10-21-company-details.md).

## Why

The app has to run without JNS. Today every fact about the company — its
name, address, phone, map pin, bank account, order prefix — is a constant in
`src/lib/tenant.ts`, `src/lib/logistics/carriers.ts` or
`src/lib/orders/payment.ts`. When EzCabinet moves, renames, or changes bank,
the only way to change any of it is a developer and a deploy. Most of those
values are still placeholders, and nobody at EzCabinet can enter the real
ones.

So: **a company fact that can change is something the client's own staff
change, from the admin, and changing it must never break work that is
already done.**

## Goals

- One admin page, `/admin/company`, where a superadmin edits every company
  detail listed below and saves it. No deploy.
- Every place that reads a company detail today reads the saved value
  instead. Nothing customer-, carrier- or staff-facing keeps a hard-coded
  company fact.
- After a move, every delivery not yet booked is quoted and booked from the
  new address by Lalamove (by pin), EasyParcel and FedEx (by postcode, city
  and state), all with the new phone. GDEX is the exception, below.
- A change shows on the next request everywhere, static pages included.

## Non-goals

- **A separate registered office.** The owner's decision: the registered
  address and the factory are one place for now, so one address serves the
  seller block on the terms page and at checkout, the email footer, and the
  courier pickup. Splitting it later is a second address block, not a
  redesign.
- More than one pickup location.
- Logo, favicon, accent colour, hero frames, decor photos. Those are assets
  and switches, not facts; `tenant.ts` keeps `heroFrames` and `finishPhotos`.
- The sending domain (`EMAIL_FROM`), the site's domain, payment gateway keys,
  carrier credentials. They need DNS or secrets, and stay with JNS's setup
  (`infra/`, env vars).
- A history screen. Every save is kept (below), but there is no UI for the
  past versions beyond "last changed by … on …".
- Re-sending bank details to customers with unpaid orders after a bank
  change.

## Anti-goals — it fails if

- Changing the order prefix renames a past order. Customers have typed
  `IC-20260826-014` into a bank transfer and kept it in an email.
- A delivery created before a move is quoted from the new workshop's pin
  while still showing the old address, or vice versa.
- Someone swaps the bank account number and nobody notices until payments
  stop arriving.
- A typo in the address needs JNS to fix.
- A bad address is saved, and the first anyone hears of it is a carrier
  refusing to quote. That already happened once: the placeholder
  `WORKSHOP_ADDRESS` could not be geocoded, so Lalamove could not quote a
  single pickup.

## What is edited

| Field                                   | Today                                | Validated as                                                                |
| --------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| Brand name                              | `tenant.brand`                       | required, 2–60 chars                                                        |
| Legal name                              | `tenant.legalName`                   | required                                                                    |
| SSM registration number                 | missing                              | optional; shown in the seller block when set                                |
| Contact email                           | `tenant.contactEmail`                | email                                                                       |
| Phone                                   | `tenant.workshopPhone`               | must normalise with `toE164` (`lib/logistics/phone.ts`)                     |
| Address line                            | `tenant.workshopAddress`             | required                                                                    |
| Postcode, city, state                   | `tenant.workshopPostcode/City/State` | 5-digit postcode; state an ISO 3166-2:MY code (`lib/logistics/malaysia.ts`) |
| Map pin                                 | `tenant.workshopPin`                 | required lat/lng inside Malaysia                                            |
| Courier close time                      | `WORKSHOP_CLOSE_TIME`                | `HH:MM`, Malaysia time                                                      |
| Bank name, account name, account number | `BANK_TRANSFER`                      | account number digits only                                                  |
| Order prefix                            | `tenant.orderPrefix`                 | 1–5 uppercase letters/digits                                                |

One phone serves the driver's pickup contact and the "call us" line in mail,
as it does today.

## Decided

- **Who:** superadmin only, a new `company:manage` permission in
  `lib/auth/permissions.ts`'s `SUPERADMIN_ONLY`. The save route passes
  `{ stepUp: true }` to `withAuth`, like Mark paid and Refund, and joins the
  step-up coverage test. The tab sits beside People in `SUPERADMIN_TABS`.
  _(Claude's call; the owner did not object.)_
- **A bank change is announced.** Saving a change to any bank field mails
  every active superadmin: who changed it, when (Malaysia time), bank name
  and the last four digits of the old and new account. No link, same reason
  as `lib/auth/passkeyMail.ts`. Through `lib/email/layout.ts`, so the
  one-look test holds. _(Claude's call.)_
- **References are fixed when they are made.** `Order` and `Delivery` each
  gain a stored `ref` written at creation from the prefix live at that
  moment. `lib/orders/ref.ts` and `lib/logistics/publicTracking.ts` stop
  building it from the current prefix; every reader (admin orders, order
  page, track page, mail, WhatsApp variables, Stripe metadata, refunds)
  reads the stored one. The migration backfills existing rows with each
  deployment's own current prefix, not a literal `IC` — the demo database
  holds `PO-` orders. A prefix change affects new orders only. _(Owner's
  decision.)_
- **A delivery records where it leaves from.** A delivery already stores
  `pickupAddress`, `pickupLat/Lng` and `pickupPostcode/City/State`. It gains
  a `fromWorkshop` flag, and creating one from the workshop always writes
  the workshop's address, pin and place onto the row. Nothing then needs the
  `address === WORKSHOP_ADDRESS` string match in `pickupPin`/`pickupPlace`,
  and those fallbacks go. The migration sets `fromWorkshop` and fills the
  pin and place on existing rows whose pickup is today's workshop address,
  before the fallbacks are removed.
- **Unbooked workshop deliveries move with the workshop.** _(Owner's
  decision.)_ Deliveries are created when an order is paid and wait 4–6
  weeks in production, so on moving day most open jobs still point at the
  old building. Saving a changed address, pin or place re-points every
  delivery that is `fromWorkshop` and not yet booked at a carrier: address,
  pin, postcode, city and state together, in the same transaction as the
  new `CompanyDetails` row, each recorded as a delivery event. Before
  saving, the page lists the jobs it will touch and asks to confirm. Booked
  jobs are left alone — the carrier already has a pickup — and the page
  lists those too, so staff know which to rebook or phone in. A job whose
  pickup an admin typed by hand is not `fromWorkshop` and never moves.
- **GDEX is warned about, not integrated.** _(Owner's decision.)_ GDEX
  quotes and books from the sender on EzCabinet's own GDEX account profile
  (`GetUserDetails` in `adapters/gdex.ts`) and ignores the app's address.
  `/admin/company` says the GDEX profile has to be updated in GDEX, and
  shows a mismatch warning when GDEX is configured and its profile postcode
  differs from the saved one. GDEX's booking reference (`ICB-${job.number}`
  today) uses the delivery's stored ref instead of a literal. _(Claude's
  call.)_
- **Bank details are live, not snapshotted.** An unpaid order's page shows
  the current account — the old one may be closed. Mail already sent keeps
  what it said; accepted.
- **The address is checked at save.** The form geocodes the address with
  `lib/logistics/geocode.ts` and fills postcode, city, state and pin from
  the result, all still editable. The admin can instead paste coordinates or
  a Google Maps link (`parseCoords`, `lib/logistics/coords.ts`). The pin is
  shown as an "Open in Google Maps" link so a person checks it before
  saving; no map library. When the geocoder is off or finds nothing, saving
  needs a typed pin — never a silent save without one.
- **Every save is a new row.** A `CompanyDetails` table, append-only; the
  newest row is live, and each row records who saved it. Same idea as
  `CatalogueVersion` being the price history: the bank-account history is
  the table. The page shows "Last changed by … on …".
- **First run seeds from the code.** With no row, the app reads today's
  `tenant.ts` values (EzCabinet's, or `tenants/demo.json`'s for the demo)
  as if they were the first row, and the first save writes one. After that,
  `tenant.ts` and the tenant JSON are only seed values for a new company's
  database.
- **Previous brand names stay reserved.** `customerName.ts` refuses a
  customer name that poses as the business; it refuses the current brand
  and every past brand in the table, and drops the literal `"ezcabinet"`.
  _(Claude's call.)_

## Every reader that moves

From `grep` on 2026-10-19:
- Carriers: `adapters/lalamove.ts`, `easyparcel.ts`, `fedex.ts` (brand,
  legal name, phone, close time, pickup place), `api/admin/deliveries`,
  `admin/logistics` (default pickup address).
- Customer pages: `[lang]/terms` and `QuoteScreen.tsx` (seller block),
  `[lang]/error.tsx` (brand), the landing footer email and every `{brand}`
  / `{orderPrefix}` in the dictionaries (`lib/copy/dictionary.ts`).
- Mail: `lib/email/layout.ts` (footer address and phone), `copy.ts`
  (`BRAND`), `templates/order.ts` (bank details, ref),
  `lib/auth/emailCodeMail.ts`, `passkeyMail.ts`.
- Admin chrome: `admin/layout.tsx`, `admin/login`, `AdminHeader.tsx`.
- Payments: `lib/orders/payment.ts` (`BANK_TRANSFER`), `lib/payments/stripe.ts`
  (description).
- Auth: `lib/auth.ts` (`rpName`, TOTP `issuer`), `customerName.ts`.

## Constraints

- Zod is the single source: one `companyDetailsSchema`, used by the form,
  the route and the reader.
- `lib/planner` is untouched.
- Nothing new in the planner's first load may import three; the quote screen
  gets the seller details as a prop or through context from the server.
  `QuoteScreen.tsx` and `error.tsx` are client components and cannot read the
  database.
- No new dependency.
- `TENANT` stops being inlined for these fields; whatever still needs it
  (the two switches) keeps working.
- `CLAUDE.md`'s open questions about `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE`,
  `WORKSHOP_POSTCODE/CITY/STATE`, `WORKSHOP_CLOSE_TIME` and `BANK_TRANSFER`
  change from "placeholder in code" to "EzCabinet enters it at
  `/admin/company`". Phase 2 of
  `docs/superpowers/plans/2026-10-11-multi-company-rollout.md` is amended the
  same way: these fields leave the tenant file.

## Accepted limits

- **`rpName` and the TOTP issuer are set when the auth instance is built.**
  A passkey or authenticator already enrolled keeps the old name forever —
  it is stored on the device. New enrolments pick up a rename once the
  function instance restarts. Cosmetic; written down so nobody chases it.
- Mail queued before a change and sent after it uses the new details,
  because `orderMail.ts` renders at flush time.

## Left to the builder

- Every field is required except the SSM number. _(Claude's call.)_
- Caching: how the saved row is read per request without a query on every
  render, and how a save invalidates it — following the
  `unstable_cache`/`revalidateTag` pattern in `lib/catalogue/store.ts` —
  the dictionary's module-level
  `filled` cache, the statically rendered landing and terms pages, and any
  other cache that captured the old values.
- How the client components receive the details.
- Table and column names, the migration, and the backfill SQL.
- Form layout, within the admin's existing look.
- Tests: at least the ref snapshot (a prefix change leaves an old order's
  ref alone), the step-up and permission coverage, the bank-change mail, and
  the save validation.
