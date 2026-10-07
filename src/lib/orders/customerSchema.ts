import { z } from "zod";

/** Who an order is for and where it goes — typed at checkout, correctable after. */
export const customerSchema = z.object({
	name: z.string().trim().min(1).max(200),
	phone: z.string().trim().min(1).max(40),
	email: z.email().max(200).nullable().default(null),
	siteAddress: z.string().trim().min(5).max(500),
	addressNotes: z.string().trim().max(500).nullable().default(null),
});
