# Planner Studio (streamlined) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the planner studio's information architecture to the
streamlined design — icon tool rail, overlay panels, verb-based selection,
on-canvas gizmo and context menu, sticky total with a breakdown modal — without
losing a single capability the current screen ships.

**Architecture:** `StudioScreen.tsx` stops being one 1296-line component and
becomes a state owner that composes six presentational children in
`src/components/planner/studio/`. Two pure-engine additions land first
(`replaceFamily`, per-module `hangAtMm`), each test-first in `lib/planner`,
because the UI tasks consume them. `PlannerScene` gains one optional prop
(`gizmo`) so a DOM overlay can be anchored to a cabinet in 3D via drei's
`<Html>`; nothing else in the scene changes.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4
(arbitrary values inline — this repo has no design-token file), React Three
Fiber + drei, vitest. Package manager is **pnpm**.

**Spec:** `docs/superpowers/plans/2026-09-10-planner-studio-streamlined-spec.md`

## Global Constraints

- `src/lib/planner` stays framework-free. No React, no three.js imports there.
- The catalogue is a parameter, never a global. Engine functions live inside
  `plannerEngine(catalogue)` and are reached through `useEngine()`.
- Every `lib/planner` function gets a test before it gets a caller.
- Copy is never hardcoded in a component. Every visible string is a key in
  `src/lib/copy/en.ts` **and** `zh.ts` **and** `ms.ts`; `dictionary.test.ts`
  fails if a locale is missing a key or copies English verbatim.
- Sentence case in UI copy. Prices in RM, formatted through the existing
  `Intl.NumberFormat` helpers in `StudioScreen`.
- Tokens, verbatim from the spec: page `#f4f3f1`, canvas ground `#faf9f7`,
  panel `#fff`, border `#e5e5e5`, soft border `#f0efec`, text `#171717`,
  secondary `#525252`, muted `#6b6b6b`, faint `#8a857c`, accent `#1f5138`,
  accent hover `#17402c`, accent tint `#f2f7f4`, accent chip `#e7efe9`, accent
  text `#17402c`, danger `#8a2c1c`. Header 52px, rail 60px (44px buttons),
  room panel 236px, overlay panel 296px, right panel 312px.
- Every interactive control keeps a ≥36px tap target and its `aria-pressed` /
  `aria-label`, as both the current screen and the design have.
- Verification for every task: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
  There is no component-test harness in this repo (no testing-library, no
  jsdom) — **do not add one**. UI tasks are verified by those three commands
  plus the stated manual check in `pnpm dev`.

## File Structure

**New — `src/components/planner/studio/`:**

| File                 | Responsibility                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ToolRail.tsx`       | The 60px icon rail. Pure: takes the active tool and a press handler.                                                                |
| `RoomPanel.tsx`      | The 236px room column: room chips, three dimension fields, fit line, overhang warning, the button that opens Defaults.              |
| `StudioPanel.tsx`    | The 296px overlay panel and its four bodies (Add, View, Doors, Defaults).                                                           |
| `SelectionPanel.tsx` | The right panel's selected state: verbs, the inline resize/replace/move/doors sections, front + hinge, and the multi-select branch. |
| `DesignRecap.tsx`    | The right panel's empty state: recap list, run list, reset, "Add a cabinet".                                                        |
| `PriceFooter.tsx`    | Sticky total button + quote CTA + the breakdown modal.                                                                              |
| `CabinetMenu.tsx`    | The right-click context menu.                                                                                                       |
| `MoveGizmo.tsx`      | The arrow cluster drawn over the selected cabinet.                                                                                  |
| `chrome.ts`          | The three shared class-string helpers (`chip`, `listBtn`, `verbBtn`) so twelve call sites cannot drift.                             |

**Modified:**

| File                                                                              | Change                                                                                   |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/lib/planner/layout.ts`                                                       | `replaceFamily`, `setHangAt`, `hangAtMm` on `PlacedModule`, `floorHeightMmOf` honours it |
| `src/lib/planner/__tests__/layout.test.ts`                                        | tests for both                                                                           |
| `src/components/planner/PlannerScene.tsx`                                         | optional `gizmo` prop; contact shadows read `floorHeightMmOf`                            |
| `src/components/planner/StudioScreen.tsx`                                         | reduced to state + composition                                                           |
| `src/lib/copy/en.ts`, `zh.ts`, `ms.ts`                                            | the new keys                                                                             |
| `src/components/planner/Cabinet.tsx`, `DesignedCabinet.tsx`, `MeasureOverlay.tsx` | accent sweep                                                                             |

---

### Task 1: Engine — `replaceFamily`

Swap a placed cabinet's family, keeping its position and landing on the nearest
rung of the new family's ladder. Refused (returns the layout unchanged) when the
new cabinet would not fit where the old one stands, or when the swap would cross
rows — a wall cabinet cannot become a tall unit in place, because the two rows
are different arrays.

**Files:**
- Modify: `src/lib/planner/layout.ts` (add the function inside `plannerEngine`, before `starterFor`, and to the returned object)
- Test: `src/lib/planner/__tests__/layout.test.ts`

