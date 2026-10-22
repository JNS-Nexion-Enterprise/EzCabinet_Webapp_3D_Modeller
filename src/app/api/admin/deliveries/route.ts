import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";
import { getCompany, isFormerWorkshop } from "@/lib/company/store";
import { workshopPickup } from "@/lib/logistics/carriers";
import { pinFor } from "@/lib/logistics/coords";
import {
	refreshGeocoderHealth,
	resolveCoordinates,
} from "@/lib/logistics/geocode";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import { trace } from "@/lib/logistics/trace";
import { deliveryInputSchema } from "@/lib/logistics/types";

export const runtime = "nodejs";

/** Every delivery for the admin list, newest job number first. */
export const GET = withAuth("logistics:read", async () => {
	const deliveries = await prisma.delivery.findMany({
		orderBy: { number: "desc" },
	});
	const company = await getCompany();
	return NextResponse.json({
		deliveries,
		workshopAddress: company.address,
		geocodingConfigured: (await refreshGeocoderHealth()).ok,
	});
});

export const POST = withAuth("logistics:book", async (request) => {
	const parsed = deliveryInputSchema.safeParse(await request.json());
	if (!parsed.success) {
		return NextResponse.json(
			{ error: "invalid_body", issues: parsed.error.issues },
			{ status: 400 },
		);
	}

	const {
		items,
		scheduledAt,
		// Pulled out of `rest` on purpose: these are the admin's *override*, not
		// columns to write. Left in the spread they would overwrite the pin
		// `resolveCoordinates` is about to find, with the null they usually are.
		siteLat,
		siteLng,
		pickupLat,
		pickupLng,
		...rest
	} = parsed.data;

	// Only a paid order becomes a delivery — the same gate the order page puts
	// on its button, held here because a URL can be typed.
	if (rest.orderId !== null) {
		const order = await prisma.order.findUnique({
			where: { id: rest.orderId },
			select: { status: true },
		});
		if (order?.status !== "PAID") {
			return NextResponse.json({ error: "order_not_paid" }, { status: 409 });
		}
	}

	// Geocode here rather than at quote time: an address Google cannot place is
	// the admin's typo, and they are far more likely to fix it now than when a
	// partner comparison silently comes back one row short.
	const blank = {
		lat: null,
		lng: null,
		geocodedFor: null,
		postcode: null,
		city: null,
		state: null,
	};
	trace("save", {
		what: "create",
		siteAddress: rest.siteAddress,
		sitePinGiven:
			siteLat !== null && siteLng !== null ? [siteLat, siteLng] : null,
		pickupAddress: rest.pickupAddress,
		pickupPinGiven:
			pickupLat !== null && pickupLng !== null ? [pickupLat, pickupLng] : null,
	});
	// A job from the workshop is written with the company's own pin and place,
	// so there is nothing to geocode and nothing to match at quote time.
	const company = await getCompany();
	const given = pinFor(pickupLat, pickupLng, rest.pickupAddress);
	const workshop = workshopPickup(rest.pickupAddress, given, company);
	// A form opened before a move still offers the old workshop; geocoded, the
	// job would leave from the old building. A typed pin says the admin meant it.
	if (
		!workshop &&
		given === null &&
		(await isFormerWorkshop(rest.pickupAddress, company))
	) {
		return NextResponse.json({ error: "workshop_moved" }, { status: 409 });
	}
	const [site, geocoded] = await Promise.all([
		resolveCoordinates(
			rest.siteAddress,
			blank,
			pinFor(siteLat, siteLng, rest.siteAddress),
		),
		workshop ? null : resolveCoordinates(rest.pickupAddress, blank, given),
	]);
	const pickup = workshop ?? {
		pickupLat: geocoded?.lat ?? null,
		pickupLng: geocoded?.lng ?? null,
		pickupGeocodedFor: geocoded?.geocodedFor ?? null,
		pickupPostcode: geocoded?.postcode ?? null,
		pickupCity: geocoded?.city ?? null,
		pickupState: geocoded?.state ?? null,
	};

	trace("save.resolved", {
		what: "create",
		site: [site.lat, site.lng],
		pickup: [pickup.pickupLat, pickup.pickupLng],
	});

	// The order was paid when this request arrived, but geocoding is a network
	// call and a cancel can land during it. The conditional write re-checks and
	// holds the order's row until the delivery is in, so a cancel that has
	// already committed leaves no delivery behind. A cancel whose own write
	// starts inside this short transaction can still get through; that
	// window is a few milliseconds and is accepted.
	const orderId = rest.orderId;
	const { orderPrefix } = company;
	const delivery = await prisma.$transaction(async (tx) => {
		if (orderId !== null) {
			const { count } = await tx.order.updateMany({
				where: { id: orderId, status: "PAID" },
				data: { updatedAt: new Date() },
			});
			if (count !== 1) return null;
		}
		return tx.delivery.create({
			data: {
				...rest,
				refPrefix: orderPrefix,
				items,
				siteLat: site.lat,
				siteLng: site.lng,
				siteGeocodedFor: site.geocodedFor,
				sitePostcode: site.postcode,
				siteCity: site.city,
				siteState: site.state,
				...pickup,
				fromWorkshop: workshop !== null,
				scheduledAt: scheduledAt === null ? null : new Date(scheduledAt),
				// Derived on write so the carrier payload builders and the list can
				// read them without recomputing, and so a later change to the maths
				// is visible as a migration rather than a silently different quote.
				totalVolumeM3: totalVolumeM3(items),
				totalWeightKg: totalWeightKg(items),
				events: {
					create: {
						source: "ADMIN",
						message: `Delivery created — ${suggestVehicle(items).label}`,
					},
				},
			},
		});
	});
	if (!delivery) {
		return NextResponse.json({ error: "order_not_paid" }, { status: 409 });
	}

	return NextResponse.json({ delivery }, { status: 201 });
});
