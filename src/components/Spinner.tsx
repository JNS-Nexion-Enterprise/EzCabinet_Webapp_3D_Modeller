/**
 * The marks that say "this is in progress" and "this finished", for the inside
 * of a button.
 *
 * Every async action already disabled its button; a dimmed button on a slow
 * connection reads as a tap that did nothing. Both marks take the button's own
 * text colour and size themselves to its text, so they drop in front of any
 * label unchanged. The spinner is a faint full track with a solid arc turning
 * on it; `Done` is the check shown for an action's done window (`useAction`).
 */
export const Spinner = () => (
	<span
		aria-hidden
		className="mr-2 inline-block h-[1em] w-[1em] shrink-0 animate-spin rounded-full border-2 border-current/20 border-t-current align-[-0.15em] motion-reduce:animate-none"
	/>
);

export const Done = () => (
	<svg
		aria-hidden
		viewBox="0 0 16 16"
		fill="none"
		stroke="currentColor"
		strokeWidth={2.5}
		strokeLinecap="square"
		className="mr-2 inline-block h-[1em] w-[1em] shrink-0 align-[-0.15em]"
	>
		<path d="M3 8.5l3.5 3.5L13 4.5" />
	</svg>
);
