# The catalogue admin, once designs arrive per rung

**Date:** 2026-09-08
**Surface:** `/admin/catalogue`, with one fix in `lib/catalogue/publishDesigns.ts`

## The problem

An admin uploads an OBJ, clicks "Add to planner", opens the Catalogue tab, and
sees the live catalogue with none of their work in it and no sign a draft
exists. The page never says what it is for, so neither does the admin.

Three things cause that, and they are separable:
1. **The page ignores the draft it was sent to review.** `page.tsx:450-468`
   resolves the version as `?version ?? published`. `/admin/import` passes
   `?version=`; the design library does not — it tells the admin to "publish it
   at /admin/catalogue" and the page opens the published document instead.

2. **"Publish" names three unrelated things**, only one of which reaches a
   customer:

   | Where                                                                     | What it does                                                 | Customer sees it |
   | ------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------- |
   | `CabinetDesign.status = "PUBLISHED"`                                      | filters the library table                                    | no               |
   | `POST /api/admin/cabinet-designs/[id]/publish` (button: "Add to planner") | merges into the catalogue, creates a DRAFT, stops            | no               |
   | `POST /api/admin/catalogue/versions/[id]/publish`                         | flips the version live; `store.ts:22` reads exactly this row | **yes**          |

3. **The page presents itself as a field editor** when its job is review and
   publish. The review block exists — it is 1,280 lines down the page.

Two defects surfaced while reading this, and the design has to answer both.

## Defect: concurrent drafts silently discard each other

`publishDesigns.ts:276` always bases the merge on the published catalogue:

```
publish design A  →  draft v12 = live + A
publish design B  →  draft v13 = live + B     ← no A
publish v13       →  A is gone
```

Two designs pushed in one sitting is the normal case, not an exotic one, and
nothing on screen would show the loss.

## Defect: a rung priced RM 0 publishes silently

`issues` (`page.tsx:1305`) is the zod parse result. `priceRm` has no positive
constraint, so a rung that arrived from a design with no price is schema-valid
and reaches customers at RM 0.

## Scale: one OBJ per rung

The client draws one export per width — BC 600, BC 800, BC 900. The unit of
upload is a **rung**, not a family. Forty products at roughly five widths is
~200 designs and ~200 rungs. Everything below assumes that shape: family rows
that summarise rung coverage, with rungs one level down.

## Design

### 1. Draft-first, and pushes stack

**Version resolution** in the existing fetch (`page.tsx:439-468`):

```
asked = ?version=<id>          if given   (unchanged — /admin/import's hand-off)
      = newest DRAFT           else if one exists
      = published              else
live  = published                          (unchanged — the diff baseline)
```

A "viewing draft v13 · open the live catalogue instead" link is the escape.

**State header**, replacing the static subtitle at `page.tsx:555`:
- on a draft — `Draft v13 · not live`, plus the `note` `createDraftVersion`
  already writes ("BC 900mm added from the design library")
- on published — `Live · v11 · published 6 Sep`

The word "publish" appears once on this page, on the button that flips a
version live. Nothing else on the screen uses it.

**Stacking** (`publishDesigns.ts:276`): base the merge on the newest DRAFT when
one exists, else the published version. `getPublishedPlannerCatalogue()` stays
the fallback. The `construction` carry-through at `:281-296` is unaffected — it
reads `base.construction` either way. When a push stacks, the new draft's note
names both sources.

Consequence, accepted deliberately: an unreviewed parse can compound onto
another unreviewed parse. Publish remains the single gate, and the alternative
on the table is silent data loss.

### 2. Review above the tabs

The state header and attention list sit **above** the tab bar, because they
describe the whole draft — a door-style price and a new base cabinet are both
changes, and nesting them under Cabinets would hide half of them. Both are
absent when `live` and `draft` are equal; the page then opens on the tabs.

**The attention list** is rung-level and capped:
- every rung that blocks publishing — price 0 — listed in full, with an inline
  RM field
