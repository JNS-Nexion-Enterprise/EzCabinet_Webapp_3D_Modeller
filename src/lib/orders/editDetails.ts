import { z } from "zod";
import { customerSchema } from "@/lib/orders/customerSchema";

/** What a customer may correct on a placed order. Never the design or the price. */
export const detailsSchema = customerSchema.extend({
	whatsappOptIn: z.boolean(),
});

/**
 * A customer corrects their own details until production starts — the
 * boundary the terms of sale state. A delivery locks them too: the address
 * has already gone to a carrier.
 */
export function canEditDetails(order: {
	status: string;
	productionStage: string | null;
	hasDelivery: boolean;
}): boolean {
	return (
		order.status !== "CANCELLED" &&
		order.productionStage === null &&
		!order.hasDelivery
	);
}

/** `canEditDetails` as a filter, so the write itself refuses a locked order. */
export const EDITABLE_ORDER = {
	status: { not: "CANCELLED" },
	productionStage: null,
	deliveries: { none: {} },
} as const;
