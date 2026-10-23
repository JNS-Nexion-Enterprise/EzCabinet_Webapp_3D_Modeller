# Catalogue Impossible States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `/admin/catalogue` offering controls the engine ignores, and stop a door with no price reaching a customer at RM 0.

**Architecture:** `hasWorktop` leaves the schema and is derived from `kind` at its two read sites. Four groups of controls stop rendering for the kinds they do not affect — a UI-only change, the fields stay in the schema because intake still writes them. A new `doorBlockersOf` in `lib/catalogue/health.ts` joins the existing publish gate.

**Tech Stack:** Next.js App Router (client component), TypeScript, zod, Tailwind, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-09-09-catalogue-impossible-states-design.md`

## Global Constraints

- **Sentence case in UI copy. Prices in RM.**
- **`lib/planner` stays framework-free** — no React, no three.js. `lib/catalogue` may import from it, never the reverse.
- **Price is computed server-side.** The client may show an indicative figure; the authoritative number comes from the API.
- **Zod is the single source of truth for types.** Define once, infer TS types from it.
- **A published catalogue that still carries a removed key must keep validating.** Zod ignores unknown keys — do not add `.strict()` anywhere.
- Test: `pnpm test` (vitest run). Lint: `pnpm lint` (biome). Types: `pnpm typecheck`.
- `pnpm lint` has PRE-EXISTING failures in `src/lib/catalogue/db.ts`, `src/lib/logistics/adapters/{gdex,easyparcel}.ts` and `src/app/api/admin/deliveries/[id]/label/route.ts`. Not part of this work; none should appear in a diff.
- `src/components/LanguageSwitcher.tsx` carries an unrelated uncommitted change. **Never stage it.** Stage by path; never `git add -A`.
- Commit catalogue _data_ changes separately from code changes. Every task here is code.

---

## File Structure

| File                                         | Responsibility                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/planner/catalogueSchema.ts`         | **Modify.** Drop `hasWorktop` from `familySchema`.                                        |
| `src/lib/planner/catalogue.ts`               | **Modify.** Drop `hasWorktop` from the ten seed families.                                 |
| `src/lib/planner/pricing.ts`                 | **Modify.** `worktopFt` filters on `kind`.                                                |
| `src/components/planner/PlannerScene.tsx`    | **Modify.** The worktop span loop filters on `kind`.                                      |
| `src/lib/catalogue/cabinetDesignLabels.ts`   | **Modify.** `CATEGORY_TO_FAMILY_SHAPE` loses its dead `hasWorktop` half.                  |
| `src/lib/mesh/mergeIntoCatalogue.ts`         | **Modify.** Stop writing `hasWorktop`.                                                    |
| `src/app/admin/catalogue/page.tsx`           | **Modify.** Remove the Worktop control; hide inapplicable controls; render door blockers. |
| `src/lib/catalogue/health.ts`                | **Modify.** Add `doorBlockersOf`.                                                         |
| `src/lib/catalogue/__tests__/health.test.ts` | **Modify.** Cases for `doorBlockersOf`.                                                   |
| `src/lib/planner/__tests__/pricing.test.ts`  | **Modify.** Worktop billed by kind.                                                       |

Tasks run in order. 1 and 2 both edit the admin form; 3 is independent of 2 but shares `health.ts` with nothing else here.

---

### Task 1: `hasWorktop` is derived from `kind`

**Files:**
- Modify: `src/lib/planner/catalogueSchema.ts`, `src/lib/planner/catalogue.ts`, `src/lib/planner/pricing.ts`, `src/components/planner/PlannerScene.tsx`, `src/lib/catalogue/cabinetDesignLabels.ts`, `src/lib/mesh/mergeIntoCatalogue.ts`, `src/app/admin/catalogue/page.tsx`
- Test: `src/lib/planner/__tests__/pricing.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Family` no longer has `hasWorktop`. Any code wanting the answer asks `family.kind === "base"`.

**Why this is safe:** every family the repo ships has `hasWorktop === (kind === "base")`, and intake already computes it that way (`mergeIntoCatalogue.ts:275`). The `hasWorktop` half of `CATEGORY_TO_FAMILY_SHAPE` is already dead — `publishDesigns.ts:199` reads only `shape.kind`.
- [ ] **Step 1: Write the failing test**

