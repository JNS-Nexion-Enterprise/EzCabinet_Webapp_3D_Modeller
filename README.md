# Cabinet planner

Lead-generation cabinet planner for **EzCabinet Sdn Bhd**, built by JNS Nexion Enterprise.

A customer picks a room, arranges cabinets along its walls in 3D, sees a price, and places an order. Reference product is IKEA's PAX planner.

This is a marketing surface, not a manufacturing tool. A human validates every design before it becomes a real order.

See [CLAUDE.md](./CLAUDE.md) for status, architecture, conventions, and the phase plan. This file only covers getting it running.

> **Prices are not confirmed.** The catalogue and pricing spec with EzCabinet
> isn't finished, so no figure here is a valid quote yet. Cabinets and their
> prices are rows an admin enters at `/admin/cabinet-designs`;
> `src/lib/planner/catalogue.ts` seeds only settings, and its rates are
> placeholders.
>
> Kitchen _dimensions_ come from a real design export. Every other room's
> dimensions are invented.

## Getting started

Requires Node 24 (`.nvmrc`), pnpm, and Docker for the local database. `.env.example` lists the environment.

```bash
pnpm install
pnpm db:up           # local Postgres
pnpm db:migrate      # apply migrations
pnpm db:seed         # publish catalogue v1: settings, no cabinets
pnpm seed:superadmin # first staff account, from SUPERADMIN_EMAIL and _PASSWORD
pnpm dev
```

Routes:
- `/en` (also `/ms`, `/zh`) — landing page.
- `/en/planner` — the planner. `?room=kitchen|living|bedroom|foyer`.
- `/en/orders`, `/en/order/[token]`, `/en/track/[token]` — a customer's orders and delivery tracking.
- `/en/tutorials` — DIY videos.
- `/admin/cabinet-designs`, `/admin/orders`, `/admin/logistics`, `/admin/site-content`,
  `/admin/tutorials`, `/admin/users`, `/admin/company`, `/admin/security` — the
  admin surface. Staff sign in at `/admin/login`, or set `AUTH_ENABLED=false`
  for local work. There is no `/admin` index.

## Deliveries

`/admin/logistics` books a pickup with a logistics partner and follows it to
site. A job is typed in by an admin, or pre-filled from a paid order by
**Create delivery**.

Only the partners whose credentials are present appear in the comparison. Out of
the box that is `manual` — the company's own lorry, booked by phone and moved
along its timeline by hand — which is what keeps the screen usable before any
carrier integration exists.

