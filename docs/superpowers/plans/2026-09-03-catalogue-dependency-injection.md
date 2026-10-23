# Catalogue dependency injection — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the published catalogue an explicit parameter everywhere it decides geometry or money, and delete the mutable module-global palette that Known issues 1–3 all share as their root cause.

**Architecture:** `lib/planner/layout.ts` becomes a factory — `plannerEngine(catalogue)` closes over one catalogue and returns the placement functions, so no call site inside the file changes and consumers destructure the engine once instead of editing hundreds of calls. `pricing.ts` stops reading the mutable `RATES` global and takes its rates off the catalogue it is already handed. React gets a `CatalogueProvider` holding `{ catalogue, engine }`; `setActivePlannerCatalogue` and every global lookup it fed (`FAMILIES`, `ROOM_TYPES`, `DOOR_STYLES`, `FINISHES`, `family()`, `roomType()`, `doorStyle()`) are deleted, leaving `catalogue.ts` as pure seed data.

**Tech Stack:** TypeScript, Next.js App Router, React context, Zod (`catalogueSchema.ts`), Vitest, Biome, pnpm.

**Spec:** `CLAUDE.md` → "Known issues" items 1–3, and "The catalogue: two reads, and why". Both state the fix verbatim: _"The fix is to thread the catalogue through `layout.ts` and the client tree (context) the way `pricing.ts` already does."_

## Global Constraints

- **`lib/planner` must stay framework-free.** No React, no three.js imports. The context provider therefore lives in `src/components/planner/`, never in `src/lib/planner/`.
- **Zod is the single source of truth for types.** `catalogueSchema.ts` owns the shapes; `catalogue.ts` re-exports them. Never hand-declare a second copy.
- **Price is computed server-side and never trusts a mutable global.** After this plan, `pricing.ts` imports no value from `catalogue.ts` other than helper functions that take a catalogue argument.
- **Every `lib/planner` function gets a test before it gets a caller.**
- **Commit catalogue _data_ changes separately from code changes** so price history stays greppable. This plan changes no price, no width and no rate value — if a step tempts you to, stop.
- Commands: `pnpm test` (vitest run), `pnpm lint` (biome check .), `pnpm build` (next build). Biome formats with **tabs**; run `pnpm lint` before every commit.
- There is **no component test harness** in this repo — `src/lib/planner/__tests__/` is the whole suite. React-only tasks are verified with `pnpm lint && pnpm build`, and that is stated explicitly where it applies.
- UI copy is sentence case. Prices in RM.

## File structure

| File                                           | Responsibility after this plan                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/lib/planner/catalogue.ts`                 | **Seed data only**, plus the `...In(catalogue, …)` reads. No mutable palette, no `setActivePlannerCatalogue`.    |
| `src/lib/planner/layout.ts`                    | `plannerEngine(catalogue)` factory + catalogue-free helpers (`emptyLayout`, `rowFor`, `setDoor`, limits, types). |
| `src/lib/planner/pricing.ts`                   | Takes a required catalogue; builds its own engine; rates read off the catalogue.                                 |
| `src/lib/planner/parts.ts`                     | Takes an optional `Construction` (defaults to the now-immutable seed).                                           |
| `src/lib/planner/measure.ts`                   | Passes `Construction` through to `parts.ts`.                                                                     |
| `src/components/planner/CatalogueContext.tsx`  | **New.** Provides `{ catalogue, engine }`; exports `useCatalogue()` and `useEngine()`.                           |
| `src/app/planner/PlannerApp.tsx`               | Wraps the tree in the provider. No render-phase mutation.                                                        |
| `src/app/page.tsx`, `src/app/planner/page.tsx` | Build an engine from the fetched catalogue; read room types off it.                                              |

---

### Task 1: Catalogue-explicit reads for families, rooms, construction and rates

`catalogue.ts` already has an `explicit-catalogue reads` section (`sizePriceRmIn`, `doorStyleIn`, `doorPriceRmIn`). Everything later in this plan needs four more of the same shape. Linear scans, deliberately — the existing section documents why (a catalogue holds tens of families; building a Map per call costs more than the scan).

**Files:**
- Modify: `src/lib/planner/catalogue.ts` (add to the `explicit-catalogue reads` section, around line 386–440)
- Test: `src/lib/planner/__tests__/catalogue.test.ts` (create)

**Interfaces:**
- Consumes: `PlannerCatalogue`, `Family`, `RoomType`, `Construction`, `Rates` from `./catalogueSchema`; the existing `CONSTRUCTION` and `RATES` seed objects.
- Produces:
  - `familyIn(catalogue: PlannerCatalogue, familyId: string): Family | undefined`
  - `roomTypeIn(catalogue: PlannerCatalogue, roomId: RoomTypeId): RoomType` — throws on unknown, same as today's `roomType`
  - `defaultWidthMmIn(catalogue: PlannerCatalogue, familyId: string): number`
  - `constructionOf(catalogue: PlannerCatalogue): Construction`
  - `ratesOf(catalogue: PlannerCatalogue): ResolvedRates`
  - `type ResolvedRates = Required<Rates>`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/planner/__tests__/catalogue.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
	CONSTRUCTION,
	constructionOf,
	defaultWidthMmIn,
	familyIn,
	PLANNER_CATALOGUE,
	RATES,
	ratesOf,
	roomTypeIn,
} from "../catalogue";

describe("familyIn", () => {
	it("finds a family in the catalogue passed in", () => {
		expect(familyIn(PLANNER_CATALOGUE, "base-cabinet")?.kind).toBe("base");
	});

	it("is undefined for a family the catalogue does not carry", () => {
		expect(familyIn(PLANNER_CATALOGUE, "no-such-family")).toBeUndefined();
	});

	it("reads the catalogue given, not the seed", () => {
		const trimmed = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.filter(
				(f) => f.id !== "base-cabinet",
			),
		};
		expect(familyIn(trimmed, "base-cabinet")).toBeUndefined();
	});
});

describe("roomTypeIn", () => {
	it("finds a room", () => {
		expect(roomTypeIn(PLANNER_CATALOGUE, "kitchen").label).toBe("Kitchen");
	});

	it("throws on a room the catalogue does not carry", () => {
		const trimmed = {
			...PLANNER_CATALOGUE,
			roomTypes: PLANNER_CATALOGUE.roomTypes.filter((r) => r.id !== "foyer"),
		};
		expect(() => roomTypeIn(trimmed, "foyer")).toThrow(/foyer/);
	});
});

describe("defaultWidthMmIn", () => {
	it("takes the middle rung of the ladder", () => {
		const sizes = familyIn(PLANNER_CATALOGUE, "base-cabinet")?.sizes ?? [];
		expect(defaultWidthMmIn(PLANNER_CATALOGUE, "base-cabinet")).toBe(
			sizes[Math.floor(sizes.length / 2)].widthMm,
		);
	});

	it("falls back to 600 for an unknown family", () => {
		expect(defaultWidthMmIn(PLANNER_CATALOGUE, "no-such-family")).toBe(600);
	});
});

describe("constructionOf", () => {
	it("is the seed when the catalogue overrides nothing", () => {
		expect(constructionOf(PLANNER_CATALOGUE)).toEqual(CONSTRUCTION);
	});

	it("takes the catalogue's own board thickness", () => {
		const thick = {
			...PLANNER_CATALOGUE,
			construction: { ...CONSTRUCTION, panelThicknessMm: 18 },
		};
		expect(constructionOf(thick).panelThicknessMm).toBe(18);
	});

	it("does not mutate the seed", () => {
		constructionOf({
			...PLANNER_CATALOGUE,
			construction: { ...CONSTRUCTION, panelThicknessMm: 18 },
		});
		expect(CONSTRUCTION.panelThicknessMm).toBe(16);
	});
});

describe("ratesOf", () => {
	it("is the seed when the catalogue carries no rates", () => {
		expect(ratesOf(PLANNER_CATALOGUE)).toEqual(RATES);
	});

	it("takes the catalogue's worktop rate", () => {
		const priced = {
			...PLANNER_CATALOGUE,
			rates: { worktopRmPerFt: 275 },
		};
		expect(ratesOf(priced).worktopRmPerFt).toBe(275);
	});

	/** `rates` has one required key and five optional ones, so a real published
	 * catalogue routinely omits some. Absent must mean "keep the fallback",
	 * never "undefined". */
	it("keeps the fallback for the rates a catalogue omits", () => {
		const partial = {
			...PLANNER_CATALOGUE,
			rates: { worktopRmPerFt: 275 },
		};
		expect(ratesOf(partial).skirtingRmPerFt).toBe(RATES.skirtingRmPerFt);
		expect(ratesOf(partial).endPanelTallRm).toBe(RATES.endPanelTallRm);
	});

	it("does not mutate the seed", () => {
		ratesOf({ ...PLANNER_CATALOGUE, rates: { worktopRmPerFt: 275 } });
		expect(RATES.worktopRmPerFt).toBe(200);
	});
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/planner/__tests__/catalogue.test.ts`
Expected: FAIL — `familyIn`, `roomTypeIn`, `defaultWidthMmIn`, `constructionOf`, `ratesOf` are not exported by `../catalogue`.
- [ ] **Step 3: Add the five reads**