**Interfaces:**
- Consumes: `find`, `occupiedSpans`, `overlapsAnything`, `familyIn`, `rowFor` — all already in scope inside `plannerEngine`.
- Produces: `replaceFamily(layout: PlannerLayout, id: string, familyId: string): PlannerLayout` on the engine object.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/planner/__tests__/layout.test.ts`. Add `replaceFamily` to the
destructured list at the top of the file (it is alphabetical — between
`removeModules` and `runExtentMm`).

```ts
describe("replaceFamily", () => {
	it("swaps the family and keeps the left edge", () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 600, "a", 600);
		const next = replaceFamily(layout, "a", "base-drawers");
		const placed = next.floor.find((m) => m.id === "a");
		expect(placed?.familyId).toBe("base-drawers");
		expect(placed?.xMm).toBe(600);
	});

	it("lands on the nearest rung of the new ladder", () => {
		let layout = emptyLayout(WALL_MM);
		// base-cabinet has a 300 rung; base-drawers starts at 400.
		layout = addModule(layout, "base-cabinet", 0, "a", 300);
		const next = replaceFamily(layout, "a", "base-drawers");
		expect(next.floor.find((m) => m.id === "a")?.widthMm).toBe(400);
	});

	it("refuses a swap the neighbours leave no room for", () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 0, "a", 300);
		layout = addModule(layout, "base-cabinet", 300, "b", 300);
		// The nearest drawer rung is 400, which would run into "b".
		expect(replaceFamily(layout, "a", "base-drawers")).toBe(layout);
	});

	it("refuses a swap that would change row", () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 0, "a", 600);
		expect(replaceFamily(layout, "a", "wall-cabinet")).toBe(layout);
	});

	it("keeps the door and the hinge", () => {
		let layout = emptyLayout(WALL_MM);
		layout = addModule(layout, "base-cabinet", 0, "a", 600);
		layout = setDoor(layout, "a", "shaker");
		layout = setHinge(layout, "a", "right");
		const next = replaceFamily(layout, "a", "base-drawers");
		const placed = next.floor.find((m) => m.id === "a");
		expect(placed?.doorStyleId).toBe("shaker");
		expect(placed?.hinge).toBe("right");
	});

	it("leaves an unknown family or id alone", () => {
		const layout = addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "a", 600);
		expect(replaceFamily(layout, "a", "nope")).toBe(layout);
		expect(replaceFamily(layout, "nope", "base-drawers")).toBe(layout);
	});
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts -t replaceFamily`
Expected: FAIL — `replaceFamily is not a function`.
- [ ] **Step 3: Implement it**

In `src/lib/planner/layout.ts`, inside `plannerEngine`, immediately above
`function starterFor(`:

```ts
/**
 * Swap what a cabinet *is* without moving it.
 *
 * The left edge is the thing the customer is not asking to change, so it
 * stays and the new family takes the nearest width its own ladder offers.
 * Refused rather than half-applied when the neighbours leave no room —
 * same rule as `setWidth`, for the same reason: a swap that silently slid
 * the run would move cabinets the customer never touched.
 *
 * A swap across rows is refused too. The rows are separate arrays and a
 * wall cabinet standing where a base unit stood is not a resize, it is a
 * different design decision — remove and add is the honest path for that.
 */
function replaceFamily(
	layout: PlannerLayout,
	id: string,
	familyId: string,
): PlannerLayout {
	const found = find(layout, id);
	const family = familyIn(catalogue, familyId);
	if (!found || !family) return layout;
	if (family.id === found.placed.familyId) return layout;
	if (rowFor(family.kind) !== found.row) return layout;

	const widthMm = family.sizes.reduce(
		(best, size) =>
			Math.abs(size.widthMm - found.placed.widthMm) <
			Math.abs(best - found.placed.widthMm)
				? size.widthMm
				: best,
		family.sizes[0].widthMm,
	);

	const spans = occupiedSpans(layout, found.row, id);
	if (found.placed.xMm + widthMm > layout.wallWidthMm) return layout;
	if (overlapsAnything(found.placed.xMm, widthMm, spans)) return layout;

	return {
		...layout,
		[found.row]: layout[found.row].map((module) =>
			module.id === id ? { ...module, familyId, widthMm } : module,
		),
	};
}
```

Then add `replaceFamily,` to the returned object (alphabetical — after
`removeModules`).
- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts`
Expected: PASS, whole file.
- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/__tests__/layout.test.ts
git commit -m "feat(planner): swap a placed cabinet's family in place"
```

---

### Task 2: Engine — per-cabinet hang height

The wall row hangs at one height today (`layout.hangingHeightMm`, or the
ceiling-aligned figure from `hangingHeightMmOf`). The design's gizmo raises and
lowers **one** wall unit, so a placed module needs an optional override.

`floorHeightMmOf` is the single place the scene, the contact shadows and the
measuring tool all ask where a cabinet's underside is — so the override goes
there and everything downstream gets it for free. `ContactShadows` currently
reads `hangingHeightMmOf(layout)` directly, which would leave a raised
cabinet's shadow behind; that is fixed in the same task because it is the same
bug.

**Files:**
- Modify: `src/lib/planner/layout.ts` (`PlacedModule`, `floorHeightMmOf`, new `setHangAt`, engine exports)
- Modify: `src/components/planner/PlannerScene.tsx:717,747` (contact shadows)
- Test: `src/lib/planner/__tests__/layout.test.ts`

**Interfaces:**
- Consumes: `WALL_HANG_LIMITS` (`{ minMm: 1200, maxMm: 1800 }`, already imported in `layout.ts`), `CEILING_TRIM_MM`, `find`, `hangingHeightMmOf`.
- Produces: `hangAtMm?: number` on `PlacedModule`; `setHangAt(layout, id, hangAtMm): PlannerLayout` on the engine; `floorHeightMmOf(position, layout)` now returns the override when there is one.

- [ ] **Step 1: Write the failing tests**

Add `setHangAt` to the destructured engine list in the test file (between
`setCeilingHeight` and `setHangingHeight`), then add:

```ts
describe("setHangAt", () => {
	const hung = () => {
		const layout = emptyLayout(WALL_MM);
		return addModule(layout, "wall-cabinet", 0, "w", 600);
	};

	it("raises one wall cabinet without moving the row", () => {
		let layout = hung();
		layout = addModule(layout, "wall-cabinet", 600, "w2", 600);
		const next = setHangAt(layout, "w", 1600);
		const [a, b] = positionsOf(next, "wall");
		expect(floorHeightMmOf(a, next)).toBe(1600);
		expect(floorHeightMmOf(b, next)).toBe(next.hangingHeightMm);
	});

	it("clamps to the hang limits", () => {
		const low = setHangAt(hung(), "w", 100);
		const high = setHangAt(hung(), "w", 9000);
		expect(low.wall.find((m) => m.id === "w")?.hangAtMm).toBe(
			WALL_HANG_LIMITS.minMm,
		);
		expect(high.wall.find((m) => m.id === "w")?.hangAtMm).toBe(
			WALL_HANG_LIMITS.maxMm,
		);
	});

	it("ignores a floor unit — only the hung row moves vertically", () => {
		const layout = addModule(emptyLayout(WALL_MM), "base-cabinet", 0, "b", 600);
		expect(setHangAt(layout, "b", 1600)).toBe(layout);
	});

	it("is overridden by ceiling mode, which lines every top up", () => {
		const layout = setWallToCeiling(setHangAt(hung(), "w", 1250), true);
		const [only] = positionsOf(layout, "wall");
		expect(floorHeightMmOf(only, layout)).toBe(hangingHeightMmOf(layout));
	});

	it("is dropped by passing null, so the unit rejoins the row", () => {
		const raised = setHangAt(hung(), "w", 1600);
		const reset = setHangAt(raised, "w", null);
		const [only] = positionsOf(reset, "wall");
		expect(reset.wall.find((m) => m.id === "w")?.hangAtMm).toBeUndefined();
		expect(floorHeightMmOf(only, reset)).toBe(reset.hangingHeightMm);
	});
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts -t setHangAt`
Expected: FAIL — `setHangAt is not a function`.
- [ ] **Step 3: Add the field**

In `src/lib/planner/layout.ts`, in `type PlacedModule`, after `xMm`:

```ts
	/**
	 * This one cabinet's underside height, when the customer has raised or
	 * lowered it away from the row. Absent means "hangs with the row", which
	 * is what every wall unit does until somebody drags its arrow — a real
	 * override and an unset one have to stay distinguishable, so this is
	 * optional rather than defaulted to the row's height.
	 *
	 * Ignored in ceiling mode: lining the tops up is the whole point of that
	 * mode, and it wins.
	 */
	hangAtMm?: number;
```

- [ ] **Step 4: Honour it where the row is positioned**

Replace `floorHeightMmOf` in `src/lib/planner/layout.ts`:

```ts
function floorHeightMmOf(position: Positioned, layout: PlannerLayout): number {
	if (position.family.kind !== "wall") return position.family.floorHeightMm;
	// Ceiling mode aligns the tops, so a per-cabinet figure has nothing to
	// say there.
	if (layout.wallToCeiling) return hangingHeightMmOf(layout);
	return position.placed.hangAtMm ?? layout.hangingHeightMm;
}
```

- [ ] **Step 5: Add the setter**

Inside `plannerEngine`, after `setHangingHeight`:

```ts
/**
 * Raise or lower one wall cabinet out of the row. `null` puts it back.
 *
 * Clamped to the same range the hang slider allows, so a cabinet can never
 * be nudged somewhere the slider could not have put the whole row — the
 * gizmo is a shortcut, not a second set of rules.
 */
function setHangAt(
	layout: PlannerLayout,
	id: string,
	hangAtMm: number | null,
): PlannerLayout {
	const found = find(layout, id);
	if (!found || found.row !== "wall") return layout;

	const next = { ...found.placed };
	if (hangAtMm === null) {
		delete next.hangAtMm;
	} else {
		next.hangAtMm = Math.max(
			WALL_HANG_LIMITS.minMm,
			Math.min(WALL_HANG_LIMITS.maxMm, Math.round(hangAtMm)),
		);
	}

	return {
		...layout,
		wall: layout.wall.map((module) => (module.id === id ? next : module)),
	};
}
```

Add `setHangAt,` to the returned object (after `setCeilingHeight`).
- [ ] **Step 6: Run the tests and watch them pass**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts`
Expected: PASS.
- [ ] **Step 7: Fix the contact shadows, which read the row height directly**

In `src/components/planner/PlannerScene.tsx`, line 717 destructures
`{ positionsOf, hangingHeightMmOf }` and line 747 computes the shadow's Y from
`hangingHeightMmOf(layout)`. Change the destructure to
`{ positionsOf, floorHeightMmOf }` and line 747 to:

```tsx
						m(floorHeightMmOf(position, layout) + position.family.heightMm / 2) -
							0.06,
```

- [ ] **Step 8: Verify the whole suite and the types**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.
- [ ] **Step 9: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/__tests__/layout.test.ts src/components/planner/PlannerScene.tsx
git commit -m "feat(planner): let one wall cabinet hang off the row"
```

---

### Task 3: Copy for the new chrome

Every string the redesign introduces, in all three locales. Doing this first
means no UI task has to stop and invent copy, and `dictionary.test.ts` proves
the three files stayed the same shape.

**Files:**
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/zh.ts`, `src/lib/copy/ms.ts`
- Test: `src/lib/copy/__tests__/dictionary.test.ts` (existing — no new test needed; it walks every leaf)

**Interfaces:**
- Produces: `t.planner.tools.*`, `t.planner.panel.*`, three new `t.planner.room.*` keys, `t.planner.selection.*` verb keys, `t.planner.design.*`, `t.planner.gizmo.*`, two new `t.planner.price.*`, one new `t.planner.canvas.*`. Later tasks reference these exact paths.

- [ ] **Step 1: Add the English keys**

In `src/lib/copy/en.ts`, inside `planner:`, add these blocks. `tools`, `panel`,
`design` and `gizmo` are new; the rest are additions to existing blocks —
put each addition inside the block it names.

```ts
		tools: {
			ariaLabel: "Tools",
			select: "Select",
			add: "Add",
			measure: "Measure",
			view: "View",
			doors: "Doors",
			defaults: "Setup",
			selectTitle: "Select and move cabinets",
			addTitle: "Add cabinet",
			measureTitle: "Measure between two points",
			viewTitle: "View: 3D, elevation or plan",
			doorsTitle: "Doors: open, closed or hidden",
			defaultsTitle: "Defaults for the whole run",
		},
		panel: {
			close: "Close panel",
			addTitle: "Add a cabinet",
			addHint: "Click one to drop it at the end of the run, or drag it onto the wall.",
			viewTitle: "View",
			viewHint: "How the room is drawn.",
			threeDHint: "See the room as it will look.",
			elevationHint: "Flat front-on — best for sizing.",
			planHint: "From above — best for depth and walkways.",
			doorsTitle: "Doors",
			doorsHint: "Applies to every unit. One cabinet's doors open from its own Open doors action.",
			defaultsTitle: "Defaults for this run",
			defaultsHint: "Set once, applies to everything — placed or not.",
		},
```

Inside the existing `room:` block:

```ts
			fitFree: "{mm} mm of wall still free.",
			fitOver: "The run is {mm} mm longer than the wall. Remove a cabinet or lengthen the wall.",
			moreSettings: "Skirting, ends, hang height…",
```

Inside the existing `selection:` block:

```ts
			verbResize: "Resize",
			verbReplace: "Replace",
			verbMove: "Move",
			verbOpenDoors: "Open doors",
			verbCloseDoors: "Close doors",
			moveMeta: "arrows + mm",
			replaceHeading: "Replace with",
			positionHeading: "Position",
			fromLeftWall: "From left wall",
			widthHint: "Neighbours stay put — a size with no room for it is greyed out. {name} comes in {n} widths.",
			moveHintFloor: "The arrows slide it along the wall. Vertical is locked for floor units.",
			moveHintWall: "The arrows slide it along the wall and set its hang height.",
			hangsAt: "hangs at {mm} mm",
			sizeRangeMeta: "{min}–{max} mm",
		},
```

New blocks, after `selection:`:

```ts
		design: {
			heading: "This design",
			hint: "Click a cabinet in the room to size it, swap it or move it.",
			room: "Room",
			wall: "Wall",
			run: "Run",
			wallFree: "Wall free",
			overBy: "over by {mm} mm",
			finish: "Finish",
			addCabinet: "Add a cabinet",
		},
		gizmo: {
			left: "Move left along the wall",
			right: "Move right along the wall",
			raise: "Raise this cabinet",
			lower: "Lower this cabinet",
			vertLocked: "Only wall cabinets move vertically",
			vertHint: "Change this cabinet's hang height",
		},
```

Inside the existing `price:` block:

```ts
			breakdown: "Breakdown",
			breakdownTitle: "What makes up {total}",
```

Inside the existing `canvas:` block:

```ts
			selectHint: "Click a cabinet to select it · right-click for its actions",
```

- [ ] **Step 2: Add the Chinese keys**

Same paths, same order, in `src/lib/copy/zh.ts`:

```ts
		tools: {
			ariaLabel: "工具",
			select: "选择",
			add: "添加",
			measure: "测量",
			view: "视图",
			doors: "门板",
			defaults: "设置",
			selectTitle: "选择并移动柜子",
			addTitle: "添加柜子",
			measureTitle: "测量两点之间的距离",
			viewTitle: "视图：3D、立面或平面",
			doorsTitle: "门板：打开、关闭或隐藏",
			defaultsTitle: "整排的默认设置",
		},
		panel: {
			close: "关闭面板",
			addTitle: "添加柜子",
			addHint: "点击即可加到整排末端，也可以拖到墙上。",
			viewTitle: "视图",
			viewHint: "房间的呈现方式。",
			threeDHint: "看看房间完成后的样子。",
			elevationHint: "正面平视——最适合确定尺寸。",
			planHint: "俯视——最适合看进深与通道。",
			doorsTitle: "门板",
			doorsHint: "适用于所有柜子。单个柜子的门板由它自己的“打开门板”操作控制。",
			defaultsTitle: "整排的默认设置",
			defaultsHint: "设置一次，适用于所有柜子——无论是否已摆放。",
		},
```

`room:` additions:

```ts
			fitFree: "墙面还剩 {mm} 毫米。",
			fitOver: "整排比墙面长 {mm} 毫米。请移除一个柜子或加长墙面。",
			moreSettings: "踢脚板、端板、悬挂高度…",
```

`selection:` additions:

```ts
			verbResize: "改尺寸",
			verbReplace: "更换",
			verbMove: "移动",
			verbOpenDoors: "打开门板",
			verbCloseDoors: "关上门板",
			moveMeta: "方向键 + 毫米",
			replaceHeading: "更换为",
			positionHeading: "位置",
			fromLeftWall: "距左墙",
			widthHint: "相邻柜子不会移动——放不下的尺寸会变灰。{name} 提供 {n} 种宽度。",
			moveHintFloor: "方向键让它沿墙滑动。落地柜无法上下移动。",
			moveHintWall: "方向键让它沿墙滑动，并设定悬挂高度。",
			hangsAt: "悬挂于 {mm} 毫米",
			sizeRangeMeta: "{min}–{max} 毫米",
```

New blocks:

```ts
		design: {
			heading: "本设计",
			hint: "点击房间里的柜子，即可改尺寸、更换或移动。",
			room: "房间",
			wall: "墙面",
			run: "整排",
			wallFree: "剩余墙面",
			overBy: "超出 {mm} 毫米",
			finish: "饰面",
			addCabinet: "添加柜子",
		},
		gizmo: {
			left: "沿墙向左移动",
			right: "沿墙向右移动",
			raise: "升高此柜",
			lower: "降低此柜",
			vertLocked: "只有壁柜可以上下移动",
			vertHint: "调整此柜的悬挂高度",
		},
```

`price:` additions:

```ts
			breakdown: "明细",
			breakdownTitle: "{total} 的构成",
```

`canvas:` addition:

```ts
			selectHint: "点击柜子即可选中 · 右键查看操作",
```

- [ ] **Step 3: Add the Malay keys**

Same paths, same order, in `src/lib/copy/ms.ts`:

```ts
		tools: {
			ariaLabel: "Alat",
			select: "Pilih",
			add: "Tambah",
			measure: "Ukur",
			view: "Paparan",
			doors: "Pintu",
			defaults: "Tetapan",
			selectTitle: "Pilih dan alihkan kabinet",
			addTitle: "Tambah kabinet",
			measureTitle: "Ukur jarak antara dua titik",
			viewTitle: "Paparan: 3D, elevasi atau pelan",
			doorsTitle: "Pintu: buka, tutup atau sembunyi",
			defaultsTitle: "Tetapan lalai untuk seluruh baris",
		},
		panel: {
			close: "Tutup panel",
			addTitle: "Tambah kabinet",
			addHint: "Klik untuk meletakkannya di hujung baris, atau seret ke dinding.",
			viewTitle: "Paparan",
			viewHint: "Cara bilik dilukis.",
			threeDHint: "Lihat bilik seperti rupanya nanti.",
			elevationHint: "Rata dari depan — terbaik untuk menetapkan saiz.",
			planHint: "Dari atas — terbaik untuk kedalaman dan laluan.",
			doorsTitle: "Pintu",
			doorsHint: "Terpakai untuk semua unit. Pintu satu kabinet dibuka melalui tindakan Buka pintu miliknya.",
			defaultsTitle: "Tetapan lalai untuk baris ini",
			defaultsHint: "Tetapkan sekali, terpakai untuk semua — sudah diletak atau belum.",
		},
```

`room:` additions:

```ts
			fitFree: "{mm} mm dinding masih kosong.",
			fitOver: "Baris ini {mm} mm lebih panjang daripada dinding. Buang satu kabinet atau panjangkan dinding.",
			moreSettings: "Papan kaki, hujung, ketinggian gantung…",
```

`selection:` additions:

```ts
			verbResize: "Ubah saiz",
			verbReplace: "Ganti",
			verbMove: "Alih",
			verbOpenDoors: "Buka pintu",
			verbCloseDoors: "Tutup pintu",
			moveMeta: "anak panah + mm",
			replaceHeading: "Ganti dengan",
			positionHeading: "Kedudukan",
			fromLeftWall: "Dari dinding kiri",
			widthHint: "Kabinet sebelah kekal di tempatnya — saiz yang tidak muat dikelabukan. {name} ada {n} lebar.",
			moveHintFloor: "Anak panah menggerakkannya di sepanjang dinding. Unit lantai tidak boleh naik turun.",
			moveHintWall: "Anak panah menggerakkannya di sepanjang dinding dan menetapkan ketinggian gantungnya.",
			hangsAt: "digantung pada {mm} mm",
			sizeRangeMeta: "{min}–{max} mm",
```

New blocks:

```ts
		design: {
			heading: "Reka bentuk ini",
			hint: "Klik kabinet dalam bilik untuk ubah saiz, ganti atau alihkannya.",
			room: "Bilik",
			wall: "Dinding",
			run: "Baris",
			wallFree: "Dinding kosong",
			overBy: "lebih {mm} mm",
			finish: "Kemasan",
			addCabinet: "Tambah kabinet",
		},
		gizmo: {
			left: "Alih ke kiri sepanjang dinding",
			right: "Alih ke kanan sepanjang dinding",
			raise: "Naikkan kabinet ini",
			lower: "Turunkan kabinet ini",
			vertLocked: "Hanya kabinet dinding boleh bergerak menegak",
			vertHint: "Ubah ketinggian gantung kabinet ini",
		},
```

`price:` additions:

```ts
			breakdown: "Perincian",
			breakdownTitle: "Apa yang membentuk {total}",
```

`canvas:` addition:

```ts
			selectHint: "Klik kabinet untuk memilihnya · klik kanan untuk tindakannya",
```

- [ ] **Step 4: Run the dictionary test**

Run: `pnpm vitest run src/lib/copy/__tests__/dictionary.test.ts`
Expected: PASS. A failure naming a path means that path is missing from one
locale or is identical to English in another — fix the locale, do not add the
path to `SHARED`.
- [ ] **Step 5: Commit**

```bash
git add src/lib/copy/en.ts src/lib/copy/zh.ts src/lib/copy/ms.ts
git commit -m "feat(copy): strings for the streamlined studio"
```

---

### Task 4: Shared chrome helpers + the tool rail

Three class-string helpers used by every panel, and the 60px rail itself. The
rail is pure — it knows nothing about panels, only which key is lit.

**Files:**
- Create: `src/components/planner/studio/chrome.ts`
- Create: `src/components/planner/studio/ToolRail.tsx`
- Modify: `src/components/planner/StudioScreen.tsx` (render the rail, hold the tool state)

**Interfaces:**
- Produces:
  - `chip(active: boolean): string`, `listBtn(active: boolean): string`, `verbBtn(active: boolean, danger?: boolean): string` from `chrome.ts`
  - `export type StudioTool = "select" | "add" | "measure" | "view" | "doors" | "defaults"`
  - `<ToolRail active={StudioTool} onPressAction={(tool: StudioTool) => void} />`
- Consumes: `t.planner.tools.*` from Task 3.

- [ ] **Step 1: Write the helpers**

`src/components/planner/studio/chrome.ts`:

```ts
/**
 * The three button shapes the studio chrome is built from.
 *
 * Class strings rather than components: these are used inside `map`s that also
 * set `aria-pressed`, `disabled` and `onClick`, and a wrapper component for
 * that is more surface than the string it hides. One file so twelve call sites
 * cannot drift apart.
 */

/** A small pill — room types, widths, on/off pairs. */
export const chip = (active: boolean) =>
	`min-h-9 rounded-lg px-3 py-2 text-[12px] transition ${
		active
			? "border border-neutral-900 bg-neutral-900 font-semibold text-white"
			: "border border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
	}`;

/** A full-width stacked option — label over hint. */
export const listBtn = (active: boolean) =>
	`flex w-full min-h-9 flex-col gap-0.5 rounded-[9px] px-3 py-2.5 text-left transition ${
		active
			? "border border-[#1f5138] bg-[#f2f7f4]"
			: "border border-neutral-200 bg-white hover:border-neutral-300"
	}`;

/** A verb row — label left, meta right. */
export const verbBtn = (active: boolean, danger = false) =>
	`flex w-full min-h-10 items-center gap-2 rounded-[9px] px-3 py-2.5 text-left transition ${
		danger
			? "border border-[#e8d9d4] bg-white text-[#8a2c1c] hover:bg-[#fdf6f4]"
			: active
				? "border border-[#1f5138] bg-[#f2f7f4] text-neutral-900"
				: "border border-neutral-200 bg-white text-neutral-900 hover:border-neutral-300"
	}`;
```

- [ ] **Step 2: Write the rail**

`src/components/planner/studio/ToolRail.tsx`:

```tsx
"use client";

import { useCopy } from "../CopyContext";

/** The six things the rail can put you in. `select` is the resting state. */
export type StudioTool =
	| "select"
	| "add"
	| "measure"
	| "view"
	| "doors"
	| "defaults";

/**
 * The glyphs are typed characters, not an icon set.
 *
 * Six glyphs is not worth a dependency on the mobile budget — the same
 * reasoning as the hand-drawn play triangle in the header.
 */
const GLYPH: Record<StudioTool, string> = {
	select: "⌖",
	add: "＋",
	measure: "⟺",
	view: "◱",
	doors: "◫",
	defaults: "⚙",
};

const ORDER: StudioTool[] = [
	"select",
	"add",
	"measure",
	"view",
	"doors",
	"defaults",
];

export function ToolRail({
	active,
	onPressAction,
}: {
	active: StudioTool;
	onPressAction: (tool: StudioTool) => void;
}) {
	const t = useCopy();
	const label: Record<StudioTool, string> = {
		select: t.planner.tools.select,
		add: t.planner.tools.add,
		measure: t.planner.tools.measure,
		view: t.planner.tools.view,
		doors: t.planner.tools.doors,
		defaults: t.planner.tools.defaults,
	};
	const title: Record<StudioTool, string> = {
		select: t.planner.tools.selectTitle,
		add: t.planner.tools.addTitle,
		measure: t.planner.tools.measureTitle,
		view: t.planner.tools.viewTitle,
		doors: t.planner.tools.doorsTitle,
		defaults: t.planner.tools.defaultsTitle,
	};

	return (
		<nav
			aria-label={t.planner.tools.ariaLabel}
			className="flex shrink-0 flex-row items-center gap-1 border-neutral-200 border-b bg-white px-2 py-1.5 lg:w-[60px] lg:flex-col lg:border-r lg:border-b-0 lg:px-0 lg:py-2"
		>
			{ORDER.map((tool) => {
				const on = tool === active;
				return (
					<button
						key={tool}
						type="button"
						onClick={() => onPressAction(tool)}
						aria-pressed={on}
						title={title[tool]}
						className={`flex min-h-11 w-11 flex-col items-center justify-center gap-[3px] rounded-[9px] border transition ${
							on
								? "border-[#1f5138] bg-[#e7efe9] text-[#17402c]"
								: "border-transparent text-neutral-600 hover:bg-[#f4f3f1]"
						}`}
					>
						<span aria-hidden className="text-[16px] leading-none">
							{GLYPH[tool]}
						</span>
						<span className="text-[9px] leading-none tracking-[0.01em]">
							{label[tool]}
						</span>
					</button>
				);
			})}
		</nav>
	);
}
```

- [ ] **Step 3: Hold the tool state in `StudioScreen`**

In `src/components/planner/StudioScreen.tsx`, next to the other `useState`
calls (around line 247):

```tsx
// The rail's active tool. `select` is the resting state; `measure` is the
// old `measureMode` under a new name, and the other four open the overlay
// panel. One piece of state rather than two, so the rail and the panel can
// never disagree about what is open.
const [tool, setTool] = useState<StudioTool>("select");
const panel: StudioTool | null =
	tool === "select" || tool === "measure" ? null : tool;
const measureMode = tool === "measure";
```

Delete the `const [measureMode, setMeasureMode] = useState(false);` line and
replace the header's Measure button handler with:

```tsx
const pressTool = (next: StudioTool) => {
	setTool((current) => (current === next ? "select" : next));
	if (next === "measure") {
		setMeasurePoints([]);
		// A dimension line taken to a door drawn open is a wrong number shown
		// to a customer: `snapToCabinet` snaps against the closed geometry
		// either way. Shut them rather than measure a lie.
		setOpenIds(new Set());
	}
};
```

Render the rail as the first child of the `<div className="flex min-h-0 flex-1 …">`
row, before the room `<aside>`:

```tsx
<ToolRail active={tool} onPressAction={pressTool} />;
```

Remove the Measure button and the view `<fieldset>` from `PlannerHeader` — both
move to the rail and its panels in Task 5. Keep the tutorials link, the change-room
button and `<AdminLink />`.
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. `pnpm dev`, open `/en/planner`, choose a room: the rail renders
on the left, `Measure` lights up and behaves as the old header button did, and
the other five do nothing yet (the panel arrives next task).
- [ ] **Step 5: Commit**

```bash
git add src/components/planner/studio/chrome.ts src/components/planner/studio/ToolRail.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): icon tool rail for the studio"
```

---

### Task 5: The overlay panel — Add, View, Doors, Defaults

The 296px panel that slides over the canvas. It is where the controls scattered
down today's left rail go, plus the view toggle out of the header. Nothing is
dropped: the Add cards keep their `draggable` behaviour and the drop target on
the canvas is untouched.

**Files:**
- Create: `src/components/planner/studio/StudioPanel.tsx`
- Modify: `src/components/planner/StudioScreen.tsx` (render it, pass handlers; delete the moved markup)

**Interfaces:**
- Consumes: `StudioTool` (Task 4), `chip` / `listBtn` (Task 4), `t.planner.panel.*` (Task 3), engine `closeGaps`, `flushWallToTallTops`, `setBaseSkirting`, `setWallToCeiling`, `setWallToWall`, `setHangingHeight`, `fits`, `addModule`.
- Produces: `<StudioPanel panel={Exclude<StudioTool,"select"|"measure">} … />` with props listed in the code below.

- [ ] **Step 1: Write the panel**

`src/components/planner/studio/StudioPanel.tsx`:

```tsx
"use client";

import { useCopy } from "../CopyContext";
import { chip, listBtn } from "./chrome";
import type { StudioTool } from "./ToolRail";

export type PanelKind = Exclude<StudioTool, "select" | "measure">;

export function StudioPanel({
	kind,
	onCloseAction,
	children,
}: {
	kind: PanelKind;
	onCloseAction: () => void;
	children: React.ReactNode;
}) {
	const t = useCopy();
	const title = {
		add: t.planner.panel.addTitle,
		view: t.planner.panel.viewTitle,
		doors: t.planner.panel.doorsTitle,
		defaults: t.planner.panel.defaultsTitle,
	}[kind];
	const hint = {
		add: t.planner.panel.addHint,
		view: t.planner.panel.viewHint,
		doors: t.planner.panel.doorsHint,
		defaults: t.planner.panel.defaultsHint,
	}[kind];

	return (
		<div className="absolute inset-y-0 left-0 z-10 flex w-[296px] max-w-full flex-col border-neutral-200 border-r bg-white shadow-[6px_0_24px_rgba(0,0,0,.06)]">
			<div className="flex items-start justify-between gap-2.5 border-[#f0efec] border-b px-3.5 pt-3.5 pb-2.5">
				<div>
					<p className="font-semibold text-[13px]">{title}</p>
					<p className="mt-0.5 text-[12px] text-neutral-500 leading-4">
						{hint}
					</p>
				</div>
				<button
					type="button"
					onClick={onCloseAction}
					aria-label={t.planner.panel.close}
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[14px] text-neutral-600 hover:bg-[#f4f3f1] hover:text-neutral-900"
				>
					✕
				</button>
			</div>
			<div className="flex-1 overflow-y-auto p-3.5">{children}</div>
		</div>
	);
}

/** One stacked option — used by the View and Doors bodies. */
export function PanelOption({
	label,
	hint,
	pressed,
	onPressAction,
}: {
	label: string;
	hint: string;
	pressed: boolean;
	onPressAction: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPressAction}
			aria-pressed={pressed}
			className={listBtn(pressed)}
		>
			<span className="font-semibold text-[13px]">{label}</span>
			<span className="text-[11px] text-neutral-500 leading-[15px]">
				{hint}
			</span>
		</button>
	);
}

/** A labelled pair of chips with a note under it — the Defaults body's unit. */
export function PanelToggle<T>({
	label,
	hint,
	value,
	options,
	onPickAction,
}: {
	label: string;
	hint: string;
	value: T;
	options: { value: T; label: string }[];
	onPickAction: (value: T) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-medium text-[12px] text-neutral-700">{label}</p>
			<div className="flex flex-wrap gap-1">
				{options.map((option) => (
					<button
						key={String(option.value)}
						type="button"
						onClick={() => onPickAction(option.value)}
						aria-pressed={option.value === value}
						className={chip(option.value === value)}
					>
						{option.label}
					</button>
				))}
			</div>
			<p className="text-[11px] text-[#8a857c] leading-[15px]">{hint}</p>
		</div>
	);
}
```

- [ ] **Step 2: Render it over the canvas**

In `StudioScreen.tsx`, inside the canvas `<div className="relative min-h-[45vh] flex-1" …>`
and **before** `<PlannerScene …/>`, add:

```tsx
{
	panel && (
		<StudioPanel kind={panel} onCloseAction={() => setTool("select")}>
			{panel === "add" && addBody}
			{panel === "view" && viewBody}
			{panel === "doors" && doorsBody}
			{panel === "defaults" && defaultsBody}
		</StudioPanel>
	);
}
```

- [ ] **Step 3: Move the four bodies out of the left rail**

Define them above the `return` in `StudioScreen`. `addBody` is the existing
palette markup from lines ~677–728 verbatim — the same `draggable`,
`onDragStart`, `onDragEnd`, `onClick`, `disabled={!canFit}` and `FamilyThumb`
— re-wrapped as a two-column grid:

```tsx
const addBody = (
	<div className="grid grid-cols-2 gap-2">
		{/* …the existing room.familyIds.map(...) block, unchanged… */}
	</div>
);

const viewBody = (
	<div className="flex flex-col gap-1.5">
		{views(t).map((option) => (
			<PanelOption
				key={option.id}
				label={option.label}
				hint={
					option.id === "3d"
						? t.planner.panel.threeDHint
						: option.id === "elevation"
							? t.planner.panel.elevationHint
							: t.planner.panel.planHint
				}
				pressed={view === option.id}
				onPressAction={() => setView(option.id)}
			/>
		))}
	</div>
);

const doorsBody = (
	<div className="flex flex-col gap-1.5">
		{doorModes(t).map((mode) => (
			<PanelOption
				key={mode.id}
				label={mode.label}
				hint={
					mode.id === "hidden"
						? t.planner.room.frontsOffNote
						: mode.id === "open"
							? t.planner.room.interiorsShownNote
							: t.planner.room.openDoorsNote
				}
				pressed={doorView === mode.id}
				onPressAction={() => {
					setDoorsHidden(mode.id === "hidden");
					setOpenIds(
						mode.id === "open"
							? new Set(withDoors.map((p) => p.placed.id))
							: new Set(),
					);
				}}
			/>
		))}
	</div>
);
```

`defaultsBody` carries everything the design folds in here, plus the three
things the design has no place for (wall mode, flush tops, close gaps):

```tsx
const defaultsBody = (
	<div className="flex flex-col gap-4">
		<PanelToggle
			label={t.planner.room.baseUnitsAria}
			hint={
				layout.baseSkirting
					? t.planner.room.kickBoardNote
					: t.planner.room.levellersNote
			}
			value={layout.baseSkirting}
			options={baseModes(t).map((m) => ({ value: m.skirted, label: m.label }))}
			onPickAction={(skirted) =>
				setLayoutAction((prev) => setBaseSkirting(prev, skirted))
			}
		/>

		<PanelToggle
			label={t.planner.room.runAria}
			hint={
				layout.wallToWall
					? t.planner.room.noPanelNeededNote
					: t.planner.room.panelNeededNote
			}
			value={layout.wallToWall}
			options={runModes(t).map((m) => ({ value: m.toWall, label: m.label }))}
			onPickAction={(toWall) =>
				setLayoutAction((prev) => setWallToWall(prev, toWall))
			}
		/>

		<PanelToggle
			label={t.planner.room.wallUnitsAria}
			hint={fill(t.planner.room.undersidesNote, {
				height: hangingHeightMmOf(layout),
			})}
			value={layout.wallToCeiling}
			options={wallModes(t).map((m) => ({
				value: m.toCeiling,
				label: m.label,
			}))}
			onPickAction={(toCeiling) =>
				setLayoutAction((prev) => setWallToCeiling(prev, toCeiling))
			}
		/>

		{!layout.wallToCeiling && (
			<DimensionField
				label={t.planner.room.wallUnitsHangAt}
				valueMm={layout.hangingHeightMm}
				minMm={WALL_HANG_LIMITS.minMm}
				maxMm={WALL_HANG_LIMITS.maxMm}
				stepMm={10}
				onChangeAction={(mm) =>
					setLayoutAction((prev) => setHangingHeight(prev, mm))
				}
			/>
		)}

		<button
			type="button"
			onClick={() => setLayoutAction(flushWallToTallTops(layout))}
			disabled={!canFlush}
			className="self-start text-[12px] text-[#1f5138] underline hover:text-[#17402c] disabled:text-neutral-300 disabled:no-underline"
		>
			{canFlush
				? t.planner.room.flushWallUnitTops
				: t.planner.room.addTallFirst}
		</button>

		<button
			type="button"
			onClick={() => setLayoutAction(closeGaps(layout))}
			disabled={gapCount === 0}
			className="self-start text-[12px] text-[#1f5138] underline hover:text-[#17402c] disabled:text-neutral-300 disabled:no-underline"
		>
			{gapCount > 0
				? fill(t.planner.run.closeGapsCount, { n: gapCount })
				: t.planner.run.closeGaps}
		</button>
	</div>
);
```

`canFlush` is whatever condition today's flush button uses — read it off
`StudioScreen.tsx` around line 548 and lift it into a named `const canFlush =
…` above these bodies rather than duplicating the expression.

Delete the moved markup from the left `<aside>`: the wall-units fieldset, the
base fieldset, the run fieldset, the doors fieldset, the flush button and the
whole "Add cabinets" section. The room card keeps only its heading, the room
chips and the three `DimensionField`s (Task 6 finishes it).
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: each of Add / View / Doors / Setup opens the
overlay with the right body; ✕ and pressing the lit tool both close it;
dragging a card from Add onto the canvas still drops a cabinet; Close gaps and
Flush tops still work and still disable when they should.
- [ ] **Step 5: Commit**

```bash
git add src/components/planner/studio/StudioPanel.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): overlay panel for add, view, doors and defaults"
```

---

### Task 6: The room panel

The 236px column: room chips, three dimension fields, the fit line, the
overhang warning, and the button that opens Defaults.

**Files:**
- Create: `src/components/planner/studio/RoomPanel.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `chip` (Task 4), `t.planner.room.fitFree` / `fitOver` / `moreSettings` (Task 3), `DimensionField`, engine `setWallWidth`, `setCeilingHeight`, `setRoomDepth`, `minWallWidthMm`, `overhangMm`, `runExtentMm`.
- Produces: `<RoomPanel … />` — props exactly as in the code below.

- [ ] **Step 1: Write it**

`src/components/planner/studio/RoomPanel.tsx`:

```tsx
"use client";

import { fill } from "@/lib/copy/fill";
import {
	CEILING_LIMITS,
	ROOM_DEPTH_LIMITS,
	type RoomTypeId,
} from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import { type PlannerLayout, WALL_LIMITS } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";
import { DimensionField } from "../DimensionField";
import { chip } from "./chrome";

export function RoomPanel({
	catalogue,
	roomId,
	layout,
	minWallMm,
	freeMm,
	overhangMm,
	onChangeRoomAction,
	onWallWidthAction,
	onCeilingAction,
	onDepthAction,
	onOpenDefaultsAction,
}: {
	catalogue: PlannerCatalogue;
	roomId: RoomTypeId;
	layout: PlannerLayout;
	/** The shortest wall the placed run fits on — the slider's real floor. */
	minWallMm: number;
	/** Wall left over, negative when the run is longer than the wall. */
	freeMm: number;
	overhangMm: number;
	onChangeRoomAction: (id: RoomTypeId) => void;
	onWallWidthAction: (mm: number) => void;
	onCeilingAction: (mm: number) => void;
	onDepthAction: (mm: number) => void;
	onOpenDefaultsAction: () => void;
}) {
	const t = useCopy();

	return (
		<aside
			aria-label={t.planner.room.heading}
			className="flex w-full shrink-0 flex-col gap-3.5 overflow-y-auto border-neutral-200 border-b bg-white p-4 lg:h-full lg:w-[236px] lg:border-r lg:border-b-0"
		>
			<div>
				<h2 className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
					{t.planner.room.heading}
				</h2>
				<p className="mt-[3px] text-[12px] text-neutral-500 leading-4">
					{t.planner.room.subtitle}
				</p>
			</div>

			<div className="flex flex-wrap gap-1">
				{catalogue.roomTypes.map((option) => (
					<button
						key={option.id}
						type="button"
						onClick={() => onChangeRoomAction(option.id)}
						aria-pressed={option.id === roomId}
						className={chip(option.id === roomId)}
					>
						{option.label}
					</button>
				))}
			</div>

			<DimensionField
				label={t.planner.room.wallLength}
				valueMm={layout.wallWidthMm}
				minMm={minWallMm}
				maxMm={WALL_LIMITS.maxMm}
				stepMm={50}
				onChangeAction={onWallWidthAction}
			/>
			{minWallMm > WALL_LIMITS.minMm && layout.wallWidthMm === minWallMm && (
				<p className="-mt-1 text-[11px] text-neutral-500 leading-4">
					{fill(t.planner.room.narrowWallNote, { min: minWallMm })}
				</p>
			)}

			<DimensionField
				label={t.planner.room.ceiling}
				valueMm={layout.ceilingHeightMm}
				minMm={CEILING_LIMITS.minMm}
				maxMm={CEILING_LIMITS.maxMm}
				stepMm={10}
				onChangeAction={onCeilingAction}
			/>

			<DimensionField
				label={t.planner.room.roomDepth}
				valueMm={layout.roomDepthMm}
				minMm={ROOM_DEPTH_LIMITS.minMm}
				maxMm={ROOM_DEPTH_LIMITS.maxMm}
				stepMm={50}
				onChangeAction={onDepthAction}
			/>

			<div className="mt-0.5 flex flex-col gap-1.5 border-[#f0efec] border-t pt-3">
				<p className="text-[12px] text-neutral-500 leading-[17px]">
					{freeMm < 0
						? fill(t.planner.room.fitOver, { mm: -freeMm })
						: fill(t.planner.room.fitFree, { mm: freeMm })}
				</p>
				{overhangMm > 0 && (
					<p className="text-[11px] text-amber-700 leading-4">
						{fill(t.planner.room.overhangWarning, { overhang: overhangMm })}
					</p>
				)}
				<button
					type="button"
					onClick={onOpenDefaultsAction}
					className="min-h-9 self-start rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[12px] text-neutral-700 hover:bg-[#faf9f7] hover:text-neutral-900"
				>
					{t.planner.room.moreSettings}
				</button>
			</div>
		</aside>
	);
}
```

- [ ] **Step 2: Swap it in**

In `StudioScreen.tsx`, delete the whole left `<aside>` and render instead:

```tsx
<RoomPanel
	catalogue={catalogue}
	roomId={roomId}
	layout={layout}
	minWallMm={minWallMm}
	freeMm={layout.wallWidthMm - runExtentMm(layout)}
	overhangMm={overhang}
	onChangeRoomAction={onChangeRoomAction}
	onWallWidthAction={(mm) => setLayoutAction((prev) => setWallWidth(prev, mm))}
	onCeilingAction={(mm) =>
		setLayoutAction((prev) => setCeilingHeight(prev, mm))
	}
	onDepthAction={(mm) => setLayoutAction((prev) => setRoomDepth(prev, mm))}
	onOpenDefaultsAction={() => setTool("defaults")}
/>;
```

Add `runExtentMm` to the `useEngine()` destructure.
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: the three sliders still clamp as before, the fit
line flips to the over-length sentence when you shorten the wall under the run,
the overhang warning still appears, and the settings button opens Defaults.
- [ ] **Step 4: Commit**

```bash
git add src/components/planner/studio/RoomPanel.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): trim the room panel to room, size and fit"
```

---

### Task 7: The selection panel — verbs

The right panel when something is selected. Six verbs; four of them expand a
section under the list. Front and hinge stay, one level deeper, because a door
style is not a verb — it is a property of the cabinet, and the design's own
mock has a permanent finish section for exactly that reason.

**Files:**
- Create: `src/components/planner/studio/SelectionPanel.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `replaceFamily` (Task 1), `setHangAt` (Task 2), `verbBtn` / `chip` (Task 4), `t.planner.selection.*` (Task 3), engine `setWidth`, `widthOptionsFor`, `duplicateModule`, `moveModule`, `leavesOn` (already in `StudioScreen.tsx`).
- Produces: `export type SelectionVerb = "resize" | "replace" | "move" | "doors" | null` and `<SelectionPanel … />`.

- [ ] **Step 1: Write it**

`src/components/planner/studio/SelectionPanel.tsx`. The verb list, then the
open section, then Front, then Swing:

```tsx
"use client";

import { fill } from "@/lib/copy/fill";
import type { Construction } from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import type {
	HingeSide,
	PlannerLayout,
	Positioned,
} from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";
import { chip, verbBtn } from "./chrome";

export type SelectionVerb = "resize" | "replace" | "move" | "doors" | null;

export function SelectionPanel({
	catalogue,
	layout,
	selected,
	verb,
	onVerbAction,
	widthOptions,
	replaceOptions,
	doorsOpen,
	hingeOptions,
	leaves,
	priceLabel,
	onWidthAction,
	onReplaceAction,
	onOffsetAction,
	onToggleDoorAction,
	onHingeAction,
	onDoorStyleAction,
	onDuplicateAction,
	onRemoveAction,
}: {
	catalogue: PlannerCatalogue;
	layout: PlannerLayout;
	selected: Positioned;
	verb: SelectionVerb;
	onVerbAction: (verb: SelectionVerb) => void;
	widthOptions: { widthMm: number; fits: boolean }[];
	/** Families in the same row as this cabinet — the only legal swaps. */
	replaceOptions: {
		id: string;
		label: string;
		meta: string;
		current: boolean;
	}[];
	doorsOpen: boolean;
	hingeOptions: { side: HingeSide; label: string }[];
	leaves: number;
	priceLabel: string;
	onWidthAction: (widthMm: number) => void;
	onReplaceAction: (familyId: string) => void;
	onOffsetAction: (xMm: number) => void;
	onToggleDoorAction: () => void;
	onHingeAction: (side: HingeSide) => void;
	onDoorStyleAction: (doorStyleId: string | null) => void;
	onDuplicateAction: () => void;
	onRemoveAction: () => void;
}) {
	const t = useCopy();
	const isWall = selected.family.kind === "wall";
	const hangAtMm = selected.placed.hangAtMm ?? layout.hangingHeightMm;

	const verbs: {
		key: Exclude<SelectionVerb, null> | "duplicate" | "remove";
		label: string;
		meta: string;
		danger?: boolean;
		press: () => void;
	}[] = [
		{
			key: "resize",
			label: t.planner.selection.verbResize,
			meta: `${selected.widthMm} mm`,
			press: () => onVerbAction(verb === "resize" ? null : "resize"),
		},
		{
			key: "replace",
			label: t.planner.selection.verbReplace,
			meta: selected.family.label,
			press: () => onVerbAction(verb === "replace" ? null : "replace"),
		},
		{
			key: "move",
			label: t.planner.selection.verbMove,
			meta: t.planner.selection.moveMeta,
			press: () => onVerbAction(verb === "move" ? null : "move"),
		},
		{
			key: "doors",
			label: doorsOpen
				? t.planner.selection.verbCloseDoors
				: t.planner.selection.verbOpenDoors,
			meta: "",
			press: onToggleDoorAction,
		},
		{
			key: "duplicate",
			label: t.planner.selection.duplicate,
			meta: "⌘D",
			press: onDuplicateAction,
		},
		{
			key: "remove",
			label: t.planner.selection.remove,
			meta: "Del",
			danger: true,
			press: onRemoveAction,
		},
	];

	return (
		<div>
			<div className="border-[#f0efec] border-b px-4 py-3.5">
				<p className="font-semibold text-[11px] text-[#1f5138] uppercase tracking-[0.06em]">
					{t.planner.selection.heading}
				</p>
				<p className="mt-1 font-semibold text-[15px]">
					{fill(t.planner.selection.nameWidth, {
						name: selected.family.label,
						width: selected.widthMm,
					})}
				</p>
				<p className="mt-0.5 text-[12px] text-neutral-500">
					{selected.widthMm} × {selected.family.heightMm} ×{" "}
					{selected.family.depthMm} mm · {priceLabel}
					{isWall
						? ` · ${fill(t.planner.selection.hangsAt, { mm: hangAtMm })}`
						: ""}
				</p>
			</div>

			<div className="flex flex-col gap-1.5 border-[#f0efec] border-b px-4 py-3">
				{verbs.map((v) => (
					<button
						key={v.key}
						type="button"
						onClick={v.press}
						aria-pressed={v.key === verb}
						className={verbBtn(v.key === verb, v.danger)}
					>
						<span className="font-medium text-[13px]">{v.label}</span>
						<span className="ml-auto text-[11px] text-[#8a857c]">{v.meta}</span>
					</button>
				))}
			</div>

			{verb === "resize" && (
				<section className="flex flex-col gap-2 border-[#f0efec] border-b px-4 py-3.5">
					<p className="font-semibold text-[12px] text-neutral-700">
						{t.planner.selection.width}
					</p>
					<div className="flex flex-wrap gap-1">
						{widthOptions.map((option) => (
							<button
								key={option.widthMm}
								type="button"
								disabled={!option.fits}
								onClick={() => onWidthAction(option.widthMm)}
								aria-pressed={option.widthMm === selected.widthMm}
								className={`${chip(option.widthMm === selected.widthMm)} disabled:cursor-not-allowed disabled:text-neutral-300`}
							>
								{option.widthMm}
								{!option.fits && ` · ${t.planner.selection.noRoom}`}
							</button>
						))}
					</div>
					<p className="text-[11px] text-[#8a857c] leading-[15px]">
						{fill(t.planner.selection.widthHint, {
							name: selected.family.label,
							n: selected.family.sizes.length,
						})}
					</p>
				</section>
			)}

			{verb === "replace" && (
				<section className="flex flex-col gap-1.5 border-[#f0efec] border-b px-4 py-3.5">
					<p className="font-semibold text-[12px] text-neutral-700">
						{t.planner.selection.replaceHeading}
					</p>
					{replaceOptions.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => onReplaceAction(option.id)}
							aria-pressed={option.current}
							className={verbBtn(option.current)}
						>
							<span className="font-medium text-[13px]">{option.label}</span>
							<span className="ml-auto text-[11px] text-[#8a857c]">
								{option.meta}
							</span>
						</button>
					))}
				</section>
			)}

			{verb === "move" && (
				<section className="flex flex-col gap-2 border-[#f0efec] border-b px-4 py-3.5">
					<p className="font-semibold text-[12px] text-neutral-700">
						{t.planner.selection.positionHeading}
					</p>
					<div className="flex items-center justify-between gap-2">
						<label htmlFor="offsetmm" className="text-[12px] text-neutral-500">
							{t.planner.selection.fromLeftWall}
						</label>
						<span className="flex items-center gap-1">
							<input
								id="offsetmm"
								type="number"
								value={Math.round(selected.xMm)}
								onChange={(e) => onOffsetAction(Number(e.target.value))}
								className="w-[70px] rounded-[7px] border border-neutral-300 px-2 py-1.5 text-right text-[12px]"
							/>
							<span className="text-[11px] text-[#8a857c]">mm</span>
						</span>
					</div>
					<p className="text-[11px] text-[#8a857c] leading-[15px]">
						{isWall
							? t.planner.selection.moveHintWall
							: t.planner.selection.moveHintFloor}
					</p>
				</section>
			)}

			<section className="flex flex-col gap-2 px-4 py-3.5">
				<p className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
					{t.planner.selection.front}
				</p>
				<div className="flex flex-wrap gap-1">
					{catalogue.doorStyles.map((style) => (
						<button
							key={style.id}
							type="button"
							onClick={() => onDoorStyleAction(style.id)}
							aria-pressed={selected.placed.doorStyleId === style.id}
							className={chip(selected.placed.doorStyleId === style.id)}
						>
							{style.label}
						</button>
					))}
					{selected.placed.doorStyleId && (
						<button
							type="button"
							onClick={() => onDoorStyleAction(null)}
							className="min-h-9 px-2 text-[12px] text-neutral-500 underline hover:text-neutral-900"
						>
							{t.planner.selection.noDoor}
						</button>
					)}
				</div>

				{/* Only a lone leaf gets a choice: a pair always hinges outward from
				    the middle, which is the only way a pair is hung. */}
				{selected.placed.doorStyleId && leaves === 1 && (
					<div className="flex flex-wrap gap-1">
						{hingeOptions.map((option) => (
							<button
								key={option.side}
								type="button"
								onClick={() => onHingeAction(option.side)}
								aria-pressed={selected.placed.hinge === option.side}
								className={chip(selected.placed.hinge === option.side)}
							>
								{option.label}
							</button>
						))}
					</div>
				)}
			</section>
		</div>
	);
}
```

- [ ] **Step 2: Wire it up**

In `StudioScreen.tsx`, add `const [verb, setVerb] = useState<SelectionVerb>(null);`
and clear it whenever the selection changes (inside `select`, when the id
differs from the current one). Replace the right `<aside>`'s single-selection
branch with `<SelectionPanel … />`, passing:

```tsx
					widthOptions={widthOptionsFor(layout, selected.placed.id)}
					replaceOptions={catalogue.families
						.filter(
							(family) =>
								rowFor(family.kind) === rowFor(selected.family.kind) &&
								room.familyIds.includes(family.id),
						)
						.map((family) => ({
							id: family.id,
							label: family.label,
							meta: fill(t.planner.selection.sizeRangeMeta, {
								min: family.sizes[0].widthMm,
								max: family.sizes[family.sizes.length - 1].widthMm,
							}),
							current: family.id === selected.family.id,
						}))}
					onReplaceAction={(familyId) =>
						setLayoutAction((prev) =>
							replaceFamily(prev, selected.placed.id, familyId),
						)
					}
					onOffsetAction={(xMm) =>
						setLayoutAction((prev) => moveModule(prev, selected.placed.id, xMm))
					}
					leaves={leavesOn(selected, construction)}
					hingeOptions={hingeSides(t)}
					priceLabel={formatRm(
						price.cabinets.find((l) => l.id === selected.placed.id)?.amountRm ?? 0,
						{ maximumFractionDigits: 0 },
					)}
```

`rowFor` is exported from `@/lib/planner/layout`; add `replaceFamily` and
`moveModule` to the `useEngine()` destructure. **Leave the multi-selection
branch exactly as it is** — it moves nowhere and loses nothing.
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: select a base cabinet — Resize opens the ladder
with unfittable rungs greyed; Replace lists only floor families and swapping to
Drawer base keeps the left edge; Move's mm field slides it; Open doors toggles
and shows the hinge chips for a single-leaf front; Duplicate and Remove work;
shift-clicking two cabinets still shows the multi-select branch.
- [ ] **Step 4: Commit**

```bash
git add src/components/planner/studio/SelectionPanel.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): verb-driven selection panel"
```

---

### Task 8: "This design" — the empty state

What the right panel shows with nothing selected: the recap the design draws,
plus the run list, reset and the add button, so nothing from today's panel is
homeless.

**Files:**
- Create: `src/components/planner/studio/DesignRecap.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `t.planner.design.*` (Task 3), `t.planner.run.*` (existing).
- Produces: `<DesignRecap … />`.

- [ ] **Step 1: Write it**

`src/components/planner/studio/DesignRecap.tsx`:

```tsx
"use client";

import { fill } from "@/lib/copy/fill";
import type { Positioned } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";

export function DesignRecap({
	rows,
	placed,
	selectedIds,
	priceOf,
	onSelectAction,
	onAddAction,
	onResetAction,
}: {
	/** Label/value pairs, already formatted by the caller. */
	rows: { label: string; value: string }[];
	placed: Positioned[];
	selectedIds: ReadonlySet<string>;
	priceOf: (id: string) => number;
	onSelectAction: (id: string, additive: boolean) => void;
	onAddAction: () => void;
	onResetAction: () => void;
}) {
	const t = useCopy();

	return (
		<div className="p-4">
			<h2 className="font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
				{t.planner.design.heading}
			</h2>
			<p className="mt-1.5 mb-3.5 text-[13px] text-neutral-700 leading-[19px]">
				{t.planner.design.hint}
			</p>

			<dl className="m-0 flex flex-col">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-baseline justify-between gap-3 border-[#f4f3f1] border-t py-2"
					>
						<dt className="text-[12px] text-neutral-500">{row.label}</dt>
						<dd className="m-0 text-right font-medium text-[13px]">
							{row.value}
						</dd>
					</div>
				))}
			</dl>

			<button
				type="button"
				onClick={onAddAction}
				className="mt-3.5 min-h-9 w-full rounded-[9px] border border-neutral-900 bg-white px-3.5 py-2.5 font-semibold text-[13px] hover:bg-[#f4f3f1]"
			>
				{t.planner.design.addCabinet}
			</button>

			<div className="mt-4">
				<p className="mb-1.5 font-semibold text-[11px] text-neutral-600 uppercase tracking-[0.06em]">
					{fill(t.planner.run.heading, {
						count: placed.length,
						unit: placed.length === 1 ? t.planner.unit : t.planner.units,
					})}
				</p>
				{placed.length === 0 ? (
					<p className="text-[12px] text-neutral-500">
						{t.planner.run.emptyHint}
					</p>
				) : (
					<div className="flex flex-col">
						{placed.map((position) => (
							<div
								key={position.placed.id}
								className={`flex items-center gap-2 border-neutral-100 border-t py-1.5 text-[13px] ${
									selectedIds.has(position.placed.id) ? "bg-[#f2f7f4]" : ""
								}`}
							>
								<input
									type="checkbox"
									checked={selectedIds.has(position.placed.id)}
									aria-label={fill(t.planner.run.selectAria, {
										name: position.family.label,
									})}
									onChange={() => onSelectAction(position.placed.id, true)}
								/>
								<button
									type="button"
									onClick={(e) =>
										onSelectAction(
											position.placed.id,
											e.shiftKey || e.metaKey || e.ctrlKey,
										)
									}
									className="flex-1 text-left"
								>
									{position.family.label} {position.widthMm}{" "}
									<span className="text-[11px] text-neutral-400">
										{position.placed.doorStyleId ?? t.planner.run.noDoorInline}
									</span>
								</button>
								<span className="tabular-nums text-[13px] text-neutral-600">
									{Math.round(priceOf(position.placed.id))}
								</span>
							</div>
						))}
					</div>
				)}
				<button
					type="button"
					onClick={onResetAction}
					className="mt-2 text-[11px] text-neutral-500 underline hover:text-neutral-900"
				>
					{t.planner.run.reset}
				</button>
			</div>
		</div>
	);
}
```

- [ ] **Step 2: Wire it up**

Replace the right panel's empty branch and the separate run-list block in
`StudioScreen.tsx` with:

```tsx
<DesignRecap
	rows={[
		{ label: t.planner.design.room, value: room.label },
		{
			label: t.planner.design.wall,
			value: `${(layout.wallWidthMm / 1000).toFixed(2)} m · ${(
				layout.ceilingHeightMm / 1000
			).toFixed(2)} m`,
		},
		{
			label: t.planner.design.run,
			value: `${(runExtentMm(layout) / 1000).toFixed(2)} m · ${
				placed.length
			} ${placed.length === 1 ? t.planner.unit : t.planner.units}`,
		},
		{
			label: t.planner.design.wallFree,
			value:
				freeMm < 0
					? fill(t.planner.design.overBy, { mm: -freeMm })
					: `${freeMm} mm`,
		},
		{
			label: t.planner.design.finish,
			value: catalogue.finishes.find((f) => f.id === finish)?.label ?? "",
		},
	]}
	placed={placed}
	selectedIds={selectedSet}
	priceOf={(id) => price.cabinets.find((l) => l.id === id)?.amountRm ?? 0}
	onSelectAction={select}
	onAddAction={() => setTool("add")}
	onResetAction={() => {
		setLayoutAction(starterFor(roomId));
		setSelectedIdsAction([]);
	}}