In `src/lib/planner/__tests__/pricing.test.ts`, add to the existing `describe("worktop", …)` block. The file already provides `empty()` (an `emptyLayout(6000)`) and a destructured `addModule` from `plannerEngine(PLANNER_CATALOGUE)` — use them:

```ts
it("bills a base run and not a wall run", () => {
	// `base-cabinet` and `wall-cabinet` are the same 900mm wide, so if the
	// worktop were billed by anything but the kind of cabinet these two would
	// come to the same number.
	const floor = addModule(empty(), "base-cabinet", 0, "b1", 900);
	const hanging = addModule(empty(), "wall-cabinet", 0, "w1", 900);

	expect(worktopFt(floor, PLANNER_CATALOGUE)).toBeCloseTo(900 / MM_PER_FT, 5);
	expect(worktopFt(hanging, PLANNER_CATALOGUE)).toBe(0);
});

it("bills nothing for a tall unit", () => {
	const tall = addModule(empty(), "tall-cabinet", 0, "t1", 600);

	expect(worktopFt(tall, PLANNER_CATALOGUE)).toBe(0);
});
```

`MM_PER_FT` and `worktopFt` are already imported at the top of that file; add nothing.

If the file already carries an equivalent assertion, extend it rather than duplicating — read the `describe("worktop", …)` block before writing.
- [ ] **Step 2: Run the test to verify it passes for the wrong reason**

Run: `pnpm vitest run src/lib/planner/__tests__/pricing.test.ts`
Expected: PASS — the seed data already satisfies it, because `hasWorktop` and `kind` agree today. That is fine and expected: this test is a **characterisation** test, pinning the behaviour _before_ the field is removed so the removal cannot change it. Note this in your report.
- [ ] **Step 3: Remove the field from the schema and the seed**

In `src/lib/planner/catalogueSchema.ts`, delete this line from `familySchema`:

```ts
	hasWorktop: z.boolean(),
```

In `src/lib/planner/catalogue.ts`, delete every `hasWorktop: true,` and `hasWorktop: false,` line from the family literals (there are ten).
- [ ] **Step 4: Point the two readers at `kind`**

`src/lib/planner/pricing.ts`, in `worktopFt`:

```ts
		.filter((position) => position.family.kind === "base")
```

Update that function's doc comment: it says "Only families that carry one count" — it is now "Only base units carry a worktop; a wall or tall unit cannot".

`src/components/planner/PlannerScene.tsx`, in the worktop span loop:

```ts
		if (position.family.kind !== "base") continue;
```

The comment above that loop ends "and `hasWorktop` is the same flag pricing charges against." Replace that clause: pricing and the scene now both read `kind`, which is what makes them agree.
- [ ] **Step 5: Drop the dead half of the category map**

In `src/lib/catalogue/cabinetDesignLabels.ts`, `CATEGORY_TO_FAMILY_SHAPE` maps each category to `{ kind, hasWorktop }`. Only `kind` was ever read (`publishDesigns.ts:199`). Reduce it to a kind map and rename it to match what it now is:

```ts
export const CATEGORY_TO_KIND: Record<Category, "base" | "wall" | "tall"> = {
	BASE_CABINET: "base",
	WALL_CABINET: "wall",
	TALL_CABINET: "tall",
	DRAWER_BASE: "base",
	FRIDGE_HOUSING: "tall",
};
```

Keep the existing doc comment above it — it explains why `category` is a better source of `kind` than anything inferred from the file, which is still true. Update `publishDesigns.ts` to import and use the new name; `shape.kind` becomes the mapped value directly.
- [ ] **Step 6: Stop writing the field at intake**

In `src/lib/mesh/mergeIntoCatalogue.ts`, delete:

```ts
			hasWorktop: module.kind === "base",
```

- [ ] **Step 7: Remove the control from the admin form**

In `src/app/admin/catalogue/page.tsx`, delete the whole `<label>` element containing the `Worktop` checkbox — the one whose `checked` reads `family.hasWorktop` and whose `onChange` writes `n.families[fi].hasWorktop`. Also remove `hasWorktop: true,` from the object literal that `+ Add cabinet` pushes.

**Leave the Rates & build tab alone.** It has a "Worktop RM per running foot" rate and a "Worktop thickness mm" build constant. Those are run-level and unaffected.
- [ ] **Step 8: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all tests pass — including the characterisation test from Step 1, which must still pass unchanged. `tsc` will name every site that still reads `hasWorktop`; there should be none left.
- [ ] **Step 9: Commit**

