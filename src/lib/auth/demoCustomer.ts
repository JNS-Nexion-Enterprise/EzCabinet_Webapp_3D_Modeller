import "server-only";
import { authEnabled } from "@/lib/auth/enabled";
import type { AuthUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";

/** The demo account's id — also how My orders finds its orders. */
export const DEMO_CUSTOMER_ID = "demo-customer";

/**
 * Who a local, signed-out checkout belongs to: one seeded customer row, so a
 * demo on a laptop can place an order without a trip through Google.
 *
 * Every order still has an owner — `Order.userId` stays NOT NULL and nothing
 * here is anonymous. Null whenever auth is enabled, which `authEnabled`
 * makes true on every Vercel deployment whatever AUTH_ENABLED says, so this
 * can never hand a public URL a shared account.
 */
export async function demoCustomer(): Promise<AuthUser | null> {
	if (authEnabled()) return null;
	return prisma.user.upsert({
		where: { email: "demo-customer@localhost" },
		update: {},
		create: {
			id: DEMO_CUSTOMER_ID,
			name: "Demo customer",
			email: "demo-customer@localhost",
			emailVerified: true,
		},
		select: {
			id: true,
			email: true,
			name: true,
			image: true,
			role: true,
			disabled: true,
			mustChangePassword: true,
		},
	});
}
