import "server-only";
import { tenant } from "@/lib/tenant";
import type { Dictionary } from "./en";
import { fill } from "./fill";
import type { Locale } from "./locales";

/**
 * The dictionary for a locale, loaded on the server only.
 *
 * Dynamic imports so a request for `/ms` never parses the other two. Server
 * components await this directly and pay nothing on the wire — only the
 * rendered HTML reaches the browser. The planner's client components get it
 * as a prop through `CopyProvider`, because `next/root-params` does not reach
 * across the client boundary.
 */
const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
	en: () => import("./en").then((m) => m.en),
	zh: () => import("./zh").then((m) => m.zh),
	ms: () => import("./ms").then((m) => m.ms),
};

/** `{brand}` and `{orderPrefix}` filled in every string, however deep; other tokens left alone. */
function branded<T>(node: T): T {
	if (typeof node === "string")
		return fill(node, {
			brand: tenant.brand,
			orderPrefix: tenant.orderPrefix,
		}) as T;
	if (Array.isArray(node)) return node.map(branded) as T;
	if (node && typeof node === "object")
		return Object.fromEntries(
			Object.entries(node).map(([key, value]) => [key, branded(value)]),
		) as T;
	return node;
}

const filled = new Map<Locale, Promise<Dictionary>>();

/**
 * The company's name and contact address come from `lib/tenant`, never from
 * the dictionary files: those say `{brand}`, and this is the one place it is
 * filled, once per locale.
 */
export function getDictionary(locale: Locale): Promise<Dictionary> {
	let dictionary = filled.get(locale);
	if (!dictionary) {
		dictionary = dictionaries[locale]().then((raw) => {
			const t = branded(raw);
			return {
				...t,
				common: { ...t.common, brand: tenant.brand },
				landing: {
					...t.landing,
					footer: { ...t.landing.footer, email: tenant.contactEmail },
				},
			};
		});
		filled.set(locale, dictionary);
	}
	return dictionary;
}
