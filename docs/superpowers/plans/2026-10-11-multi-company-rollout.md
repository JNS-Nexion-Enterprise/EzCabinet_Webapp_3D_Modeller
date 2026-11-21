# Selling the planner to more companies: what is done and what is not

Status as of 2026-10-11. The goal is 5 to 20 cabinet companies on this one
codebase, maintained by one person.

## Decisions already made

- **One repo, one deployment per company.** Each company gets its own Vercel
  project, database, Blob store and domain. No tenant column in the database.
- **One product, config only.** Every company runs the same commit. No forks.
- **All projects live in the JNS Vercel team.**
- **A dependency patch deploys to the demo site by itself; client sites wait
  for one manual tap.**
- **Clients are assumed to have no IT staff.** JNS registers and runs a domain
  for each company.
- **Two product modes, quote-only and checkout,** set per company.
- **Infrastructure is described with OpenTofu** and Vercel's provider. Both
  are open source and free.

Assumed, not confirmed: the next clients are Malaysian (RM, `+60`, en/ms/zh,
FPX), sell the same four rooms and use the same six production stages.

## Done

- **`infra/`**: OpenTofu config that turns each file in `tenants/` into a
  Vercel project, a private Blob store, production env vars, a domain with
  its mail DNS records, and the firewall rule on the sign-in code route. One
  5xx alert covers every project. Setup steps are in `infra/README.md`.
- **`tenants/demo.json`**: the first tenant file.
- **CI** format-checks and validates `infra/` without secrets.
- **Merged into `feature/development`**, not pushed.

The config passes `tofu validate` and a dry-run plan. **Nothing has been
created on Vercel from it.**

## Not done

### To finish the infrastructure work

- [ ] Create a private bucket for the state file (Cloudflare R2 free tier
      works) and an access key for it. Fill in `infra/backend.hcl`.
- [ ] Create a Vercel API token for the JNS team.
- [ ] Choose the state passphrase and store it in a password manager.
- [ ] Create a database for the demo site. No OpenTofu provider exists for
      Prisma Postgres, so this stays a manual step for every company.
- [ ] Get the demo site's Stripe test keys and a Google sign-in client. Fill
      in `infra/secrets.auto.tfvars`.
- [ ] Confirm the demo domain. `planner-demo.jnsnexion.com.my` is a guess.
- [ ] Run the first `tofu apply` for demo and read its plan closely. The
      firewall rule and the alert filter (`statusGroup:5xx`) are untested.
- [ ] Add `tenants/ezcabinet.json` once its domain is chosen.
- [ ] A weekly `tofu plan` that reports settings changed by hand in the
      dashboard.
- [ ] Set the `payment-gateway` flag per project. It is not in the config.
- [ ] Push `feature/development`. Remove the finished worktree
      `.claude/worktrees/iac` and its branch `worktree-iac`.

### Step zero: ownership (before any second sale)

- [ ] A written agreement with EzCabinet, reviewed by a lawyer: JNS owns the
      software and may license it to others; EzCabinet owns its designs,
      prices, photos and customer data. Nothing written covers this today.
- [ ] Move EzCabinet's own material out of the shared code. The next clients
      are its competitors.
  - `public/hero-frames/` and `public/finishes/rhone-oak.jpg`
  - `FINISHES`, the kitchen dimensions in `CONSTRUCTION`,
    `WALL_CABINET_FLOOR_MM` and `deliveryFlatRm: 85` in
    `src/lib/planner/catalogue.ts`
- [ ] A standard contract for new clients: licence not ownership, what the
      fee covers, what happens to their data when they leave.

### Phase 1: make one release safe and automatic

- [ ] CI runs `pnpm build` and `pnpm audit --prod --audit-level high`.
- [ ] `.github/dependabot.yml`, weekly, with linked packages grouped
      (`better-auth`, `prisma`, `three`, `next` with `react`, `stripe`).
- [ ] Auto-merge for patch updates once CI is green. Needs branch protection
      on `main` requiring the CI check.
- [ ] `src/lib/env.ts`: one zod schema for every env name, so a missing one
      fails the build. Add the four names missing from `.env.example`.
- [ ] `GET /api/health`: commit sha, tenant, database reachable, last
      migration.
