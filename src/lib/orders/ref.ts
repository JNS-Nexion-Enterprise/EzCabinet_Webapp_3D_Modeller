import { seedCompany } from "@/lib/company/details";

/**
 * The order number as a customer reads it: `IC-20260826-014`, the format in the
 * client's own Order Confirmation design.
 *
 * The date is the day it was placed in Malaysia — a function on Vercel runs in
 * UTC, and an order placed at 1am in Kuala Lumpur belongs to that day. Distinct
 * from a delivery's `IC-00042`, so the two are never read as the same thing.
 *
 * The prefix is the one stored on the order when it was placed, so changing the
 * company's prefix never renames a past order. Null is an order made before refs
 * were stored: it was made under the seed prefix, and reads as that.
 */
const DAY = new Intl.DateTimeFormat("en-CA", {
	timeZone: "Asia/Kuala_Lumpur",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

export const orderRef = (order: {
	refPrefix: string | null;
	number: number;
	createdAt: Date | string;
}): string =>
	`${order.refPrefix ?? seedCompany().orderPrefix}-${DAY.format(new Date(order.createdAt)).replaceAll("-", "")}-${String(order.number).padStart(3, "0")}`;