In `src/lib/planner/catalogue.ts`, extend the import at the top of the file to pull the two extra schema types:

```ts
import type {
	Construction,
	Family,
	Finish,
	PlannerCatalogue,
	Rates,
	RoomType,
	SizeOption,
} from "./catalogueSchema";
```

and re-export them alongside the existing re-exports:

```ts
export type { Construction, Family, Finish, Rates, RoomType, SizeOption };
```

Then append to the `explicit-catalogue reads` section, immediately after `doorPriceRmIn`:

```ts
/** Every rate resolved — the catalogue's where it sets one, the seed's where
 * it does not. `Rates` has one required key and five optional, so a published
 * catalogue routinely carries only some. */
export type ResolvedRates = Required<Rates>;

export function familyIn(
	catalogue: PlannerCatalogue,
	familyId: string,
): Family | undefined {
	return catalogue.families.find((f) => f.id === familyId);
}

export function roomTypeIn(
	catalogue: PlannerCatalogue,
	roomId: RoomTypeId,
): RoomType {
	const found = catalogue.roomTypes.find((room) => room.id === roomId);
	if (!found) throw new Error(`unknown room type ${roomId}`);
	return found;
}

/** The size a freshly placed cabinet takes: the middle of its ladder. */
export function defaultWidthMmIn(
	catalogue: PlannerCatalogue,
	familyId: string,
): number {
	const sizes = familyIn(catalogue, familyId)?.sizes ?? [];
	return sizes[Math.floor(sizes.length / 2)]?.widthMm ?? 600;
}

/** Workshop constants for this catalogue, the seed filling anything it omits.
 * A fresh object every call — never a reference to the seed, which callers
 * would then be able to mutate. */
export function constructionOf(catalogue: PlannerCatalogue): Construction {
	return { ...CONSTRUCTION, ...catalogue.construction };
}

/** Rates for this catalogue, the seed filling anything it omits. Zod drops
 * absent optional keys rather than setting them to `undefined`, so the spread
 * cannot clobber a fallback with a hole. */
export function ratesOf(catalogue: PlannerCatalogue): ResolvedRates {
	return { ...RATES, ...catalogue.rates };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/planner/__tests__/catalogue.test.ts`
Expected: PASS, 13 tests.
- [ ] **Step 5: Run the whole suite and the linter**

Run: `pnpm test && pnpm lint`
Expected: PASS — nothing else changed yet.
- [ ] **Step 6: Commit**

```bash
git add src/lib/planner/catalogue.ts src/lib/planner/__tests__/catalogue.test.ts
git commit -m "feat(planner): catalogue-explicit reads for families, rooms, construction and rates"
```

---

### Task 2: The catalogue React context

The provider that will hand the live catalogue — and, from Task 6, the engine built from it — to the client tree. Added first and left unused so the tasks that need it can land one at a time.

**Files:**
- Create: `src/components/planner/CatalogueContext.tsx`
- Modify: `src/app/planner/PlannerApp.tsx`

**Interfaces:**
- Consumes: `PlannerCatalogue` from `@/lib/planner/catalogueSchema`.
- Produces:
  - `<CatalogueProvider catalogue={…}>{children}</CatalogueProvider>`
  - `useCatalogue(): PlannerCatalogue`
  - `useEngine()` — declared in Task 6, once `plannerEngine` exists. Do **not** stub it here.

- [ ] **Step 1: Write the provider**

Create `src/components/planner/CatalogueContext.tsx`:

```tsx
"use client";

import { createContext, useContext } from "react";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * The published catalogue, handed down instead of installed into a module
 * global.
 *
 * It replaced `setActivePlannerCatalogue`, which swapped a mutable palette in
 * `catalogue.ts` that every consumer read directly. That made three bugs
 * possible at once — a stale door-price copy, a global mutated during React's
 * render phase, and a server-rendered starter layout priced against a
 * catalogue it was not built from — because "which catalogue is live" was
 * ambient rather than passed. Here it is a value with one owner.
 */
const CatalogueContext = createContext<PlannerCatalogue | null>(null);

export function CatalogueProvider({
	catalogue,
	children,
}: {
	catalogue: PlannerCatalogue;
	children: React.ReactNode;
}) {
	return (
		<CatalogueContext.Provider value={catalogue}>
			{children}
		</CatalogueContext.Provider>
	);
}

/** Throws rather than falling back to the seed: a component rendering the
 * bundled fixtures because someone forgot a provider is exactly the silent
 * wrong-price failure this context exists to make impossible. */
export function useCatalogue(): PlannerCatalogue {
	const catalogue = useContext(CatalogueContext);
	if (!catalogue) {
		throw new Error("useCatalogue outside a CatalogueProvider");
	}
	return catalogue;
}
```

- [ ] **Step 2: Split `PlannerApp` into a provider and the screens it wraps**

`PlannerApp` has three `return` statements (start at line 91, quote at 112, studio at 125), and from Task 6 it will need `useEngine()` itself — which it cannot call inside its own provider. So split it: an outer component that provides, an inner one that consumes.

In `src/app/planner/PlannerApp.tsx`, rename the existing component to `PlannerScreens` and keep its body exactly as it is, then add the new export above it:

```tsx
import { CatalogueProvider } from "@/components/planner/CatalogueContext";

export function PlannerApp({
	initialRoomId,
	catalogue,
	finishTextures,
}: {
	initialRoomId: RoomTypeId;
	/** The live published catalogue. */
	catalogue: PlannerCatalogue;
	/** Finish id → uploaded decor photo, for the finishes that have one. The
	 * same upload that gives the landing page its swatch, so the strip and the
	 * cabinet show the same board. */
	finishTextures: Record<string, string>;
}) {
	return (
		<CatalogueProvider catalogue={catalogue}>
			<PlannerScreens
				initialRoomId={initialRoomId}
				catalogue={catalogue}
				finishTextures={finishTextures}
			/>
		</CatalogueProvider>
	);
}
```

`PlannerScreens` keeps the same props and the same body — including the `setActivePlannerCatalogue(catalogue)` call, which stays until Task 7. Removing it now would blank every palette that still reads the global.
- [ ] **Step 3: Verify**

There is no component test harness in this repo, so the check here is the type-checker and the build.

Run: `pnpm lint && pnpm build`
Expected: PASS. `useCatalogue` is exported and unused — that is intended at this point.
- [ ] **Step 4: Commit**

```bash
git add src/components/planner/CatalogueContext.tsx src/app/planner/PlannerApp.tsx
git commit -m "feat(planner): catalogue react context, provided by PlannerApp"
```

---

### Task 3: Pricing reads its rates off the catalogue, and the catalogue stops being optional

Fixes **Known issue 1** and a fourth, unlisted bug of the same family: `pricing.ts` reads the module-level `RATES` for worktop, ceiling trim, skirting and all three end-panel rates. `setActivePlannerCatalogue` is client-only, so on the server — where CLAUDE.md says price is authoritative — those six rates are always the bundled placeholders, whatever the published catalogue says.

**Files:**
- Modify: `src/lib/planner/pricing.ts`
- Modify: `src/components/planner/QuoteScreen.tsx:44`
- Modify: `src/components/planner/StartScreen.tsx:155`
- Modify: `src/components/planner/StudioScreen.tsx:258`
- Test: `src/lib/planner/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `ratesOf`, `ResolvedRates` from Task 1; `useCatalogue` from Task 2.
- Produces:
  - `computePlannerPrice(layout, finish, catalogue): KitchenPrice` — `catalogue` **required**
  - `endPanelPriceRm(layout, catalogue): { count: number; amountRm: number }`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/planner/__tests__/pricing.test.ts`, inside the existing `describe("catalogue is a real parameter, not just an import default")` block:

