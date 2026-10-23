/**
 * The scroll maths behind the landing page's choreography, as pure functions.
 *
 * Framework-free on purpose, the same way `lib/planner` is: the client island
 * that calls these is a thin shell around them, so the arithmetic that decides
 * where a beat lands is testable without a DOM.
 *
 * The model: a **track** is a tall element containing a sticky stage. Its
 * progress is one number, 0 the moment its top reaches the viewport top and 1
 * once the runway underneath the sticky stage has been scrolled away. Every
 * animated property on the page is a function of that single number — which is
 * how Apple's product pages are built, where one `--vo-scroll-*` custom
 * property feeds dozens of elements.
 */

/** The unit interval, defended. */
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v + 0);

/**
 * How far through a track the page has scrolled, 0..1.
 *
 * `rectTop` is the track's `getBoundingClientRect().top` — negative once its
 * top has passed above the viewport. The runway is everything the track has
 * beyond one viewport, since the sticky stage occupies that last viewport.
 */
export function trackProgress(
	rectTop: number,
	trackHeight: number,
	viewportHeight: number,
): number {
	const runway = trackHeight - viewportHeight;
	// A track no taller than the viewport never pins, so it has no runway to
	// divide by. Treat it as a switch at the moment its top passes.
	if (runway <= 0) return rectTop <= 0 ? 1 : 0;
	return clamp01(-rectTop / runway);
}

/**
 * Where the landing hero's 3D build runs: anywhere motion is allowed, phones
 * included, at the owner's call — the design has a phone layout for it, and
 * the scene is light on a phone (see `HeroBuild`). Reduced motion gets the
 * photo hero. One media query, so CSS (which hero is shown) and the island
 * (whether to download three) can never disagree.
 */
export const BUILD_QUERY = "(prefers-reduced-motion: no-preference)";
