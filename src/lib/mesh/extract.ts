import type { Family } from "@/lib/planner/catalogueSchema";
import type { MeshModule, MeshPart, Vec3 } from "./objRead";
import { type ClassifiedPart, LEG_FOOTING_MM, type PartRole } from "./roles";
import type { Grouping, StrategyName } from "./strategies";

/**
 * Turns grouped, classified geometry into a draft catalogue: the module
 * standard, the panel spec, the finish list and the hardware list, as the
 * client actually builds them.
 *
 * The app reads one design at a time and takes only `geometryOf` and `kindOf`
 * from here, through `measureDesign.ts`. `extractCatalogue` is left over from
 * the whole-run import and only tests call it. Nothing here is priced —
 * geometry carries no money, so that decision stays a person's.
 */

/** Mirrors `familySchema.kind`; a cabinet is placed into one of three runs. */
export type ModuleKind = Family["kind"];

export type PartSpec = {
	name: string;
	role: PartRole;
	/** How many of this part in one module. */
	count: number;
	sizeMm: Vec3;
};

/**
 * What the design says a cabinet is made of. This is the part that reaches the
 * customer: the planner draws this many shelves and this many door leaves, so
 * a six-shelf tall unit no longer looks like a one-shelf one.
 */
export type CabinetGeometry = {
	shelves: number;
	fixedShelves: number;
	doorLeaves: number;
	drawers: number;
	hasBack: boolean;
	/** Adjustable feet the cabinet stands on. Zero means it sits on a plinth,
	 * which is what the scene drew for everything before designs could say
	 * otherwise. The client's own base cabinet has four Häfele levellers. */
	legs: number;
	/** How tall those feet are, so the carcass floats by the right amount. */
	legHeightMm: number;
	/** How wide a foot is. The client's Häfele Axilo 48 measures 57mm across;
	 * `parts.ts` guessed 50 for years. Zero means the design did not say. */
	legDiameterMm: number;
	/** How far in from the carcass edge a foot stands — ~45mm on the client's
	 * file, against a hardcoded guess of 60. Zero means the design did not say. */
	legInsetMm: number;
};

export type ModuleSpec = {
	name: string;
	/** How many identical cabinets the job used — a weak popularity signal. */
	count: number;
	kind: ModuleKind;
	widthMm: number;
	depthMm: number;
	heightMm: number;
	/** Height of the cabinet's underside above the floor: ~100 for base units
	 * on a plinth, ~1500 for wall units. This is what separates the classes. */
	floorHeightMm: number;
	geometry: CabinetGeometry;
	/** True if any of this cabinet's roles were guessed from geometry rather
	 * than read off a name — the rows most worth a human glance. */
	inferred: boolean;
	parts: PartSpec[];
};

export type FinishCandidate = {
	/** Slug in the shape `lib/planner/catalogue.ts` uses for finish ids. */
	id: string;
	label: string;
	hex: string;
	texture: string | null;
	/** True when the label is a guess from a filename, which is always: the
	 * exporter destroys material names. The confirm step exists for this. */
	needsReview: boolean;
};

export type HardwareCandidate = { name: string; count: number };

export type CatalogueDraft = {
	sourceVersion: string;
	/** The panel thickness the job is built from — 16mm in the sample. */
	panelThicknessMm: number;
	/** Underside of the lowest base unit: the plinth. */
	plinthHeightMm: number;
	/** How the cabinets were found, and how much to trust it. */
	strategy: StrategyName;
	confidence: Grouping["confidence"];
	modules: ModuleSpec[];
	finishes: FinishCandidate[];
	hardware: HardwareCandidate[];
	/** Anything a human should look at before trusting the draft. */
	warnings: string[];
};

/**
 * `C-Knob_#3` and `C-Knob_01` are the same knob placed twice — the exporter
 * writes a copy index, not a variant. Only a trailing `#n` or `_nn` counts;
 * a name that genuinely ends in a number keeps it.
 */
