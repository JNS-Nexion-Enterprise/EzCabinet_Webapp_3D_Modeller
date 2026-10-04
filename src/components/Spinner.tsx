/**
 * The mark that says "this is in progress", for the inside of a button.
 *
 * Every async action already disabled its button; a dimmed button on a slow
 * connection reads as a tap that did nothing. A ring in the button's own text
 * colour, sized to its text, so it drops in front of any label unchanged.
 */
export const Spinner = () => (
	<span
		aria-hidden
		className="mr-2 inline-block h-[1em] w-[1em] shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.15em] motion-reduce:animate-none"
	/>
);
