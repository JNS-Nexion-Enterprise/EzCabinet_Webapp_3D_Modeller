/**
 * The people list needs to know whether a row has a password, but must not
 * ship the `accounts` array itself to the browser. One select and one mapper,
 * so the page and the GET route cannot drift apart.
 */
export const HAS_PASSWORD_SELECT = {
	accounts: {
		where: { providerId: "credential" },
		select: { id: true },
		take: 1,
	},
} as const;

export function withHasPassword<T extends { accounts: unknown[] }>(
	row: T,
): Omit<T, "accounts"> & { hasPassword: boolean } {
	const { accounts, ...rest } = row;
	return { ...rest, hasPassword: accounts.length > 0 };
}
