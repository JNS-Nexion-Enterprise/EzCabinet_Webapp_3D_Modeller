/**
 * The three button shapes the studio chrome is built from.
 *
 * Class strings rather than components: these are used inside `map`s that also
 * set `aria-pressed`, `disabled` and `onClick`, and a wrapper component for
 * that is more surface than the string it hides. One file so a dozen call
 * sites cannot drift apart.
 */

/**
 * Widens what a thumb can hit without changing what is drawn — the swatches
 * and badges stay their size, the transparent pseudo-element around them takes
 * the tap. Sideways only as far as the gaps between neighbours allow.
 */
export const thumb =
	"relative after:absolute after:-inset-x-[3px] after:-inset-y-[9px] after:content-['']";

/** A small pill — room types, widths, on/off pairs. */
export const chip = (active: boolean) =>
	`min-h-9 rounded-lg px-3 py-2 text-[12px] transition ${
		active
			? "border border-neutral-900 bg-neutral-900 font-semibold text-white"
			: "border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
	}`;

/** A full-width stacked option — label over hint. */
export const listBtn = (active: boolean) =>
	`flex min-h-9 w-full flex-col gap-0.5 rounded-[9px] px-3 py-2.5 text-left transition ${
		active
			? "border border-[#1f5138] bg-[#f2f7f4]"
			: "border border-neutral-200 bg-white hover:border-neutral-300"
	}`;

/** A verb row — label left, meta right. */
export const verbBtn = (active: boolean, danger = false) =>
	`flex min-h-10 w-full items-center gap-2 rounded-[9px] px-3 py-2.5 text-left transition ${
		danger
			? "border border-[#e8d9d4] bg-white text-[#8a2c1c] hover:bg-[#fdf6f4]"
			: active
				? "border border-[#1f5138] bg-[#f2f7f4] text-neutral-900"
				: "border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300"
	}`;
