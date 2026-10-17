import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boxCabinetObj, cornerObj } from "../src/lib/mesh/__tests__/cornerMock";

/**
 * Writes mock designs to upload at /admin/cabinet-designs:
 *   pnpm tsx scripts/generate-corner-mock.ts [outDir]
 * File the two corner units as "Corner base cabinet" and "Corner wall
 * cabinet", Kitchen. The plain boxes are an invented range for a demo
 * catalogue: nothing in them comes from a client's drawing.
 */
const outDir = process.argv[2] ?? "corner-mocks";
mkdirSync(outDir, { recursive: true });
writeFileSync(
	join(outDir, "CB 900mm.obj"),
	cornerObj({ sizeMm: 900, heightMm: 870, armMm: 600, legMm: 100 }),
);
writeFileSync(
	join(outDir, "CW 600mm.obj"),
	cornerObj({ sizeMm: 600, heightMm: 720, armMm: 350, legMm: 0 }),
);
const boxes: [string, number, number, number][] = [
	["Base 600mm", 600, 870, 600],
	["Base 800mm", 800, 870, 600],
	["Base 900mm", 900, 870, 600],
	["Wall 600mm", 600, 720, 350],
	["Wall 800mm", 800, 720, 350],
	["Tall 600mm", 600, 2100, 600],
];
for (const [name, widthMm, heightMm, depthMm] of boxes) {
	writeFileSync(
		join(outDir, `${name}.obj`),
		boxCabinetObj({ widthMm, heightMm, depthMm }),
	);
}
console.log(`wrote ${boxes.length} box cabinets to ${outDir}`);
console.log(`wrote ${outDir}/CB 900mm.obj and ${outDir}/CW 600mm.obj`);