- [ ] Pin Node 24 in `package.json` and `.nvmrc`.

### Phase 2: take the company out of the code

The app does not read `TENANT` yet. Until this phase is done, a project
created by `infra/` runs as EzCabinet.

**2026-10-14: a first slice exists on branch `feature/demo-tenant`**, built
for a prospect demo and not merged. It adds `src/lib/tenant.ts`, the
`{brand}` placeholder in the dictionaries, the customer-visible literals and
a hero switch. It covers part of the first, second, third and sixth items
below, and its guard test covers the dictionaries only. Three English-only
mails, the accent colour and `mode` are untouched. See
`docs/ops/demo-site-runbook.md`.

- [ ] `src/lib/tenant.ts` and a zod `tenantSchema` that loads
      `tenants/<slug>.json`. Extend the tenant file with: legal name, contact
      email, order reference prefix, workshop details, bank details, accent
      colour, passkey and 2FA names, the Meta verification token, and the
      legal parameters.
- [x] `WORKSHOP_*` and `BANK_TRANSFER` left the tenant file for `/admin/company`
      (docs/superpowers/plans/2026-10-21-company-details.md); the tenant file
      seeds them for a new company's first run.
- [ ] Replace the literal brand name in about 30 source files and the four
      copy dictionaries with the `{brand}` placeholder.
- [ ] A guard test that fails on `ezcabinet` under `src/` outside `tenants/`.
- [ ] Replace the accent colour `#1f5138`, inline in about 75 files, with one
      CSS variable.
- [ ] Move the hero frames and favicon under `public/tenants/<slug>/`.
- [ ] Add `mode: "checkout" | "quote"` to the tenant file.

### Phase 3: release to every company with one action

- [ ] Auto-tag a patch release when a Dependabot PR merges.
- [ ] `release-demo.yml`: deploy demo on any tag, then run a browser test
      (sign in, add a cabinet, place a test-mode order).
- [ ] `release-clients.yml`: started by hand, refuses a tag demo did not
      pass, deploys EzCabinet first and then the rest four at a time. Each
      deploy is followed by a health check and a smoke test, with rollback
      on failure.
- [ ] `scripts/smoke.mjs`.
- [ ] Write the migration rule into `CLAUDE.md`: every migration is additive,
      because a rollback puts old code on a migrated database.
- [ ] A fleet check every 15 minutes, run as a Vercel cron on the demo
      project, posting to Slack.
- [ ] `docs/ops/new-client-runbook.md`.
- [ ] Register a domain for each company. Move EzCabinet to its own before
      any customer enrols a passkey.

### Phase 4: running the fleet

- [ ] Backups: record what the database provider keeps, write
      `docs/ops/restore-runbook.md`, rehearse a restore on demo. Copy each
      company's design files to a second bucket weekly.
- [ ] `docs/ops/secrets.md`: where secrets live and how to rotate them. One
      Resend key per company.
- [ ] One JNS superadmin per company for support.
- [ ] Error tracking tagged with the tenant.
- [ ] A Vercel spend limit and a record of usage per company.
- [ ] An offboarding runbook: export, domain transfer, destroy, delete.
- [ ] A sealed document saying how to run a release if the maintainer is
      unavailable.

### Separate project

- [ ] The quote-only flow: the design ends at "send to sales" with no
      payment, delivery or passkey step. `CLAUDE.md` lists it as designed but
      not built. It needs its own spec.

## Open questions

- **How does production ship today?** `vercel.json` skips production git
  builds, and the current project `ezcabinet_3d_webapp` has no production env
  vars. Production appears not to be live. Confirm.
- **The `IC-` order prefix.** It comes from "Infinite Cabinet", not EzCabinet.
  The team also owns `infinitecabinet.my` and a project named
  `infinite_cabinet_production_app`. Decide the real prefix before it becomes
  config; changing it later changes order numbers customers already hold.
- **PostHog: one project or one per company.** Each company is the data
  controller for its own customers. Ask counsel. Until answered, plan for one
  project per company.
- **Legal pages.** One template with per-company parameters is assumed. A
  company whose counsel wants different wording needs its own override and
  its own `TERMS_VERSION`.
- **Data processing agreements.** Owning every account makes JNS the
  processor for every company. Each one needs a signed agreement.
