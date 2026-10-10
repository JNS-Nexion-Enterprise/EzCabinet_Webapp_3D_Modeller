import { orderRef } from "@/lib/orders/ref";

/**
 * The people list needs a few derived facts about a row — a password, how many
 * passkeys, the last orders — but must not ship the `accounts`, `_count` or
 * `orders` relations themselves to the browser. One select and one mapper, so
 * the page and the GET route cannot drift apart.
 *
 * The three newest orders (number and phone) are what staff read out to
 * confirm who is calling before they reset a customer's passkeys.
 */
export const USER_ROW_SELECT = {
	id: true,
	email: true,
	name: true,
	role: true,
	disabled: true,
	twoFactorEnabled: true,
	lastLoginAt: true,
	createdAt: true,
	accounts: {
		where: { providerId: "credential" },
		select: { id: true },
		take: 1,
	},
	_count: { select: { passkeys: true } },
	orders: {
		select: { number: true, createdAt: true, customerPhone: true },
		orderBy: { createdAt: "desc" },
		take: 3,
	},
} as const;

export function toUserRow<
	T extends {
		accounts: unknown[];
		_count: { passkeys: number };
		orders: { number: number; createdAt: Date; customerPhone: string }[];
	},
>(
	row: T,
): Omit<T, "accounts" | "_count" | "orders"> & {
	hasPassword: boolean;
	passkeyCount: number;
	recentOrders: { ref: string; phone: string }[];
} {
	const { accounts, _count, orders, ...rest } = row;
	return {
		...rest,
		hasPassword: accounts.length > 0,
		passkeyCount: _count.passkeys,
		recentOrders: orders.map((o) => ({
			ref: orderRef(o.number, o.createdAt),
			phone: o.customerPhone,
		})),
	};
}