```bash
git add src/lib/planner/catalogueSchema.ts src/lib/planner/catalogue.ts src/lib/planner/pricing.ts src/components/planner/PlannerScene.tsx src/lib/catalogue/cabinetDesignLabels.ts src/lib/mesh/mergeIntoCatalogue.ts src/app/admin/catalogue/page.tsx src/lib/planner/__tests__/pricing.test.ts
git commit -m "fix(catalogue): derive the worktop from the kind of cabinet

A wall cabinet's card offered a Worktop checkbox, and the flag was not inert:
pricing billed a worktop by the running foot and the scene drew the slab from
floorHeightMm + heightMm, so ticking it charged a customer for a worktop 2,380mm
up a wall. Every family the repo ships has hasWorktop === (kind === base), and
intake already computed it that way, so the field's only independent value was
an impossible one. Pricing and the scene now read kind directly."
```

---

### Task 2: Inapplicable controls stop rendering

**Files:**
- Modify: `src/app/admin/catalogue/page.tsx`

**Interfaces:**
- Consumes: Task 1's removal of the Worktop control (same region of the file).
- Produces: nothing later tasks read.

The fields stay in the schema and intake keeps writing them — a wall design's measured `floorHeightMm` is what `matchesFamily` routes on (`mergeIntoCatalogue.ts:125`). Only the editing control goes.

| Control                                     | Render when               | Because                                                                                    |
| ------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| Off floor mm                                | `family.kind !== "wall"`  | `layout.ts:870` returns the layout's hang height for a wall unit and never reads the field |
| Legs, Leg height mm, Leg ⌀ mm, Leg inset mm | `family.kind !== "wall"`  | `parts.ts:133` returns `{heightMm: 0, legs: 0, insetMm: 0}` for wall                       |
| Shelves                                     | effective drawers `=== 0` | `fitOutOf:188` forces shelves to 0 when drawers > 0                                        |
| Door leaves                                 | effective drawers `=== 0` | `cabinetPartsMm:367` returns before emitting any door                                      |
- [ ] **Step 1: Derive the effective drawer count once**

The engine's own rule is `geometry?.drawers ?? family.drawers` (`parts.ts:181`). Read it the same way so the control hides on exactly the condition the engine acts on. Inside the family card's render, before the fields:

```tsx
{
	/* The engine's own reading — `fitOutOf` prefers the
										    measured count over the family's. Hiding a control on
										    a second, looser reading would leave an input visible
										    that the scene still ignores. */
}
```

and compute `const drawers = family.geometry?.drawers ?? family.drawers;` at the top of the map callback for that family.
- [ ] **Step 2: Hide Off floor mm for a wall family**

Wrap the `<Num label="Off floor mm" … />` element:

```tsx
											{family.kind !== "wall" && (
												<Num
													label="Off floor mm"
													…unchanged props…
												/>
											)}
```

Copy the element's existing props verbatim — read them off the file rather than retyping from memory.
- [ ] **Step 3: Hide the four leg controls for a wall family**

The four `<Num>` elements labelled `Legs`, `Leg height mm`, `Leg ⌀ mm` and `Leg inset mm` sit together inside the Override disclosure. Wrap the group in one `{family.kind !== "wall" && ( … )}` — one guard, not four.
- [ ] **Step 4: Hide Shelves and Door leaves on a drawer bank**

Wrap each in `{drawers === 0 && ( … )}`. They are not adjacent (Fixed shelves and Drawer fronts sit between them), so this is two guards.

**Leave Fixed shelves and Drawer fronts rendering unconditionally.** Fixed shelves is summed with Shelves by `parts.ts:192` and records a real `shelfFixed` role from the drawing; Drawer fronts is the field the whole condition is keyed on.
- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean. A JSX nesting mistake surfaces here as a parse error — re-read the hunk rather than guessing.
- [ ] **Step 6: Read the result back**

You cannot run a browser. Instead, re-read your own edited region and write out, in your report, what the form renders for each of: a base family with 0 drawers, a base family with 3 drawers, and a wall family. Name every control that appears and every one that does not.
- [ ] **Step 7: Commit**

