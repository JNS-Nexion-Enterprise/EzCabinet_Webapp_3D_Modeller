/**
 * Where the verify page sends a customer afterwards. `next` comes from the
 * query string, so it is attacker-supplied: only a path on this site is
 * followed. `//host` and `/\host` both leave the site in a browser despite
 * starting with a slash.
 */
export function safeCustomerNext(
	next: string | undefined,
	lang: string,
): string {
	const fallback = `/${lang}/orders`;
	if (!next?.startsWith("/")) return fallback;
	if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
	if (/^\/[a-z-]+\/verify(\?|$|\/)/i.test(next)) return fallback;
	return next;
}
