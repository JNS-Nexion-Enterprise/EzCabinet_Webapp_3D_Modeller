import { describe, expect, it } from "vitest";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
import { publishIssueSentences } from "../publishIssues";

const draft = PLANNER_CATALOGUE;

describe("publishIssueSentences", () => {
	it("names a finish by its label and says what to fix", () => {
		const label = draft.finishes[1].label;
		expect(
			publishIssueSentences([{ path: ["finishes", 1, "hex"] }], draft),
		).toEqual([`Finish "${label}" needs a colour like #1f5138.`]);
	});

	it("names rates, standards, ladder rungs and room walls", () => {
		expect(
			publishIssueSentences(
				[
					{ path: ["rates", "deliveryFlatRm"] },
					{ path: ["construction", "panelThicknessMm"] },
					{ path: ["doorWidthLadderMm", 2] },
					{ path: ["roomTypes", 0, "defaultWallWidthMm"] },
				],
				draft,
			),
		).toEqual([
			"Delivery fee has a value the planner cannot use.",
			"Board thickness has a value the planner cannot use.",
			"Door width ladder, rung 3 has a value the planner cannot use.",
			`${draft.roomTypes[0].label} wall width has a value the planner cannot use.`,
		]);
	});

	it("says each sentence once and skips what is not an issue", () => {
		expect(
			publishIssueSentences(
				[
					{ path: ["rates", "deliveryFlatRm"] },
					{ path: ["rates", "deliveryFlatRm"] },
					{},
				],
				draft,
			),
		).toHaveLength(1);
		expect(publishIssueSentences(undefined, draft)).toEqual([]);
	});
});

import { publishMarks } from "../publishIssues";

describe("publishMarks", () => {
	it("marks settings by their path and opens the first one's tab", () => {
		const out = publishMarks(
			[
				{ path: ["doorWidthLadderMm", 2] },
				{ path: ["rates", "deliveryFlatRm"] },
				{ path: ["finishes", 1, "hex"] },
			],
			draft,
		);
		expect(Object.keys(out.marks)).toEqual([
			"doorWidthLadderMm.2",
			"rates.deliveryFlatRm",
			"finishes.1.hex",
		]);
		expect(out.marks["finishes.1.hex"]).toBe("Enter a colour like #1f5138.");
		expect(out.tab).toBe("doors");
		expect(out.rest).toEqual([]);
	});

	it("keys a door surcharge by its width", () => {
		expect(
			Object.keys(
				publishMarks(
					[{ path: ["doorStyles", 0, "priceRmBySizeMm", "800"] }],
					draft,
				).marks,
			),
		).toEqual(["doorStyles.0.priceRmBySizeMm.800"]);
	});

	it("leaves what no input carries to the banner", () => {
		const out = publishMarks(
			[
				{ path: ["families", 0, "depthMm"] },
				{ path: ["doorStyles", 0, "look"] },
			],
			draft,
		);
		expect(out.marks).toEqual({});
		expect(out.tab).toBeNull();
		expect(out.rest).toHaveLength(2);
	});
});
