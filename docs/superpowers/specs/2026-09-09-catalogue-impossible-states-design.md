# Controls the engine ignores, and one that charges for nothing

**Date:** 2026-09-09
**Surface:** `/admin/catalogue`'s family card, `lib/planner/pricing.ts`, `lib/planner/catalogue.ts`, `lib/catalogue/health.ts`

## The problem

A wall cabinet's card offers a **Worktop** checkbox. A wall unit cannot have a
worktop, and the checkbox is not inert: `pricing.ts:117` bills worktop by the
running foot for any family carrying the flag, and `PlannerScene.tsx:726` draws
the slab. Ticking it on a wall unit charges the customer for a worktop and
draws one 2,380mm up the wall.

That is one instance of a class: **a control the engine ignores for this kind of
cabinet, or obeys into a state the cabinet cannot be in.** An audit of every
editable field found seven.

## The findings

| #   | Control                                                  | What the code does                                                                                                                                     | Class                                   |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| 1   | **Worktop**, on a wall or tall family                    | obeyed by `pricing.ts:117` and `PlannerScene.tsx:726`; intake never creates it — `mergeIntoCatalogue.ts:275` sets `hasWorktop: module.kind === "base"` | charges money for an impossible product |
| 2   | **Off floor mm**, on a wall family                       | `layout.ts:870` returns the layout's hang height for `kind === "wall"` and never reads the field                                                       | dead input                              |
| 3   | **Legs, leg height, leg ⌀, leg inset**, on a wall family | `parts.ts:133` returns `{heightMm: 0, legs: 0, insetMm: 0}` for wall                                                                                   | four dead inputs                        |
| 4   | **Shelves**, on a drawer bank                            | `fitOutOf:188` forces 0 when `drawers > 0`, so no board runs through a drawer box                                                                      | dead input                              |
| 5   | **Door leaves**, on a drawer bank                        | `cabinetPartsMm:367` returns before emitting any door                                                                                                  | dead input                              |
| 6   | **Fixed shelves**                                        | `parts.ts:192` only ever adds it to `shelves`                                                                                                          | real data, no distinct behaviour        |
| 7   | **Door price** for a width no style prices               | `catalogue.ts:378-384` — exact, else next ladder rung, else `?? 0`; an unknown `doorStyleId` returns 0 outright                                        | charges nothing, silently, server-side  |

Findings 2 and 3 combine with 1: the dead `floorHeightMm` comes back to life at
`PlannerScene.tsx:727`, which computes the worktop's height from the raw field
rather than through `floorHeightMmOf`.

**Cleared, not findings:** `Back panel` (`parts.ts:268`, every kind), skirting and
ceiling trim (computed from layout spans, not per-family flags), drawers on a
wall unit (rare, but a real product).

## Design

### 1. `hasWorktop` is derived, not stored

In every family the repo ships, `hasWorktop === (kind === "base")`, and intake
already computes it that way. The field is redundant with `kind`, and its only
independent value is an impossible one.
- Remove `hasWorktop` from `familySchema`, from the seed families, and from the
  admin form.
- `pricing.ts` and `PlannerScene.tsx` read `family.kind === "base"` directly.
- `CATEGORY_TO_FAMILY_SHAPE` (`cabinetDesignLabels.ts:87-94`) drops its
  `hasWorktop` half and maps category → `kind` alone.

Zod ignores unknown keys, so an already-published catalogue carrying
`hasWorktop` still validates and simply stops being read.

**The migration risk, stated plainly.** This changes behaviour for any _live_
family where `hasWorktop !== (kind === "base")` — a base family with the box
unticked would start being billed a worktop. The repo's seed has no such family,
but the live catalogue is in Postgres and cannot be checked from here. **Before
merging, read the published catalogue and confirm no family disagrees.** If one
does, it is either a mistake this change fixes or a real product that needs
`kind` to express it.

### 2. Inapplicable controls are not rendered

Findings 2-5 are not derivable — they are simply not applicable — so the fix is
to render each control only for the kinds it affects:

| Control                            | Rendered when     |
| ---------------------------------- | ----------------- |
| Off floor mm                       | `kind !== "wall"` |
| Legs, leg height, leg ⌀, leg inset | `kind !== "wall"` |
| Shelves                            | `drawers === 0`   |
| Door leaves                        | `drawers === 0`   |

The fields stay in the schema and intake keeps writing them — a wall design's
measured `floorHeightMm` is still what `matchesFamily` routes on
(`mergeIntoCatalogue.ts:125`). Only the editing control goes.

`drawers` here is the effective value `fitOutOf` uses —
`geometry?.drawers ?? family.drawers` — so the controls hide on the same
condition the engine acts on, not a second reading of it.

### 3. Fixed shelves stays as it is

Finding 6 needs no change. The two inputs already live inside the **Override
these** disclosure, whose stated purpose is correcting a bad parse — and a
drawing really does distinguish a fixed shelf from an adjustable one
(`extract.ts:222` counts a `shelfFixed` role). The planner not yet drawing them
differently is a gap in the renderer, not a reason to throw the measurement
away. Recorded, not fixed.

### 4. An unpriced door blocks a publish

Finding 7 is the same defect the branch of 2026-09-08 closed for carcass
prices, one field over. Extend `blockersOf` in `lib/catalogue/health.ts` to
return a second kind of blocker: a (family width × door style) pair that
`doorPriceRmIn` resolves to zero.

```ts
export type DoorBlocker = {
	doorStyleId: string;
	doorStyleLabel: string;
	widthMm: number;
};
```

The review panel lists them alongside the rung blockers, and the publish gate
counts both. `doorPriceRmIn`'s `?? 0` fallbacks stay — a runtime that throws on
a missing price would take the planner down for a customer, and zero is the
safe render. The gate is what stops a zero ever being published.

**Scope:** only widths the catalogue's own families actually offer. The door
ladder may carry rungs no family uses, and those are not a problem to solve.

## Not doing

- Making `kind` derive anything else. Category seeds `kind` at creation only —
  see the intake spec.
- Drawing fixed shelves differently from adjustable ones. Real, separate,
  renderer work.
- Removing `floorHeightMm` for wall families. It is dead as a _control_ but live
  as _data_ — `matchesFamily` routes on it.

## Testing

- `pricing.ts` bills a worktop for a base family and not for wall or tall, read
  off `kind` — the direct replacement for the flag.
- `doorBlockersOf` finds a family width that a style does not price, and finds
  nothing when every offered width is priced. The unknown-`doorStyleId` case
  returns zero and must be caught too.
- A published-catalogue fixture that still carries `hasWorktop` parses and
  prices identically after the field is gone.
