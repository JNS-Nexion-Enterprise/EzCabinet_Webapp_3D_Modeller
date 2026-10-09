/**
 * Where Google sends the customer back to: the page's `?next=`, or home.
 * `searchParams` is typed by hand, and a repeated `?next=a&next=b` arrives as
 * an array whatever the type says — not ours to guess at, so it counts as
 * absent. Better Auth checks the string itself against our origin.
 */
export function googleCallback(next: unknown, lang: string): string {
	return typeof next === "string" && next ? next : `/${lang}`;
}
