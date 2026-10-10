const BASE = "https://site.invalid";

/**
 * A `next` from the query string is attacker-supplied: only a path on this
 * site is followed. Returns the parsed path, or null when it is not one.
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
function sameSitePath(next: unknown, refused: string[]): string | null {
	// A repeated `?next=a&next=b` arrives as an array: not ours to guess at.
	if (typeof next !== "string" || !next.startsWith("/")) return null;
	// Control characters and backslashes are never in a path we link to.
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point
	if (/[\u0000-\u001f\u007f\\]/.test(next)) return null;

	let url: URL;
	let decoded: string;
	try {
		url = new URL(next, BASE);
		decoded = decodeURIComponent(url.pathname);
	} catch {
		return null;
	}
	const segments = decoded.split("/").filter(Boolean);
	if (url.origin !== BASE) return null;
	// The asking page itself, however it is spelled (%76erify, VERIFY, ./, //)
	// — after the locale, or first: the proxy gives "/verify" a locale and it
	// lands on the same page.
	if (
		refused.includes(segments[0]?.toLowerCase()) ||
		refused.includes(segments[1]?.toLowerCase())
	)
		return null;
	// Dot segments are resolved but an empty segment survives them:
	// "/a/..//evil.example" parses to "//evil.example", which a browser reads
	// as another site. Refuse any empty segment rather than repair it — an
	// encoded one too ("/%2F%2Fevil.example"), which anything downstream that
	// decodes the path would turn into the same thing.
	if (
		url.pathname === "/" ||
		url.pathname.includes("//") ||
		decoded.includes("//")
	)
		return null;

	// Second, independent proof: what we return must re-parse to itself, on
	// our origin.
	const result = url.pathname + url.search + url.hash;
	try {
		const again = new URL(result, BASE);
		if (
			again.origin !== BASE ||
			again.pathname + again.search + again.hash !== result
		)
			return null;
	} catch {
		return null;
	}
	return result;
}

/** Where the verify page sends a customer afterwards. */
export function safeCustomerNext(
	next: string | string[] | undefined,
	lang: string,
): string {
	return sameSitePath(next, ["verify"]) ?? `/${lang}/orders`;
}

/**
 * Where the name step (`/[lang]/welcome`) sends a customer afterwards, and
 * so where a code sign-in is headed: the email form always goes through that
 * page, which passes a customer who owes no name straight on. The provider
 * buttons hand `next` to Better Auth, which checks it; this path navigates
 * by itself, so it gets the same check here.
 *
 * The verify page is allowed — a customer whose session lapsed there is sent
 * to sign in with it as `next` — and re-checks its own `next`. The welcome
 * page is not: it would only send them round again.
 */
export function safeWelcomeNext(
	next: string | string[] | undefined,
	lang: string,
): string {
	return sameSitePath(next, ["welcome"]) ?? `/${lang}`;
}