```ts
it("charges the catalogue's worktop rate, not the bundled one", () => {
	const priced = {
		...PLANNER_CATALOGUE,
		rates: { worktopRmPerFt: RATES.worktopRmPerFt * 2 },
	};
	const base = computePlannerPrice(run(), "white", PLANNER_CATALOGUE);
	const dear = computePlannerPrice(run(), "white", priced);

	const line = (p: typeof base) =>
		p.categories.find((c) => c.label === "Worktop");
	expect(line(dear)?.amountRm).toBeCloseTo((line(base)?.amountRm ?? 0) * 2, 6);
	expect(line(dear)?.detail).toContain(String(RATES.worktopRmPerFt * 2));
});

it("charges the catalogue's end-panel rates", () => {
	const priced = {
		...PLANNER_CATALOGUE,
		rates: {
			worktopRmPerFt: RATES.worktopRmPerFt,
			endPanelBaseRm: 1,
			endPanelWallRm: 1,
			endPanelTallRm: 1,
		},
	};
	const panels = endPanelPriceRm(run(), priced);
	expect(panels.amountRm).toBe(panels.count);
});

it("charges the catalogue's skirting and ceiling-trim rates", () => {
	const priced = {
		...PLANNER_CATALOGUE,
		rates: {
			worktopRmPerFt: RATES.worktopRmPerFt,
			skirtingRmPerFt: RATES.skirtingRmPerFt * 3,
			ceilingTrimRmPerFt: RATES.ceilingTrimRmPerFt * 3,
		},
	};
	const flush = setWallToCeiling(run(), true);
	const base = computePlannerPrice(flush, "white", PLANNER_CATALOGUE);
	const dear = computePlannerPrice(flush, "white", priced);

	const amount = (p: typeof base, label: string) =>
		p.categories.find((c) => c.label === label)?.amountRm ?? 0;
	expect(amount(dear, "Skirting")).toBeCloseTo(amount(base, "Skirting") * 3, 6);
	expect(amount(dear, "Ceiling trim")).toBeCloseTo(
		amount(base, "Ceiling trim") * 3,
		6,
	);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/planner/__tests__/pricing.test.ts`
Expected: FAIL — the doubled catalogue produces the same total, because the rates come from the module global. (`endPanelPriceRm` also fails to compile with two arguments.)
- [ ] **Step 3: Rewrite `pricing.ts` to take its rates from the catalogue**

Replace the import block at the top of `src/lib/planner/pricing.ts`:

```ts
import {
	doorPriceRmIn,
	doorStyleIn,
	type FinishId,
	type ModuleKind,
	ratesOf,
	type ResolvedRates,
	sizePriceRmIn,
} from "./catalogue";
```

`PLANNER_CATALOGUE` and `RATES` are gone from this file — that is the point of the task.

Change `cabinetPriceRm` so its catalogue is required:

```ts
function cabinetPriceRm(
 placed: Positioned,
 catalogue: PlannerCatalogue,
): {
 carcassRm: number;
 doorRm: number;
} {
```

Re-key the end-panel rate table onto the resolved rates:

```ts
const END_PANEL_RM: Record<ModuleKind, keyof ResolvedRates> = {
	base: "endPanelBaseRm",
	wall: "endPanelWallRm",
	tall: "endPanelTallRm",
};
```

Give `endPanelPriceRm` the catalogue:

```ts
export function endPanelPriceRm(
	layout: PlannerLayout,
	catalogue: PlannerCatalogue,
): {
	count: number;
	amountRm: number;
} {
	const rates = ratesOf(catalogue);
	const panels = endPanels(layout);
	return {
		count: panels.length,
		amountRm: panels.reduce(
			(total, panel) => total + rates[END_PANEL_RM[panel.kind]],
			0,
		),
	};
}
```

In `computePlannerPrice`, drop the default and resolve the rates once:

```ts
export function computePlannerPrice(
 layout: PlannerLayout,
 _finish: FinishId,
 catalogue: PlannerCatalogue,
): KitchenPrice {
 const rates = ratesOf(catalogue);
```

then replace every `RATES.` in the body with `rates.`, and the end-panel call with `endPanelPriceRm(layout, catalogue)`:

```ts
const panels = endPanelPriceRm(layout, catalogue);
```

```ts
  {
   label: "Worktop",
   detail: `${tops.toFixed(2)} ft @ RM ${rates.worktopRmPerFt}/ft`,
   amountRm: tops * rates.worktopRmPerFt,
  },
```

```ts
categories.push({
	label: "Ceiling trim",
	detail: `${trim.toFixed(2)} ft @ RM ${rates.ceilingTrimRmPerFt}/ft`,
	amountRm: trim * rates.ceilingTrimRmPerFt,
});
```

```ts
categories.push({
	label: "Skirting",
	detail: `${skirting.toFixed(2)} ft @ RM ${rates.skirtingRmPerFt}/ft`,
	amountRm: skirting * rates.skirtingRmPerFt,
});
```

Finally, delete the now-lying doc comment on `WORKTOP_RM_PER_FT`, replacing it with the truth:

```ts
/** PLACEHOLDER. Kept for the copy on the landing page; the priced figure comes
 * from the catalogue's `rates.worktopRmPerFt` via `ratesOf`. */
export const WORKTOP_RM_PER_FT = 200;
```

- [ ] **Step 4: Pass the catalogue at the three component call sites**

`src/components/planner/QuoteScreen.tsx` — add the import and use it at line 44:

```tsx
import { useCatalogue } from "./CatalogueContext";
```

```tsx
const catalogue = useCatalogue();
const price = computePlannerPrice(layout, finish, catalogue);
```

`src/components/planner/StartScreen.tsx` — same, at line 155:

```tsx
import { useCatalogue } from "./CatalogueContext";
```

```tsx
const catalogue = useCatalogue();
const starterPrice = computePlannerPrice(starter, "strata-noir", catalogue);
```

`src/components/planner/StudioScreen.tsx` — same, at line 258:

```tsx
import { useCatalogue } from "./CatalogueContext";
```

```tsx
const catalogue = useCatalogue();
const price = computePlannerPrice(layout, finish, catalogue);
```

`src/app/page.tsx:163` already passes its catalogue — leave it alone.
- [ ] **Step 5: Pass the catalogue at every test call site**

In `src/lib/planner/__tests__/pricing.test.ts`, the seed catalogue is the right one for these tests — they are asserting the engine, not a publish. Rather than editing ~35 calls, add a local wrapper directly under the existing `run()` helper and rename the calls to it:

```ts
/** These tests price against the bundled seed. Named so a reader can see at a
 * glance which catalogue a figure came from — the whole point of the
 * parameter. */
const price = (layout: PlannerLayout, finish = "white") =>
	computePlannerPrice(layout, finish, PLANNER_CATALOGUE);
```

Then run the mechanical rewrite over the file:

```bash
sed -i '' -E 's/computePlannerPrice\((.*), "white"\)/price(\1)/g' src/lib/planner/__tests__/pricing.test.ts
```

Review the diff by hand afterwards — the three tests you added in Step 1 pass an explicit catalogue and must keep doing so, and the two existing tests in `describe("catalogue is a real parameter…")` that compare `PLANNER_CATALOGUE` against `pricier` must keep their explicit third argument. Add `import type { PlannerLayout } from "../layout";` if it is not already imported, and fix the one `endPanelPriceRm(` call in the file to pass `PLANNER_CATALOGUE`.
- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, including the three new rate tests.
- [ ] **Step 7: Lint, build, commit**

```bash
pnpm lint && pnpm build
git add src/lib/planner/pricing.ts src/lib/planner/__tests__/pricing.test.ts \
  src/components/planner/QuoteScreen.tsx src/components/planner/StartScreen.tsx \
  src/components/planner/StudioScreen.tsx
git commit -m "fix(planner): price against the catalogue's rates, not a mutable global"
```

---

### Task 4: `parts.ts` takes its construction as an argument

