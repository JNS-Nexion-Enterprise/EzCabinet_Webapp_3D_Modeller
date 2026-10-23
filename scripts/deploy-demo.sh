#!/usr/bin/env bash
# Deploy the demo site, and only the demo site.
#
#   DEMO_VERCEL_PROJECT_ID=prj_... pnpm deploy:demo
#
# This checkout is linked to EzCabinet's Vercel project, so a bare
# `vercel deploy --prod` here would aim at EzCabinet. The two exported names
# below override that link, and the script refuses to run without the demo
# project's id or with EzCabinet's. The demo project is not linked to git: this
# command is the only thing that changes what a prospect sees.
set -euo pipefail

EZCABINET_PROJECT_ID="prj_VSW1GYQfIENGgyovB0FX3OUhNq0h"

if [ -z "${DEMO_VERCEL_PROJECT_ID:-}" ]; then
	echo "Set DEMO_VERCEL_PROJECT_ID to the planner-demo project's id." >&2
	exit 1
fi
if [ "$DEMO_VERCEL_PROJECT_ID" = "$EZCABINET_PROJECT_ID" ]; then
	echo "That is EzCabinet's project id. Refusing to deploy the demo over it." >&2
	exit 1
fi

export VERCEL_ORG_ID="${VERCEL_ORG_ID:-team_e99YHIFwOVbqUGDqr0OXOWiY}"
export VERCEL_PROJECT_ID="$DEMO_VERCEL_PROJECT_ID"

exec vercel deploy --prod "$@"
