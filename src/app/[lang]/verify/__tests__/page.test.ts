import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
const count = vi.hoisted(() => vi.fn(async () => 0));
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/catalogue/db", () => ({ prisma: { passkey: { count } } }));
vi.mock("next/navigation", () => ({
	notFound: (): never => {
		throw new Error("NOT_FOUND");
	},
	redirect: (url: string): never => {
		throw new Error(`REDIRECT:${url}`);
	},
}));
vi.mock("@/lib/copy/dictionary", () => ({
	getDictionary: async () => ({ passkey: { heading: "h" } }),
}));
vi.mock("../PasskeyGate", () => ({ PasskeyGate: () => null }));

const { default: VerifyPage } = await import("@/app/[lang]/verify/page");

const customer = (over: Partial<AuthUser>): AuthUser => ({
	id: "c1",
	email: "aiman@outlook.com",
	name: "Aiman",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: true,
	mustSetName: false,
	...over,
});

const open = (next?: string) =>
	VerifyPage({
		params: Promise.resolve({ lang: "en" }),
		searchParams: Promise.resolve({ next }),
	});

beforeEach(() => {
	currentUser.mockReset();
	count.mockClear();
});

describe("the passkey step and the name", () => {
	// The device's passkey prompt shows the account's name, so a passkey is
	// never set up on an account that has none.
	it("sends a customer with no name to the name step first, keeping the target", async () => {
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		await expect(open("/en/order/abc")).rejects.toThrow(
			"REDIRECT:/en/welcome?next=%2Fen%2Forder%2Fabc",
		);
		expect(count).not.toHaveBeenCalled();
	});

	it("shows the passkey step to a customer who has a name", async () => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open("/en/order/abc")).resolves.toBeTruthy();
		expect(count).toHaveBeenCalledWith({ where: { userId: "c1" } });
	});

	it("still passes on a customer who owes nothing", async () => {
		currentUser.mockResolvedValue(customer({ mustVerifyPasskey: false }));
		await expect(open("/en/order/abc")).rejects.toThrow(
			"REDIRECT:/en/order/abc",
		);
	});
});