```bash
git add src/app/admin/catalogue/page.tsx
git commit -m "fix(admin): stop offering controls the engine ignores

Off floor and the four leg fields do nothing on a wall family — floorHeightMmOf
returns the layout's hang height and standOf returns zeros for wall. Shelves and
Door leaves do nothing on a drawer bank — fitOutOf forces shelves to zero and
cabinetPartsMm returns before emitting a door. Each control now renders only for
the kinds it affects. The fields stay in the schema: intake still writes them,
and matchesFamily routes on floorHeightMm."
```

---

### Task 3: An unpriced door blocks a publish

**Files:**
- Modify: `src/lib/catalogue/health.ts`, `src/lib/catalogue/__tests__/health.test.ts`, `src/app/admin/catalogue/page.tsx`

**Interfaces:**
- Consumes: `blockersOf` / `PriceBlocker` from the existing `health.ts`.
- Produces:
  - `type DoorBlocker = { doorStyleId: string; doorStyleLabel: string; widthMm: number }`
  - `doorBlockersOf(catalogue: PlannerCatalogue): DoorBlocker[]`

**The defect:** `doorPriceRmIn` (`src/lib/planner/catalogue.ts:371-385`) resolves an exact width, else the next rung of `doorWidthLadderMm`, else `?? 0`; an unknown `doorStyleId` returns 0 outright. So a cabinet width no door style prices charges the customer nothing for the door, server-side, with no warning.

The fallbacks stay — a runtime that threw on a missing price would take the planner down for a customer, and zero is the safe render. The gate is what stops a zero being published.
- [ ] **Step 1: Write the failing test**

Add to `src/lib/catalogue/__tests__/health.test.ts`:

```ts
describe("doorBlockersOf", () => {
	it("finds nothing when every offered width is priced", () => {
		expect(doorBlockersOf(PLANNER_CATALOGUE)).toEqual([]);
	});

	it("reports a width no door style prices", () => {
		const next = clone(PLANNER_CATALOGUE);
		const family = next.families[0];
		const style = next.doorStyles[0];
		// A width the ladder resolves to a rung this style does not price.
		for (const key of Object.keys(style.priceRmBySizeMm)) {
			delete style.priceRmBySizeMm[key];
		}

		const blocked = doorBlockersOf(next);
		expect(blocked.some((b) => b.doorStyleId === style.id)).toBe(true);
		expect(blocked.every((b) => b.doorStyleLabel === style.label)).toBe(true);
		expect(blocked.some((b) => b.widthMm === family.sizes[0].widthMm)).toBe(
			true,
		);
	});

	it("ignores widths no family offers", () => {
		const next = clone(PLANNER_CATALOGUE);
		// A door ladder rung nothing is built at is not a problem to solve.
		next.doorWidthLadderMm = [...next.doorWidthLadderMm, 9999];

		expect(doorBlockersOf(next)).toEqual([]);
	});

	it("skips families no room offers", () => {
		const next = clone(PLANNER_CATALOGUE);
		const orphanWidth = 1234;
		next.families.push({
			...PLANNER_CATALOGUE.families[0],
			id: "test-orphan",
			label: "Retired",
			sizes: [{ widthMm: orphanWidth, priceRm: 100 }],
		});

		expect(doorBlockersOf(next).some((b) => b.widthMm === orphanWidth)).toBe(
			false,
		);
	});
});
```

Add `doorBlockersOf` to the import at the top of the file.
- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/catalogue/__tests__/health.test.ts`
Expected: FAIL — `doorBlockersOf is not a function`.
- [ ] **Step 3: Write the implementation**

Add to `src/lib/catalogue/health.ts`:

```ts
export type DoorBlocker = {
	doorStyleId: string;
	doorStyleLabel: string;
	widthMm: number;
};

/**
 * Every (door style × offered width) that would charge the customer nothing.
 *
 * `doorPriceRmIn` resolves an exact width, else the next rung of the door
 * ladder, else falls through to zero — and an unknown style id returns zero
 * outright. Those fallbacks are right at runtime: a throw would take the
 * planner down for a customer mid-design, and a zero at least renders. But it
 * is the same silent RM 0 the carcass gate already closes, one field over, so
 * it belongs in front of the same publish button.
 *
 * Only widths a family actually offers count. The door ladder may carry rungs
 * nothing is built at, and those are not a problem to solve. Stranded families
 * are skipped for the reason `blockersOf` skips them — a cabinet no customer
 * can reach cannot show a customer a wrong price.
 */