/>;
```

Lift `const freeMm = layout.wallWidthMm - runExtentMm(layout);` next to
`minWallMm` and pass the same value to `RoomPanel` rather than recomputing it.

The finish swatch row stays where it is, above the footer — the design keeps it
visible in both states.
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: with nothing selected the recap reads correctly,
the run list still multi-selects with its checkboxes, reset restores the
starter, "Add a cabinet" opens the Add panel.
- [ ] **Step 4: Commit**

```bash
git add src/components/planner/studio/DesignRecap.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): design recap and run list in the empty state"
```

---

### Task 9: Sticky total and the breakdown modal

The full price list stops living in the sidebar. The footer carries the total
as a button; the modal carries the lines. The quote CTA still calls
`onGoToQuoteAction` — the modal collects nothing.

**Files:**
- Create: `src/components/planner/studio/PriceFooter.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `computePlannerPrice` result (already computed in `StudioScreen` as `price`), `priceLineLabel` / `priceLineDetail` from `./priceLineCopy`, `t.planner.price.breakdown` / `breakdownTitle` (Task 3).
- Produces: `<PriceFooter … />`.

- [ ] **Step 1: Write it**

`src/components/planner/studio/PriceFooter.tsx`:

```tsx
"use client";

import { useState } from "react";
import { fill } from "@/lib/copy/fill";
import { useCopy } from "../CopyContext";

export function PriceFooter({
	lines,
	coverNote,
	totalLabel,
	ctaDisabled,
	onQuoteAction,
}: {
	lines: { id: string; label: string; detail: string; amount: string }[];
	/** The "a trim strip and a skirting board are included above." sentence,
	 * or null when nothing extra was added for the customer. */
	coverNote: string | null;
	totalLabel: string;
	ctaDisabled: boolean;
	onQuoteAction: () => void;
}) {
	const t = useCopy();
	const [open, setOpen] = useState(false);

	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-neutral-200 border-t px-4 py-3.5">
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex w-full items-baseline justify-between gap-2.5 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-3 py-2.5 text-left hover:border-neutral-300 hover:bg-[#f4f3f1]"
			>
				<span className="text-[12px] text-neutral-600">
					{t.planner.price.estimatedTotal}
				</span>
				<span className="flex items-baseline gap-2">
					<span className="font-semibold text-[19px] tabular-nums">
						{totalLabel}
					</span>
					<span className="font-semibold text-[#1f5138] text-[11px]">
						{t.planner.price.breakdown}
					</span>
				</span>
			</button>

			<p className="flex items-center gap-1.5 text-[#b45309] text-[11px] leading-4">
				<span className="rounded border border-[#b45309] px-1 py-0.5 font-semibold">
					{t.planner.price.estimateBadge}
				</span>{" "}
				{t.planner.price.placeholderNote}
			</p>

			<button
				type="button"
				onClick={onQuoteAction}
				disabled={ctaDisabled}
				className="min-h-11 rounded-[10px] bg-[#1f5138] px-3 py-2.5 font-semibold text-[14px] text-white transition hover:bg-[#17402c] disabled:cursor-not-allowed disabled:opacity-40"
			>
				{t.planner.price.cta}
			</button>

			{open && (
				<div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(23,23,23,.42)] p-6">
					<div
						role="dialog"
						aria-modal="true"
						aria-label={fill(t.planner.price.breakdownTitle, {
							total: totalLabel,
						})}
						className="max-h-full w-full max-w-[720px] overflow-y-auto rounded-[14px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.24)]"
					>
						<div className="flex items-start justify-between gap-4 border-[#f0efec] border-b px-6 pt-5 pb-3.5">
							<div>
								<h2 className="font-semibold text-[18px]">
									{fill(t.planner.price.breakdownTitle, { total: totalLabel })}
								</h2>
								<p className="mt-1 text-[13px] text-neutral-500">
									{t.planner.price.placeholderNote}
								</p>
							</div>
							<button
								type="button"
								onClick={() => setOpen(false)}
								aria-label={t.common.close}
								className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-[#f4f3f1]"
							>
								✕
							</button>
						</div>
						<div className="px-6 py-4">
							{lines.map((line) => (
								<div
									key={line.id}
									className="flex items-baseline justify-between gap-3 border-[#f4f3f1] border-b py-2"
								>
									<span className="text-[13px]">
										{line.label}{" "}
										<span className="text-[#8a857c]">{line.detail}</span>
									</span>
									<span className="font-medium text-[13px] tabular-nums">
										{line.amount}
									</span>
								</div>
							))}
							{coverNote && (
								<p className="mt-3 text-[11px] text-neutral-500 leading-4">
									{coverNote}
								</p>
							)}
							<div className="flex items-baseline justify-between gap-3 pt-3">
								<span className="font-semibold text-[13px]">
									{t.planner.price.estimatedTotal}
								</span>
								<span className="font-semibold text-[20px] tabular-nums">
									{totalLabel}
								</span>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Swap it in**

Replace the right panel's footer block in `StudioScreen.tsx`:

```tsx
<PriceFooter
	lines={price.categories.map((line) => ({
		id: line.id,
		label: priceLineLabel(t, line),
		detail: priceLineDetail(t, line),
		amount: rm(line.amountRm),
	}))}
	coverNote={
		coverPieces.length > 0
			? `${coverPieces.join(` ${t.planner.price.and} `)} ${
					coverPieces.length === 1
						? t.planner.price.includedAboveSingular
						: t.planner.price.includedAbovePlural
				}`
			: null
	}
	totalLabel={formatRm(price.totalRm, { maximumFractionDigits: 0 })}
	ctaDisabled={placed.length === 0}
	onQuoteAction={onGoToQuoteAction}
