import "server-only";
import { type CompanyDetails, sellerLine } from "@/lib/company/details";
import { getCompany } from "@/lib/company/store";
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

/** The company tokens filled in every string, however deep; other tokens left alone. */
function branded<T>(node: T, c: CompanyDetails): T {
	if (typeof node === "string")
		return fill(node, {
			brand: c.brand,
			legalName: c.legalName,
			orderPrefix: c.orderPrefix,
		}) as T;
	if (Array.isArray(node)) return node.map((n) => branded(n, c)) as T;
	if (node && typeof node === "object")
		return Object.fromEntries(
			Object.entries(node).map(([key, value]) => [key, branded(value, c)]),
		) as T;
	return node;
}

// ponytail: one entry per locale per save in a warm instance; evict if saves ever get frequent.
const filled = new Map<string, Dictionary>();

/**
 * The company's facts come from `getCompany()` (the admin-edited row), never
 * from the dictionary files: those say `{brand}`, `{seller}` and the like, and
 * this is the one place they are filled. Memoised on the facts themselves, so
 * a save shows on the next call.
 */
export async function getDictionary(locale: Locale): Promise<Dictionary> {
	const company = await getCompany();
	const key = `${locale}:${JSON.stringify(company)}`;
	let dictionary = filled.get(key);
	if (!dictionary) {
		const t = branded(await dictionaries[locale](), company);
		const seller = {
			seller: sellerLine(company),
			email: company.contactEmail,
			phone: company.phone,
		};
		dictionary = {
			...t,
			common: { ...t.common, brand: company.brand },
			landing: {
				...t.landing,
				footer: { ...t.landing.footer, email: company.contactEmail },
			},
			quote: { ...t.quote, soldBy: fill(t.quote.soldBy, seller) },
			terms: { ...t.terms, seller: fill(t.terms.seller, seller) },
		};
		filled.set(key, dictionary);
	}
	return dictionary;
}
