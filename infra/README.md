# Infrastructure

One Vercel project per company, described once. Adding a company is a file in
`../tenants` plus its secrets, then `tofu apply`.

Tooling is [OpenTofu](https://opentofu.org) with Vercel's own provider. Both
are open source and free. `brew install opentofu`.

## What it creates per company

| | |
| --- | --- |
| Vercel project `planner-<slug>` | Not linked to git. The release job deploys it. |
| Blob store `planner-<slug>` | Private, `sin1`, connected to the project. |
| Env vars, production only | Config from the tenant file, secrets from `secrets.auto.tfvars`, and five generated here (`BETTER_AUTH_SECRET`, `CRON_SECRET`, `FLAGS_SECRET`, `EASYPARCEL_WEBHOOK_TOKEN`, `WHATSAPP_VERIFY_TOKEN`). |
| The domain, and its mail DNS records | |
| Firewall rule on the sign-in code route | 90 an hour per address. |

Plus one 5xx alert covering every company's project.

## What it does not create

- **The database.** No provider for Prisma Postgres is published. Create it by
  hand and put its URL in the company's `DATABASE_URL`.
- **The domain itself.** Buying one costs money, so a person does it. Its
  nameservers must point at Vercel before `apply`.
- **Accounts that need a person to pass verification:** the payment gateway,
  WhatsApp Business, carriers, the Google sign-in client. Their keys go in
  `secrets.auto.tfvars`; their webhooks are registered by hand.
- **The `payment-gateway` flag.** Set per project in the Vercel dashboard.
- **The existing `ezcabinet_3d_webapp` project.** It stays as the git-linked
  project that builds pull-request previews, and is not managed here.

## First-time setup

1. Create a private bucket for the state and an access key scoped to it.
   Copy `backend.hcl.example` to `backend.hcl` and fill it in.
2. Copy `secrets.auto.tfvars.example` to `secrets.auto.tfvars` and fill it in.
   Choose a long `state_passphrase` and store it in the password manager. The
   state is encrypted with it before upload; without it the state cannot be
   read.
3. Export `VERCEL_API_TOKEN` (a token for the JNS team), `AWS_ACCESS_KEY_ID`
   and `AWS_SECRET_ACCESS_KEY`.
4. `tofu init -backend-config=backend.hcl`

## Adding a company

1. Add `../tenants/<slug>.json`. Copy `demo.json`.
2. Add its block to `secrets` in `secrets.auto.tfvars`.
3. `tofu plan`, read it, `tofu apply`.
4. `tofu output projects` gives the project id the release job deploys to.
   `tofu output -json webhook_tokens` gives the tokens to paste when
   registering the EasyParcel callback and the WhatsApp webhook.

New companies start with `"signInRateLimitAction": "log"`, which counts and
blocks nothing. After a real sign-in code has been requested on the live site
and seen passing, change it to `"deny"` and apply.

## Changing a setting

Change it here, never in the Vercel dashboard. `tofu plan` with no pending
edits should always say "No changes"; anything else is a setting somebody
changed by hand.

## Removing a company

Export its data first (the offboarding runbook). Then delete its tenant file
and its `secrets` block and apply. The Blob store and everything in it are
destroyed with the project.

## Not yet tested against Vercel

The config passes `tofu validate` against the provider's schema, and a
dry-run plan resolves every tenant and refuses a misspelt secret name or a
missing `DATABASE_URL`. No resource has been created from it yet. The first
`tofu apply` for `demo` is the real test; read its plan closely, the firewall
rule and the alert filter (`statusGroup:5xx`) most of all.
