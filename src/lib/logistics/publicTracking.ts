import { tenant } from "@/lib/tenant";
import type { DeliveryItem, DeliveryStatusName } from "./types";
import { deliveryItemSchema } from "./types";

/**
 * What a customer is allowed to see of a delivery, derived.
 *
 * Pure and here rather than in the page for the usual reason, plus one specific
 * to this surface: everything below decides what leaves the building. A
 * delivery row carries an admin's notes, a carrier's raw payload and the name
 * of whoever spent the money, and the page rendering it is reachable by anyone
 * holding a link.
 */

/**
 * Whether a carrier is holding this job yet.
 *
 * The tracker is the carrier's story — picked up, in transit, delivered — and
 * before anyone books one there is nothing for it to say. `DRAFT` and `QUOTED`
 * mean the cabinets are still being built and the partner comparison has not
 * been acted on, so the page shows what we know instead of five grey dots that
 * read as a stalled delivery.
 */
export const shipmentBooked = (status: DeliveryStatusName): boolean =>
	status !== "DRAFT" && status !== "QUOTED";

/**
 * Which of the three things the page can be saying.
 *
 * The design covers the happy path — a green tick over "Order placed" — and a
 * cancelled job rendered through it tells a customer their delivery is being
 * prepared when it is not.
 */
export type TrackingTone = "placed" | "delivered" | "stopped";

export function trackingTone(status: DeliveryStatusName): TrackingTone {
	if (status === "DELIVERED") return "delivered";
	if (status === "CANCELLED" || status === "FAILED") return "stopped";
	return "placed";
}

/** The job number as the customer reads it back over the phone. */
export const orderRef = (number: number): string =>
	`${tenant.orderPrefix}-${String(number).padStart(5, "0")}`;

export type PublicEvent = { at: string; status: DeliveryStatusName };

/**
 * The timeline, cut down to transitions.
 *
 * Events without a status are quote fan-outs, edits and failed polls — internal
 * bookkeeping written in admin English ("Delivery created — 3-tonne lorry").
 * Only transitions are shown, and only their *status*: the stored `message` is
 * a carrier's own wording, so the page renders the translated label instead and
 * the reader's locale survives.
 *
 * `DRAFT` and `QUOTED` transitions go too — "we asked five couriers for a
 * price" is our procurement, not the customer's delivery.
 */
export function customerEvents(
	events: readonly { at: string; status: DeliveryStatusName | null }[],
): PublicEvent[] {
	return events
		.filter(
			(event): event is PublicEvent =>
				event.status !== null && shipmentBooked(event.status),
		)
		.map(({ at, status }) => ({ at, status }));
}

export type KeyedItem = { item: DeliveryItem; key: string };

/**
 * The order's line items, ready to render.
 *
 * `Delivery.items` is Json, so a row written before a schema change can hold a
 * line this build no longer understands. Parsed one at a time and the
 * unreadable ones dropped: a half-rendered line is worse than a missing one,
 * and one bad line must not take the rest of the order down with it.
 *
 * The key is the line's own content plus which occurrence of it this is. A job
 * sheet's items are a positional list with no id, and two identical rows are
 * two real lines — so neither the array index (which React rightly objects to)
 * nor the content alone (which collides) will do.
 */
export function readItems(raw: unknown): KeyedItem[] {
	const rows = Array.isArray(raw) ? raw : [];
	const seen = new Map<string, number>();
	return rows
		.map((row) => deliveryItemSchema.safeParse(row))
		.flatMap((parsed) => {
			if (!parsed.success) return [];
			const item = parsed.data;
			const line = `${item.label}·${item.qty}·${item.widthMm}·${item.heightMm}·${item.depthMm}`;
			const nth = (seen.get(line) ?? 0) + 1;
			seen.set(line, nth);
			return [{ item, key: `${line}#${nth}` }];
		});
}