| Variable                                                                       | For                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CRON_SECRET`                                                                  | The tracking sweep at `/api/cron/track-deliveries`. Vercel sends it as `Authorization: Bearer`; without it the route refuses to run.                                                                                                                                                                                                                                                      |
| `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET`                                      | Lalamove — vehicle class, the one that moves cabinets. A `pk_test…` key selects the sandbox host, anything else production.                                                                                                                                                                                                                                                               |
| `GOOGLE_GEOCODING_API_KEY`                                                     | Turns a delivery's address into the pin Lalamove prices against. Without it no vehicle partner can quote.                                                                                                                                                                                                                                                                                 |
| `EASYPARCEL_CLIENT_ID`, `EASYPARCEL_CLIENT_SECRET`                             | EasyParcel — parcels. OAuth app credentials; an admin links an account at `/admin/logistics`.                                                                                                                                                                                                                                                                                             |
| `GDEX_PRIMARY_API_KEY`                                                         | GDEX — the Azure APIM subscription key from the developer portal, sent as the `subscription-key` header. **Not** `Ocp-Apim-Subscription-Key`: GDEX renamed APIM's default, so the standard header is ignored and the gateway reports a missing key while a valid one is being sent. `GDEX_SECONDARY_API_SECRET` is that key's rotation spare, not a signing secret, and nothing reads it. |
| `GDEX_USER_TOKEN`                                                              | GDEX — the myGDEX account's Integration Token, sent as `User-Token`. From the myGDEX **web application** (User Profile → Integration Token), a different system from the developer portal.                                                                                                                                                                                                |
| `FEDEX_API_URL`, `FEDEX_API_KEY`, `FEDEX_API_PASSWORD`, `FEDEX_ACCOUNT_NUMBER` | FedEx — parcels.                                                                                                                                                                                                                                                                                                                                                                          |
| `CITYLINK_API_KEY`                                                             | City-Link — parcels                                                                                                                                                                                                                                                                                                                                                                       |
| `APP_URL`                                                                      | This deployment's own origin; EasyParcel's login returns here. Required in production.                                                                                                                                                                                                                                                                                                    |
| `EASYPARCEL_WEBHOOK_TOKEN`                                                     | The secret `?token=` on EasyParcel's callback URL, because their webhooks are unsigned.                                                                                                                                                                                                                                                                                                   |

Lalamove, EasyParcel, GDEX and FedEx are implemented; City-Link is still a stub, and
it is a single file plus its statuses in `lib/logistics/status.ts` — nothing
else changes when one is written. A partner with no credentials is not hidden:
it appears in the comparison as a row saying so, because "switched off" and
"refused this job" must not be the same blank screen.

**GDEX talks to the sandbox only.** The account holds no active subscription to
the live `myGDEX` product, so the base URL is a constant rather than a flag —
see `adapters/gdex.ts`. `pnpm gdex:ping` is the one thing that checks GDEX's
real API shape; like `easyparcel:ping` it needs credentials and is deliberately
kept out of PR CI. Its own `GDEX_LIVE=1` switches that script, not the app.

A delivery is geocoded when it is **saved**, not when it is quoted, so an
address Google cannot place shows as a warning on the job rather than as a
missing row in the partner comparison. Google returning `APPROXIMATE` — it found
the town and nothing finer — counts as a failure, because a lorry sent to the
town centre is a wrong delivery. An admin can paste a `3.1509, 101.5931` pin to
override the result.

Lalamove's webhook goes to `POST /api/webhooks/lalamove`, set in the Partner
Portal or via `PATCH /v3/webhook`. It is authenticated by the `apiKey` in the
payload matching `LALAMOVE_API_KEY`, because Lalamove does not sign callbacks.

Status reaches the app two ways. A partner that supports callbacks posts to
`/api/webhooks/<carrier>`, which sits outside `/api/admin` on purpose (a carrier
has no session) and so authenticates the caller itself. Everything else is
covered by the cron sweep, which polls jobs that are booked but not yet
finished. Both paths write through one function, so the row means the same thing
either way.

## Scripts

| Command                                                                             | Does                                                      |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `pnpm dev`                                                                          | Dev server                                                |
| `pnpm build`                                                                        | Production build                                          |
| `pnpm test`                                                                         | Vitest, against fixtures in `__tests__/`; no UI tests yet |
| `pnpm typecheck`                                                                    | `next typegen` and `tsc --noEmit`                         |
| `pnpm lint`                                                                         | Biome check (lint + format)                               |
| `pnpm db:up` / `db:down`                                                            | Local Postgres via docker compose                         |
| `pnpm db:migrate`                                                                   | `prisma migrate dev`                                      |
| `pnpm db:seed`                                                                      | Seed catalogue v1: settings, no cabinets                  |
| `pnpm db:studio`                                                                    | Prisma Studio                                             |
| `pnpm seed:superadmin`                                                              | Create the first staff account                            |
| `pnpm auth:reset-2fa <email>` / `auth:reset-passkey <email>`                        | Reset a locked-out account                                |
| `pnpm email:preview <dir>`                                                          | Write every mail in every language to a folder            |
| `pnpm lalamove:ping`, `easyparcel:ping`, `fedex:ping`, `gdex:ping`, `whatsapp:ping` | Call a partner's real API; needs credentials              |
| `pnpm generate:grain`                                                               | Regenerates `public/grain.png` and `public/floor.png`     |

`generate:grain` is a one-off — the PNGs are committed. Only rerun it if you change the generator.
