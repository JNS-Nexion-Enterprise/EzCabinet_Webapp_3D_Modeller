# Cabinet Drag Handle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the floor handle move the selected cabinet on both axes it is
allowed to move on — along the wall for every cabinet, and up and down for a
wall unit — so the handle delivers the control it advertises.

**Architecture:** The scene already drags along the wall: `beginDrag` records
where the pointer took hold, a full-height plane catches the moves,
`moveModule` clamps against neighbours, and `dropModule` snaps flush on
release. This adds the second axis to that same path. The rule for what a
given cabinet may do lives in `lib/planner` as one pure function
(`dragModule`) so it is testable and so the scene never decides policy; the
scene only converts a ray into millimetres and calls it.

**Tech Stack:** TypeScript, React Three Fiber, vitest. pnpm.

**Spec:** This plan is the spec — it comes from a direct decision, recorded
under "Decisions taken" below, not a separate document.

## Global Constraints

- `src/lib/planner` stays framework-free. No React, no three.js imports.
- Every `lib/planner` function gets a test before it gets a caller.
- The layout document does **not** change shape. `xMm` and the optional
  `hangAtMm` already exist; nothing gains a `zMm`, and no cabinet leaves the
  wall. Pricing, worktop spans, skirting and end panels keep working untouched
  because they still see one run against one wall.
- Collision behaviour is unchanged: a cabinet stops against its neighbour and
  lands flush on release. A drag can never produce an overlapping layout.
- Hang heights stay inside `WALL_HANG_LIMITS` (1200–1800mm) — the same range
  the hang slider allows. The gizmo is a shortcut, not a second set of rules.
- Verification for every task: `pnpm test`, `pnpm typecheck`,
  `pnpm exec biome check src/`. There is no component-test harness in this repo
  and none is to be added; UI tasks are verified by those three plus the stated
  manual check.

## Decisions taken (2026-09-10)

1. **Freedom:** along the wall for all cabinets, plus hang height for wall
   units. Not free placement on the floor plane — that would need `zMm` on
   every module, 2D collision, and rewrites of `exposure.ts`, worktop spans,
   skirting and end panels, all of which assume a single run.
2. **Collision:** unchanged — stop against the neighbour, snap flush on
   release.

## File Structure

