import { useSyncExternalStore } from "react";

/** The same line Tailwind v4 draws for `max-[760px]:` (`width < 760px`), so a
 *  759.5px window is a phone to both the hook and the CSS. */
export const PHONE_QUERY = "(width < 760px)";

function subscribe(onChange: () => void) {
	const query = window.matchMedia(PHONE_QUERY);
	query.addEventListener("change", onChange);
	return () => query.removeEventListener("change", onChange);
}

/** True on a phone-width screen. Studio only: the server snapshot is `false`
 *  because the studio never renders on the server — not for the start screen. */
export function usePhone(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => window.matchMedia(PHONE_QUERY).matches,
		() => false,
	);
}
