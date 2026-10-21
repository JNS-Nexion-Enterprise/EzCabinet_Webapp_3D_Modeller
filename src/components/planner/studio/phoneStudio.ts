/** The phone studio's tab rules. Pure: no React, no copy. */

export type PhoneTab = "selected" | "add" | "room" | "run";

/** The design's order, left to right in the tab bar. */
export const PHONE_TABS: readonly PhoneTab[] = [
	"selected",
	"add",
	"room",
	"run",
];

/**
 * How the run shows its fronts.
 *
 * `hidden` exists because `open` cannot answer "show me every interior". Two
 * cabinets whose doors hinge on the same shared stile cannot both be open —
 * not here and not in a real kitchen — so swinging them all at once stacks
 * two leaves into the same space whatever angle they stop at. Taking the
 * fronts away is the honest way to show the whole run at once, and it is what
 * this toggle was specified as from the start.
 */
export type DoorView = "closed" | "open" | "hidden";

/** An empty room has nothing to select, so it opens on the room's shape. */
export function initialPhoneTab(cabinetCount: number): PhoneTab {
	return cabinetCount === 0 ? "room" : "selected";
}

/** Selecting a cabinet brings its panel up; clearing the selection leaves the
 *  customer where they were. */
export function tabAfterSelection(
	current: PhoneTab,
	selectedCount: number,
): PhoneTab {
	return selectedCount > 0 ? "selected" : current;
}

/** The one doors button cycles through all three views. */
export function nextDoorView(current: DoorView): DoorView {
	if (current === "closed") return "open";
	return current === "open" ? "hidden" : "closed";
}