/>;
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: the total matches what the sidebar showed before,
the modal lists the same categories with the same amounts, ✕ closes it, the CTA
still lands on the quote screen and is still disabled on an empty wall.
- [ ] **Step 4: Commit**

```bash
git add src/components/planner/studio/PriceFooter.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): sticky total with a breakdown modal"
```

---

### Task 10: Canvas chips, context menu and shortcuts

The design's two floating chips, the hint line, right-click on a cabinet, and
the ⌘D / Esc shortcuts. No scene change is needed: `hitTestRef` already answers
"which cabinet is under this screen point", which is exactly what a context
menu needs.

**Files:**
- Create: `src/components/planner/studio/CabinetMenu.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `hitTestRef` (existing), `SelectionVerb` (Task 7), `t.planner.canvas.selectHint` (Task 3).
- Produces: `<CabinetMenu x={number} y={number} items={{ key, label, danger?, press }[]} onDismissAction={() => void} />`.

- [ ] **Step 1: Write the menu**

`src/components/planner/studio/CabinetMenu.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function CabinetMenu({
	x,
	y,
	items,
	onDismissAction,
}: {
	x: number;
	y: number;
	items: { key: string; label: string; danger?: boolean; press: () => void }[];
	onDismissAction: () => void;
}) {
	// Any click anywhere else closes it, including one that lands on the
	// canvas — which is a pointer event the scene also handles, so this
	// listens on the window rather than wrapping the page in a backdrop.
	useEffect(() => {
		const close = () => onDismissAction();
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, [onDismissAction]);

	return (
		<div
			className="fixed z-30 flex min-w-[168px] flex-col rounded-[10px] border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,.16)]"
			style={{ left: x, top: y }}
		>
			{items.map((item) => (
				<button
					key={item.key}
					type="button"
					onClick={item.press}
					className={`min-h-9 w-full rounded-md px-3.5 py-2 text-left text-[13px] hover:bg-[#f4f3f1] ${
						item.danger ? "text-[#8a2c1c]" : "text-neutral-900"
					}`}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Open it from the canvas**

In `StudioScreen.tsx`:

```tsx
const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(
	null,
);
```

On the canvas wrapper `<div className="relative min-h-[45vh] flex-1" …>` add:

```tsx
					onContextMenu={(e) => {
						const id = hitTestRef.current?.(e.clientX, e.clientY) ?? null;
						if (!id) return;
						e.preventDefault();
						setSelectedIdsAction([id]);
						setVerb(null);
						setMenu({ x: e.clientX, y: e.clientY, id });
					}}
```

and render, inside that wrapper:

```tsx
{
	menu && (
		<CabinetMenu
			x={menu.x}
			y={menu.y}
			onDismissAction={() => setMenu(null)}
			items={[
				{
					key: "resize",
					label: t.planner.selection.verbResize,
					press: () => setVerb("resize"),
				},
				{
					key: "replace",
					label: t.planner.selection.verbReplace,
					press: () => setVerb("replace"),
				},
				{
					key: "move",
					label: t.planner.selection.verbMove,
					press: () => setVerb("move"),
				},
				{
					key: "duplicate",
					label: t.planner.selection.duplicate,
					press: () =>
						setLayoutAction((prev) => duplicateModule(prev, menu.id)),
				},
				{
					key: "remove",
					label: t.planner.selection.remove,
					danger: true,
					press: removeSelected,
				},
			]}
		/>
	);
}
```

Each `press` runs before the window listener closes the menu; `setMenu(null)`
in the dismiss handler covers all of them, so no item needs to close it itself.
- [ ] **Step 3: Add the chips and the hint**

Replace the existing top-left readout with the design's two chips, and add the
select hint under the canvas when nothing is selected and no panel is open:

```tsx
<div className="absolute top-3 left-3.5 z-[6] flex flex-wrap items-center gap-2">
	<span className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-700 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
		{fill(t.planner.canvas.runOfWall, {
			run: (runExtentMm(layout) / 1000).toFixed(2),
			wall: (layout.wallWidthMm / 1000).toFixed(2),
		})}{" "}
		· {placed.length} {placed.length === 1 ? t.planner.unit : t.planner.units}
	</span>
	<span className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-[#8a857c] shadow-[0_1px_2px_rgba(0,0,0,.04)]">
		{views(t).find((v) => v.id === view)?.label}
	</span>
</div>;
```

```tsx
{
	selection.length === 0 && panel === null && !measureMode && (
		<p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] text-[#a2998c]">
			{t.planner.canvas.selectHint}
		</p>
	);
}
```

Keep the existing measure overlay block and the measuring hint untouched.
- [ ] **Step 4: Add ⌘D and Esc**

`PlannerApp.tsx` already owns the Delete/Backspace handler. Extend that same
effect rather than adding a second listener — one place, one set of guards:

```tsx
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
				if (selectedIds.length !== 1) return;
				e.preventDefault();
				setLayout((prev) => duplicateModule(prev, selectedIds[0]));
				return;
			}
			if (e.key === "Escape") {
				setSelectedIds([]);
				return;
			}
```

Add `duplicateModule` to the `useEngine()` destructure in `PlannerScreens`.
- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: right-clicking a cabinet selects it and opens the
menu at the pointer; picking Resize opens that section in the right panel;
clicking elsewhere dismisses the menu without leaving a stray selection; ⌘D
duplicates; Esc clears; Delete still removes; the browser's own context menu
never appears over a cabinet but still works over the panels.
- [ ] **Step 6: Commit**

```bash
git add src/components/planner/studio/CabinetMenu.tsx src/components/planner/StudioScreen.tsx src/app/\[lang\]/planner/PlannerApp.tsx
git commit -m "feat(planner): canvas chips, context menu and shortcuts"
```

---

### Task 11: The move gizmo

An arrow cluster floating on the selected cabinet while the Move verb is on:
← → slide it along the wall, ↑ ↓ change a wall cabinet's hang height. Drawn
with drei's `<Html>`, which keeps it pinned as the camera orbits — a DOM
overlay positioned from a one-off projection would drift the moment the user
rotates the view.

**Files:**
- Create: `src/components/planner/studio/MoveGizmo.tsx`
- Modify: `src/components/planner/PlannerScene.tsx` (one optional prop)
- Modify: `src/components/planner/StudioScreen.tsx`

**Interfaces:**
- Consumes: `setHangAt` (Task 2), `moveModule` (existing), `SNAP_MM` (existing, 60), `t.planner.gizmo.*` (Task 3).
- Produces: `<MoveGizmo … />`; `PlannerScene` prop `gizmo?: { anchorMm: [number, number, number]; node: React.ReactNode }`.

- [ ] **Step 1: Write the gizmo**

`src/components/planner/studio/MoveGizmo.tsx`:

```tsx
"use client";

import { useCopy } from "../CopyContext";

export function MoveGizmo({
	vertical,
	onLeftAction,
	onRightAction,
	onUpAction,
	onDownAction,
}: {
	/** Wall cabinets move vertically; floor units are pinned to the floor. */
	vertical: boolean;
	onLeftAction: () => void;
	onRightAction: () => void;
	onUpAction: () => void;
	onDownAction: () => void;
}) {
	const t = useCopy();
	const arrow =
		"flex h-9 w-9 items-center justify-center rounded-[7px] text-[15px] text-[#1f5138] hover:bg-[#e7efe9]";
	const vert = `flex h-[17px] w-9 items-center justify-center rounded-[5px] text-[12px] ${
		vertical
			? "text-[#1f5138] hover:bg-[#e7efe9]"
			: "cursor-not-allowed text-neutral-300"
	}`;

	return (
		<div className="flex items-center gap-0.5 rounded-[10px] border border-[#1f5138] bg-white/95 p-[3px]">
			<button
				type="button"
				onClick={onLeftAction}
				aria-label={t.planner.gizmo.left}
				className={arrow}
			>
				←
			</button>
			<div className="flex flex-col gap-0.5">
				<button
					type="button"
					onClick={onUpAction}
					disabled={!vertical}
					aria-label={t.planner.gizmo.raise}
					title={
						vertical ? t.planner.gizmo.vertHint : t.planner.gizmo.vertLocked
					}
					className={vert}
				>
					↑
				</button>
				<button
					type="button"
					onClick={onDownAction}
					disabled={!vertical}
					aria-label={t.planner.gizmo.lower}
					title={
						vertical ? t.planner.gizmo.vertHint : t.planner.gizmo.vertLocked
					}
					className={vert}
				>
					↓
				</button>
			</div>
			<button
				type="button"
				onClick={onRightAction}
				aria-label={t.planner.gizmo.right}
				className={arrow}
			>
				→
			</button>
		</div>
	);
}
```

- [ ] **Step 2: Give the scene an anchor slot**

In `PlannerScene.tsx`, import `Html` from `@react-three/drei` (the file already
imports `OrbitControls, Shadow` from there), add the prop to the signature and
its type:

```tsx
	/** A DOM overlay pinned to a point in the scene, in run millimetres.
	 * `<Html>` keeps it pinned as the camera orbits, which a one-off screen
	 * projection could not. */
	gizmo?: { anchorMm: [number, number, number]; node: React.ReactNode };
```

and render it as the last child inside the `<Canvas>`:

```tsx
{
	gizmo && (
		<Html
			position={[
				m(gizmo.anchorMm[0]),
				m(gizmo.anchorMm[1]),
				m(gizmo.anchorMm[2]),
			]}
			center
			zIndexRange={[5, 0]}
		>
			{gizmo.node}
		</Html>
	);
}
```

- [ ] **Step 3: Pass it from the studio**

In `StudioScreen.tsx`, above the return:

```tsx
// The cabinet's own centre, in the same frame `Cabinet` positions itself
// in: x is measured from the middle of the run, y from the floor.
const gizmo =
	selected && verb === "move"
		? {
				anchorMm: [
					selected.xMm + selected.widthMm / 2 - layout.wallWidthMm / 2,
					floorHeightMmOf(selected, layout) + selected.family.heightMm / 2,
					selected.family.depthMm / 2,
				] as [number, number, number],
				node: (
					<MoveGizmo
						vertical={selected.family.kind === "wall"}
						onLeftAction={() =>
							setLayoutAction((prev) =>
								moveModule(prev, selected.placed.id, selected.xMm - SNAP_MM),
							)
						}
						onRightAction={() =>
							setLayoutAction((prev) =>
								moveModule(prev, selected.placed.id, selected.xMm + SNAP_MM),
							)
						}
						onUpAction={() =>
							setLayoutAction((prev) =>
								setHangAt(
									prev,
									selected.placed.id,
									(selected.placed.hangAtMm ?? prev.hangingHeightMm) + 50,
								),
							)
						}
						onDownAction={() =>
							setLayoutAction((prev) =>
								setHangAt(
									prev,
									selected.placed.id,
									(selected.placed.hangAtMm ?? prev.hangingHeightMm) - 50,
								),
							)
						}
					/>
				),
			}
		: undefined;
```

Pass `gizmo={gizmo}` to `<PlannerScene …/>`, and add `floorHeightMmOf`,
`moveModule` and `setHangAt` to the `useEngine()` destructure. Import `SNAP_MM`
from `@/lib/planner/layout`.
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: select a wall cabinet, press Move — the cluster
appears on it and stays on it while you orbit; ← → slide it 60mm at a time and
stop against a neighbour; ↑ ↓ raise and lower that one cabinet between 1200 and
1800mm while its neighbour stays put; on a base cabinet ↑ ↓ are disabled and
carry the locked tooltip; switching to plan view or clearing the verb removes
the cluster.
- [ ] **Step 5: Commit**

```bash
git add src/components/planner/studio/MoveGizmo.tsx src/components/planner/PlannerScene.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): on-canvas move gizmo"
```

---

### Task 12: Accent sweep

The selection accent is blue (`#2b6cb0`) in the 3D scene as well as in the
panels, so the last task is the one that makes the screen read as one thing.
Planner surfaces only — the admin pages keep their own blue links.

**Files:**
- Modify: `src/components/planner/Cabinet.tsx:240`
- Modify: `src/components/planner/DesignedCabinet.tsx:455`
- Modify: `src/components/planner/MeasureOverlay.tsx:12`
- Modify: `src/components/planner/StudioScreen.tsx` (any `#2b6cb0` / `#f2f6fb` left after tasks 4–11)

- [ ] **Step 1: Find every remaining occurrence**

Run: `grep -rn '2b6cb0\|f2f6fb' src/components/planner/`
Expected: the three constants above, plus whatever survived in `StudioScreen`.
- [ ] **Step 2: Change them**

- `Cabinet.tsx:240` — the selected emissive: `"#2b6cb0"` → `"#1f5138"`.
- `DesignedCabinet.tsx:455` — `const emissive = highlighted ? "#15803d" : "#2b6cb0";`
  → `highlighted ? "#2f7d54" : "#1f5138"`. Both are green now, so the
  highlighted tone has to stay clearly lighter than the selected one or the
  measure hover becomes invisible.
- `MeasureOverlay.tsx:12` — `MARKER_COLOR` → `"#1f5138"`.
- Any `bg-[#f2f6fb]` left in `StudioScreen.tsx` → `bg-[#f2f7f4]`; any
  `text-[#2b6cb0]` → `text-[#1f5138]`.

- [ ] **Step 3: Set the studio ground**

In `StudioScreen.tsx`, the `<main>` background `bg-[#e9e7e3]` → `bg-[#f4f3f1]`,
and the canvas wrapper gains `bg-[#faf9f7]`. `PlannerHeader`'s `h-14` → `h-[52px]`.
- [ ] **Step 4: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: pass. In `pnpm dev`: a selected cabinet glows green in 3D and its
panel row is green-tinted; hovering it in measure mode is still visibly
distinct from selected; the measure markers and dimension line are green;
`grep -rn '2b6cb0\|f2f6fb' src/components/planner/` returns nothing.
- [ ] **Step 5: Commit**

```bash
git add src/components/planner
git commit -m "style(planner): one green accent across the studio"
```

---

## Self-review notes

- **Spec coverage.** Tool rail → Task 4. Room panel and fit line → Task 6.
  Overlay panels (add/view/doors/defaults) → Task 5. Verb selection panel,
  resize/replace/move/doors → Task 7. Recap + run list → Task 8. Sticky total
  and breakdown modal → Task 9. Canvas chips, hint, context menu, shortcuts →
  Task 10. Gizmo and per-unit hang → Tasks 2 and 11. Accent and metrics →
  Task 12. Re-homed features: drag-drop (Task 5), multi-select (Tasks 7, 8),
  hinge (Task 7), close-gaps / wall mode / flush tops (Task 5), overhang
  warning (Task 6), run list and reset (Task 8), per-cabinet door style and
  no-door (Task 7).
- **Known follow-up, deliberately not in this plan.** `setOffsetMm` in the
  design's mock reorders the row; the real `moveModule` clamps against
  neighbours instead, which is the better behaviour and what Task 7 wires the
  mm field to. If the client wants "type a number and the neighbours shuffle",
  that is a new engine function and its own task.
- **The mobile layout is inherited, not designed.** The design is a desktop
  mock. Every panel above keeps the existing `lg:` breakpoint behaviour —
  stacked on a phone, columns on a desktop — and the rail becomes a horizontal
  strip under 1024px. If a phone-specific studio is wanted, that is a separate
  spec.