export function doorBlockersOf(catalogue: PlannerCatalogue): DoorBlocker[] {
	const stranded = new Set(strandedFamilyIds(catalogue));
	const widths = new Set<number>();
	for (const family of catalogue.families) {
		if (stranded.has(family.id)) continue;
		for (const size of family.sizes) widths.add(size.widthMm);
	}

	const blockers: DoorBlocker[] = [];
	for (const style of catalogue.doorStyles) {
		for (const widthMm of [...widths].sort((a, b) => a - b)) {
			if (doorPriceRmIn(catalogue, style.id, widthMm) > 0) continue;
			blockers.push({
				doorStyleId: style.id,
				doorStyleLabel: style.label,
				widthMm,
			});
		}
	}
	return blockers;
}
```

Import `doorPriceRmIn` from `@/lib/planner/catalogue`. That is `lib/catalogue` importing from `lib/planner`, which is the permitted direction.
- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/catalogue/__tests__/health.test.ts`
Expected: PASS, all cases including the four pre-existing `blockersOf` ones.

If "finds nothing when every offered width is priced" fails, the seed catalogue genuinely has a width no style prices. That is a real finding about the data — report it, do not weaken the assertion.
- [ ] **Step 5: Wire it into the page**

In `src/app/admin/catalogue/page.tsx`, beside the existing `blockers` memo:

```ts
const doorBlockers = useMemo(
	() => (draft ? doorBlockersOf(draft) : []),
	[draft],
);
```

Add `doorBlockersOf` to the existing `@/lib/catalogue/health` import.

Add the count to the publish button's `disabled`, alongside the three conditions already there:

```tsx
											disabled={
												changes.length === 0 ||
												issues.length > 0 ||
												blockers.length > 0 ||
												doorBlockers.length > 0
											}
```

And render them in the "Needs you" panel, after the existing rung-blocker rows. A door blocker is fixed on the **Door styles** tab, not inline here, so this row is a statement rather than a field:

```tsx
{
	doorBlockers.length > 0 && (
		<div className="border-neutral-100 border-b px-4 py-3 last:border-b-0">
			<p className="text-sm">
				<span className="font-medium">
					{doorBlockers.length} door price
					{doorBlockers.length === 1 ? "" : "s"}
				</span>{" "}
				missing
			</p>
			<p className="mt-0.5 text-[12px] text-neutral-500">
				{doorBlockers
					.slice(0, 4)
					.map((b) => `${b.doorStyleLabel} at ${b.widthMm} mm`)
					.join(" · ")}
				{doorBlockers.length > 4
					? ` · and ${doorBlockers.length - 4} more`
					: ""}{" "}
				— a door with no price is charged at RM 0. Set them on the door styles
				tab.
			</p>
		</div>
	);
}
```

Also extend the amber line in the Review card that explains why publishing is held, so it counts door blockers as well as rung blockers.
- [ ] **Step 6: Verify**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: clean.
- [ ] **Step 7: Commit**

```bash
git add src/lib/catalogue/health.ts src/lib/catalogue/__tests__/health.test.ts src/app/admin/catalogue/page.tsx
git commit -m "fix(catalogue): hold a publish until every offered width has a door price

doorPriceRmIn resolves an exact width, else the next ladder rung, else zero, and
an unknown style id returns zero outright — so adding a cabinet width no door
style prices charged the customer nothing for the door, server-side, with no
warning. The fallbacks stay, because a throw would take the planner down for a
customer mid-design. The publish gate is what stops a zero being published."
```

---

## Final verification

- [ ] `pnpm test && pnpm typecheck && pnpm lint` — clean, with only the pre-existing lint failures listed in Global Constraints.
- [ ] `grep -rn "hasWorktop" src/` returns nothing but the Rates-tab worktop _rate_ and _thickness_ (different concepts, both still live).
- [ ] **A manual gate before this merges, for a human with database access:** read the published catalogue and confirm no live family has `hasWorktop` disagreeing with `kind === "base"`. Removing the field changes behaviour for such a family — a base one with the box unticked would start being billed a worktop. The repo's seed has none; the live catalogue cannot be checked from the repo. If one disagrees, it is either a mistake this change fixes or a real product that needs `kind` to express it — decide which before merging.
