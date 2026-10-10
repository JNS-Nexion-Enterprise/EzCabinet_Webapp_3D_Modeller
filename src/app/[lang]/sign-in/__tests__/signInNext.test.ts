import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
	notFound: (): never => {
		throw new Error("NOT_FOUND");
	},
}));
vi.mock("@/lib/copy/dictionary", () => ({
	getDictionary: async () => ({
		signIn: {},
		passkey: {},
		privacy: {},
	}),
}));

const { default: SignInPage } = await import("@/app/[lang]/sign-in/page");
const { GoogleSignInButton } = await import(
	"@/app/[lang]/sign-in/GoogleSignInButton"
);
const { googleCallback } = await import("@/app/[lang]/sign-in/signInNext");

describe("googleCallback", () => {
	it.each([
		["a path", "/en/planner/kitchen?a=1", "/en/planner/kitchen?a=1"],
		["nothing", undefined, "/ms"],
		["empty", "", "/ms"],
		// `?next=a&next=b` reaches the page as an array: not ours to guess at.
		["a repeated parameter", ["/en/orders", "https://evil.example"], "/ms"],
		["a non-string", 42, "/ms"],
	])("%s", (_label, next, expected) => {
		expect(googleCallback(next, "ms")).toBe(expected);
	});
});

/** The `callbackURL` the page hands the Google button. */
const callbackOf = (tree: unknown): unknown => {
	const seen: unknown[] = [tree];
	while (seen.length) {
		const node = seen.pop() as {
			type?: unknown;
			props?: { callbackURL?: unknown; children?: unknown };
		} | null;
		if (!node || typeof node !== "object") continue;
		if (node.type === GoogleSignInButton) return node.props?.callbackURL;
		const children = node.props?.children;
		if (Array.isArray(children)) seen.push(...children);
		else seen.push(children);
	}
	return undefined;
};

describe("the sign-in page", () => {
	const open = (next?: string | string[]) =>
		SignInPage({
			params: Promise.resolve({ lang: "en" }),
			searchParams: Promise.resolve({ next }),
		});

	it("hands Google the page asked for", async () => {
		expect(callbackOf(await open("/en/orders"))).toBe("/en/orders");
	});

	it("hands Google a string, never the array a repeated parameter arrives as", async () => {
		expect(callbackOf(await open(["/en/orders", "/en/x"]))).toBe("/en");
	});
});
