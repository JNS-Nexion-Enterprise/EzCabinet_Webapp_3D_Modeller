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
