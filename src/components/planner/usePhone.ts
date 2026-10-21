import { useSyncExternalStore } from "react";

export const PHONE_QUERY = "(max-width: 759px)";

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