| File                                       | Change                                                                                                                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/planner/layout.ts`                | new `dragModule` — the one place that decides which axes a cabinet may move on                                                                                                               |
| `src/lib/planner/__tests__/layout.test.ts` | tests for it                                                                                                                                                                                 |
| `src/components/planner/PlannerScene.tsx`  | ray helper returns a point rather than an x; `dragRef` carries the vertical grab; the drag plane calls `dragModule`; `MoveHandle` rides a wall unit instead of sitting on the floor under it |

---

### Task 1: Engine — `dragModule`

One call that moves a cabinet to where a drag has put it. It is the only
place that knows a floor unit has no vertical freedom and that ceiling mode
takes the choice away from every wall unit.

**Files:**
- Modify: `src/lib/planner/layout.ts` (inside `plannerEngine`, above `starterFor`, and added to the returned object)
- Test: `src/lib/planner/__tests__/layout.test.ts`

**Interfaces:**
- Consumes: `find`, `moveModule`, `setHangAt` — all already in scope inside `plannerEngine`.
- Produces: `dragModule(layout: PlannerLayout, id: string, to: { xMm: number; hangAtMm?: number }): PlannerLayout` on the engine object.

- [ ] **Step 1: Write the failing tests**

Add `dragModule` to the destructured engine list at the top of the test file
(alphabetical — between `dropModule` and `duplicateModule`), then add:

```ts
describe("dragModule", () => {
	it("slides a floor cabinet along the wall", () => {
		const placed = addModule(layout, "base-cabinet", 0, "a", 600);
		const next = dragModule(placed, "a", { xMm: 900 });
		expect(at(next, "a")).toBe(900);
	});

	it("moves a wall cabinet on both axes at once", () => {
		const placed = addModule(layout, "wall-cabinet", 0, "w", 600);
		const next = dragModule(placed, "w", { xMm: 800, hangAtMm: 1650 });
		expect(at(next, "w")).toBe(800);
		expect(next.wall.find((m) => m.id === "w")?.hangAtMm).toBe(1650);
	});

	it("ignores a hang height given for a floor cabinet", () => {
		const placed = addModule(layout, "base-cabinet", 0, "a", 600);
		const next = dragModule(placed, "a", { xMm: 300, hangAtMm: 1650 });
		expect(at(next, "a")).toBe(300);
		expect(next.floor.find((m) => m.id === "a")).not.toHaveProperty("hangAtMm");
	});

	it("clamps the hang height to the slider's own range", () => {
		const placed = addModule(layout, "wall-cabinet", 0, "w", 600);
		const low = dragModule(placed, "w", { xMm: 0, hangAtMm: 100 });
		const high = dragModule(placed, "w", { xMm: 0, hangAtMm: 9000 });
		expect(low.wall[0].hangAtMm).toBe(WALL_HANG_LIMITS.minMm);
		expect(high.wall[0].hangAtMm).toBe(WALL_HANG_LIMITS.maxMm);
	});

	it("leaves the hang height alone in ceiling mode, which aligns the tops", () => {
		const hung = addModule(layout, "wall-cabinet", 0, "w", 600);
		const ceiling = setWallToCeiling(hung, true);
		const next = dragModule(ceiling, "w", { xMm: 600, hangAtMm: 1700 });
		expect(at(next, "w")).toBe(600);
		expect(next.wall.find((m) => m.id === "w")?.hangAtMm).toBeUndefined();
	});

	it("stops against a neighbour rather than overlapping it", () => {
		let placed = addModule(layout, "base-cabinet", 0, "a", 600);
		placed = addModule(placed, "base-cabinet", 600, "b", 600);
		const next = dragModule(placed, "a", { xMm: 500 });
		// Clamped flush against "b" at 600, not sitting inside it.
		expect(at(next, "a")).toBe(0);
		expectNoOverlaps(next);
	});

	it("leaves an unknown id alone", () => {
		const placed = addModule(layout, "base-cabinet", 0, "a", 600);
		expect(dragModule(placed, "nope", { xMm: 900 })).toBe(placed);
	});
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts -t dragModule`
Expected: FAIL — `dragModule is not a function`.
- [ ] **Step 3: Implement it**

In `src/lib/planner/layout.ts`, inside `plannerEngine`, immediately above
`function starterFor(`:

```ts
/**
 * Put a cabinet where a drag has taken it.
 *
 * Which axes a cabinet may move on is a layout rule, not a scene detail,
 * so it is decided here: everything slides along the wall, and only a hung
 * cabinet has a height of its own to change. A hang height handed in for a
 * floor unit is dropped rather than refused — the pointer moves in two
 * dimensions whatever is being dragged, and the caller should not have to
 * ask what it is holding.
 *
 * Ceiling mode ignores the vertical too: lining the tops up is the whole
 * point of that mode, and `floorHeightMmOf` would overrule the stored
 * figure anyway. Writing it would leave a number that silently reappears
 * when the mode is switched off.
 */
function dragModule(
	layout: PlannerLayout,
	id: string,
	to: { xMm: number; hangAtMm?: number },
): PlannerLayout {
	const found = find(layout, id);
	if (!found) return layout;

	const moved = moveModule(layout, id, to.xMm);
	if (
		to.hangAtMm === undefined ||
		found.row !== "wall" ||
		moved.wallToCeiling
	) {
		return moved;
	}
	return setHangAt(moved, id, to.hangAtMm);
}
```

Then add `dragModule,` to the returned object (alphabetical — after
`dropModule`).
- [ ] **Step 4: Run the tests and watch them pass**

Run: `pnpm vitest run src/lib/planner/__tests__/layout.test.ts`
Expected: PASS, whole file.
- [ ] **Step 5: Commit**

```bash
git add src/lib/planner/layout.ts src/lib/planner/__tests__/layout.test.ts
git commit -m "feat(planner): one call for where a drag puts a cabinet"
```

---

### Task 2: Scene — read the pointer's height, not just its position along the wall

`runXFromRay` throws away the y of the crossing it computes. The vertical drag
needs it. This task changes nothing a user sees; it is the seam the next task
builds on.

**Files:**
- Modify: `src/components/planner/PlannerScene.tsx` (`runXFromRay`, and its two call sites)

**Interfaces:**
- Produces: `runPointFromRay(e, planeZ, runWidthMm): { xMm: number; yMm: number }`, where `xMm` is measured from the left end of the run exactly as before, and `yMm` is height above the floor.
- `runXFromRay` stays, as a one-line wrapper, because `DropPicker` and the existing pointer handlers only want the one number.

- [ ] **Step 1: Widen the helper**

Replace `runXFromRay` in `src/components/planner/PlannerScene.tsx` with:

```tsx
/**
 * Where this pointer ray crosses the vertical plane the cabinet stands in.
 *
 * `xMm` is along the run from its left end; `yMm` is height above the floor.
 *
 * The plane has to be the cabinet's own, not the floor. A wall unit hangs a
 * metre and a half up against the back wall, and the same ray reaches the
 * floor a long way in front of it — dragging against the floor plane
 * therefore moves the cabinet at a different rate from the cursor, and the
 * further the camera tilts the worse it gets.
 *
 * Read off the ray rather than `e.point`, which is wherever the ray happened
 * to strike a mesh and would offset the grab by the height of the door it hit.
 */
function runPointFromRay(
	e: ThreeEvent<PointerEvent>,
	planeZ: number,
	runWidthMm: number,
): { xMm: number; yMm: number } {
	const { origin, direction } = e.ray;
	// Looking straight along the wall there is no crossing to find; the last
	// known position is better than a divide by zero.
	const t =
		Math.abs(direction.z) < 1e-6 ? 0 : (planeZ - origin.z) / direction.z;
	return {
		xMm: (origin.x + direction.x * t) * 1000 + runWidthMm / 2,
		yMm: (origin.y + direction.y * t) * 1000,
	};
}

/** Just the distance along the run — what a drop or a sideways drag needs. */
const runXFromRay = (
	e: ThreeEvent<PointerEvent>,
	planeZ: number,
	runWidthMm: number,
) => runPointFromRay(e, planeZ, runWidthMm).xMm;
```

- [ ] **Step 2: Verify nothing moved**

Run: `pnpm typecheck && pnpm test && pnpm exec biome check src/components/planner/`
Expected: all pass, no behaviour change.

In `pnpm dev`: drag a cabinet along the wall and drop a family from the
palette onto the canvas. Both behave exactly as before.
- [ ] **Step 3: Commit**

```bash
git add src/components/planner/PlannerScene.tsx
git commit -m "refactor(planner): read the pointer's height off the drag plane too"
```

---

### Task 3: Drag a wall unit up and down

The drag becomes two-axis. A floor unit is unaffected — `dragModule` drops the
vertical for it — so there is no branch in the pointer handler.

**Files:**
- Modify: `src/components/planner/PlannerScene.tsx` (`dragRef`, `beginDrag`, the drag plane's `onPointerMove`, and the engine destructure in `Run`)

**Interfaces:**
- Consumes: `dragModule` (Task 1), `runPointFromRay` (Task 2), `floorHeightMmOf` (existing).
- Produces: `dragRef.current.grabYMm` — how far up the carcass the pointer took hold, so a cabinet does not jump its underside to the cursor.

- [ ] **Step 1: Carry the vertical grab**

In `Run`, add to the `dragRef` type, next to `grabMm`:

```tsx
/**
 * How far above the cabinet's underside the pointer took hold. The
 * vertical twin of `grabMm`, and it exists for the same reason: without
 * it a wall unit snaps its underside to the cursor the instant you
 * touch it.
 */
grabYMm: number;
```

Add `dragModule` to the engine destructure at the top of `Run`, and widen
`beginDrag`:

```tsx
const beginDrag = (
	e: ThreeEvent<PointerEvent>,
	position: Positioned,
	planeZ: number,
) => {
	const pointer = runPointFromRay(e, planeZ, runWidthMm);
	dragRef.current = {
		id: position.placed.id,
		grabMm: pointer.xMm - position.xMm,
		grabYMm: pointer.yMm - floorHeightMmOf(position, layout),
		planeZ,
	};
	setDragging(true);
	if (controls) controls.enabled = false;
};
```

- [ ] **Step 2: Apply both axes on every move**

In the drag plane's `onPointerMove`, replace the body with:

```tsx
				onPointerMove={(e) => {
					const drag = dragRef.current;
					if (!drag) return;
					e.stopPropagation();

					const pointer = runPointFromRay(e, drag.planeZ, runWidthMm);
					const next = dragModule(layoutRef.current, drag.id, {
						xMm: pointer.xMm - drag.grabMm,
						hangAtMm: pointer.yMm - drag.grabYMm,
					});
					if (next === layoutRef.current) return;

					// Re-anchor to where the cabinet actually ended up, so one held
					// against its neighbour starts moving the instant you reverse.
					const settled = [...next.floor, ...next.wall].find(
						(placed) => placed.id === drag.id,
					);
					if (settled) drag.grabMm = pointer.xMm - settled.xMm;
					onLayoutChange(next);
				}}
```

The vertical needs no re-anchoring: `setHangAt` clamps to a range rather than
against a neighbour, so the cabinet never lags behind the pointer the way a
blocked sideways move does.
- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm test && pnpm exec biome check src/components/planner/`
Expected: all pass.

In `pnpm dev`, with a wall cabinet selected:
- dragging it sideways still stops against its neighbours and lands flush;
- dragging it upwards raises it and stops at 1800mm; downwards stops at 1200mm;
- the selection panel's "hangs at … mm" line counts along with the drag;
- its neighbours stay where they are — only the dragged one moves;
- a base cabinet dragged upwards does not move vertically at all;
- with Defaults → Wall units → "To ceiling" on, vertical dragging does nothing.

- [ ] **Step 4: Commit**

```bash
git add src/components/planner/PlannerScene.tsx
git commit -m "feat(planner): drag a wall unit to its own hang height"
```

---

### Task 4: Put the handle where the cabinet is

A wall unit's handle currently sits on the floor a metre and a half below it,
which reads as belonging to whatever is standing underneath. It should ride
the cabinet it moves, and it should say it moves in two directions.

**Files:**
- Modify: `src/components/planner/PlannerScene.tsx` (`MoveHandle`, and the call site in `Run`)

**Interfaces:**
- Consumes: `floorHeightMmOf(position, layout)` — where the underside of this cabinet actually is, ceiling mode included.
- Produces: `MoveHandle` gains `floorHeightMm: number` and `vertical: boolean`.

- [ ] **Step 1: Take the height as a prop**

In `MoveHandle`, replace the props and the position with:

```tsx
function MoveHandle({
	position,
	runWidthMm,
	floorHeightMm,
	vertical,
	onGrab,
}: {
	position: Positioned;
	runWidthMm: number;
	/** The underside of this cabinet, from the floor. */
	floorHeightMm: number;
	/** Whether this one can be dragged up and down as well as along. */
	vertical: boolean;
	onGrab: (e: ThreeEvent<PointerEvent>, planeZ: number) => void;
}) {
	const centreX = m(position.xMm + position.widthMm / 2 - runWidthMm / 2);
	// Two different frames, and mixing them is the bug this comment exists to
	// stop: the handle is drawn inside the run's group, which already sits on
	// the wall plane, so its own position is measured from there — but the
	// drag reads a world ray, so the plane it solves against is a world z.
	const planeZ =
		-m(roomDepthMm) / 2 + m(WALL_GAP_MM) + m(position.family.depthMm) / 2;
	const localZ = m(position.family.depthMm) + 0.16;
	// A cabinet on the floor gets its handle on the floor in front of it; one
	// that hangs gets it just below its own underside, where it reads as
	// belonging to that cabinet rather than to whatever stands beneath it.
	const y = floorHeightMm > 0 ? m(floorHeightMm) - 0.14 : 0.012;
```

`roomDepthMm` stays a prop; it is still what the world plane is measured from.
- [ ] **Step 2: Stand it up when it hangs**

A handle lying flat on the floor is legible from above; one hanging in the air
has to face the customer. Replace the `<group>`'s opening tag:

```tsx
	return (
		<group
			position={[centreX, y, floorHeightMm > 0 ? localZ - 0.1 : localZ]}
			// Flat on the floor for a cabinet that stands on it; facing the room
			// for one that hangs.
			rotation={floorHeightMm > 0 ? [0, 0, 0] : [-Math.PI / 2, 0, 0]}
			onPointerDown={(e) => onGrab(e, planeZ)}
		>
```

- [ ] **Step 3: Say which way it moves**

The four arms are drawn from an array of angles. Draw the vertical pair only
when the cabinet has a vertical to move on, so the handle stops promising
what a base unit cannot do:

```tsx
{
	(vertical ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [0, Math.PI]).map(
		(angle) => (
			<mesh
				key={angle}
				position={[Math.cos(angle) * 0.075, Math.sin(angle) * 0.075, 0.002]}
				rotation={[0, 0, angle - Math.PI / 2]}
			>
				<circleGeometry args={[0.022, 3]} />
				<meshBasicMaterial color="#1f5138" />
			</mesh>
		),
	);
}
```

And draw the upright bar only in the same case — replace the second bar mesh
with:

```tsx
{
	vertical && (
		<mesh position={[0, 0, 0.002]}>
			<planeGeometry args={[0.014, 0.13]} />
			<meshBasicMaterial color="#1f5138" />
		</mesh>
	);
}
```

- [ ] **Step 4: Pass the two new props**

At the call site in `Run`:

```tsx
<MoveHandle
	key={position.placed.id}
	position={position}
	runWidthMm={runWidthMm}
	roomDepthMm={layout.roomDepthMm}
	floorHeightMm={floorHeightMmOf(position, layout)}
	vertical={position.family.kind === "wall" && !layout.wallToCeiling}
	onGrab={(e, planeZ) => {
		e.stopPropagation();
		if (measureMode) return;
		beginDrag(e, position, planeZ);
	}}
/>;
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm test && pnpm exec biome check src/components/planner/`
Expected: all pass.

In `pnpm dev`:
- select a base cabinet — the handle lies on the floor in front of it and
  shows a left/right bar only;
- select a wall cabinet — the handle hangs just under it, faces the room, and
  shows all four arms;
- turn on "To ceiling" — the wall cabinet's handle drops back to two arms;
- the handle follows its cabinet as it is dragged and as it is resized.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/PlannerScene.tsx
git commit -m "feat(planner): the handle rides the cabinet it moves"
```

---

## Self-review notes

- **Scope coverage.** Sideways movement already worked and is untouched;
  Task 1 decides the rules, Task 2 supplies the missing number, Task 3 spends
  it, Task 4 makes the control honest about what it does. Nothing here adds
  `zMm`, so pricing, worktop spans, skirting, end panels and `exposure.ts` are
  not read, let alone changed.
- **What is deliberately not here.** Dragging a cabinet between the floor and
  wall rows: a family's `kind` decides its row, and a base cabinet cannot hang.
  Changing rows means changing what the cabinet _is_, which is the Replace
  verb's job.
- **Watch on release.** `dropModule` snaps the sideways position flush; there
  is no equivalent snap for the hang height, and there should not be one — the
  slider has never snapped either, and the whole point of a per-cabinet height
  is that it is off the row's figure.
- **The measure tool.** `snapToCabinet` reads a wall unit's height through
  `floorHeightMmOf`, which already honours `hangAtMm`, so a raised cabinet
  measures correctly with no change here. Worth re-checking by hand after
  Task 3 all the same: measure floor-to-underside on a raised unit and confirm
  the number matches the panel.
