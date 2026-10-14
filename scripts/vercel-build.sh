#!/usr/bin/env bash
# Vercel's build command, for every project that builds from this repository.
set -euo pipefail

pnpm exec prisma migrate deploy

# A new company's first build meets an empty database, and the landing page
# reads the published catalogue while it prerenders, so the build would fail.
# The seed only creates what is missing (it never overwrites), so it is safe on
# every build. EzCabinet's project has no TENANT and is seeded by hand, as
# before.
if [ -n "${TENANT:-}" ]; then
	pnpm exec tsx prisma/seed.ts
fi

pnpm build
