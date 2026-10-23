# Demo site runbook

A site for showing the planner to prospects, with no EzCabinet name or data on
it. Written 2026-10-14. The code is on branch `feature/demo-tenant`; nothing
is deployed yet.

## Decisions

- **No second repository.** A copy would still say EzCabinet until the same
  edits were made in it, and every later fix would then be done twice. A
  separate repo is a branch that can no longer be merged back.
- **The demo is the same code with one setting.** `TENANT=demo` makes the app
  "JNS Nexion Enterprise". With no `TENANT` it is EzCabinet, exactly as before.
- **The demo stays off `feature/development` for now.** Development is for
  EzCabinet and must not be disturbed. The demo code lives on its own branch
  until after the demo; merging is a later, separate decision.
- **The demo site shares nothing with EzCabinet** except the repository: its
  own Vercel project, database, Blob store, domain, Stripe sandbox and Google
  sign-in client.
- **Staged.** The first version is safe to show while you drive it. It is not
  yet safe to hand to a prospect to use alone (see "Still EzCabinet").

## Three rules that keep the two apart

1. `TENANT` is set in exactly one place: the `planner-demo` Vercel project.
   Never in `.env.local`, never on the EzCabinet project.
2. The demo deploys from `feature/demo-tenant` only: a push to that branch,
   or `pnpm deploy:demo`. Never a bare `vercel deploy --prod`: this checkout
   is linked to EzCabinet's Vercel project, so that would aim at EzCabinet.
3. Whatever differs for the demo goes in `tenants/demo.json` or the demo
   database. No `if (demo)` in feature code.

## How it works

| Piece                           | Where                                                     | What it does                                                                                                                                                                |
| ------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant values                   | `src/lib/tenant.ts`                                       | EzCabinet's values are the defaults. `TENANT=demo` spreads `tenants/demo.json` over them.                                                                                   |
| Demo values                     | `tenants/demo.json`                                       | Brand, legal name, contact email, workshop address and phone, `heroFrames: false`. `infra/` reads the same file and ignores the keys it does not declare.                   |
| Copy                            | `src/lib/copy/{en,ms,zh}.ts`, `dictionary.ts`             | The dictionaries say `{brand}`. `getDictionary()` fills it once per locale and sets `common.brand` and the contact email from the tenant.                                   |
| Literals outside the dictionary | carriers, payment, email, auth, Stripe, error page, admin | Each reads the tenant: workshop address and phone, bank account name, mail header, sign-in code subject, passkey and 2FA names, Stripe description, admin title and header. |
| Hero                            | `src/app/[lang]/page.tsx`, `src/app/admin/login/page.tsx` | The frames are a render of EzCabinet's own cabinet, so they show only when `tenant.heroFrames`.                                                                             |
| Browser                         | `next.config.ts`                                          | `TENANT` is inlined, because the quote screen is a client component and prints the seller.                                                                                  |
| Builds                          | `vercel.json`, `scripts/vercel-ignore.sh`                 | EzCabinet's project: previews of every branch, production skipped, as before. The demo project: production from `feature/demo-tenant` only, no previews.                    |
| Deploy by hand                  | `scripts/deploy-demo.sh`                                  | Needs `DEMO_VERCEL_PROJECT_ID`; refuses to run without it or with EzCabinet's id. For a redeploy without a push.                                                            |
| Guard                           | `src/lib/copy/__tests__/brand.test.ts`                    | Fails if the name is typed into a dictionary string or the demo tenant file.                                                                                                |

## Status

Done:
- The code above, committed and pushed on `feature/demo-tenant`, no pull
  request.
- 2026-10-14: Vercel project `planner-demo` created in the JNS team
  (`prj_8gUcwfOlkYjKv1iI5uxaHwcHnHwl`), linked to this repository. Its first
  build, from `main`, was skipped, so nothing EzCabinet-branded went live.
- `pnpm tsx scripts/generate-corner-mock.ts <dir>` also writes six plain
  cabinets (three base, two wall, one tall) for a demo catalogue.

Checked:
- Lint, typecheck and the whole test suite pass.
- All 32 mails from `pnpm email:preview` are byte-identical to
  `feature/development`'s.
- The branch's preview on the EzCabinet project shows the same tab titles and
  visible text as the development preview on `/en`, `/zh/terms` and
  `/ms/planner`.
- `pnpm deploy:demo` refuses with no project id and with EzCabinet's id.
- `scripts/vercel-ignore.sh` gives the expected build or skip for both
  projects on `main`, `feature/development` and `feature/demo-tenant`.

Not checked:
- How the app looks as "JNS Nexion Enterprise" against a real database, including
  the landing page without its hero image.
- The demo project's first real production build. The fallback is in step 3
  below.

## Setup

### 1. Accounts and project (by hand)

1. Vercel, JNS team: project `planner-demo`, imported from this repository
   (done). Set its **production branch to `feature/demo-tenant`** (Settings,
   Environments, Production, Branch Tracking). Pushes to any other branch
   then never change the demo.
2. Create a new database and a new Blob store, each connected to
   `planner-demo` only. Connecting the Blob store adds its own variables.
3. Add the domain `planner-demo.jnsnexion.com.my` to the project. Passkeys
   bind to this hostname, so settle it before anyone signs in.
