# Legal pages: terms of sale, refund policy, privacy update

2026-10-07. Status: approved in conversation, awaiting spec review.

Piece **A** of two. Piece **B** — phone step after sign-up, Profile page,
checkout prefill — is its own spec and depends on this one: B stores a phone
number on the account, and the notice that covers it must exist first.

## Why

The planner takes full payment for made-to-order goods and shows the customer
no terms, no refund policy and no seller address before they pay.

- **Consumer Protection (Electronic Trade Transactions) Regulations 2024**
  (in force 25 December 2024, replacing the 2012 regulations) — an online
  seller must disclose: name, website, email and phone, physical address, a
  description of the goods, the full price including taxes and shipping,
  payment methods, terms and conditions, and the estimated delivery time —
  **in Bahasa Malaysia**, other languages as supplements. The seller must
  also let a buyer correct an order, acknowledge an order at once, bear
  re-delivery of defective goods, and keep transaction records three years.
  Not complying is an offence under the Consumer Protection Act 1999.
- **Consumer Protection Act 1999** — statutory guarantees (acceptable
  quality, matching description) cannot be contracted out of, so the terms
  say outright that nothing in them limits those rights.
- **PDPA s.7 (Notice and Choice)** — the notice must also say where the data
  comes from, and whether giving it is obligatory and what follows if it is
  withheld.
- **PDPA 2010, as amended 2024** (fully in force since 1 June 2025) — the
  current privacy notice covers analytics and WhatsApp only. It does not
  mention account data, phone, address, orders, the payment processor or the
  couriers who receive a name, phone and address.
- **GDPR** — investigated, not applicable. Using PostHog's EU-hosted cloud
  does not put a Malaysian controller under GDPR; it applies only to a company
  offering goods to, or monitoring, people in the EU. PostHog is itself bound
  as processor, under its DPA. The notice says this in one sentence.

**None of this is legal advice.** Every page ships with the same amber
"draft, pending review by EzCabinet Sdn Bhd" banner the privacy page already
carries. EzCabinet is the seller and the PDPA data controller; their counsel
approves the wording, and the numbers below are starting defaults for them to
change.

## Decisions

| Question | Decision |
| --- | --- |
| Who writes the terms | We draft, marked draft. EzCabinet's counsel edits later. |
| Where the text lives | `lib/copy/{en,ms,zh}.ts`, like the privacy notice. Not MDX (a dependency), not admin-editable (a CMS for three pages). |
| How agreement is recorded | A required checkbox at checkout, refused server-side without it, with the wording's version and the time stored on the order. |
| Refunds in the app | None. The policy tells the customer to contact EzCabinet; there is no refund or cancel button. |
| GDPR | One sentence in the privacy notice. No consent or representative machinery. |

## Pages

| Route | Content |
| --- | --- |
| `/[lang]/terms` | Terms of sale and payment |
| `/[lang]/refunds` | Refund and cancellation policy |
| `/[lang]/privacy` | Existing notice, extended |

All three are a title, a draft banner, an intro and a list of
heading-plus-paragraph sections. `privacy/page.tsx` already renders exactly
that, so its markup moves into one `LegalPage` component
(`src/components/LegalPage.tsx`) that the three routes call with their own
sections. No page is indexed differently from privacy today.

### Terms of sale — draft content

1. **Who you are buying from** — EzCabinet Sdn Bhd, registered address,
   email, phone. Read from the existing footer copy and `WORKSHOP_ADDRESS`;
   the address is still a placeholder (see Open questions in `CLAUDE.md`).
2. **What you are buying** — cabinets made to order from the design you
   submit. The 3D view is illustrative; dimensions are confirmed at re-measure.
3. **Price** — in Ringgit Malaysia, as shown at checkout, delivery fee
   included. The price charged is the one computed by EzCabinet's server at
   the time of order.
4. **Payment** — card through the payment gateway, or bank transfer. An order
   is confirmed when payment is received in full.
5. **Re-measure** — EzCabinet measures the site before production. If the
   design must change, the change is quoted and agreed before production
   starts.
6. **Delivery** — to the address given at checkout; the customer is told when
   it is booked.
7. **Complaints** — email first; unresolved disputes may go to the Tribunal
   for Consumer Claims Malaysia.
8. **Law** — the laws of Malaysia.

### Refund policy — draft content

| Situation | Outcome |
| --- | --- |
| Cancelled before production starts | Full refund |
| Cancelled after production starts | No refund — the goods are made to order |
| Damaged or defective on delivery | Report within **7 days** with photos; repaired or replaced |
| Design changed at re-measure | Re-quoted; the difference is refunded or charged before production |
| How refunds are paid | To the original payment method, within **14 working days** |
| How to ask | Contact EzCabinet with the order reference (`IC-YYYYMMDD-NNN`) |

"Production starts" is a fact the app already records: `Order.productionStage`
is null until an admin starts it (`lib/orders/stage.ts`). The policy is
written to match that line so staff and customer read the same boundary.

