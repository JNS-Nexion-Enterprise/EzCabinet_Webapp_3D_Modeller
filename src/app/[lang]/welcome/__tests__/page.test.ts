import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("next/navigation", () => ({
	notFound: (): never => {
		throw new Error("NOT_FOUND");
	},
	redirect: (url: string): never => {
		throw new Error(`REDIRECT:${url}`);
	},
}));
vi.mock("@/lib/copy/dictionary", () => ({
	getDictionary: async () => ({ welcome: { heading: "h", body: "b" } }),
}));

const { default: WelcomePage } = await import("@/app/[lang]/welcome/page");
const { nameMessage, WelcomeForm } = await import(
	"@/app/[lang]/welcome/WelcomeForm"
);

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

const open = (next?: string | string[], lang = "en") =>
	WelcomePage({
		params: Promise.resolve({ lang }),
		searchParams: Promise.resolve({ next }),
	});

/** The `next` the page hands its form, read off the rendered tree. */
const formNext = (tree: unknown): string | undefined => {
	const seen: unknown[] = [tree];
	while (seen.length) {
		const node = seen.pop() as {
			type?: unknown;
			props?: { next?: string; children?: unknown };
		} | null;
		if (!node || typeof node !== "object") continue;
		if (node.type === WelcomeForm) return node.props?.next;
		const children = node.props?.children;
		if (Array.isArray(children)) seen.push(...children);
		else seen.push(children);
	}
	return undefined;
};

beforeEach(() => currentUser.mockReset());

describe("the name step", () => {
	it("asks a customer with no name, and remembers where they were going", async () => {
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		const tree = await open("/en/planner/kitchen?a=1#quote");
		expect(formNext(tree)).toBe("/en/planner/kitchen?a=1#quote");
	});

	// Closed the tab at this step and signed in again another day: the code
	// form always comes through here, so the step is simply met again.
	it("asks again on a later sign-in, however long ago the account was made", async () => {
		currentUser.mockResolvedValue(customer({ name: "  ", mustSetName: true }));
		const tree = await open("/en/verify?next=%2Fen%2Forder%2Fabc");
		expect(formNext(tree)).toBe("/en/verify?next=%2Fen%2Forder%2Fabc");
	});

	it("passes a customer who has a name straight on, never showing the form", async () => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open("/ms/orders", "ms")).rejects.toThrow(
			"REDIRECT:/ms/orders",
		);
	});

	it("passes staff straight on", async () => {
		currentUser.mockResolvedValue(
			customer({ role: "ADMIN", name: "", mustVerifyPasskey: false }),
		);
		await expect(open("/en/orders")).rejects.toThrow("REDIRECT:/en/orders");
	});

	it("sends a signed-out visitor to sign in, keeping the target", async () => {
		currentUser.mockResolvedValue(null);
		await expect(open("/en/orders")).rejects.toThrow(
			"REDIRECT:/en/sign-in?next=%2Fen%2Forders",
		);
	});

	it.each([
		["another site", "https://evil.example/x"],
		["a protocol-relative URL", "//evil.example"],
		["this page again", "/en/welcome?next=/en/orders"],
		["a repeated parameter", ["/en/orders", "/en/x"]],
		["nothing", undefined],
	])("goes home instead of following %s", async (_label, next) => {
		currentUser.mockResolvedValue(customer({}));
		await expect(open(next)).rejects.toThrow("REDIRECT:/en");
		currentUser.mockResolvedValue(customer({ name: "", mustSetName: true }));
		expect(formNext(await open(next))).toBe("/en");
	});

	it("404s an unknown language", async () => {
		await expect(open("/xx/orders", "xx")).rejects.toThrow("NOT_FOUND");
	});
});

describe("nameMessage", () => {
	it.each([
		[200, undefined, null],
		[400, "name_required", "nameRequired"],
		[400, "name_refused", "nameRefused"],
		[401, "sign_in_required", "failed"],
		[500, undefined, "failed"],
	])("status %i, error %j", (status, error, expected) => {
		expect(nameMessage(status, error)).toBe(expected);
	});
});
