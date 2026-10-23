import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/route";
import { geocodeAddress, geocoderFault } from "@/lib/logistics/geocode";

export const runtime = "nodejs";

const bodySchema = z.object({ address: z.string().trim().min(1).max(500) });

/**
 * Find the pin, postcode, city and state for a typed workshop address, so the
 * company form can fill them in. Read-only, hence no step-up. `fault` is the
 * deployment's half of a miss (no key, key refused), read after the lookup
 * because the lookup is what notes the geocoder's health.
 */
export const POST = withAuth("company:manage", async (request) => {
	const parsed = bodySchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return NextResponse.json({ error: "invalid_body" }, { status: 400 });
	}
	const found = await geocodeAddress(parsed.data.address);
	return NextResponse.json({ found, fault: found ? null : geocoderFault() });
});
