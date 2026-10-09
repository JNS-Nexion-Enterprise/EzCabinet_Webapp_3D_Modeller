import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { en } from "../en";
import { LOCALES } from "../locales";
import { ms } from "../ms";
import { zh } from "../zh";

/** Every leaf path in a nested dictionary, e.g. "common.back". */
const paths = (value: unknown, prefix = ""): string[] =>
	typeof value === "object" && value !== null
		? Object.entries(value).flatMap(([key, child]) =>
				paths(child, prefix ? `${prefix}.${key}` : key),
			)
		: [prefix];

const at = (dict: unknown, path: string): string =>
	path.split(".").reduce<never>((v, k) => (v as never)[k], dict as never);

/** Strings that are legitimately identical across locales. */
const SHARED = new Set([
	"common.brand",
	"landing.footer.email",
	// Malay borrows the word outright — "Menu" is the Malay for it, not an
	// untranslated string.
	"landing.nav.menu",
	// "Unit" is the Malay word too, and a count of one takes no plural.
	"orders.unitsOne",
]);

/** The only strings that may name a sign-in provider: its button, its error. */
const PROVIDER_KEYS = new Set([
	"signIn.continueWithGoogle",
	"signIn.googleError",
]);
const PROVIDER_NAME = /google|谷歌/i;

describe("dictionaries", () => {
	it("serves exactly the three locales", () => {
		expect(LOCALES).toHaveLength(3);
	});

	// The type gate already makes this a compile error. The test catches it in
	// CI, where a stray `as never` or `@ts-expect-error` cannot hide it.
	it.each([
		["zh", zh],
		["ms", ms],
	])("%s has exactly English's keys", (_name, dict) => {
		expect(paths(dict).sort()).toEqual(paths(en).sort());
	});

	it.each([
		["zh", zh],
		["ms", ms],
	])("%s has no value left in English", (_name, dict) => {
		const untranslated = paths(en).filter(
			(p) => !SHARED.has(p) && at(dict, p) === at(en, p),
		);
		expect(untranslated).toEqual([]);
	});

	it("has no empty strings", () => {
		for (const dict of [en, zh, ms]) {
			for (const path of paths(dict)) {
				expect(at(dict, path).trim()).not.toBe("");
			}
		}
	});

	// A customer can sign in with any email, so nothing outside a provider's
	// own button may read as if Google were the only way in.
	it.each([
		["en", en],
		["zh", zh],
		["ms", ms],
	])(
		"%s names a sign-in provider only on its own button and error",
		(_name, dict) => {
			const naming = paths(dict).filter(
				(p) => !PROVIDER_KEYS.has(p) && PROVIDER_NAME.test(at(dict, p)),
			);
			expect(naming).toEqual([]);
		},
	);

	// A customer who mistyped can only notice if the address is shown back.
	it.each([
		["en", en],
		["zh", zh],
		["ms", ms],
	])(
		"%s shows the address a code went to, and the resend countdown",
		(_name, dict) => {
			expect(dict.signIn.codeSent).toContain("{email}");
			expect(dict.signIn.resendIn).toContain("{seconds}");
		},
	);

	it("names no provider on the page a wrong-account link lands on", () => {
		// Its strings are inline, not in the dictionary — see the file's comment.
		const notFound = readFileSync(
			new URL("../../../app/[lang]/not-found.tsx", import.meta.url),
			"utf8",
		);
		expect(notFound).not.toMatch(PROVIDER_NAME);
	});
});
