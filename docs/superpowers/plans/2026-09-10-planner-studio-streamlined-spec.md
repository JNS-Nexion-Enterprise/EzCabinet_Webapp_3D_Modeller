# Planner Studio (streamlined) — spec

**Source design:** `Planner Studio (streamlined).dc.html` in the Claude Design
project `df15da59-8dbe-4c27-bc54-78ebcde47403`
(<https://claude.ai/design/p/df15da59-8dbe-4c27-bc54-78ebcde47403?file=Planner+Studio+%28streamlined%29.dc.html>).

`support.js` in that project is the generated `dc-runtime` bundle — the
`<sc-for>` / `<sc-if>` / `DCLogic` shim the mock renders with. Nothing in it is
ported; the target is the real React tree.

The design is a mock: a CSS-box 2D room, invented prices, five hardcoded
cabinet types. What is being adopted is its **information architecture and
visual language**, not its data or its fake scene. Every number in the shipped
screen still comes from the published catalogue and `computePlannerPrice`.

## What changes

| Today (`StudioScreen.tsx`, 1296 lines)                                    | Streamlined                                                                                                                                                                     |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left rail = room card (all toggles inline) + cabinet palette, always open | 60px icon **tool rail** + 236px **room panel** + a 296px **overlay panel** that slides over the canvas for Add / View / Doors / Defaults                                        |
| View toggle + Measure live in the header                                  | Both are tools on the rail; header keeps breadcrumb, tutorials, admin                                                                                                           |
| Right panel = selection form, finish, run list, full price list           | Right panel = **verbs** (Resize · Replace · Move · Open doors · Duplicate · Remove) that expand inline; recap + run list when nothing is selected; sticky footer with the total |
| Whole price breakdown always visible                                      | Total button opens a **breakdown modal**; the quote CTA still goes to `QuoteScreen`                                                                                             |
| Selection accent `#2b6cb0` (blue)                                         | Accent `#1f5138` (green), tints `#f2f7f4` / `#e7efe9`                                                                                                                           |
| No canvas affordances beyond drag                                         | Right-click **context menu** on a cabinet; on-canvas **arrow gizmo** while the Move verb is on                                                                                  |
| One hang height for the whole wall row                                    | Per-cabinet hang-height override, driven by the gizmo's ↑ ↓                                                                                                                     |
| No way to swap a cabinet's family                                         | **Replace** verb: swap family, snap to the nearest rung of the new ladder                                                                                                       |

## Decisions taken (asked and answered, 2026-09-10)

1. **Full IA rewrite**, not a restyle.
2. **Every current capability is re-homed**, none dropped. The design's mock has
   no place for drag-and-drop from the palette, multi-select, hinge choice,
   close-gaps, the run list, reset, per-cabinet door style / no-door,
   wall-to-ceiling mode or the overhang warning. Each gets a home below.
3. **The quote modal is breakdown-only.** `QuoteScreen` stays the lead path;
   the design's inline name/phone form is Phase 3 work and is not pulled
   forward.
4. **Both engine additions ship**: `replaceFamily` and per-module `hangAtMm`.

## Where the re-homed features live

| Feature                                         | New home                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Drag a family onto the wall                     | Add panel — the cards stay `draggable`, the canvas keeps its drop target                           |
| Multi-select (shift/⌘-click, checkboxes)        | Selection panel's multi branch, unchanged; the run list keeps its checkboxes                       |
| Hinge left / right                              | Inside the **Open doors** verb, beside the open/close button — where it is today, one level deeper |
| Per-cabinet door style + "No door"              | **Front** section of the selection panel, always visible under the verbs                           |
| Close gaps (n)                                  | Defaults panel                                                                                     |
| Run list + reset this room                      | "This design" panel, under the recap, when nothing is selected                                     |
| Wall units: Hanging / To ceiling, flush-to-tall | Defaults panel                                                                                     |
| Overhang warning                                | Room panel, under the fit line                                                                     |
| Measure axis chips, snap labels, clear          | Unchanged, still the canvas overlay while the Measure tool is on                                   |

## Visual tokens (from the design, verbatim)

```
page            #f4f3f1     canvas ground   #faf9f7
panel           #ffffff     border          #e5e5e5   soft border #f0efec
text            #171717     secondary       #525252   muted #6b6b6b  faint #8a857c
accent          #1f5138     accent hover    #17402c
accent tint     #f2f7f4     accent chip bg  #e7efe9   accent text #17402c
danger          #8a2c1c
header 52px · tool rail 60px (44px buttons, radius 9) · room panel 236px
overlay panel 296px · right panel 312px
type 11 / 12 / 13 / 15 / 19px · radius 7–10px
```

Geist is already the app font (`src/app/[lang]/layout.tsx`), so type needs no
new dependency.

## Out of scope

- Lead capture (name/phone) in the breakdown modal — Phase 3.
- The design's fake `TYPES` / `FINISHES` tables and its `priceOf` formula.
- Touching `QuoteScreen`, `StartScreen` or the landing page beyond the accent
  sweep in the last task.
