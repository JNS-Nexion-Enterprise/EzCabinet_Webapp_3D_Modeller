# Filling a ladder from the files, and correcting what a product is called

**Date:** 2026-09-09
**Surface:** `/admin/catalogue`'s family card, `lib/catalogue/publishDesigns.ts`,
`lib/mesh/mergeIntoCatalogue.ts`, `lib/planner/catalogueSchema.ts`

## The problem

One OBJ is one width. A family's size ladder is therefore a set of files, and
filling a five-rung ladder means five uploads that must all land on the same
family.

Most of that loop already exists and is not the problem:
- `/admin/cabinet-designs` already accepts multiple files in one drop
  (`page.tsx:450` loops them; the input carries `multiple`)
- `POST /api/admin/cabinet-designs/publish` already takes an array of ids and
  runs `publishDesigns(ids)` — **one merge, one draft**
- `measureDesign` already reads each file's own width

**The loop is blind, not missing.** `matchesFamily`
(`mergeIntoCatalogue.ts:115-132`) infers the target from shape — `kind`,
`drawers`, height, depth, floor height, and shelves/leaves where known. Width is
deliberately excluded, which is exactly why a ladder collapses onto one family.
But nothing lets an admin _say_ which family, there is no entry point from the
catalogue screen, and a design that measures 10mm off silently forks a duplicate
family instead of joining the ladder it belongs to.

The second problem is naming. The upload form asks for one of five categories;
`CATEGORY_TO_FAMILY_SHAPE` collapses it to a `kind`, and **`category` is never
stored on the family** (`catalogueSchema.ts` has no such field). So a design
filed as a base cabinet when it is really a drawer base is routed wrong, and
correcting the library row afterwards changes nothing — the family already
exists.

## Design

### 1. Category becomes a catalogue field

`familySchema.category`, an optional enum of the library's five values. Optional
so every already-published catalogue keeps validating — the escape hatch
`geometry` already uses.
- `mergeIntoCatalogue` writes it when it creates a family, from the design's
  category.
- After that it is a dropdown on the family card, beside Type, and the admin
  owns it.

**Category seeds `kind` at creation and never re-applies.** It is tempting to
re-run `CATEGORY_TO_FAMILY_SHAPE` when the admin changes the category — that
would be wrong. `kind` decides how a cabinet is placed and, once the impossible-
states work lands, whether it is billed a worktop. Silently changing either as a
side effect of a filing correction would move a customer's price. Category,
`kind` and the geometry fields stay independent after creation.

**Relabelling never moves a rung.** A saved layout document stores `familyId`
per placed module, and those documents back the public share links customers
receive over WhatsApp. Re-homing a rung onto a different family would break
every link that placed it — the exact failure `schemaVersion` exists to prevent.
So a relabel changes what the family is _called and grouped as_: same
`familyId`, same rungs, same prices, same links.

**Routing gets more precise, carefully.** `matchesFamily` also compares
`category` — but only when _both_ sides carry one, mirroring the existing
`g === undefined` clause that stops pre-`geometry` families forking. Without
that guard every family in the live catalogue forks on the next upload.

**On the Cabinets tab**, category is the family row's label: `Drawer base · 5
sizes · 3 drawn`, falling back to the raw `kind` where a family has none. Room
stays the only grouping; category is not a second hierarchy and gets no filter
of its own.

**Drift is expected and left alone.** After a relabel, designs already merged
into the family still carry their original category on their library rows. The
family's category wins; the design rows are not rewritten, because a design row
records what was uploaded and when. Future uploads route by the corrected value
anyway, since a batch inherits its category from the target family.

### 2. A drop zone on the family card

"Add designs to this ladder", on the card itself. What each file needs:

| Field                | Source                                                            |
| -------------------- | ----------------------------------------------------------------- |
| width, height, depth | measured from the OBJ by `measureDesign`                          |
| category, room       | inherited from the family dropped on                              |
| SKU                  | prefilled from the filename (`BC 900mm.obj` → `BC-900`), editable |
| price                | typed in the row, or left blank                                   |

**Price matters here.** `design.priceRm` becomes the rung's price
(`publishDesigns.ts:217` → `mergeIntoCatalogue.ts:248`), and the merge never
overwrites a price that already exists. Left blank, the rung arrives at RM 0,
lands in the review panel's blocker list, and the publish gate holds it — so a
batch dropped at 11pm and priced the next morning cannot reach a customer in
between. That is a supported flow, not a gap.

**Category is inherited, not asked per file.** Five files dropped on Base
cabinet are five base cabinets. A file whose measured shape disagrees takes the
mismatch path instead.

**The mismatch row.** A file outside `DIMENSION_TOLERANCE_MM` of the target is
held back with the measurement that disagrees and two choices — add to this
ladder anyway, or make it its own family. The rest go through untouched.

```
read 5 files → 4 rungs, 1 needs you
  BC 300mm → 300 mm   RM [   ]
  BC 400mm → 400 mm   RM [   ]
  BC 600mm → 600 mm   RM [   ]
  BC 800mm → 800 mm   RM [   ]

  ⚠ BC 900mm — 890 mm tall, this ladder is 880
      [ add to Base cabinet anyway ]  [ make it its own family ]

     [ add 4 rungs to Base cabinet ]
```

### 3. One new argument on the server

`publishDesigns(ids, { targetFamilyId, forced })`.
- `targetFamilyId` overrides `matchesFamily` entirely. Dropping on a card is an
  explicit instruction; inference has nothing to add to it.
- `forced` carries the per-design "anyway" decisions.

Everything after that is unchanged and must stay so: re-read the bytes from
Blob, re-measure server-side, one merge, one DRAFT, stop. Trust comes from the
file, never from what the client claims about it.

The page then reloads onto that draft — `resolveOpenVersion` picks it up, since
a fresh draft outranks published — and the new rungs appear in the review panel.
The 2026-09-08 work is the landing pad for this one.

## Not doing

- **Moving rungs between families.** Breaks share links; see section 1.
- **A category filter on the Cabinets tab.** Room grouping plus the width/name
  search covers navigation at this scale.
- **Rewriting `CabinetDesign.category` on a relabel.** The library row is a
  record of what was uploaded.
- **A per-rung design picker.** The batch path covers the common case; a picker
  for repairing one wrong binding is a smaller follow-up once this proves the
  explicit binding is right.

## Testing

- `matchesFamily` with `category` on both sides, on one side, and on neither —
  the both-`undefined` case is the one that must not fork every existing family.
- `publishDesigns` with a `targetFamilyId` whose shape `matchesFamily` would
  have routed elsewhere: the design lands on the named family.
- `forced` admits a design outside `DIMENSION_TOLERANCE_MM`; without it, that
  design is reported as a mismatch rather than merged.
- Category is written at family creation and **`kind` does not change** when the
  category is later edited. That is the pricing trap in section 1 and it needs
  its own test.
- A batch where one file is priced and another is not produces one draft with
  one priced rung and one blocker.