`parts.ts` reads the mutable `CONSTRUCTION` for board thickness, plinth height and the two-leaf threshold. Task 7 freezes that object, so the fallback geometry and the measuring tool would silently keep using 16mm board for a client whose catalogue says otherwise.

This one keeps a **default**, unlike `pricing.ts` and `layout.ts`, and the difference is deliberate: after Task 7 the seed is immutable, so defaulting to it is a documented constant rather than "whatever was installed last". `parts.ts` draws the _fallback_ cabinet — it decides no money and no placement — and a required argument here would churn ~25 assertions in `parts.test.ts` for no bug caught.

**Files:**
- Modify: `src/lib/planner/catalogue.ts` (`doorLeavesFor`)
- Modify: `src/lib/planner/parts.ts:97` (`standOf`), `:147`, `:164` (`cabinetPartsMm`), `:169`
- Modify: `src/lib/planner/measure.ts:209` (`designPartBoxes`)
- Modify: `src/components/planner/Cabinet.tsx:141,151`
- Modify: `src/components/planner/PlannerScene.tsx:707,714`
- Test: `src/lib/planner/__tests__/parts.test.ts`

**Interfaces:**
- Consumes: `Construction`, `CONSTRUCTION`, `constructionOf` from Task 1; `useCatalogue` from Task 2.
- Produces:
  - `doorLeavesFor(widthMm: number, thresholdMm?: number): number`
  - `standOf(family: Family, construction?: Construction): { heightMm: number; legs: number; insetMm: number }`
  - `cabinetPartsMm(family: Family, widthMm: number, hasDoor: boolean, construction?: Construction): PartBoxMm[]`
  - `designPartBoxes(…existing args…, construction?: Construction)` — keep the existing parameter order and append

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/planner/__tests__/parts.test.ts`:

```ts
describe("construction comes from the catalogue, not a global", () => {
	const thicker = { ...CONSTRUCTION, panelThicknessMm: 25 };

	it("draws sides at the construction's board thickness", () => {
		const side = cabinetPartsMm(base, 600, false, thicker).find(
			(part) => part.role === "side",
		);
		expect(side?.sizeMm.x).toBe(25);
	});

	it("stands a plinth at the construction's plinth height", () => {
		const plinthy = { ...CONSTRUCTION, plinthHeightMm: 140 };
		expect(standOf(base, plinthy).heightMm).toBe(140);
	});

	it("splits into two leaves at the construction's threshold", () => {
		const early = { ...CONSTRUCTION, doorLeavesThresholdMm: 400 };
		const leaves = cabinetPartsMm(base, 600, true, early).filter(
			(part) => part.role === "doorLeaf",
		);
		expect(leaves).toHaveLength(2);
	});

	it("keeps the seed when no construction is given", () => {
		const side = cabinetPartsMm(base, 600, false).find(
			(part) => part.role === "side",
		);
		expect(side?.sizeMm.x).toBe(CONSTRUCTION.panelThicknessMm);
	});
});
```

Add `CONSTRUCTION` to the file's existing `from "../catalogue"` import if it is not already there. `base` is the fixture the existing tests in this file already use — reuse it rather than defining another.
- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test src/lib/planner/__tests__/parts.test.ts`
Expected: FAIL — `cabinetPartsMm` takes three arguments, `standOf` takes one.
- [ ] **Step 3: Thread construction through**

`src/lib/planner/catalogue.ts` — give `doorLeavesFor` the threshold:

```ts
/** How many door leaves a carcass of this width carries. */
export const doorLeavesFor = (
	widthMm: number,
	thresholdMm: number = CONSTRUCTION.doorLeavesThresholdMm,
) => (widthMm > thresholdMm ? 2 : 1);
```

`src/lib/planner/parts.ts` — take the import as a type plus the seed:

```ts
import {
	type Construction,
	CONSTRUCTION,
	doorLeavesFor,
	type Family,
} from "./catalogue";
```

`standOf` (line 97) gains the parameter, and its `CONSTRUCTION.plinthHeightMm` read at line 110 becomes `construction.plinthHeightMm`:

```ts
export function standOf(
 family: Family,
 construction: Construction = CONSTRUCTION,
) {
```

Line 147's leaf count passes the threshold:

```ts
  doorLeaves:
   family.geometry?.doorLeaves ||
   doorLeavesFor(widthMm, construction.doorLeavesThresholdMm),
```

— which means the function containing line 147 needs the parameter too. `cabinetPartsMm` (line 164) gains it and passes it on:

```ts
export function cabinetPartsMm(
 family: Family,
 widthMm: number,
 hasDoor: boolean,
 construction: Construction = CONSTRUCTION,
): PartBoxMm[] {
 const t = construction.panelThicknessMm;
 const stand = standOf(family, construction);
```

Follow the type errors from there: any private helper in the file that reads `CONSTRUCTION` takes `construction: Construction` as a required parameter (they are internal, so no default) and its callers pass theirs down.
- [ ] **Step 4: Pass it at the callers that have a live catalogue**

`src/lib/planner/measure.ts` — `designPartBoxes` (the function containing line 209) appends an optional `construction` and forwards it:

```ts
const parts = cabinetPartsMm(
	position.family,
	position.widthMm,
	position.placed.doorStyleId !== null,
	construction,
);
```

with the parameter declared as `construction: Construction = CONSTRUCTION` and `import { type Construction, CONSTRUCTION, WALL_GAP_MM } from "./catalogue";`. Forward it from `snapToCabinet` too, appending the same optional parameter there — `snapToCabinet` is what `PlannerScene` calls.

`src/components/planner/Cabinet.tsx`:

```tsx
import { useCatalogue } from "./CatalogueContext";
import { constructionOf } from "@/lib/planner/catalogue";
```

```tsx
const construction = constructionOf(useCatalogue());
const stand = standOf(family, construction);
```

```tsx
const parts = cabinetPartsMm(family, widthMm, door !== null, construction);
```

`src/components/planner/PlannerScene.tsx` — replace the two `CONSTRUCTION.worktopThicknessMm` reads (lines 707 and 714) with a value taken from the catalogue, and pass the same object into `snapToCabinet`:

```tsx
const construction = constructionOf(useCatalogue());
```

Drop `CONSTRUCTION` from its `@/lib/planner/catalogue` import and add `constructionOf`. Note that `PlannerScene` renders inside `<Canvas>`; React context crosses the R3F reconciler boundary in `@react-three/fiber` v8+, but if the value comes back `null` at runtime, read it in the outer component and pass it down as a prop rather than reaching for a workaround.
- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS. The ~25 existing `cabinetPartsMm` / `standOf` calls in `parts.test.ts`, `measure.test.ts` and `layout.test.ts` are unchanged and still pass, because the parameter is optional.
- [ ] **Step 6: Lint, build, commit**

```bash
pnpm lint && pnpm build
git add src/lib/planner/catalogue.ts src/lib/planner/parts.ts src/lib/planner/measure.ts \
  src/lib/planner/__tests__/parts.test.ts src/components/planner/Cabinet.tsx \
  src/components/planner/PlannerScene.tsx
git commit -m "feat(planner): parts and measuring take construction from the catalogue"
```

---

### Task 5: `plannerEngine(catalogue)` — layout.ts stops reading the global palette

The core of the plan. `layout.ts` resolves a `familyId` into a `Family` in one private function (`positioned`, line 136) and a `roomId` into a `RoomType` in one place (`starterFor`, line 1067) — but nearly every exported function reaches one of those transitively, so an explicit parameter would mean editing ~400 call sites across the components and 201 in `layout.test.ts` alone.

A factory avoids all of them: `plannerEngine(catalogue)` closes over the catalogue, the function bodies are untouched, and consumers destructure once. Catalogue-free exports (`emptyLayout`, `rowFor`, `setDoor`, `setHinge`, `setDoors`, `SNAP_MM`, `WALL_LIMITS`, and every type) stay at module scope — moving them in would buy nothing and cost every import.

