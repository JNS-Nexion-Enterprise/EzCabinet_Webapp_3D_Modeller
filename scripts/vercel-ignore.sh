#!/usr/bin/env bash
# Vercel's Ignored Build Step: exit 1 builds, exit 0 skips.
#
# Two Vercel projects build from this one repository:
#
#   ezcabinet_3d_webapp  previews of every branch; production is skipped,
#                        because production does not ship from git.
#   planner-demo         production from feature/demo-tenant only; no
#                        previews. It has TENANT set.
#
# Production is matched on the branch as well as TENANT, so the demo still
# builds if Vercel does not expose project variables to this step.
#
# Vercel runs the copy of this rule in the commit being built. Until this
# branch is merged, a push to another branch reaches the demo project with
# that branch's older rule, and builds a preview there. It fails for want of
# a DATABASE_URL, as long as the demo's variables are set for production only.

if [ "$VERCEL_ENV" = "production" ]; then
	if [ "$VERCEL_GIT_COMMIT_REF" = "feature/demo-tenant" ] || [ -n "$TENANT" ]; then
		exit 1
	fi
	exit 0
fi

# A preview: EzCabinet's project builds it, the demo project does not.
if [ -n "$TENANT" ]; then
	exit 0
fi
exit 1