4. Stripe: create a separate sandbox for the demo and a webhook endpoint for
   the demo domain, subscribed to the three `payment_intent.*` events and
   `refund.created`, `refund.updated`, `refund.failed`. Do not reuse
   EzCabinet's test account: in a shared account every endpoint receives
   every event.
5. Google: create a separate sign-in client with the demo domain as its
   origin and redirect.

### 2. Production env vars on `planner-demo`

Set every one for **Production only**, not Preview or Development. Until
this branch is merged, other branches still carry the old build rule, so a
push to `feature/development` builds a preview on the demo project too.
Without a `DATABASE_URL` in Preview that build fails at once, harmlessly,
instead of running development's migrations against the demo database.

| Name                                                | Value                                   |
| --------------------------------------------------- | --------------------------------------- |
| `TENANT`                                            | `demo`                                  |
| `DATABASE_URL`                                      | the demo database                       |
| `BETTER_AUTH_URL`, `APP_URL`                        | `https://planner-demo.jnsnexion.com.my` |
| `BETTER_AUTH_SECRET`, `CRON_SECRET`, `FLAGS_SECRET` | fresh random values, not EzCabinet's    |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`          | the demo's client                       |
| Stripe keys and webhook secret                      | the demo sandbox's                      |
| `PAYMENT_GATEWAY_FALLBACK`                          | `stripe`                                |

Leave out `RESEND_API_KEY` and the WhatsApp token. The demo then sends no
mail and no messages, and sign-in is by Google.

### 3. Deploy

Push `feature/demo-tenant`, or press Redeploy on the project's latest
production deployment. The build applies the migrations to the demo
database.

To deploy from a laptop without a push:

```bash
DEMO_VERCEL_PROJECT_ID=prj_8gUcwfOlkYjKv1iI5uxaHwcHnHwl pnpm deploy:demo
```

If Vercel skips the build, run the same thing prebuilt, with the two names
the script would have set:

```bash
export VERCEL_ORG_ID=team_e99YHIFwOVbqUGDqr0OXOWiY
export VERCEL_PROJECT_ID=prj_8gUcwfOlkYjKv1iI5uxaHwcHnHwl   # planner-demo
vercel pull --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

### 4. Seed and fill

The catalogue settings seed themselves: `scripts/vercel-build.sh` runs
`prisma/seed.ts` on every build of a project with `TENANT` set. It only
creates what is missing, and the landing page cannot be built without it.
1. Create the first admin, with the demo database's URL in the environment.
   Vercel will not hand out a sensitive variable, so copy the URL from the
   database's page in the Storage tab. A value already in the environment
   wins over `.env.local`.

   ```bash
   DATABASE_URL=... SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... pnpm seed:superadmin
   ```
2. Sign in at `/admin/login`, enrol the authenticator and a passkey.
3. `pnpm tsx scripts/generate-corner-mock.ts demo-designs`, then at
   `/admin/cabinet-designs` upload the files, name and price each, file them
   under rooms.
4. In the catalogue settings: rename the six finishes (the seeded names are
   EzCabinet's), remove "Rhone Oak" (its id attaches a supplier's scan), and
   set the base door style's surcharge to RM 0.
5. Publish.

### 5. Before the meeting

- Sign in once as a customer with Google and enrol its passkey.
- Look at the landing page. If the headline looks stranded without the hero
  image, centre it for the no-frames case and redeploy.
- In `en`, `ms` and `zh`: landing page, planner start, studio, quote screen,
  a test-card order and its order page, admin login and header. Search each
  page and its tab title for "ezcabinet". Expect none.
- Confirm the demo's admin shows no orders and no users from anywhere else.
- Run the exact click path once, the day before.

## Still EzCabinet

Brand, emails, order and delivery numbers (`PO-`), favicon (the JNS logo,
`tenants/demo.ico`), courier sender names, the workshop pin (a generic spot in
Subang Jaya's industrial area) and the bundled images now all come from
`tenants/demo.json`. The build deletes `public/hero-frames` and
`public/finishes` when the tenant file turns them off, so they cannot be
fetched by path either. What is left:
- The six seeded finish names and the kitchen dimensions in `CONSTRUCTION`.
  Rename the finishes by hand in step 4.
- The browser keys `ezcabinet.planner.*` (draft, sign-in nudge). Only visible
  in developer tools; renaming them would lose EzCabinet customers' drafts.

The green accent colour is unchanged, on purpose: it is not their name.

## If hosting is not ready in time

The same branch runs on a laptop. Put `TENANT=demo`, the demo database's
`DATABASE_URL` and `AUTH_ENABLED=false` in a `.env.demo` file (ignored by
git), then:

```bash
set -a; source .env.demo; set +a; pnpm dev
```

`AUTH_ENABLED=false` works only off Vercel. It lets a signed-out visitor
order as a seeded demo customer, so no sign-in is shown.

## After the demo

The branch changes about 19 lines in each language file, so it will conflict
with later copy edits on `feature/development`. Within about two weeks,
merge it or drop it.

Before merging, repeat the proof that EzCabinet is unchanged: the mail
comparison, the page-text comparison between the two previews, and lint,
typecheck and tests.

After merging, one thing changes in day-to-day work: new copy writes
`{brand}` where it would have named the company, and `brand.test.ts` fails
if the name is typed literally. Drop the test at merge time if that rule is
not wanted.

The wider plan this is the first slice of:
`docs/superpowers/plans/2026-10-11-multi-company-rollout.md`, Phase 2.