**Files:**
- Modify: `src/lib/planner/layout.ts`
- Modify: `src/lib/planner/pricing.ts`
- Test: `src/lib/planner/__tests__/layout.test.ts`, `src/lib/planner/__tests__/exposure.test.ts`, `src/lib/planner/__tests__/measure.test.ts`, `src/lib/planner/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: `familyIn`, `roomTypeIn`, `defaultWidthMmIn`, `constructionOf` from Task 1.
- Produces:
  - `plannerEngine(catalogue: PlannerCatalogue): PlannerEngine`
  - `type PlannerEngine = ReturnType<typeof plannerEngine>` — every function listed in Step 3's returned object, with today's signatures unchanged
  - Still module-scope, unchanged: `emptyLayout`, `rowFor`, `setDoor`, `setHinge`, `setDoors`, `newId`, `SNAP_MM`, `WALL_LIMITS`, and the types `PlannerLayout`, `Positioned`, `Row`, `HingeSide`, `EndPanel`, `SkirtingSpan`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/planner/__tests__/layout.test.ts`:

```ts
describe("the engine is bound to the catalogue it was given", () => {
	it("places off the catalogue's own size ladder", () => {
		const narrow = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.map((f) =>
				f.id === "base-cabinet"
					? { ...f, sizes: [{ widthMm: 500, priceRm: 1 }] }
					: f,
			),
		};
		const engine = plannerEngine(narrow);
		const placed = engine.addModule(emptyLayout(4000), "base-cabinet", 0);
		expect(placed.floor[0].widthMm).toBe(500);
	});

	it("refuses a family the catalogue does not carry", () => {
		const without = {
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.filter(
				(f) => f.id !== "base-cabinet",
			),
		};
		const engine = plannerEngine(without);
		expect(engine.fits(emptyLayout(4000), "base-cabinet")).toBe(false);
		expect(
			engine.addModule(emptyLayout(4000), "base-cabinet", 0).floor,
		).toHaveLength(0);
	});

	it("builds a starter from the catalogue's own room, not the seed's", () => {
		const short = {
			...PLANNER_CATALOGUE,
			roomTypes: PLANNER_CATALOGUE.roomTypes.map((r) =>
				r.id === "kitchen"
					? { ...r, starter: [{ familyId: "base-cabinet", widthMm: 600 }] }
					: r,
			),
		};
		expect(plannerEngine(short).starterFor("kitchen").floor).toHaveLength(1);
	});

	it("two engines over two catalogues do not see each other", () => {
		const a = plannerEngine(PLANNER_CATALOGUE);
		const b = plannerEngine({
			...PLANNER_CATALOGUE,
			families: PLANNER_CATALOGUE.families.filter(
				(f) => f.id !== "base-cabinet",
			),
		});
		expect(a.fits(emptyLayout(4000), "base-cabinet")).toBe(true);
		expect(b.fits(emptyLayout(4000), "base-cabinet")).toBe(false);
	});
});
```

Add `PLANNER_CATALOGUE` to the existing `from "../catalogue"` import and `plannerEngine` to the `from "../layout"` import.
- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/lib/planner/__tests__/layout.test.ts`
Expected: FAIL — `plannerEngine` is not exported by `../layout`.
- [ ] **Step 3: Wrap the catalogue-dependent functions in the factory**

In `src/lib/planner/layout.ts`, replace the import block:

```ts
import {
	CEILING_LIMITS,
	CEILING_TRIM_MM,
	type Construction,
	constructionOf,
	DEFAULT_CEILING_MM,
	DEFAULT_ROOM_DEPTH_MM,
	defaultWidthMmIn,
	type Family,
	familyIn,
	type ModuleKind,
	ROOM_DEPTH_LIMITS,
	type RoomTypeId,
	roomTypeIn,
	WALL_CABINET_FLOOR_MM,
	WALL_HANG_LIMITS,
} from "./catalogue";
import type { PlannerCatalogue } from "./catalogueSchema";
import { exposedSides } from "./exposure";
import { standOf } from "./parts";
```

Then add the factory. Everything from `positioned` (line 136) to the end of the file moves inside it, **with the function bodies unchanged** — the only edits inside are three substitutions:

| Was                        | Becomes                                  |
| -------------------------- | ---------------------------------------- |
| `family(id)`               | `familyIn(catalogue, id)`                |
| `roomType(roomId)`         | `roomTypeIn(catalogue, roomId)`          |
| `defaultWidthMm(familyId)` | `defaultWidthMmIn(catalogue, familyId)`  |
| `standOf(position.family)` | `standOf(position.family, construction)` |

Leave at module scope, above the factory: `SNAP_MM`, `rowFor`, `emptyLayout`, `newId`/`counter`, `clampToWall`, `overlapsAnything`, `isPositioned`, `find`, `withX`, `setDoor`, `setHinge`, `setDoors`, `WALL_LIMITS`, and every `type`/`export type`. None of them touch the catalogue.

**Exactly these move inside the factory**, in the order they already appear, each body byte-for-byte unchanged except for the four substitutions above. Change `export function foo` to `function foo` as they move — the factory's returned object is what exports them now.

Private: `positioned`, `clampX`, `snapTargets`, `snapX`, `placementFor`, `evictBlockedWallUnits`.
Public: `positionsOf`, `allPositions`, `rowEndMm`, `occupiedSpans`, `freeSpans`, `moveModule`, `dropModule`, `firstFreeXMm`, `fits`, `addModule`, `removeModules`, `removeModule`, `duplicateModule`, `setHangingHeight`, `setWallToCeiling`, `setWallToWall`, `setBaseSkirting`, `hangingHeightMmOf`, `endPanels`, `skirtingSpans`, `floorHeightMmOf`, `flushWallToTallTops`, `runExtentMm`, `minWallWidthMm`, `setWallWidth`, `setRoomDepth`, `setCeilingHeight`, `overhangMm`, `overhangingIds`, `closeGaps`, `setWidth`, `widthOptionsFor`, `starterFor`.

Several of these (`removeModule`, `setRoomDepth`, `setBaseSkirting`) do not touch the catalogue today, but they are moved anyway: splitting the surface so a caller imports half from the module and destructures the other half is the kind of seam nobody remembers the rule for. The line is "operates on a `PlannerLayout` and could ever need a family" — everything on that side lives on the engine.

Everything else stays at module scope, above the factory: `SNAP_MM`, `rowFor`, `emptyLayout`, `counter`/`newId`, `clampToWall`, `overlapsAnything`, `isPositioned`, `find`, `withX`, `setDoor`, `setHinge`, `setDoors`, `WALL_LIMITS`, and every `type` / `export type` (`PlacedModule`, `PlannerLayout`, `Positioned`, `Row`, `HingeSide`, `EndPanel`, `SkirtingSpan`).

```ts
/**
 * The placement engine, bound to one catalogue.
 *
 * A factory rather than a `catalogue` parameter on each function: `positioned`
 * is the only place a `familyId` becomes a `Family`, but almost every export
 * reaches it, so an explicit parameter would have meant editing several
 * hundred call sites to fix three bugs. Closing over the catalogue leaves
 * every body and every call unchanged and still makes "which catalogue"
 * a value with an owner rather than a module global.
 *
 * Cheap to build — it allocates closures, not indexes — but build it once per
 * catalogue anyway (`useMemo` in the client tree) so React sees stable
 * identities.
 */
export function plannerEngine(catalogue: PlannerCatalogue) {
	const construction: Construction = constructionOf(catalogue);

	const positioned = (placed: PlacedModule): Positioned | null => {
		const found = familyIn(catalogue, placed.familyId);
		return found
			? { placed, family: found, widthMm: placed.widthMm, xMm: placed.xMm }
			: null;
	};

	// … the functions listed above, moved in order, bodies unchanged …

	return {
		positionsOf,
		allPositions,
		rowEndMm,
		occupiedSpans,
		freeSpans,
		moveModule,
		dropModule,
		firstFreeXMm,
		fits,
		addModule,
		removeModules,
		removeModule,
		duplicateModule,
		setHangingHeight,
		setWallToCeiling,
		setWallToWall,
		setBaseSkirting,
		hangingHeightMmOf,
		endPanels,
		skirtingSpans,
		floorHeightMmOf,
		flushWallToTallTops,
		runExtentMm,
		minWallWidthMm,
		setWallWidth,
		setRoomDepth,
		setCeilingHeight,
		overhangMm,
		overhangingIds,
		closeGaps,
		setWidth,
		widthOptionsFor,
		starterFor,
	};
}