7 days and 14 working days are our defaults, not EzCabinet's.

### How each 2024 duty is met

| Duty | Met by |
| --- | --- |
| Disclosures in Bahasa Malaysia | `/ms/terms`, `/ms/refunds`, `/ms/privacy`, and the Malay checkout |
| Seller name, address, email, phone | Terms section 1 and the line above the pay button |
| Full price incl. taxes and shipping | Existing checkout breakdown; terms say so |
| Estimated delivery time | Terms, Delivery — **4 to 6 weeks from re-measure**, our default |
| Let the buyer correct an order | Terms, "Correcting your order": free edits before paying, by email until production starts |
| Acknowledge the order at once | Existing: the order page the customer lands on, and the WhatsApp message when opted in |
| Bear re-delivery of defective goods | Refund policy, damaged or defective |
| Keep records three years | Orders are never deleted (`Order.userId` is `Restrict`) |
| Statutory rights preserved | Terms, "Your rights as a consumer" |

### Privacy notice — additions

New sections, added to the existing ones:

- **Your account** — signing in with Google gives us your name, email and
  profile photo. (Piece B adds: the phone number and address you save.)
- **Your orders** — name, phone, email, delivery address, the design and the
  price, kept as a record of the sale.
- **Who else receives it** — the payment processor (card details go to them,
  never to us), the courier that delivers the order (name, phone, address),
  Meta for WhatsApp updates (existing section), Google for sign-in, and Mux,
  which streams the tutorial videos and so sees a viewer's IP address.
  Vendors' own terms are not reproduced: they bind EzCabinet, not the
  customer.
- **How long we keep it** — order records for as long as tax and accounting
  law requires; an account with no orders until you ask us to delete it.
- **What you must give us** — the data comes from the customer or from
  Google; name, phone and address are obligatory to order (no delivery
  without them); email and WhatsApp updates are optional.
- **Your rights** — access, correction, a copy of your data in a portable
  form, withdrawing consent, and asking us to stop direct marketing.
- **Other laws** — one sentence: analytics is processed in the EU by PostHog
  under its data processing agreement; EzCabinet sells in Malaysia and this
  notice is given under Malaysian law.

## Acceptance at checkout

`QuoteScreen.tsx` already carries one required condition
(`remeasureAccepted`) and one optional consent (`whatsappOptIn`). Terms follow
the first pattern exactly.

- **Checkbox**, unticked by default: "I agree to the Terms of sale and the
  Refund policy" — both linked, opening in a new tab so the design and the
  typed form are not lost. Pay / Place order stays disabled until ticked.
- **Server** — `orderInputSchema` in `POST /api/orders` gains
  `termsAccepted: z.literal(true)`. An order without it is a 400, like a
  missing `remeasureAccepted`. The client checkbox is a convenience; this is
  the record.
- **Stored on the order** — `Order.termsVersion String?` and
  `Order.termsAcceptedAt DateTime?`. Nullable because existing orders
  predate the terms.
- **Version** — `TERMS_VERSION` in `src/lib/orders/terms.ts`, a date string
  (`"2026-10-07"`), written by the server, never read from the request. It is
  bumped by hand whenever the terms or refund wording changes, so an order
  can always be matched to the text its customer agreed to. The file's
  comment says so.
- **Seller disclosure** — business name, address and contact shown on the
  checkout step itself, above the button: the regulations want it before
  purchase, not one click away.

Migration: two nullable columns on `Order`, hand-written and checked with
`prisma migrate diff --from-config-datasource --to-schema` (Known issue 12).

## Links

- Landing footer: Terms, Refund policy, Privacy notice.
- Checkout: the checkbox links, plus the seller block.
- Sign-in page: "By continuing you agree to the Privacy notice", linked.
- `proxy.ts` needs nothing: the new routes are locale-prefixed public pages.

## Translations

English is the source. Malay and Chinese are drafted by us and added to
`docs/translation-review.md` for a native check before production. PDPA
expects the notice in Malay and English; both exist.

## Testing

- `orders/__tests__/route.test.ts` — refuses an order without
  `termsAccepted`, and with `termsAccepted: false`. That the stamp is stored
  is checked by hand in the plan (the route has no success-path test to
  extend, and building one means mocking the catalogue, pricing and outbox
  for two assignments).
- `copy/__tests__/dictionary.test.ts` — existing parity check covers the new
  keys in `ms` and `zh`.
- No test for page markup: `LegalPage` is presentational.

## Not in this spec

- An in-app refund or cancellation flow.
- Appointing a Data Protection Officer — depends on EzCabinet's data volumes.
- A breach-notification procedure — an operations document, not app code.
- Changes to the analytics consent banner.
- Phone number at sign-up, Profile, checkout prefill — piece B.

## For EzCabinet to answer

- Registered business address and SSM number for the seller block.
- Real delivery lead time, and whether prices carry SST.
- Real refund windows and whether any deposit is non-refundable.
- Whether installation is offered, and on what terms.
- Counsel's sign-off on all three pages, and on the PostHog DPA.
