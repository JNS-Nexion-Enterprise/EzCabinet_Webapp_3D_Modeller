# Planner phone layout — spec

Source: Claude Design project "EzCabinet Webpage Design" (`df15da59-8dbe-4c27-bc54-78ebcde47403`),
file `Planner (redesign).dc.html`, its `narrow` variant, shown at 390 × 844 in
`Landing - Phone Preview.dc.html`. This document carries everything the build
needs from it; nobody executing the plan has to open the design.

## What changes, and where

**Phone means a viewport narrower than 760 px** (the design's `innerWidth < 760`).
At 760 px and up every planner screen renders exactly as it does today — the
desktop studio, and the stacked `max-lg` layout tablets get.

Below 760 px the planner stops being a fixed-height app shell and becomes a
**scrolling page**: a sticky header, the content, and a bar fixed to the bottom.
The 36 px language strip at the top of the page is hidden on the planner there;
the start screen carries the language links instead.

## Shared chrome (all three screens)

- **Header**: `position: sticky; top: 0; z-index: 10`; a 3-column grid
  `1fr auto 1fr`, gap 8, height 64, padding 0 16, background
  `rgba(255,255,255,.95)` with `backdrop-filter: blur(8px)`, bottom border
  `#ececec`.
  - Left, a **back pill**: min-height 44, padding `0 14px 0 12px`, border
    `#e0e0e0`, fully rounded, white, 14 px / 500, a chevron (8 × 8 box, left and
    bottom 1.6 px borders `#171717`, rotated 45°). Hover `#f5f5f5` / border
    `#cfcfcf`, active `#ececec`.
  - Centre, the title: 16 px / 600, with an optional 12 px `#666` subtitle under it.
  - Right, optional: a 44 × 44 round icon link (studio: tutorials, a play
    triangle 16 px, stroke 1.8).
- **Bottom bar**: `position: fixed`, left/right/bottom 0, z-index 10, padding
  `12px 16px calc(12px + env(safe-area-inset-bottom))`, background
  `rgba(255,255,255,.96)` + blur 8, top border `#ececec`. Its primary button:
  min-height 52, radius 12, `#1f5138`, hover `#17402c`, active `#123322`, white
  16 px / 600.
- **Segmented control** (view toggle and studio tabs): track `#f2f2f2`, radius
  12, padding 4, gap 2. Buttons `flex: 1`, min-height 40, radius 9, 14 px. On:
  white, 600, `box-shadow: 0 1px 3px rgba(0,0,0,.1)`, `aria-pressed="true"`.
  Off: transparent, `#525252`, 500; hover `rgba(255,255,255,.6)`.
- **Tap targets are at least 44 px** on phone: chips 44 px / 14 px / radius 10,
  finish swatches 44 × 44 radius 10 (selected: 2 px `#171717` ring 4 px out),
  list rows 48 px / 15 px, number inputs min-height 40 / 16 px / 84 px wide,
  range inputs 32 px tall.

## Start

- Header: back pill **Home** → `/{lang}`; title "Room planner".
- Body padding `24px 20px 128px`, gap 28, left-aligned.
- h1 26 / 32, 600, letter-spacing −0.01em. Subtitle 15 / 22 `#5c5c5c`.
- Rooms: 2-column grid, gap 12. Card: min-height 136, padding 14, border
  `#e5e5e5`, radius 14, left-aligned, column, gap 3; icon 80 × 40 `#737373`;
  label 15 / 600 (margin-top 10); subtitle 13 / 17 `#666`. Picked: a 2 px
  `#171717` outline and a 22 px black check badge at top 10 / right 10. A room
  with no designs stays disabled and says "Coming soon", as today.
- Then a row, top border `#f0f0f0`, padding-top 8: the language links (EN / 中文 /
  MS, 44 px targets, current one 600 `#171717`, others `#666`).
- Bottom bar: **Start planning**, disabled while the picked room has no designs.

## Studio

Top to bottom:

1. Header: back pill **Rooms** → room picker; title = the room's label;
   subtitle "{m} m wall" (the targeted wall's length, 2 decimals); right, the
   tutorials link.
2. View toggle — 3D / Elevation / Plan — in a segmented control, padding `12px 16px 0`.
3. **The canvas card**: height 300, margin `12px 16px 0`, radius 16, background
   `#f4f2ee`, overflow hidden. Inside:
   - top-left chip: padding `7px 10px`, radius 9, `rgba(255,255,255,.94)`,
     13 px `#404040`, shadow `0 1px 3px rgba(0,0,0,.08)` — "{run} of {wall} m · N units";
   - bottom, centred, 13 px `#5c5c5c`: "Tap a cabinet to edit it" while nothing is
     selected and nothing is being measured.
4. Tabs — **Selected / Add / Room / Run** — in a segmented control, padding `16px 16px 0`.
5. The active tab's body, padding `16px 16px 140px`.
6. Bottom bar: left, "Estimated total" 12 px `#5c5c5c` with an **ESTIMATE**
   badge (1 px `#b45309` border, radius 4, 10 px / 600 `#9a4a07`), the total
   under it at 22 px / 600 tabular; right, **Get a quote** (padding `0 22px`).

## Quote

- Header: back pill **Edit** → studio; title "Quote".
- Body padding `20px 20px 120px`, gap 24.
- First, a summary card: padding 10, radius 16, `#f7f6f4`, border `#ececec`; a
  112 × 84 scene thumbnail (radius 10) beside three lines — "{room} · {runs} ·
  {n} units" 15 / 600, finish and fronts 13 `#666`, total 17 / 600.
- Inputs: min-height 50, radius 10, padding `0 14px`, 16 px. Checkbox 22 × 22.
- The submit button sits in the bottom bar.

## Decisions — where the design and the app disagree

The design is a layout reference. Where its content contradicts `CLAUDE.md`,
the app wins:

| Design | Built instead | Why |
| --- | --- | --- |
| "Infinite Cabinet" | `{brand}` / EzCabinet | Brand |
| "Then, a starting layout" — Full run / Blank wall | Not built | Rooms open on an empty wall |
| Width chips 400 / 600 / 800, "300–900 mm" ranges | `SelectionPanel` and the add menu as they are | One design, one cabinet; no ladder |
| "Fridge housing · carcass only" | Not built | A placed cabinet always wears a door |
| Invented prices, finish names, "Glass" front | The catalogue's | Prices come from the catalogue |
| "Free to try · no account needed" | Not built | Checkout needs an account |
| Quote: name / phone / email / area, "a designer calls you" | `QuoteScreen`'s own fields, sign-in, passkey, terms, Stripe / bank transfer | It is a paid checkout |
| Admin link | Not built | No admin link on public pages |

And where the design has no home for something the app does:

- **Room tab = `RoomPanel` + the Setup (defaults) body under it.** The design's
  Room tab already mixes the room with "Wall units hang at", so kick board,
  wall-units mode, hang height, flush tops and close gaps follow it there.
  Room shape, per-wall lengths, wall paint and room type stay, since they are
  `RoomPanel`.
- **Doors, Measure and Reset view are three 44 × 44 round buttons stacked at the
  canvas card's top-right** (white `rgba(255,255,255,.94)`, same shadow as the
  chip, gap 8, inset 10). Doors cycles closed → open → hidden, the selling
  feature, one tap from the canvas. Its `aria-label` names the mode, and a
  visible 12 px caption beside the button names it too. The measure readout
  replaces the bottom hint while measuring.
- **Selected tab**: one cabinet → `SelectionPanel`; several → the multi-select
  block; none → `DesignRecap`. The whole-room finish swatches always follow
  ("Front finish · whole run" in the design).
- **Run tab** = `RunList`, then the sign-in nudge (no room for it in a
  one-row bar).
- **Tab rules**: an empty room opens on Room (the existing "measure the room
  first" rule); selecting a cabinet anywhere switches to Selected; Room's
  "Next: add cabinets" and the recap's Add button switch to Add. Adding a
  cabinet does not switch tabs, so several can be added in a row.
- **No right-click menu and no drag-from-menu on phone.** Selected carries every
  verb; Add is tap-to-add.
- The canvas keeps `touch-action: none` (it is how orbiting works). A swipe that
  starts on the 300 px card orbits; the page scrolls from anywhere else.
- The price breakdown stays reachable: the bar's total is a button that opens
  the existing breakdown dialog.