- everything else as one line per change type ("14 rungs now drawn from a
  design", "3 prices changed"), from `summariseCatalogueChanges(live, draft)`
- each line jumps to that family in the Cabinets tab, expanded

**Publish is disabled while any blocker stands**, alongside today's zod
`issues`. The button's hint says what is missing, by count.

**One state, two views.** The inline price fields write the same
`draft.families[i].sizes[j].priceRm` the Cabinets tab edits — the page already
holds `draft` as one object (`page.tsx:468`), so this is a second reader, not a
second copy.

Everything still leaves through `POST /versions` → `.../publish`. Zod
validation, the DRAFT row as audit trail and cache revalidation are unchanged.

### 3. Cabinets tab: room-first

Grouped by room, read from `roomTypes[].familyIds` — data the catalogue already
carries (`catalogue.ts:434-443`) and the tab currently ignores.

```
Kitchen · 5 families · 22 rungs · 8 drawn
  Base cabinet    base   5 sizes   3 drawn   5 priced
  Drawer base     base   3 sizes   0 drawn   3 priced
```

One row per family with three counts; the row expands inline into today's
editor card. Coverage is summarised at family level because "3 of 5 widths
still render as grey boxes" is the actionable unit.

**"In no room" is a first-class group**, warning-styled, at the bottom: any
family whose id appears in no `roomTypes[].familyIds`. Derived, no schema
change. It is what makes an uploaded design that reached nobody visible, and it
is where `Testing123` surfaces on day one.

**Room membership moves onto the family row** — a checkbox per room, writing
`roomTypes[].familyIds`. That array is editable only on the Rooms tab today,
which is why adding a family and having it appear nowhere is a silent failure.
The Rooms tab keeps what is genuinely room-shaped: starter layout and
`defaultWallWidthMm`.

**This is also the retire path.** Untick every room: the family stays in the
document, its prices and history stay greppable, its designs stay linked, and
no customer sees it. No new state, no delete.

**Search spans families and rung widths** — typing `900` surfaces every family
carrying a 900 rung, which is how someone hunts across 200 rungs.

### 4. "What it holds" becomes one read-only line

The geometry block (`page.tsx:686-806`) is fallback-only data. Its consumers:

| Consumer                          | When                            |
| --------------------------------- | ------------------------------- |
| `Cabinet.tsx`                     | undrafted rungs only            |
| `measure.ts:213` snapping         | only while no mesh has loaded   |
| `StudioScreen.tsx:139` leaf count | fallback; the drafted mesh wins |
| `thumbs.tsx:10-12` palette art    | always                          |

It is written by intake (`measureDesign` → `mergeIntoCatalogue`), so an open row
of number inputs invites edits the scene will ignore. Replace with one line
computed by the same functions the renderer calls — `fitOutOf(family,
widestRung, construction)` and `standOf(family, construction)` — so precedence
is displayed rather than restated:

```
1 shelf · 2 door leaves at 900 mm · back panel · 4 legs, 100 mm × ⌀57, 17 mm in
  — measured from BC 800mm
```

Correcting a bad parse stays possible behind an explicit **Override these**
disclosure, which reveals today's inputs unchanged. `withGeometry`
(`page.tsx:114`) survives as the writer behind that disclosure.

The top-level `Drawers` field goes read-only when `geometry.drawers` is set,
since `fitOutOf:181` discards it in that case.

## Not doing

- **Discard draft.** No DELETE route exists, and a bad draft is fixable by
  editing it or pushing the design again. Add it when someone wants to abandon
  one.
- **Persisting `category` on the family.** The library's five-value vocabulary
  is finer than `kind`, but with room-first grouping nothing consumes it.
- **Renaming `CabinetDesign.status`'s `PUBLISHED`.** A vestigial name for a
  library filter (`cabinet-designs/route.ts:41-44`). A Prisma enum migration
  does not belong in a UI change.

## Testing

New logic lands in the pure modules, which are already tested:
- **`publishDesigns` stacking** — publish A, publish B, assert the second draft
  carries both families. This is the data-loss defect; it must have a test.
- **`blockersOf(catalogue)`** in `lib/catalogue/`, returning `{familyId,
  widthMm}` per rung priced 0. Tested beside `diff.ts`.
- **`strandedFamilyIds(catalogue)`** — same module. Tested with a family in one
  room and a family in none.

The page gets no test: it has none today, and every derivation it renders is
covered above. `pnpm test` and `pnpm lint` gate the work.

## Mockup

https://claude.ai/code/artifact/7714ddd9-64ba-4ea6-975a-1e5780dac93f — the
review screen in both states, with the publish gate and the demoted geometry
line. Section 3's room grouping is not in it.
