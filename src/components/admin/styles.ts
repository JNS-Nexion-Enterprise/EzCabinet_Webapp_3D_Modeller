/**
 * The two control looks the admin screens share. Both pages had grown their
 * own near-identical copy — same borders, same red error state, drifting
 * padding.
 */
import { INVALID, USER_INVALID } from "@/components/Field";

/** A text/number input. `hasError` paints the invalid state. */
export function fieldClass(hasError: boolean, extra = "") {
	return `rounded-lg border px-2.5 py-2 text-sm ${
		hasError ? INVALID : "border-neutral-300"
	} ${USER_INVALID} ${extra}`;
}

/** A pill toggle — filter chips, multi-selects, segmented choices. */
export function chipClass(active: boolean) {
	return `min-h-8 rounded-full border px-3.5 py-2 text-xs font-medium ${
		active
			? "border-neutral-900 bg-neutral-900 text-white"
			: "border-neutral-200 bg-white text-neutral-600"
	}`;
}
