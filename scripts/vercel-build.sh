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
	# A cached install skips postinstall, so the client the seed imports is
	# not there yet; `pnpm build` generates it too late.
	pnpm exec prisma generate
	pnpm exec tsx prisma/seed.ts

	# EzCabinet's own images are served from `public` to anyone who knows the
	# path, so hiding them on the page is not enough: a company whose tenant
	# file turns them off is built without them. Its own favicon, if it has
	# one, replaces EzCabinet's.
	flag() { node -p "require('./tenants/${TENANT}.json').$1 !== false"; }
	if [ "$(flag heroFrames)" = false ]; then rm -rf public/hero-frames; fi
	if [ "$(flag finishPhotos)" = false ]; then rm -rf public/finishes; fi
	if [ -f "tenants/${TENANT}.ico" ]; then
		cp "tenants/${TENANT}.ico" src/app/favicon.ico
	fi
fi

pnpm build
