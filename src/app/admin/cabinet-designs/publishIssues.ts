import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

const RATE_LABELS: Record<string, string> = {
	worktopRmPerFt: "Worktop rate",
	ceilingTrimRmPerFt: "Ceiling trim rate",
	skirtingRmPerFt: "Skirting rate",
	endPanelBaseRm: "End panel rate, base unit",
	endPanelWallRm: "End panel rate, wall unit",
	endPanelTallRm: "End panel rate, tall unit",
	deliveryFlatRm: "Delivery fee",
};

const BUILD_LABELS: Record<string, string> = {
	panelThicknessMm: "Board thickness",
	plinthHeightMm: "Plinth height",
	worktopThicknessMm: "Worktop thickness",
	doorLeavesThresholdMm: "Two-doors width",
};

type Path = readonly PropertyKey[];

/** Where in the settings a catalogue path points, in the words of the screen. */
function whereOf(path: Path, draft: PlannerCatalogue): string {
	const [section, index, field, sub] = path;
	const at = typeof index === "number" ? index : -1;
	const quoted = (label: string | undefined, fallback: string) =>
		label ? `${fallback} "${label}"` : `${fallback} ${at + 1}`;
	switch (section) {
		case "rates":
			return RATE_LABELS[String(index)] ?? "A rate";
		case "construction":
			return BUILD_LABELS[String(index)] ?? "A build standard";
		case "doorWidthLadderMm":
			return `Door width ladder, rung ${at + 1}`;
		case "doorStyles": {
			const style = quoted(draft.doorStyles[at]?.label, "Door style");
			return field === "priceRmBySizeMm" && sub !== undefined
				? `${style}, ${String(sub)}mm surcharge`
				: field === "label"
					? `${style} name`
					: style;
		}
		case "finishes":
			return quoted(draft.finishes[at]?.label, "Finish");
		case "wallColours":
			return quoted(draft.wallColours?.[at]?.label, "Wall colour");
		case "roomTypes":
			return `${draft.roomTypes[at]?.label ?? `Room ${at + 1}`} wall width`;
		case "families":
			return quoted(draft.families[at]?.label, "Cabinet");
		default:
			return path.map(String).join(" › ") || "The catalogue";
	}
}

/**
 * What a rejected publish says, as plain sentences. The edit screens already
 * paint a bad value red as it is typed, so most of these name a field the admin
 * can see; a path no screen field carries (a cabinet, say) is still named, so
 * "invalid_catalogue" is never all there is to read.
 */
export function publishIssueSentences(
	issues: unknown,
	draft: PlannerCatalogue,
): string[] {
	if (!Array.isArray(issues)) return [];
	const out: string[] = [];
	for (const issue of issues) {
		const path = (issue as { path?: unknown } | null)?.path;
		if (!Array.isArray(path)) continue;
		const what =
			path.at(-1) === "hex"
				? "needs a colour like #1f5138"
				: path.at(-1) === "label"
					? "needs a name"
					: "has a value the planner cannot use";
		const sentence = `${whereOf(path, draft)} ${what}.`;
		if (!out.includes(sentence)) out.push(sentence);
	}
	return out;
}

/** The settings tab a catalogue path is edited on. */
export type SettingsTabName = "doors" | "finishes" | "standards";

/**
 * The key `CatalogueSettings` files a rendered input under — its catalogue
 * path, dot-joined — or null for a path no input carries (a cabinet, a door's
 * look, any id). Keep in step with the `mark(...)` calls in that component.
 */
function settingKey(path: Path): { key: string; tab: SettingsTabName } | null {
	const [section, index, field, sub] = path;
	const key = path.map(String).join(".");
	switch (section) {
		case "doorWidthLadderMm":
			return path.length === 2 ? { key, tab: "doors" } : null;
		case "doorStyles":
			return field === "label" ||
				(field === "priceRmBySizeMm" && sub !== undefined && path.length === 4)
				? { key, tab: "doors" }
				: null;
		case "finishes":
		case "wallColours":
			return field === "label" || field === "hex"
				? { key, tab: "finishes" }
				: null;
		case "rates":
		case "construction":
			return path.length === 2 && index !== undefined
				? { key, tab: "standards" }
				: null;
		case "roomTypes":
			return field === "defaultWallWidthMm" ? { key, tab: "standards" } : null;
		default:
			return null;
	}
}

/**
 * A rejected publish, split: the issues an input on the settings screen can
 * carry become marks on that input (by `settingKey`), the rest stay sentences
 * for the banner. `tab` is the first marked input's tab, to open before focus.
 */
export function publishMarks(
	issues: unknown,
	draft: PlannerCatalogue,
): {
	marks: Record<string, string>;
	tab: SettingsTabName | null;
	rest: string[];
} {
	const marks: Record<string, string> = {};
	let tab: SettingsTabName | null = null;
	const unmarked: unknown[] = [];
	if (Array.isArray(issues)) {
		for (const issue of issues) {
			const raw = (issue as { path?: unknown } | null)?.path;
			const path = Array.isArray(raw) ? raw : [];
			const at = settingKey(path);
			if (!at) {
				unmarked.push(issue);
				continue;
			}
			const last = path.at(-1);
			marks[at.key] ??=
				last === "hex"
					? "Enter a colour like #1f5138."
					: last === "label"
						? "Enter a name."
						: "The planner cannot use this value. Enter a whole number that is not negative.";
			tab ??= at.tab;
		}
	}
	return { marks, tab, rest: publishIssueSentences(unmarked, draft) };
}