const stripCopySuffix = (name: string) =>
	name
		.replace(/[_ ]*#\d+$/, "")
		.replace(/_\d{2,}$/, "")
		.trim();

export function slugify(label: string): string {
	return label
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * The exporter emits some panels twice: once as a solid box and once as a flat
 * face with no thickness. Dropping the degenerate twin keeps a part from being
 * counted double, and a zero dimension out of the cut list.
 */
const isSolid = (part: MeshPart) => part.sizeMm.every((d) => d > 0);

function partsOf(classified: ClassifiedPart[]): PartSpec[] {
	const byKey = new Map<string, PartSpec>();

	for (const { part, role } of classified) {
		if (!isSolid(part)) continue;
		const name = stripCopySuffix(part.name);
		// Same name and same size is the same part; same name at a different
		// size is a genuinely different part (a 400 door is not an 800 door).
		const sizeMm = part.sizeMm.map(Math.round) as Vec3;
		const key = `${name}|${sizeMm.join("x")}`;
		const found = byKey.get(key);
		if (found) {
			found.count += 1;
		} else {
			byKey.set(key, { name, role, count: 1, sizeMm });
		}
	}

	return [...byKey.values()].sort(
		(a, b) =>
			volume(b.sizeMm) - volume(a.sizeMm) || a.name.localeCompare(b.name),
	);
}

const volume = (size: Vec3) => size[0] * size[1] * size[2];

/**
 * Which run a cabinet belongs to. Mirrors `familySchema.kind` — a base unit
 * stands on the floor, a wall unit hangs, a tall unit does both.
 */
export function kindOf(floorHeightMm: number, heightMm: number): ModuleKind {
	if (floorHeightMm >= 1200) return "wall";
	if (heightMm >= 1200) return "tall";
	return "base";
}

/** What this cabinet holds, from the parts that were classified in it.
 * Exported because `measureDesign` needs the same answer for a lone cabinet —
 * the fit-out is what tells a six-shelf tall unit from a plain box, and the
 * planner draws from it. */
export function geometryOf(classified: ClassifiedPart[]): CabinetGeometry {
	const solid = classified.filter(({ part }) => isSolid(part));
	const count = (role: PartRole) => solid.filter((c) => c.role === role).length;

	// Legs are hardware standing on the floor. Height is the axis the model is
	// tall on (index 2 after `normalise`), which is what separates a leveller
	// from a handle — a handle is hardware too, but it sits at door height.
	const floorMm = Math.min(...solid.map(({ part }) => part.minMm[2]));
	const legParts = solid.filter(
		({ part, role }) =>
			role === "hardware" && part.minMm[2] <= floorMm + LEG_FOOTING_MM,
	);
	const legHeightMm = legParts.length
		? Math.round(Math.max(...legParts.map(({ part }) => part.sizeMm[2])))
		: 0;

	// A foot is round, so its two horizontal extents are the same; take the
	// larger and let a squarish plinth foot read as its widest point.
	const legDiameterMm = legParts.length
		? Math.round(
				Math.max(
					...legParts.map(({ part }) =>
						Math.max(part.sizeMm[0], part.sizeMm[1]),
					),
				),
			)
		: 0;

	// The gap between the cabinet's own outer edge and the outer edge of the
	// outermost foot — the same edge-to-edge measure `parts.ts` places from.
	// Measured against every solid part rather than the end panels alone,
	// because a design whose ends were not recognised still has a correct
	// overall width.
	//
	// ponytail: one inset for both axes, because parts.ts uses one constant for
	// both. Split into x and z only if a design turns up with feet set
	// differently front-to-back than side-to-side.
	const legInsetMm =
		legParts.length && solid.length
			? Math.max(
					0,
					Math.round(
						Math.min(
							Math.min(...legParts.map(({ part }) => part.minMm[0])) -
								Math.min(...solid.map(({ part }) => part.minMm[0])),
							Math.max(
								...solid.map(({ part }) => part.minMm[0] + part.sizeMm[0]),
							) -
								Math.max(
									...legParts.map(({ part }) => part.minMm[0] + part.sizeMm[0]),
								),
						),
					),
				)
			: 0;

	return {
		shelves: count("shelfAdjustable"),
		fixedShelves: count("shelfFixed"),
		doorLeaves: count("door"),
		drawers: count("drawerFront"),
		hasBack: count("back") > 0,
		legs: legParts.length,
		legHeightMm,
		legDiameterMm,
		legInsetMm,
	};
}

/**
 * The most common smallest-dimension across every solid part. Cabinet parts
 * are sheet goods, so their thinnest axis *is* the board thickness, and the
 * mode shrugs off the odd door or drawer box built from something else.
 */
function panelThickness(modules: MeshModule[]): number {
	const tally = new Map<number, number>();
	for (const module of modules) {
		for (const part of module.parts) {
			if (!isSolid(part)) continue;
			const thin = Math.round(Math.min(...part.sizeMm));
			tally.set(thin, (tally.get(thin) ?? 0) + 1);
		}
	}
	let best = 0;
	let bestCount = 0;
	for (const [thickness, count] of tally) {
		if (count > bestCount) {
			best = thickness;
			bestCount = count;
		}
	}
	return best;
}

/**
 * The exporter's material ids (`7#752#-1`) point at re-encoded texture copies
 * (`RotText12.jpg`) whose bytes no longer match the originals, so a material
 * cannot be traced back to a finish name. What survives is the texture
 * filenames sitting next to the `.obj` — `Rhone Oak.jpg`, `Strata Noir.jpg` —
 * which are the real names, just unattached to anything.
 *
 * So every finish here is a *candidate*: the right label, an unknown colour,
 * and no idea which panels wear it. A human resolves that at the confirm step.
 * Guessing would put a wrong swatch in front of a customer.
 */
function finishesOf(imageNames: string[]): FinishCandidate[] {
	const byId = new Map<string, FinishCandidate>();

	for (const file of imageNames) {
		// `RotText9.jpg` is the exporter's own rotated copy, not a finish.
		if (/^RotText\d*\./i.test(file)) continue;
		const label = file
			.replace(/\.[^.]+$/, "")
			.replace(/^Color[_ ]/i, "")
			.replace(/_/g, " ")
			.trim();
		const id = slugify(label);
		if (!id || byId.has(id)) continue;
		byId.set(id, {
			id,
			label,
			hex: "#cccccc",
			texture: file,
			needsReview: true,
		});
	}

	return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function hardwareOf(rolesByModule: ClassifiedPart[][]): HardwareCandidate[] {
	const tally = new Map<string, number>();
	for (const module of rolesByModule) {
		for (const { part, role } of module) {
			if (role !== "hardware") continue;
			const name = stripCopySuffix(part.name);
			tally.set(name, (tally.get(name) ?? 0) + 1);
		}
	}
	return [...tally.entries()]
		.map(([name, count]) => ({ name, count }))
		.sort((a, b) => b.count - a.count);
}

/** `Base 900 · 3 drawer` — a suggestion the reviewer renames, not an identity. */
function describe(
	kind: ModuleKind,
	widthMm: number,
	geometry: CabinetGeometry,
): string {
	const label = kind[0].toUpperCase() + kind.slice(1);
	const detail = geometry.drawers
		? `${geometry.drawers} drawer`
		: geometry.doorLeaves
			? `${geometry.doorLeaves} door`
			: "open";
	return `${label} ${widthMm} · ${detail}`;
}

export function extractCatalogue({
	sourceVersion,
	grouping,
	imageNames = [],
	droppedCount = 0,
	notes = [],
}: {
	sourceVersion: string;
	grouping: Grouping & { rolesByModule: ClassifiedPart[][] };
	imageNames?: string[];
	droppedCount?: number;
	notes?: string[];
}): CatalogueDraft {
	const specs = new Map<string, ModuleSpec>();

	grouping.modules.forEach((module, i) => {
		const roles = grouping.rolesByModule[i] ?? [];
		if (roles.length === 0) return;

		const [widthMm, depthMm, heightMm] = module.sizeMm.map(Math.round);
		const floorHeightMm = Math.round(module.minMm[2]);
		const geometry = geometryOf(roles);
		const kind = kindOf(floorHeightMm, heightMm);

		// Two cabinets with the same shape *and* the same fit-out are the same
		// product used twice. Keying on the fit-out too matters: a 900 with
		// shelves and a 900 with drawers are not the same cabinet.
		const key = [
			widthMm,
			depthMm,
			heightMm,
			floorHeightMm,
			geometry.shelves,
			geometry.doorLeaves,
			geometry.drawers,
		].join("|");

		const found = specs.get(key);
		if (found) {
			found.count += 1;
			return;
		}

		specs.set(key, {
			name: describe(kind, widthMm, geometry),
			count: 1,
			kind,
			widthMm,
			depthMm,
			heightMm,
			floorHeightMm,
			geometry,
			inferred: roles.some((r) => r.source === "geometry"),
			parts: partsOf(roles),
		});
	});

	const modules = [...specs.values()].sort(
		(a, b) => a.floorHeightMm - b.floorHeightMm || b.widthMm - a.widthMm,
	);

	const warnings = [...notes];
	if (modules.length === 0) {
		warnings.push(
			"No cabinets found in this export. Check that it contains cabinet geometry and not just an annotation layer.",
		);
	}
	if (grouping.confidence !== "high") {
		warnings.push(grouping.note);
	}
	if (droppedCount > 0) {
		warnings.push(
			`${droppedCount} unnamed entities skipped (the exporter's \`G-Object\` geometry — feet, loose meshes).`,
		);
	}
	if (modules.some((module) => module.inferred)) {
		warnings.push(
			"Some panels had no recognisable name, so their role was guessed from shape and position. Check the shelf and door counts on the rows marked inferred.",
		);
	}
	warnings.push(
		"Materials carry no readable names in this format. Finishes below are guessed from texture filenames — name and colour each one before publishing.",
	);

	const bases = modules.filter((module) => module.kind !== "wall");

	return {
		sourceVersion,
		panelThicknessMm: panelThickness(grouping.modules),
		plinthHeightMm: bases.length
			? Math.min(...bases.map((module) => module.floorHeightMm))
			: 0,
		strategy: grouping.strategy,
		confidence: grouping.confidence,
		modules,
		finishes: finishesOf(imageNames),
		hardware: hardwareOf(grouping.rolesByModule),
		warnings,
	};
}
