import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));

const count = vi.hoisted(() => vi.fn());
const passkeyCount = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { order: { count }, passkey: { count: passkeyCount } },
}));

const { default: AccountLayout } = await import(
	"@/app/[lang]/(account)/layout"
);

const open = () =>
	AccountLayout({ children: null, params: Promise.resolve({ lang: "en" }) });

beforeEach(() => {
	count.mockReset();
	count.mockResolvedValue(2);
	passkeyCount.mockReset();
	passkeyCount.mockResolvedValue(3);
});

const signedIn: AuthUser = {
	id: "cust-1",
	email: "c@x.com",
	name: "C",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: false,
};

/** Depth-first search of the returned element tree for AccountNav's items. */
function navItems(node: unknown): { href: string; count: number }[] | null {
	if (!node || typeof node !== "object") return null;
	const props = (node as { props?: Record<string, unknown> }).props;
	if (!props) return null;
	if (Array.isArray(props.items)) return props.items;
	const kids = [props.children].flat();
	for (const kid of kids) {
		const found = navItems(kid);
		if (found) return found;
	}
	return null;
}

describe("account layout", () => {
	it("counts only the signed-in account's orders for the side nav", async () => {
		currentUser.mockResolvedValue({
			id: "staff-1",
			email: "s@x.com",
			name: "S",
			image: null,
			role: "ADMIN",
			disabled: false,
			mustChangePassword: false,
			mustSetupTwoFactor: false,
			mustVerifyPasskey: false,
		});
		await open();
		expect(count).toHaveBeenCalledWith({ where: { userId: "staff-1" } });
	});

	it("lists Passkeys in the side nav with the account's passkey count", async () => {
		currentUser.mockResolvedValue(signedIn);
		const items = navItems(await open());
		expect(passkeyCount).toHaveBeenCalledWith({ where: { userId: "cust-1" } });
		expect(items).toContainEqual(
			expect.objectContaining({ href: "/en/passkeys", count: 3 }),
		);
	});

	it("does not query when nobody is signed in (the page redirects)", async () => {
		currentUser.mockResolvedValue(null);
		await open();
		expect(count).not.toHaveBeenCalled();
	});
});
