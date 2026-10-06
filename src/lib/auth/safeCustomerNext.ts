const BASE = "https://site.invalid";

/**
 * Where the verify page sends a customer afterwards. `next` comes from the
 * query string, so it is attacker-supplied: only a path on this site is
 * followed.
 *
 * Checking prefixes is not enough: a browser strips tab, LF and CR from
 * anywhere in a URL, so "/\t/evil.example" reads as `//evil.example`. So the
 * input is parsed the way a browser will, must stay on our origin, and what
 * is returned is the parsed form, never the raw string.
 *
 * Dot segments are the other trap: "/a/..//evil.example" resolves to
 * "//evil.example", so an empty path segment is refused outright and the
 * result must re-parse to itself on our origin.
 */
export function safeCustomerNext(
	next: string | undefined,
	lang: string,
): string {
	const fallback = `/${lang}/orders`;
	if (!next?.startsWith("/")) return fallback;
	// Control characters and backslashes are never in a path we link to.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
	if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;

	let url: URL;
	let segments: string[];
	try {
		url = new URL(next, BASE);
		segments = decodeURIComponent(url.pathname).split("/").filter(Boolean);
	} catch {
		return fallback;
	}
	if (url.origin !== BASE) return fallback;
	// The verify page itself, however it is spelled (%76erify, VERIFY, ./, //).
	if (segments[1]?.toLowerCase() === "verify") return fallback;
	// Dot segments are resolved but an empty segment survives them:
	// "/a/..//evil.example" parses to "//evil.example", which a browser reads
	// as another site. Refuse any empty segment rather than repair it.
	if (url.pathname === "/" || url.pathname.includes("//")) return fallback;

	// Second, independent proof: what we return must re-parse to itself, on
	// our origin.
	const result = url.pathname + url.search + url.hash;
	try {
		const again = new URL(result, BASE);
		if (
			again.origin !== BASE ||
			again.pathname + again.search + again.hash !== result
		)
			return fallback;
	} catch {
		return fallback;
	}
	return result;
}