export type PlannerEngine = ReturnType<typeof plannerEngine>;
```

`addModule` and `fits` currently default `widthMm` to `defaultWidthMm(familyId)` in the parameter list. That default now needs the catalogue, which the closure has, so the parameter list is fine as written — but make the defaults explicit rather than relying on evaluation order:

```ts
 function fits(
  layout: PlannerLayout,
  familyId: string,
  widthMm: number = defaultWidthMmIn(catalogue, familyId),
 ): boolean {
```

Two functions that are still module-scope call into the engine's set — `setDoors` calls `setDoor` (both catalogue-free, fine), and `flushWallToTallTops` calls `setHangingHeight` (both inside the factory, fine). If the type-checker finds any other module-scope function reaching an engine function, move it inside the factory and add it to the returned object.
- [ ] **Step 4: Point `pricing.ts` at an engine built from its own catalogue**

This is the fix for the deepest part of **Known issue 3**: `positionsOf` resolved families off the global palette, so on the server `position.family` was a seed family while `sizePriceRmIn` looked the width up in the published one — and mismatched widths fell through `?? 0`.

In `src/lib/planner/pricing.ts`, drop `endPanels`, `positionsOf` and `skirtingSpans` from the `./layout` import (keep the types) and add `plannerEngine`:

```ts
import { plannerEngine, type PlannerLayout, type Positioned } from "./layout";
```

Each exported function that walks the layout now builds an engine from the catalogue it is given, which means `worktopFt`, `ceilingTrimFt` and `skirtingFt` gain a required `catalogue` parameter:

```ts
export function worktopFt(
	layout: PlannerLayout,
	catalogue: PlannerCatalogue,
): number {
	const mm = plannerEngine(catalogue)
		.positionsOf(layout, "floor")
		.filter((position) => position.family.hasWorktop)
		.reduce((total, position) => total + position.widthMm, 0);
	return ftOf(mm);
}
```

```ts
export function ceilingTrimFt(
	layout: PlannerLayout,
	catalogue: PlannerCatalogue,
): number {
	if (!layout.wallToCeiling) return 0;
	const mm = plannerEngine(catalogue)
		.positionsOf(layout, "wall")
		.reduce((total, position) => total + position.widthMm, 0);
	return ftOf(mm);
}
```

```ts
export function skirtingFt(
	layout: PlannerLayout,
	catalogue: PlannerCatalogue,
): number {
	const mm = plannerEngine(catalogue)
		.skirtingSpans(layout)
		.reduce((total, span) => total + (span.endMm - span.startMm), 0);
	return ftOf(mm);
}
```

`endPanelPriceRm` uses `plannerEngine(catalogue).endPanels(layout)`. `computePlannerPrice` builds the engine once at the top and passes `catalogue` down to the four helpers:

```ts
const engine = plannerEngine(catalogue);
const placed: Positioned[] = [
	...engine.positionsOf(layout, "floor"),
	...engine.positionsOf(layout, "wall"),
];
```

```ts
const tops = worktopFt(layout, catalogue);
const trim = ceilingTrimFt(layout, catalogue);
const skirting = skirtingFt(layout, catalogue);
const panels = endPanelPriceRm(layout, catalogue);
```

- [ ] **Step 5: Destructure the engine at the top of each test file**

No test body changes. In `src/lib/planner/__tests__/layout.test.ts`, replace the whole `from "../layout"` import with the catalogue-free names plus a destructured engine:

```ts
import {
	emptyLayout,
	plannerEngine,
	type PlannerLayout,
	type Row,
	rowFor,
	setDoor,
	setDoors,
	setHinge,
	SNAP_MM,
	WALL_LIMITS,
} from "../layout";

/** The seed is the right catalogue for engine tests: they assert placement
 * rules, not a publish. Destructured so the assertions below read exactly as
 * they did when these were module functions. */
const {
	addModule,
	closeGaps,
	dropModule,
	duplicateModule,
	endPanels,
	firstFreeXMm,
	fits,
	floorHeightMmOf,
	flushWallToTallTops,
	freeSpans,
	hangingHeightMmOf,
	minWallWidthMm,
	moveModule,
	occupiedSpans,
	overhangingIds,
	overhangMm,
	positionsOf,
	removeModule,
	removeModules,
	runExtentMm,
	setBaseSkirting,
	setCeilingHeight,
	setHangingHeight,
	setRoomDepth,
	setWallToCeiling,
	setWallToWall,
	setWallWidth,
	setWidth,
	skirtingSpans,
	starterFor,
	widthOptionsFor,
} = plannerEngine(PLANNER_CATALOGUE);
```

Do the same in `exposure.test.ts` (`addModule`, `positionsOf`), `measure.test.ts` (`addModule`, `allPositions`) and `pricing.test.ts` (`addModule`, `removeModule`, `setBaseSkirting`, `setWallToCeiling`, `setWallToWall`, `setWallWidth`, `setWidth`, `starterFor`) — keeping `emptyLayout` and `setDoor` as plain imports, since they stayed at module scope. In `pricing.test.ts`, also pass `PLANNER_CATALOGUE` to the `worktopFt` / `ceilingTrimFt` / `skirtingFt` calls.
- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test`
Expected: PASS, including the four new engine tests.
- [ ] **Step 7: Commit**

The app does not build yet — the components still import the deleted module-level `addModule` and friends. That is Task 6. Commit `lib/` on its own so the refactor is reviewable apart from the call-site churn.

```bash
pnpm lint
git add src/lib/planner/layout.ts src/lib/planner/pricing.ts src/lib/planner/__tests__/
git commit -m "refactor(planner): bind the layout engine to an explicit catalogue"
```

---

### Task 6: The client tree and the server pages take their engine from the catalogue

Fixes **Known issue 3** outright: `app/page.tsx` builds its starter layout from the same catalogue it prices it against.

**Files:**
- Modify: `src/components/planner/CatalogueContext.tsx` (add `useEngine`)
- Modify: `src/app/planner/PlannerApp.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`
- Modify: `src/components/planner/PlannerScene.tsx`
- Modify: `src/components/planner/StartScreen.tsx`
- Modify: `src/components/planner/QuoteScreen.tsx`
- Modify: `src/app/page.tsx:148-170`

**Interfaces:**
- Consumes: `plannerEngine`, `PlannerEngine` from Task 5; `CatalogueProvider`, `useCatalogue` from Task 2.
- Produces: `useEngine(): PlannerEngine`

- [ ] **Step 1: Put the engine in the context**

The provider builds it once, so every consumer shares one identity and `useMemo`/`useCallback` deps downstream stay honest. Rewrite the context value in `src/components/planner/CatalogueContext.tsx`:

```tsx
"use client";

import { createContext, useContext, useMemo } from "react";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import { type PlannerEngine, plannerEngine } from "@/lib/planner/layout";

type CatalogueValue = { catalogue: PlannerCatalogue; engine: PlannerEngine };

const CatalogueContext = createContext<CatalogueValue | null>(null);

export function CatalogueProvider({
	catalogue,
	children,
}: {
	catalogue: PlannerCatalogue;
	children: React.ReactNode;
}) {
	// One engine per catalogue, not one per consumer: the closures it returns
	// end up in hook dependency arrays downstream.
	const value = useMemo(
		() => ({ catalogue, engine: plannerEngine(catalogue) }),
		[catalogue],
	);
	return (
		<CatalogueContext.Provider value={value}>
			{children}
		</CatalogueContext.Provider>
	);
}

function use(): CatalogueValue {
	const value = useContext(CatalogueContext);
	if (!value) throw new Error("useCatalogue outside a CatalogueProvider");
	return value;
}

export const useCatalogue = (): PlannerCatalogue => use().catalogue;
export const useEngine = (): PlannerEngine => use().engine;
```

- [ ] **Step 2: `PlannerScreens` builds its starters from the live catalogue**

`initialRooms()` currently maps over the module-level `ROOM_TYPES` and calls the module-level `starterFor`. Both go. `PlannerScreens` sits inside the provider (Task 2), so it reads `useEngine()`; `initialRooms` is called from a `useState` initializer, so it takes the engine as an argument rather than calling a hook. Its other two global reads go at the same time: `removeModules` (line 74) comes off the engine, and `roomType(roomId)` (line 102) becomes `roomTypeIn(catalogue, roomId)`.

In `src/app/planner/PlannerApp.tsx`:

```tsx
import { plannerEngine } from "@/lib/planner/layout";
```

```tsx
/** Every room starts from its own preset, and keeps its own work. */
const initialRooms = (
	catalogue: PlannerCatalogue,
): Record<RoomTypeId, PlannerLayout> => {
	const engine = plannerEngine(catalogue);
	return Object.fromEntries(
		catalogue.roomTypes.map((room) => [room.id, engine.starterFor(room.id)]),
	) as Record<RoomTypeId, PlannerLayout>;
};
```

and inside `PlannerScreens`:

```tsx
const { removeModules, starterFor } = useEngine();
const [rooms, setRooms] = useState<Record<RoomTypeId, PlannerLayout>>(() =>
	initialRooms(catalogue),
);
```

Drop `ROOM_TYPES`, `roomType` and `starterFor` from the `@/lib/planner/catalogue` and `@/lib/planner/layout` imports, add `roomTypeIn`, and keep `emptyLayout` — it stayed at module scope. Keep `setActivePlannerCatalogue` for now (Task 7 deletes it).
- [ ] **Step 3: Move the four screens onto the engine**

In each of `StudioScreen.tsx`, `PlannerScene.tsx`, `StartScreen.tsx` and `QuoteScreen.tsx`, destructure the engine once near the top of the component and delete the corresponding names from the `@/lib/planner/layout` import:

```tsx
const catalogue = useCatalogue();
const {
	addModule,
	allPositions,
	closeGaps,
	/* …the names this file actually calls… */
} = useEngine();
```

Keep importing `emptyLayout`, `setDoor`, `setHinge`, `setDoors`, `rowFor`, `SNAP_MM`, `WALL_LIMITS` and the types straight from `@/lib/planner/layout` — they never moved.

At the same time, swap the palette reads in those files onto the catalogue, since Task 7 deletes the globals:

| File                         | Was                               | Becomes                                                   |
| ---------------------------- | --------------------------------- | --------------------------------------------------------- |
| `StudioScreen.tsx:385`       | `ROOM_TYPES.map`                  | `catalogue.roomTypes.map`                                 |
| `StudioScreen.tsx:868,1005`  | `DOOR_STYLES.map`                 | `catalogue.doorStyles.map`                                |
| `StudioScreen.tsx:1059,1080` | `FINISHES`                        | `catalogue.finishes`                                      |
| `StudioScreen.tsx`           | `family(id)`                      | `familyIn(catalogue, id)`                                 |
| `StudioScreen.tsx`           | `roomType(id)`                    | `roomTypeIn(catalogue, id)`                               |
| `PlannerScene.tsx:947`       | `FINISHES.find(…) ?? FINISHES[0]` | `catalogue.finishes.find(…) ?? catalogue.finishes[0]`     |
| `PlannerScene.tsx`           | `doorStyle(id)`                   | `doorStyleIn(catalogue, id)`                              |
| `StartScreen.tsx:153,183`    | `ROOM_TYPES`                      | `catalogue.roomTypes`                                     |
| `QuoteScreen.tsx:46`         | `FINISHES.find`                   | `catalogue.finishes.find`                                 |
| `QuoteScreen.tsx`            | `doorStyle(id)`, `roomType(id)`   | `doorStyleIn(catalogue, id)`, `roomTypeIn(catalogue, id)` |

`doorStyleIn` returns the schema's string-keyed `DoorStyle`. Everything above reads `id`, `label`, `look` and `note`, none of which changed shape — but if the type-checker points at a `priceRmBySizeMm` read in a component, that component was pricing on the client and belongs in `pricing.ts`. Move it there rather than re-keying.

Leave `CEILING_LIMITS`, `ROOM_DEPTH_LIMITS`, `WALL_HANG_LIMITS`, `CEILING_TRIM_MM`, `WALL_GAP_MM`, `WORKTOP_COLOR` and the other colour constants imported as they are — they are genuine constants, not catalogue data.
- [ ] **Step 4: Fix the landing page**

`src/app/page.tsx` — delete the `ponytail:` comment at lines 148–156 describing the bug, build an engine from the fetched catalogue, and read the room strip off it:

```tsx
// Read the live catalogue so the swatch row, the room strip and the hero
// price can't drift from what the planner actually offers after a publish.
const [{ data: catalogue }, siteImages] = await Promise.all([
	getPublishedPlannerCatalogue(),
	prisma.siteImage.findMany(),
]);
const engine = plannerEngine(catalogue);
```

```tsx
const kitchenPrice = computePlannerPrice(
	engine.starterFor("kitchen"),
	catalogue.finishes[0].id,
	catalogue,
);
```

and at line 381, `{catalogue.roomTypes.map((room, i) => (`. Drop `ROOM_TYPES` from the `@/lib/planner/catalogue` import (keep `RoomTypeId`) and add `import { plannerEngine } from "@/lib/planner/layout";`.
- [ ] **Step 5: Verify**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS on all three. The build is the real check here — it type-checks every component the engine refactor touched.
- [ ] **Step 6: Check it in the browser**

Run: `pnpm dev`, then open `http://localhost:3000` and `http://localhost:3000/planner`.
Expected: the landing page shows a non-zero "Starter kitchen run" figure; the planner opens on the kitchen starter with cabinets on the wall; the door-style and finish strips are populated; dragging a cabinet still snaps.

A **zero** starter price means the published catalogue's kitchen ladder no longer carries the starter's widths — a real data problem this task has now made visible instead of silently pricing at RM 0. Report it rather than papering over it.
- [ ] **Step 7: Commit**

```bash
git add src/components/planner/ src/app/planner/PlannerApp.tsx src/app/page.tsx
git commit -m "fix(planner): build layouts and palettes from the live catalogue"
```

---

### Task 7: Delete the mutable palette

Fixes **Known issue 2** by removing the thing being mutated, and closes **Known issue 1** by leaving nothing that can go stale. Nothing should still reference these names after Task 6 — this task is mostly deletion, and the type-checker proves it.

**Files:**
- Modify: `src/lib/planner/catalogue.ts`
- Modify: `src/app/planner/PlannerApp.tsx`
- Test: `src/lib/planner/__tests__/pricing.test.ts`, `src/lib/planner/__tests__/layout.test.ts`

**Interfaces:**
- Produces: `catalogue.ts` exporting seed data (`FAMILIES`, `ROOM_TYPES`, `FINISHES`, `CONSTRUCTION`, `RATES`, `PLANNER_CATALOGUE`), the true constants, and the `…In` / `…Of` reads. Nothing else.

- [ ] **Step 1: Write the failing test**

The invariant worth locking is that the bundled catalogue is internally consistent — the thing the mutation used to break. Add to `src/lib/planner/__tests__/catalogue.test.ts`:

```ts
describe("the seed catalogue is one consistent document", () => {
	it("satisfies its own schema", () => {
		expect(() => plannerCatalogueSchema.parse(PLANNER_CATALOGUE)).not.toThrow();
	});

	it("prices every door on every rung of the ladder", () => {
		for (const style of PLANNER_CATALOGUE.doorStyles) {
			for (const mm of PLANNER_CATALOGUE.doorWidthLadderMm) {
				expect(style.priceRmBySizeMm[String(mm)]).toBeGreaterThan(0);
			}
		}
	});

	it("carries every family its rooms name", () => {
		const ids = new Set(PLANNER_CATALOGUE.families.map((f) => f.id));
		for (const room of PLANNER_CATALOGUE.roomTypes) {
			for (const id of room.familyIds) expect(ids.has(id)).toBe(true);
		}
	});
});
```

Import `plannerCatalogueSchema` from `../catalogueSchema`.
- [ ] **Step 2: Run it**

Run: `pnpm test src/lib/planner/__tests__/catalogue.test.ts`
Expected: PASS already — this is a characterisation test, capturing what must survive the deletion. If it fails now, stop: the seed is broken before you touch it.
- [ ] **Step 3: Delete the palette machinery**

From `src/lib/planner/catalogue.ts`, delete outright:
- `setActivePlannerCatalogue` (and its whole doc comment)
- `FAMILY_BY_ID`, `ROOM_BY_ID`, `DOOR_BY_ID`
- `family()`, `roomType()`, `sizesOf()`, `sizePriceRm()`, `defaultWidthMm()`
- `doorStyle()`, `doorPriceRm()`
- the number-keyed `DOOR_STYLES` array and the local `DoorStyle` type that describes it

Re-export the schema's `DoorStyle` alongside the other shapes instead:

```ts
export type {
	Construction,
	DoorStyle,
	Family,
	Finish,
	Rates,
	RoomType,
	SizeOption,
};
```

`Cabinet.tsx:6` and `DesignedCabinet.tsx:12` import `type DoorStyle` from here and keep compiling unchanged — they read `look` and `label`, never `priceRmBySizeMm`, which is the only field whose keying differs. If the type-checker disagrees, that component was pricing on the client; move the read into `pricing.ts` rather than re-keying.

Define the seed door styles string-keyed once — JSON object keys always are, and that removes the re-key that made the stale copy possible:

```ts
/** The width ladder doors are priced against — the union of the families'. */
const DOOR_WIDTHS = [300, 400, 600, 800, 900, 1200, 1500, 1800];

const doorPrices = (rmPer100Mm: number): Record<string, number> =>
	Object.fromEntries(
		DOOR_WIDTHS.map((mm) => [String(mm), Math.round((mm / 100) * rmPer100Mm)]),
	);

const SEED_DOOR_STYLES: DoorStyle[] = [
	{
		id: "slab",
		label: "Slab",
		look: "slab",
		note: "Flat front",
		priceRmBySizeMm: doorPrices(22),
	},
	{
		id: "shaker",
		label: "Shaker",
		look: "shaker",
		note: "Framed front",
		priceRmBySizeMm: doorPrices(34),
	},
	{
		id: "glass",
		label: "Glass",
		look: "glass",
		note: "Glazed frame",
		priceRmBySizeMm: doorPrices(46),
	},
];
```

Make the seed the single document, with no copies:

```ts
/**
 * The catalogue this repo ships: the seed the DB is loaded from, and the
 * disaster-recovery copy. It is **not** the live catalogue — the live one
 * comes from the published `CatalogueVersion` and is passed explicitly, to
 * `plannerEngine`, `computePlannerPrice` and `CatalogueProvider`.
 *
 * Frozen because a mutable version of this object is what Known issues 1–3
 * were: a palette swapped in place, half of it by reference and half by copy,
 * so which values a caller saw depended on when it read them.
 */
export const PLANNER_CATALOGUE: PlannerCatalogue = Object.freeze({
	families: FAMILIES,
	doorStyles: SEED_DOOR_STYLES,
	doorWidthLadderMm: DOOR_WIDTHS,
	roomTypes: ROOM_TYPES,
	finishes: FINISHES,
});
```

Update the doc comment on `CONSTRUCTION` and `RATES` — they are no longer "mutable so `setActivePlannerCatalogue` can swap them"; they are the fallbacks `constructionOf` and `ratesOf` fill from. Update the comment above `FAMILIES` / `ROOM_TYPES` / `FINISHES` the same way.
- [ ] **Step 4: Take the mutation out of `PlannerApp`**

In `src/app/planner/PlannerApp.tsx`, delete the `setActivePlannerCatalogue(catalogue);` line and its import, and the doc comment on the `catalogue` prop that describes the swap. Replace it with:

```tsx
/** The live published catalogue. Passed down through `CatalogueProvider`;
 * nothing reads it from a module global. */
catalogue: PlannerCatalogue;
```

- [ ] **Step 5: Fix the last test references**

`pricing.test.ts` imports `doorPriceRm` and `sizePriceRm`, both now deleted. Point them at the explicit reads:

```ts
it("charges each carcass its own size's price", () => {
	const line = price(run()).cabinets.find((l) => l.id === "b1");
	expect(line?.carcassRm).toBe(
		sizePriceRmIn(PLANNER_CATALOGUE, "base-cabinet", 900),
	);
});
```

and replace the test named `"the explicit-catalogue read agrees with the module-palette one"` — there is no module palette any more — with the thing that actually matters:

```ts
it("charges the next rung up for a width between rungs", () => {
	expect(doorPriceRmIn(PLANNER_CATALOGUE, "shaker", 850)).toBe(
		doorPriceRmIn(PLANNER_CATALOGUE, "shaker", 900),
	);
});
```

`layout.test.ts` imports `FAMILIES` and `family` — swap `family(id)` for `familyIn(PLANNER_CATALOGUE, id)` and `FAMILIES` for `PLANNER_CATALOGUE.families`, and drop `ROOM_TYPES` in favour of `PLANNER_CATALOGUE.roomTypes`. Do the same in `parts.test.ts` and `pricing.test.ts` for any remaining palette import.
- [ ] **Step 6: Verify nothing still reaches for the palette**

Run:

```bash
grep -rn -E "setActivePlannerCatalogue|\bDOOR_STYLES\b|\bdoorStyle\(|\bdefaultWidthMm\(|\bsizePriceRm\(|\bdoorPriceRm\(" src
```

Expected: no output. Then:

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS on all three.
- [ ] **Step 7: Commit**

```bash
git add src/lib/planner/catalogue.ts src/lib/planner/__tests__/ src/app/planner/PlannerApp.tsx
git commit -m "refactor(planner): delete the mutable catalogue palette"
```

---

### Task 8: The server routes validate against the live catalogue, and CLAUDE.md stops listing fixed bugs

**Files:**
- Modify: `src/app/planner/page.tsx:4,8,16-18`
- Modify: `CLAUDE.md` — "Known issues", "The catalogue: two reads, and why"

**Interfaces:**
- Consumes: `getPublishedPlannerCatalogue` (already imported there), the live `catalogue.roomTypes`.

- [ ] **Step 1: Validate `?room=` against the published catalogue**

`VALID_ROOM_IDS` is built at module load from the seed, so a room a publish added would 404 into the kitchen and a room it removed would open on nothing. In `src/app/planner/page.tsx`, delete the module-level constant and move the check below the fetch:

```tsx
import type { RoomTypeId } from "@/lib/planner/catalogue";
```

```tsx
const { room } = await searchParams;

const [{ data: catalogue }, siteImages] = await Promise.all([
	getPublishedPlannerCatalogue(),
	prisma.siteImage.findMany(),
]);

// Validated against the catalogue that is actually about to be rendered,
// not the bundled seed: a publish that adds or drops a room changes what
// `?room=` may say.
const initialRoomId: RoomTypeId = catalogue.roomTypes.some((r) => r.id === room)
	? (room as RoomTypeId)
	: "kitchen";
```

- [ ] **Step 2: Update CLAUDE.md**

In the **Known issues** section, delete items 1, 2 and 3 and the paragraph beginning _"All three have the same root: the live palette is a mutable module global…"_. Renumber the two that remain (drafter naming; the junk `Testing123` family) to 1 and 2.

In **The catalogue: two reads, and why**, replace the whole section — there is only one read now:

```markdown
### The catalogue is a parameter, never a global

`catalogue.ts` holds the **seed**: the data this repo ships, the disaster-recovery
copy, and the fallbacks (`CONSTRUCTION`, `RATES`) that fill in whatever a
published catalogue omits. `PLANNER_CATALOGUE` is frozen. Nothing swaps it.

The live catalogue comes from the published `CatalogueVersion` and is passed
explicitly to the three things that consume it:
- `plannerEngine(catalogue)` — the placement functions in `layout.ts`, bound to
  one catalogue. A factory rather than a per-function parameter because
  `positioned` is the only place a `familyId` becomes a `Family`, but nearly
  every export reaches it.
- `computePlannerPrice(layout, finish, catalogue)` — the money path, which also
  takes its rates off that catalogue via `ratesOf`.
- `<CatalogueProvider catalogue={…}>` in `components/planner/CatalogueContext.tsx`
  — the client tree, which reads `useCatalogue()` for palettes and `useEngine()`
  for placement.

This replaced a mutable module palette that `setActivePlannerCatalogue` swapped
in place. It was three bugs at once: a door-price copy that never got swapped, a
global mutated during React's render phase, and a server-rendered starter layout
built from the seed but priced against the published catalogue — which fell
through `?? 0` whenever a publish changed a size ladder. "Which catalogue is
live" is now a value with an owner.
```

- [ ] **Step 3: Verify**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: PASS.

Run: `pnpm dev`, then open `http://localhost:3000/planner?room=bedroom` and `http://localhost:3000/planner?room=nonsense`.
Expected: the first opens on the bedroom starter, the second falls back to the kitchen.
- [ ] **Step 4: Commit**

```bash
git add src/app/planner/page.tsx CLAUDE.md
git commit -m "fix(planner): validate the room param against the live catalogue"
```
