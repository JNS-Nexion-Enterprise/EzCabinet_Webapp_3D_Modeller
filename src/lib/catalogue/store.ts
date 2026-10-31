import "server-only";
import { unstable_cache } from "next/cache";
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
import { prisma } from "./db";

/**
 * The published-catalogue read path — the only place server code should
 * reach for catalogue data going forward. Pure engine functions
 * (`lib/planner`) never import this; they take a catalogue as a parameter,
 * and this is what supplies it at the request boundary.
 *
 * Cached and tag-revalidated so a published catalogue is read from Postgres
 * roughly once per revalidation window, not once per request — the DB-op
 * cost CLAUDE.md's original "catalogue in the repo" rule was protecting
 * against stays protected even though the catalogue moved.
 */

export const CATALOGUE_CACHE_TAG = "catalogue";

async function fetchPublishedPlannerCatalogue() {
	const row = await prisma.catalogueVersion.findFirstOrThrow({
		where: { product: "PLANNER", status: "PUBLISHED" },
		orderBy: { version: "desc" },
		select: { id: true, version: true, data: true },
	});
	return {
		id: row.id,
		version: row.version,
		data: plannerCatalogueSchema.parse(row.data),
	};
}

/**
 * The same read, straight off Postgres.
 *
 * For an admin screen that just wrote a catalogue version and reloaded:
 * `revalidateTag` purges the cache below, but not necessarily before the
 * reload's own render, and an editor showing its own change as not-yet-made
 * is worse than one extra query on a three-person admin surface.
 */
export const readPublishedPlannerCatalogue = fetchPublishedPlannerCatalogue;

/**
 * Stays `unstable_cache` despite Next's note that `use cache` replaces it: that
 * needs Cache Components, and on serverless a plain `use cache` entry rarely
 * outlives its request, so most reads would reach Postgres.
 */
export const getPublishedPlannerCatalogue = unstable_cache(
	fetchPublishedPlannerCatalogue,
	["catalogue-planner"],
	{ tags: [CATALOGUE_CACHE_TAG] },
);
