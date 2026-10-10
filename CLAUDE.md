# Cabinet planner

Public, lead-generation cabinet planner for **EzCabinet Sdn Bhd** (Malaysian cabinet manufacturer). Built by JNS Nexion Enterprise.

An end customer picks a room, arranges cabinets along one wall in 3D, sees a price, and submits a quote request. EzCabinet's sales team receives the lead with a rendered image attached.

**This is a marketing surface, not a production tool.** It must be convincing and fast on mid-range Android in Malaysia. It does not need to be manufacturing-accurate. A human validates every design before it becomes a real order.

Reference product: IKEA's PAX planner. Not the full IKEA room planner — one room, one wall.

## History worth knowing

The first build was a **wardrobe** configurator: a five-step stepper that split one opening into bays, at `/viewer`, on an engine in `lib/wardrobe`. It was superseded by the room planner in August 2026 and deleted (commit `5b2f0e7`). If you find a doc, comment, or branch referring to `/viewer`, `lib/wardrobe`, `components/configurator`, bays, or the `WARDROBE` product — that is the old design. Do not rebuild it. `git show 5b2f0e7^` has it if you need to read it.

The wardrobe survives only as a seed family (`id: "wardrobe"`) in `lib/planner/catalogue.ts`, which tests use as a fixture.

## Status

Phase 0 (catalogue + pricing spec with client) not yet complete — see Open questions. The engine, the planner UI, and the admin catalogue surface are built. `/admin/cabinet-designs` is the one catalogue screen: each uploaded design is one cabinet, filed under the rooms that offer it, and `POST /api/admin/cabinet-designs/publish` rebuilds the catalogue from the design rows (`lib/catalogue/buildCatalogue.ts`). Customers can check out: `POST /api/orders` re-validates and re-prices the design and stores an `Order` (manual bank transfer until a gateway is chosen), `/admin/orders` marks it paid, and **Create delivery** opens the logistics form pre-filled from the design (`lib/orders`). Customers get updates for the order, each admin-advanced production stage and the delivery: by WhatsApp when they opted in (`lib/whatsapp`, Meta Cloud API; go-live waits on EzCabinet — see Open questions), and by email (`lib/email`, Resend) — receipts always, the rest when WhatsApp is off. Share links are the remaining Phase 3 work.

**Confirmed client requirement (resolved):** EzCabinet designs in SketchUp and asked for "upload SketchUp designs so we can maintain new configurations." It is resolved the literal way: the planner **renders the model they drew** — see [3D](#3d). This reversed an earlier decision to rebuild each cabinet procedurally from extracted numbers; that section carries the measurements that changed it.

**The file format is OBJ, not `.skp`, everywhere.** A `.skp` is a SketchUp-proprietary container that in practice needs SketchUp itself to read; the `openskp` reader was deleted in August 2026 along with `lib/skp`. The client exports the design folder as Wavefront OBJ — `.obj` + `.mtl` + textures — and uploads it zipped. `lib/mesh` reads it. Nothing in the app accepts a `.skp` any more: not catalogue import, not the cabinet-design library. If you are adding an upload that takes a design, it takes `.obj`/`.zip`.

## Stack

The dependency list is `package.json`. The two that need saying:

- Mux for the DIY tutorial videos — the one thing in the app that is streamed rather than generated
- Deployed on Vercel, functions pinned to `sin1` (Singapore) — users are in Klang Valley

## Architecture

### The core rule: the layout document is the single source of truth

A design is a set of cabinets placed in rows against one wall. Each placed cabinet references a **family** — one uploaded design — and its width. Everything else — 3D geometry, price, quote, and eventually the cutting list — is **derived** from that JSON. Nothing is stored twice.

```
Room document (JSON) — RoomLayout, src/lib/planner/room.ts
  ├─ roomId:     kitchen | living | bedroom | foyer
  ├─ plan:       { template: rect | l, widthMm, depthMm, notch…, mirror }   lib/planner/floorplan.ts
  ├─ ceilingHeightMm, hangingHeightMm, …   shared settings
  ├─ runs[]:     one per wall of the plan; each { floor[], wall[] }
  │                modules: familyId, widthMm, xMm, doorStyleId
  ├─ corners[]:  { vertex, floor, wall } — corner units, inside corners only
  └─ free[]:     free-standing cabinets — centre + yaw, never against a wall
```

### One design, one cabinet

The customer does not drag a slider or step through a size ladder. EzCabinet draws **one export per width** — BC 600, BC 800, BC 900 — and each export is its own cabinet: its own name, all-in price (door included), box and drawn model. A catalogue family is exactly one design with exactly one size, and its id is the design's id. This is deliberate:

- It matches how EzCabinet manufactures — standard modules, each a SKU.
- It is what makes rendering the drafted model 1:1 possible: every cabinet has a real file behind it.
- The price a customer sees is the one the admin typed, and the Phase 4 SKU list falls straight out of the layout.

An earlier design grouped the widths into one family with a ladder, matched by shape. On the client's first uploads it folded BC 600 / 800 / 900 into the seed's invented `base-cabinet`, kept that family's invented prices and box, and no screen could tell which cabinet was real. Do not bring the ladder back.

`familySchema.sizes` is still an array and `layout.ts` still places against it, so a multi-width family (the seed, older published versions) still works; the resize control only shows when a family has more than one size. The add-cabinet menu groups cabinets by the design library's category.

### Room shapes

A room is a **floor plan** (`plan: FloorPlan`, `lib/planner/floorplan.ts`) —
a template with editable wall lengths, not a wall list. `rect` has four walls,
`l` has six (a notch cut from one front corner, mirrorable); a U template is
one more shape later. Every corner is 90° and closure is guaranteed by
construction: there is no wall list to leave open. `wallsOf(plan)` derives the
walls (start, end, length, yaw, inward normal) and `setWallLength(plan, wall,
mm)` edits one, clamped only to the plan's own limits (`clampPlan`). The
cabinet-aware clamp is the engine's `setWallLength` (`room.ts`): a wall never
goes shorter than what its cabinets, corner squares and any free cabinet need —
it bisects to the nearest length `isClear` accepts.

A room is still **runs** — `runs[i]` belongs to wall *i*. Each run is still the
one-dimensional thing `layout.ts` places: `runView` hands a run to that engine
as an ordinary `PlannerLayout`, with an active corner as a `reserved` span, and
`withRun` writes its rows back. No placement rule knows about corners — a
corner is one more neighbour in `occupiedSpans`.

**Winding rule (load-bearing).** Facing any wall from inside the room, its
start is on the left, so every inside vertex is the **left-hand corner of the
wall after it**. A corner unit is drawn for the left-hand corner and is never
turned or mirrored to fit — it always sits at the start of the wall it
belongs to. This is also why a migrated v2 run keeps its `xMm`: v2 already
placed left to right facing the wall from inside.

A vertex is an **active corner** when both walls meeting there hold cabinets,
or the vertex holds a corner unit (`CORNER_BASE_CABINET` / `CORNER_WALL_CABINET`,
`isCorner`) — never stored, always derived. Adding the first cabinet to a
wall's neighbour activates its shared corner and runs `cascadeCorner` to slide
cabinets clear; the edit is refused if a wall has no room. An active corner
reserves 607 mm (floor) / 397 mm (wall) empty, or the unit's width once one is
placed, on **both** walls. Removing the last cabinet from either wall frees the
square; nothing is pulled back toward it. An **outside corner** (the L notch's
inner corner) never holds a unit and never reserves anything — a run ending
there has an open end.

Every room now has walls all round, so a cabinet flush against a side wall
(within one board) wears no end panel — see Open questions. Stored orders are
design v3; v1 and v2 are migrated to v3 on read as a `rect` plan — v2 never had
an L-shaped *room*, only an L-shaped kitchen run along two walls of a
rectangle. The straight run lands on wall 0; a v2 L's side run lands on wall 3
(left) or wall 1 (right), and its corner unit at the vertex those walls share
(3 or 0), so the kitchen the customer built is unchanged, only the room around
it is now explicit.

### Wall numbering

Once a room has more than one wall, "which wall" needs a name a customer and
the admin both use. The Room panel shows a small floor-plan map (`WallMap`,
`RoomPanel.tsx`) with every wall numbered in a matching badge, and each wall's
length field carries the same number. The scene mirrors it: `showWallNumbers`
turns on floor badges at the foot of every wall while the Room panel is open —
off by default, since they're clutter once the shape is settled — and plan
view labels each wall "Wall n" beside an editable length chip
(`WallLengths.tsx`, built on the same `EditableFigure` `PositionDimensions.tsx`
uses — `DimensionField` is the Room panel's own field, a different component).
The pan gizmo
(`showPanPuck`) hides while the Room panel is open so it doesn't sit on top of
the wall-length labels; orbit and zoom stay live regardless.

### Drag to another wall

**Floor units (base, tall) have one drop rule.** Dragged more than 150 mm off
their wall they follow the floor, and the release goes through `dropAt`
(`room.ts`): back edge within `SNAP_TO_WALL_MM` of a wall joins that wall, else
the cabinet stands free (see below). The wall tint while dragging reads the
same `wallToJoin`, so the preview and the drop always agree. Within 150 mm of
their own wall they slide along it and stay on it.

**Only wall units hop wall to wall** (`transferTarget`, `floorplan.ts`, from
the pointer's floor point), since they cannot stand free. Either way the move
is `moveToRun`, keeping id, door style and hinge and dropping whatever turn it
had on its old wall. A wall unit's custom hang height survives the move only if
it's still valid on the new wall; otherwise it resets.

### Free-standing cabinets

A base or tall unit can stand away from every wall — `RoomLayout.free`, each
entry a centre (`xMm`, `zMm`) and a yaw, never a `hangAtMm`: a free cabinet
always stands on the floor. Wall-hung and corner units can't go free — they
need a wall or a corner to exist.

On drop, if the cabinet's back edge lands within **150 mm**
(`SNAP_TO_WALL_MM`, `room.ts`) of a wall, it joins that wall's run through the
same `moveToRun` path; otherwise it stays free at the drop point. While
dragging, `clampIntoPlan` (`floorplan.ts`) keeps the cabinet's footprint inside
the room — pushed against a wall it slides along it, and a drop aimed into the
L's notch lands just outside it. `dropAt` still refuses a centre in the notch
for any caller that skips the clamp; everywhere else inside the room outline,
clear of other cabinets' footprints, is valid. A free
cabinet is drawn as a one-cabinet `Run` built from `freeView` — the same view
`pricing.ts` reads — so the worktop, kick board, doors and end panels are the
existing `Run` code, not a special case. It prices as a run of one: its own
worktop (base only), its own kick board wherever a run would bill one, both
sides charged as end panels. The exposed back is not charged — see Open
questions. While a free cabinet stands, the engine only gates further edits on
"does this create a new free-cabinet problem" (still overlapping, still
outside the room); checkout stays strict and re-validates fully.

### Directory layout

```text
src/
  lib/planner/           ← PURE TypeScript. No React, no three.js imports.
    floorplan.ts         ← template + measurements → walls, corners, frames
    layout.ts            ← placement, collision, snapping
    room.ts              ← the stored document: runs + corners + free; each run placed by layout.ts
    parts.ts             ← every box a cabinet is drawn from, as numbers
    exposure.ts          ← which outer sides of a cabinet nothing sits against
  lib/catalogue/         ← DB-backed catalogue: read path, versions, diffs, blob
    versions.ts          ← createDraftVersion, the one place a DRAFT is numbered
    convertDesign.ts     ← one upload → fit-out + render mesh on the row
    buildCatalogue.ts    ← design rows → the catalogue, rebuilt on every publish
    siteImages.ts        ← homepage/finish photo slots, derived from the catalogue
  lib/logistics/         ← delivery jobs and the logistics partners that move them
    carriers.ts          ← the partner vocabulary; isomorphic, no secrets
    types.ts             ← zod payloads + the CarrierAdapter contract
    measure.ts           ← items => weight, volume, the vehicle that fits
    phone.ts             ← an admin's typing => E.164, which carriers demand
    geocode.ts           ← an address => the pin Lalamove prices against
    status.ts            ← a carrier's word for a state => ours; unknown => null
    http.ts              ← the one outbound fetch: timeout, retry only if safe
    store.ts             ← the single write path for a tracking update
    registry.ts          ← which partners we can reach right now
    tokens.ts            ← a partner's OAuth tokens: one row, refreshed under a lock
    label.ts             ← captured shipping labels: blob path, and which carriers have one
    adapters/            ← one file per partner; manual, lalamove, easyparcel, gdex and fedex are built
  lib/orders/            ← checkout: a customer's design becomes an order
    layoutSchema.ts      ← zod twin of PlannerLayout; stored as { schemaVersion, layout }
    validate.ts          ← can this design be sold as it stands — every rule explicit
    price.ts             ← the planner's price + the flat delivery fee, server-side
    items.ts             ← order → delivery rows: box from the design, weight from its row
    payment.ts           ← manual bank transfer, the fallback when no gateway is set
    markPaid.ts          ← the one AWAITING_PAYMENT → PAID write, admin and webhook alike
    stage.ts             ← production stages, forward-only, one at a time
  lib/payments/          ← online payment gateways, one adapter each (Stripe; Fiuu next)
    types.ts             ← the PaymentGateway contract: start / verify / ack
    registry.ts          ← `payment-gateway` flag → adapter; old gateways' webhooks stay live
    start.ts             ← start or resume an order's payment: one intent per order, never two charges
    stripe.ts            ← PaymentIntent + Payment Element; our form sends the billing details
  lib/whatsapp/          ← customer WhatsApp updates via Meta's Cloud API
    templates.ts         ← event → template name, variables, payload; pure
    send.ts              ← one API call; retryable or not
    outbox.ts            ← enqueue in the state change's transaction; flush after, by channel
    webhook.ts           ← Meta's signature, status order; pure
  lib/email/             ← every email the app sends
    layout.ts            ← one look: blocks → { html, text }, escaping included
    copy.ts              ← mail wording, en / ms / zh; server-side, never in the site dictionary
    templates/           ← one pure function per mail; order.ts holds the eight order mails
    orderMail.ts         ← an outbox row → its order → a sent mail
  lib/mesh/              ← reads an OBJ export into catalogue data
    archive.ts           ← unzip; the .obj text and the texture filenames
    objRead.ts           ← OBJ parse: named boxes in the file's own units
    normalise.ts         ← infers scale and up-axis, never assumes them
    roles.ts             ← what each panel is: naming table, geometric fallback
    strategies.ts        ← flat panels → cabinets, three strategies best-first
    extract.ts           ← cabinets → CatalogueDraft (no money, ever)
    read.ts              ← whole-run intake; no caller since /admin/import went
    measureDesign.ts     ← one file = one cabinet, for the design library
    renderMesh.ts        ← OBJ → grouped binary geometry the planner draws
  components/planner/    ← R3F scene and the planner screens
    DesignedCabinet.tsx  ← draws the drafted mesh; Cabinet.tsx is the fallback
  components/admin/      ← admin chrome, DesignViewer
  app/admin/             ← cabinet designs (the whole catalogue), logistics,
                           site content, tutorials
  app/api/               ← admin + catalogue + site-image endpoints
```

`lib/planner` must stay framework-free. Everything in it is `(layout, catalogue) => result`. This lets us:

- build and test the whole engine against fixtures before any UI exists
- run the same code client-side for instant feedback and server-side as the authority
- lift the folder into Factory Tracker in Phase 4 without dragging UI along

If a change to `lib/planner` requires importing React or three.js, the change is wrong.

### The catalogue is a parameter, never a global

`catalogue.ts` holds the **seed**: the settings a fresh database starts with
(door styles, finishes, rooms), the invented families tests use as fixtures, and
the fallbacks (`CONSTRUCTION`, `RATES`) that fill in whatever a published
catalogue omits. The seed publishes no cabinets. `PLANNER_CATALOGUE` is frozen. Nothing swaps it.

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
through `?? 0` whenever a publish changed a size ladder. A fourth, quieter bug
rode along with it: `pricing.ts` read worktop, ceiling-trim, skirting and all
three end-panel rates off the module-level `RATES` global rather than the
catalogue argument, so on the server — where price is authoritative — those six
rates always priced at the bundled placeholders regardless of what was
published. "Which catalogue is live" is now a value with an owner.

### Non-negotiables

- **Price is computed server-side.** The client may show an indicative figure; the authoritative number comes from the API. Never trust a client-submitted price.
- **`schemaVersion` on every stored document.** Public share links must survive schema changes. A customer's WhatsApp link rendering wrong is a lost sale.
- **Zod is the single source of truth for types.** Define the schema once, infer TS types from it, validate every API payload. Malformed input on a public endpoint is guaranteed.
- **Sizes are validated against the family's ladder.** Reject off-ladder widths server-side.
- **The catalogue lives in the database.** Cabinets and their prices are `CabinetDesign` rows, rebuilt into a `CatalogueVersion` on every publish — the version table is the price history. The disaster-recovery copy for cabinets is Postgres plus the design files in Blob; `lib/planner/catalogue.ts` seeds only settings. Ship seed changes as their own commit.
- **Every admin route calls `requireAuth`.** `lib/auth/route.ts`'s `withAuth` wraps every handler under `src/app/api/admin`, with one named exemption in the coverage test's allow-list (`logistics/easyparcel/callback/route.ts` — EasyParcel's own redirect, checked by its `state` cookie instead), and the test fails the build on any other exported method it does not see gated — see [Auth](#auth).
- **A customer notification is queued in the same transaction as the change it reports**, deduplicated by `dedupeKey`, one row per channel (`Notification.channel`) — except delivery booked, which queues after the booking commits so a failed insert can never roll back money spent at a carrier. `draftsFor` (`lib/whatsapp/templates.ts`) is the one place that decides channels: order placed, payment confirmed and refunded always go by email; stage and delivery mails unless WhatsApp carries them — the customer opted in *and* `whatsappConfigured()`, so before WhatsApp is live a ticked box still gets mail. Preview deployments never get `WHATSAPP_TOKEN` or `RESEND_API_KEY`.

## 3D

**The planner draws the model the drafter drew.** EzCabinet designs every
cabinet in SketchUp and exports it as OBJ. That drawing is the deliverable, and
the software's job is to ingest it and put it in front of a customer — not to
re-derive a cabinet somebody has already drawn.

This reverses what this document said until August 2026. The old rule —
*"nothing in the scene is an image or a loaded model"* — rebuilt every cabinet
from eleven extracted numbers, and the visible result was a Häfele Axilo 48
leveller rendered as a plain grey cylinder. The three arguments for it do not
survive contact with the numbers:

| The old objection | What is actually true |
| --- | --- |
| "Heavy web geometry that fights the mobile budget" | The client's whole wall run is **8,058 verts / 13,896 triangles**. As binary that is **176 KB** — about what *one* of their decor photos costs (`Rhone Oak.jpg` is 178 KB). One cabinet is ~25 KB, ~13 KB gzipped. The old figure was measuring OBJ *text*, which is ASCII floats at ~6× the binary. |
| "A baked mesh cannot resize to the size ladder" | True, and irrelevant: a cabinet never resizes. The client draws **one export per width** — BC 800, BC 900, BC 1000 — and each is its own cabinet. |
| "No parameters, so it can never produce a price or a BOM" | Price and BOM come from the layout document and the catalogue row. Geometry never fed them and still does not. The mesh is purely visual. |

### What is drawn from a file, and what is not

| | Source |
| --- | --- |
| Cabinet geometry | **the drafted mesh, 1:1** |
| Room shell — floor, walls, ceiling | procedural. No file describes the customer's room |
| Worktop spanning a run | procedural. It crosses cabinets, so no single export has it |
| Finish, door style | **our** materials, painted per classified mesh group |
| Price | the design row, all-in; door styles add a surcharge |

### Classified at intake, not at runtime

`lib/mesh/renderMesh.ts` converts an upload once, on the server, and the browser
receives grouped binary geometry — never an OBJ, never a loader.

```
BC 800mm.obj  (private Blob — carries their part naming)
      ↓  readObjMesh · normalise · classify        (lib/mesh)
      ↓  bucket triangles by role, write binary
  cabinet mesh  ~42 KB / ~13 KB gzipped
   groups: carcass · door · drawerFront · shelf · hardware · other
      ↓  GET /api/cabinet-mesh/[id]   (public, immutable)
  DesignedCabinet.tsx → BufferGeometry
```

**The mesh is grouped by role, and that is load-bearing.** Two features carry
the sale, and both need to know which triangles are fronts:

- the **finish picker**, which paints the customer's colour onto exactly the
  surfaces a sprayer would paint;
- the **doors-open/hidden toggle**, which hides those groups and nothing else.

`roles.ts` already classifies from the drafter's own group names (`Door_L_`,
`G-UEnd_(R)`). That classification used to be discarded; now it decides the
buckets. The drafter's own materials are dropped — the export carries ~900 KB of
re-encoded texture copies (`RotText12.jpg`) whose names map to nothing, and the
grain tile tinted per finish is both smaller and better.

**Nothing is dropped for being unrecognised.** A record `roles.ts` cannot place
goes to `other` and is still drawn, with a neutral material. `readObj` discards
`G-Object.041` as carrying no readable design intent — but in the client's own
sample job that record *is* the adjustable feet. Unrecognised is not unwanted.

**`Cabinet.tsx` is the fallback, not the primary.** Six procedural boxes rebuilt
from `parts.ts`, still rendered for a family with no published mesh: every
catalogue published before this, and any design whose file would not convert. Do
not delete it — a design that fails to parse must still be sellable.

The custom binary format (`ICBMESH1`: magic, a JSON group table, `Float32`
positions, `Uint32` indices) is hand-rolled for the same reason
`scripts/generate-grain-texture.mjs` hand-rolls a PNG — a GLB writer is a
dependency and an exporter's worth of spec for a file only this app reads.

### Design intake lives in `src/lib/mesh/CLAUDE.md`

How a file becomes a cabinet — scale and up-axis inference, which end is the
wall, panel roles, run grouping, the two intake paths, and the additive merge —
is documented next to the code that does it, and loads when you work there.

### Coverage is the thing to watch

A rung with no `meshDesignId` falls back to procedural geometry, and that is
fine — but it is invisible unless something says so, and the first look at the
planner proved it. One rung of thirty had a design, the kitchen starter layout
happened to place none of them, so every cabinet on screen was fallback and the
generic leg read as a broken feature rather than a missing file.

So `/admin/cabinet-designs` shows, on every design row, what it converted to —
its triangle count, or "no mesh — drawn procedurally" — and whether it is live,
edited but unpublished, or leaving at the next publish.

**A design whose file would not convert stays sellable**, drawn procedurally.
Refusing it would make 1:1 a guarantee rather than a maybe; the admin row says
which ones are procedural instead.

### `parts.ts`, and what it is still for

`lib/planner/parts.ts` returns every box in one *procedural* cabinet — sides,
top, bottom, back, legs, shelves, door leaves, drawer fronts — as
`{ role, index, centreMm, sizeMm }` in the cabinet's own frame. `Cabinet.tsx`
renders the fallback from it and `measure.ts` snaps against it. Both used to
derive the interior separately, which left the measuring tool knowing only the
outer bounding box: a shelf gap, a door reveal and a board thickness were all
unmeasurable.

`familySchema.geometry` feeds it: `shelves`, `fixedShelves`, `doorLeaves`,
`drawers`, `hasBack`, `legs`, `legHeightMm`, `legDiameterMm` and `legInsetMm`,
read off the design at intake, so the fallback at least has the right counts and
the right hardware. `standOf` floats a base carcass on feet when the design
recorded them and falls back to the recessed plinth otherwise.

The leg dimensions matter more than they look. On the client's own file the feet
are **2,248 of 2,344 triangles — 96%** of the model; the carcass is 60, the door
24, the shelf 12. They are the one place a fallback visibly differs from the
drawing, which is exactly what got noticed first. `geometryOf` measures them
(57mm across, 17mm in) rather than guessing (50 and 35), so a design whose mesh
failed still falls back with the right feet.

Zero in either field means "not recorded" and `parts.ts` keeps its constants —
which is why they are not defaulted to those constants in the schema. A real
50mm foot and an unrecorded one have to stay distinguishable.

**Exposed ends wear the door finish.** `exposure.ts` answers which outer sides of
a cabinet have no neighbour touching them, and `PlannerScene` passes it down so
an end-of-run side renders as a veneered end panel rather than plain carcass
board — the most camera-facing surface in the default 3/4 view. Every such side
is also a charged panel, and `exposureOf` in `layout.ts` is the one answer both
the scene and `pricing.ts` read. A side is covered by anything within one board
(`panelThicknessMm`) that shares its height, whichever row it is in — so a wall
unit is buried against a tall unit, and a lifted base is not buried by the one
below it. Two rules EzCabinet confirmed on 2026-09-13: a tall unit's side beside a shorter
cabinet counts as covered, and `G-UEnd_(L)/(R)` is the carcass side, so panels
are charged on top of a design's all-in price, not inside it.

**The measuring tool snaps to whichever geometry is actually drawn.**
`snapToCabinet` takes the drafted mesh's group boxes when one has loaded and
falls back to `cabinetPartsMm` when it has not. That is not a nicety: a
dimension line taken against an idealised shelf while the scene draws the real
one is a wrong number shown to a customer. `PlannerScene` reads the mesh
synchronously through `peekDesignMesh`, because a pointer handler cannot await —
and a null there is correct rather than a race, since no mesh means procedural
boxes are what is on screen.

Onboarding a new design is a **data-entry task, not a 3D-modeling task**: name
it, price it, publish it. That is what lets one person maintain the catalogue.

### Mobile performance rules

Mid-range Android is the target device.

- Lazy-load the 3D bundle behind `Suspense` so it never blocks LCP on the landing page
- `dpr={[1, 2]}`
- **Lighting is `components/planner/Lighting.tsx`, and nothing else adds a light.** One shadow-casting key light, off to one side of the room (see `KEY_OFFSET_M` in `lightingRig.ts` for why), plus one non-shadow fill from the opposite side (`FILL_INTENSITY`/`FILL_OFFSET_M`) that brightens cabinet fronts on the key's own wall without a second shadow to reconcile; an environment from drei `Lightformer`s rendered once (`frames={1}`) — never an HDR file; Khronos PBR Neutral tone mapping, so a finish renders as the colour the admin typed. UI and overlay materials set `toneMapped={false}`.
- **The shadow map is redrawn on change, never per frame.** `SHADOW_MAP` has `autoUpdate: false`; anything that moves a caster calls `markShadowsDirty()` (`lightingRig.ts`) — layout edits, a drag, a door animating, a drafted mesh arriving. Orbiting needs nothing, since the light is fixed in the world. Set shadow-map options through the Canvas `shadows` prop only: R3F re-applies it on every Canvas render.
- **Two quality tiers, `low` and `high`, chosen by measured frame rate** (`PerformanceMonitor`, never user-agent). `high` adds a 2048² shadow map and N8AO ambient occlusion from `HighQualityEffects.tsx`, which is lazy-loaded so a `low` device never downloads postprocessing. `?quality=high|low` forces a tier in development.
- **A captured screenshot renders at `high`** regardless of the device's tier — it is the image that goes out over WhatsApp. (Capture is not built yet; whoever builds it owns this.)
- **One grayscale grain texture, tinted per finish via material colour.** `public/grain.png` is 512², ~54KB, generated by `pnpm generate:grain`, and every surface in the scene shares it. Do not ship a separate 2K PBR set per finish — eight finishes of 2K maps will destroy load time on mobile data
- **The floor is a second greyscale tile, `public/floor.png`**, drawn by the same script: SPC planks (1220 × 180mm, staggered joints, micro-bevel) tinted oak in `Room.tsx`. A generated woodgrain is allowed there and only there — the floor is room context, not a board anyone is sold
- **A finish can override that with a real decor photo.** The `finish:<id>` site-image slot feeds both the landing swatch and the 3D door, so uploading one supplier decor scan makes the strip and the cabinet show the same board. The photo becomes the front's `map` with the material colour set to white; the grain tile stays on as the roughness map. Absent an upload, the generated grain tinted by `finish.hex` is the fallback — see `components/planner/grain.ts`.
- **Decor scans are the supplier's IP.** Board suppliers (Max World and the like) publish decor images for their own catalogue; they are production print masters, not stock photography. Get written permission before putting one on a public page — for a fabricator that buys the board this is normally just a request to the rep
- **The geometry is not the problem; the textures are.** Measured on the client's own export: a whole wall run is 176 KB of binary geometry, one cabinet ~25 KB (~13 KB gzipped). One decor scan is 178 KB. Budget accordingly — the reflex to cut triangles is aimed at the wrong thing here.
- **Meshes are served `immutable` and fetched once per SKU.** The pathname carries the source file's sha256, so a given URL's bytes never change; `DesignedCabinet.tsx` caches the *promise*, so four identical base units in a run are one request. Prefetch sibling ladder rungs if changing a width ever feels slow.
- **A design past `MAX_TRIANGLES` (200,000) is refused** and falls back to procedural. That is not a cabinet — it is a whole room, or a file with the furniture library left switched on.
- `InstancedMesh` for shelves/drawers only if a design gets large enough to need it

Two features carry the sale: a **doors-open / doors-hidden toggle** so the customer sees their interior, and a **canvas screenshot** attached to the quote. That screenshot going out over WhatsApp is what closes the lead.

## Where assets live

| Kind | Home | Why |
| --- | --- | --- |
| Grain/laminate textures | `/public` | Static, versioned with code, free off Vercel CDN |
| Palette thumbnails | Inline SVG (`components/planner/thumbs.tsx`) | Drawn from the family's own proportions. Never boot a WebGL context per thumbnail. |
| Design exports (`.obj`, or `.zip` with textures) | Vercel Blob, **private** | The source file carries the client's module standard, layer structure and part naming. Never public, never in `/public`. Reachable only under `/api/admin`. |
| Derived render meshes (`.icbmesh`) | Vercel Blob, served **public** via `/api/cabinet-mesh/[id]` | The geometry a customer's browser draws, so it has to get out — but only as triangles, with the drafter's materials and every part name stripped. The store is private-access-only, so the route is the hole, exactly like site images. Regenerable from the source, so it is cache, not record. |
| Homepage / room / finish photos | Vercel Blob, public | Slot-keyed (`hero`, `room:<id>`, `finish:<id>`), uploaded at `/admin/site-content`. Slots are derived from the live catalogue, not hardcoded, so adding a finish adds its photo slot |
| Canvas screenshots | Vercel Blob | User-generated at runtime, one per lead |
| Quote PDFs | Vercel Blob | Same |
| Tutorial videos | **Mux**, not Blob | Needs transcoding, adaptive bitrate and a poster frame. Blob would serve one giant MP4 to a phone on Malaysian mobile data |
| Catalogue versions, designs, tutorials, site-image slots, leads, Blob URLs | Postgres | |

Test: if you could delete it and rebuild it from a `git clone`, it belongs in the repo, not Blob.

**Never base64 images into a Postgres column.** A design export is ~2 MB; a screenshot is tens of KB; a render mesh is ~42 KB. All of them live in Blob and only the pathname lives in a column. `CabinetDesign.meshGroups` is the one piece of derived geometry in Postgres, and it is a role/triangle-count summary for the review table — the planner never reads it, because the binary carries its own group table.

## UX flow

Three screens. Rooms open on an **empty wall**: there is no invented starter run to price, and one assembled from whatever designs exist would look random. Blank canvases still cost conversion, which is what the preset designs below are for.

1. **Start** — pick a room; a room with no designs yet is shown as coming soon and cannot be picked
2. **Studio** — an empty room opens on the Room panel (shape, wall lengths, ceiling) with a **Next: add cabinets** button, since a wall cannot shrink below what its cabinets need; then drag cabinets in from a menu grouped by category, choose door style and finish, measure. A placed cabinet always wears a door style — its price includes the door
3. **Checkout** — one page: contact, delivery, and (with a gateway live) Stripe's Payment Element drawing only the payment method, then one **Pay** button that creates the order and confirms its payment → `/[lang]/order/[token]`. With no gateway (`payment-gateway` flag on `manual`) it is **Place order**, and the order page shows bank transfer details until an admin marks it paid

**An order is priced on the server, never by the client.** `POST /api/orders` (public, guarded by BotID) runs `validateOrder` — the engine forgives an unknown family or an off-ladder width silently, which is fine on a canvas and wrong for a payment — then `priceOrder` against the published catalogue, and stores the design as `{ schemaVersion, layout }` with the catalogue version it was priced against. A paid order's **Create delivery** (`/admin/logistics?fromOrder=`) fills the delivery form with one row per cabinet at its designed size and the design row's weight; the delivery create route refuses an order that is not paid.

**An order records the terms it was placed under.** Checkout requires a
ticked terms box; `POST /api/orders` refuses a body without
`termsAccepted: true` and stamps `Order.termsVersion` (`TERMS_VERSION`,
`lib/orders/terms.ts`) and `termsAcceptedAt`. Bump `TERMS_VERSION` by hand
whenever the wording of `/[lang]/terms` or `/[lang]/refunds` changes in
meaning. Both pages and the privacy notice are **drafts**, rendered by
`components/LegalPage.tsx` from `lib/copy`; the refund policy's boundary is
`Order.productionStage` being set. Staff cancel an order from
`/admin/orders/[id]` (`lib/orders/cancel.ts`) on that boundary: unpaid any
time, paid only before production starts and with a reason. Cancelling moves
no money — a cancelled order that still has a `paidAt` shows **Refund due**
until the money goes back: through the gateway (below), or by hand, after
which staff press **Mark refunded**. A customer cannot cancel from their own
page, and cancelling does not void an open gateway payment or send a WhatsApp
message; the refund being recorded does send one (`ORDER_REFUNDED`).

**A superadmin can send a refund back through the gateway, and the gateway's
webhook records it.** On a Refund-due order paid online, **Refund RM x
through <provider>** (`POST /api/admin/orders/[id]/refund`, `orders:refund`,
passkey step-up; `lib/orders/refund.ts`) asks the gateway for the whole
payment back (`PaymentGateway.refund`). The order's `status` stays
`CANCELLED`; where the refund is comes from `refundState`, never a stored
status: `refundRequestedAt` alone is an attempt the gateway has not answered,
`refundRef` without `refundedAt` is one it is processing, and only the signed
webhook (or a refund that settled at once) sets `refundedAt`, through
`markRefunded` — the one write path, shared with **Mark refunded**. The claim
is a conditional write before the gateway call and the idempotency key
carries `refundRequestedAt`, so two presses cannot refund twice. **An
ambiguous error is never a refusal:** only `RefundRefused` (the gateway read
the request and said no) clears the attempt; a timeout, a 5xx or a
connection error keeps it, and **Ask again** repeats the same key. Stripe
does not order its events, so the adapter re-reads the refund on every
`refund.*` event rather than trusting the snapshot. A full refund issued in
the gateway's dashboard on a cancelled order is recorded the same way; a
partial one, or one on an order that is not cancelled, is logged and never
applied. FPX refunds settle in days and can fail, even after succeeding: the
order is then Refund due again with `refundError` shown. If the webhook never
arrives, **Check with <provider>** on a pending refund calls the same route,
which asks the gateway (`PaymentGateway.refundStatus`) and writes exactly
what the webhook would have; it never starts a second refund. Accepted
limits: **Mark refunded** stays available while a refund is unacknowledged
(the panel says to check the dashboard first), and is refused while one is
pending; Stripe replays a stored 5xx for a reused key, so if **Ask again**
keeps failing the way out is the dashboard and **Mark refunded**; and
**Mark refunded** sends the customer the same `ORDER_REFUNDED` message, on
purpose. Delivery creation re-checks the order is still paid as it inserts;
a cancel whose write starts inside that few-millisecond transaction can
still get through, also accepted. The gateway's
webhook endpoint must be subscribed to `refund.created`, `refund.updated` and
`refund.failed` as well as the three `payment_intent.*` events.

**No login to configure — but checkout now requires an account.** Browsing, planning and pricing stay anonymous; `POST /api/orders` is the one hard stop — signed out, placing an order bounces to `/[lang]/sign-in?next=…` and back to the same quote, the design intact via the autosaved draft (`lib/plannerDraft.ts`). A customer whose session has not passed a passkey then meets one more step, `/[lang]/verify`, before the order is placed — a first-time customer sets one up, a returning one uses theirs. A separate, earlier email/WhatsApp gate at **"save & share"** — for the customer who has sunk time into a design and will trade a phone number to keep it — is designed but **not yet built**; see Status and Phasing.

**An order is its owner's.** Every order carries the account that placed it
(`Order.userId`, `NOT NULL`). `/[lang]/orders` lists the signed-in customer's
own orders; `/[lang]/order/[token]` and — for a delivery that belongs to an
order — `/[lang]/track/[token]` open only for that account or staff with
`orders:read` (`lib/orders/access.ts`). The token in the URL is an address,
not a key: signed out, it bounces through sign-in and back; signed in
as anyone else, it is the same 404 as a made-up token. A standalone
admin-booked delivery keeps link access — its recipient has no account.

**A customer corrects their own order details until production starts.**
`PATCH /api/orders/[token]` (owner only, never staff) rewrites name, phone,
email, address, access notes and the WhatsApp opt-in — never the design or
the price. `canEditDetails` (`lib/orders/editDetails.ts`) locks it once
`productionStage` is set, the order is cancelled, or a delivery exists; the
same rule rides in the write's `where`. A phone change re-points that
order's `PENDING` notifications, since `Notification.to` is a snapshot.
Unticking the opt-in is how a customer stops WhatsApp updates.

**The account area** is the route group `app/[lang]/(account)/` — My orders
and each order page inside one layout (`SiteHeader` + "Your account" side
nav); route groups leave URLs unchanged. The layout only reads who is signed
in; access stays in each page (`viewerOf`, `canViewOrder`). `AccountMenu`
reads the session in the browser so the statically rendered landing page,
which also shows it, stays static. Profile, WhatsApp number, saved addresses
and saved designs are later pieces of the Claude Design "Customer Account"
file. How a customer signs in is under [Auth](#auth).

**Not yet built.** Save writes the layout to Postgres under a `nanoid` slug, returns a short URL, creates the lead record, and attaches the screenshot. Then a `wa.me` deep link with the design URL prefilled.

Ship 8–10 **preset designs** as their own indexable routes ("2.4m 3-door kitchen run", etc). Each is an SEO landing page and an entry point into the planner — solves the blank-canvas problem and the traffic problem together.

### The studio's own chrome

- **A breadcrumb header** (`PlannerHeader.tsx`) instead of a stepper — the planner is one screen you stay on, not a wizard.
- **3D / elevation / plan toggle** (`PlannerView` in `PlannerScene.tsx`). Elevation faces the **target wall** — whichever wall is tapped in 3D or plan view becomes the target, and elevation reframes to face it; there is no separate side view any more. Elevation and plan are orthographic and axis-locked: the point of an elevation is that it stays square, so one stray drag must not knock it off.
- **Room dimensions are editable in place** (`DimensionField.tsx`), ceiling height among them — it is a layout dimension in `PlannerLayout`, clamped by `CEILING_LIMITS`, not a constant, because it decides whether a tall unit fits.
- **Room shape and wall lengths** are in the Room panel and, in plan view, on the walls themselves (`WallLengths.tsx`).

### Tutorials

`/tutorials` is a public DIY video library; `/admin/tutorials` uploads to Mux with `@mux/upchunk` (direct-to-Mux, so the video never passes through a function) and polls `[id]/status` until the asset is ready. `lib/mux.ts` is `server-only` — those are write credentials for the video account and must never reach a customer's bundle.

This is the one place the app streams something it did not generate. It is a separate surface from the planner and shares nothing with it.

### Telemetry

PostHog **Cloud EU**, installed from the Vercel Marketplace, so we can see where customers drop out of the funnel and what broke in their browser. Vercel Web Analytics could not do that job — anonymous aggregate counts, no per-visitor journeys, no replay, no alerts — so it runs beside PostHog as a plain page-view count, never instead of it.

- **One module:** `lib/analytics.ts` — `track`, `captureError`, consent. `posthog-js` is imported on idle, never on the LCP path. `<Analytics>` mounts in `app/[lang]/layout.tsx` only; **admin is not tracked**.
- **Through our origin:** `next.config.ts` rewrites `/api/ph/*` to the EU hosts, so ad blockers do not hide drop-offs. `/api/` already bypasses the locale redirect and the admin gate. The region is hardcoded there and in `analytics.ts` because PostHog fixes it at install.
- **Consent (PDPA s.129):** cookieless until the visitor accepts (`opt_out_capturing_by_default` + `cookieless_mode: "on_reject"` — drop the first and "pending" sets cookies). Accepting enables cookies and the error-triggered replay. `/[lang]/privacy` is a **draft** for EzCabinet's counsel.
- **Never send form fields.** No `identify()` with phone or email, nothing a customer types in any event payload. Replay masks inputs.
- **Journey events** are a typed union in `analytics.ts`, fired from existing handlers — one per customer decision, never per pointer move. `quote_submitted` fires after `POST /api/orders` answers 201 — a placed order, not a button press.
- **Breakage:** `error.tsx`, `global-error.tsx`, WebGL context loss in `PlannerScene`, and mesh-load failures in `DesignedCabinet` (the procedural fallback hides them on screen).
- **Room shapes changed two event payloads.** `room_shape_changed.shape` is now `rect | l | l-mirror` (was `straight | left | right`); `quote_viewed.wallMm` now means the back wall's length (`wallsOf(plan)[0].lengthMm`), not the room's one wall. Update any PostHog insight or funnel filtering on these values.
- **Vercel Speed Insights and Web Analytics** (`@vercel/speed-insights`, `@vercel/analytics`), mounted beside `<Analytics>`, so public pages only. Both are cookieless, so no consent gate, and both send nothing until toggled on in the project dashboard. Speed Insights is the free tier: the Real Experience Score only, 10,000 events per 30 days shared across the team, and ingestion pauses for 14 days past that cap (Plus is US$10 per project per month). Web Analytics on Pro has no free events: US$0.03 per 1,000 page views, drawn from the Pro usage credit. Page views only — no custom events; journeys stay in PostHog. Together they add ~6 KB gzipped, deferred, and one beacon per page view. `_vercel` is excluded from the `proxy.ts` matcher, or the beacons get a locale redirect. Neither alerts on failures; that is PostHog and the 5xx rule below.
- **Alerts → Slack:** PostHog error-tracking alerts (new/reopened issue, spike) and a funnel insight alert; server 5xx via the Vercel rule in `docs/ops/vercel-5xx-alert.json`.

## Auth

Accounts, with three roles: `SUPERADMIN`, `ADMIN`, `CUSTOMER`. Customers sign
in with Google, or with a six-digit code mailed to any address — never a
password. Staff are invited by a superadmin and can use either Google or the
password that superadmin set. A staff account promoted from an existing
customer row that has a Google sign-in keeps only that, so a Google-only staff
member has no password fallback — the OAuth-misconfigured escape hatch only
exists for a row that was given a password. A promoted row with no Google
sign-in is given the invite's password (below). Public sign-up can only ever
produce a `CUSTOMER`; a role is granted only by a superadmin acting on
`/admin/users`.

**A customer can sign in with any email.** Better Auth's `emailOTP` plugin:
the address, then a code typed into the same tab — six digits, ten minutes,
three wrong tries, single use, stored hashed in `Verification`. A code and
not a link, because a link opens in the mail app's in-app browser, where the
saved design is absent and passkeys do not work. The first code sign-in
creates the row: `CUSTOMER`, `emailVerified: true`, and no name. The passkey
rules are unchanged and do not know how the customer signed in.

**A code customer gives their name next, once.** `/[lang]/welcome`, one
required field, posted to `POST /api/account/name` — the only door for a
name: it writes `name` on the caller's own row, only while it has none, and
the write itself carries that condition, so two racing requests cannot both
land. There is no rename. Asked after the code and never on the first screen:
that screen serves new and returning customers alike, and a name field shown
only to new ones would say which addresses have accounts. `AuthUser.mustSetName`
is derived on every read (`owesName`, `lib/auth/customerName.ts`) and enforced
exactly where the passkey step is, and before it, because the device's passkey
prompt shows the name: `viewerOf` redirects to the welcome page, the verify
page does the same, the three order routes answer 401 `name_required` (the
coverage test requires both checks in every route under `api/orders`), and
`/api/payments/config` reports `nameRequired` so the quote screen shows a
card instead of losing the form. The email form always navigates by way of
the welcome page, which passes a customer who owes nothing straight on — only
the server knows which is which. A customer who closes the tab there meets
the step again at their next sign-in. `customerNameSchema` is the whole rule
for a name: invisible format characters removed, trimmed, 2 to 80
characters, any script, no control characters, and not one that poses as the
business — one
that contains "ezcabinet", or whose first word starts with "admin" or
"support". Both are tested on a folded copy (compatibility forms unified,
lower-cased, everything but letters and digits removed) so punctuation and
zero-width characters do not dress it up; "ezcabinet" is looked for in the
whole name, the prefix in the first word only, so "Ad Minh" and "Sup Port"
are names. A word ends at an ordinary space and nothing else (a hair space
does not end one), and the first word is the first that is anything once
folded, so "- admin" is refused. Known limits, accepted: "Ad min" typed with
a space is let through; a single-character name is refused
(one CJK character alone is asked to add a character), and look-alike
letters from another script (Cyrillic "а") are not caught. It is not unique,
not a credential, and never identifies a caller. Until it is given, the name
is empty: the account menu hides the line and `/admin/users` labels the row
with its address. Any mail that carries a name escapes it (`esc`,
`lib/auth/inviteMail.ts`).

**Staff cannot use a code**, because it would be a way round both the
password and the authenticator. They are treated like any address on the two
code routes, with two differences: no code is ever mailed to a non-`CUSTOMER`
row (`sendSignInCode`, `lib/auth/emailCodeMail.ts`), and no session is ever
created for one. `refuseStaffCodeSession` (`session.create.before`) is the one
place a staff code sign-in is stopped. There used to be a second refusal at
request time; it was removed because the plugin never counted a staff
address's wrong tries, so the fourth guess answered differently and a staff
address could be told apart by response bytes and by counting attempts. For
the same reason a code that was not mailed — staff, past the cap, or a send
the mail provider refused — is left until it expires (stored hashed, three
tries, ten minutes) and not deleted. Do not "tidy" any of this: deleting the
unmailed code or re-adding the request-time refusal brings the difference
back. One narrow guard remains (`refuseUnverifiedStaff`,
`emailCodeBeforeHook`): a non-customer row whose email is **not** verified is
refused with the plugin's own wrong-code answer before the plugin runs,
because given a correct code the plugin would delete every sign-in and
session on that row. Invite, promotion and the seed all verify staff, so such
a row should not exist; a verified staff row goes through the plugin like
anyone's. So **promoting a customer with no Google sign-in sets the invite's
password** on the row, with `mustChangePassword`, and the form shows it for
handing over exactly as for a fresh invite.

**The plugin registers nine routes and two are open**:
`/email-otp/send-verification-otp` (type `sign-in` only) and
`/sign-in/email-otp` (body `email` and `otp` only — the plugin would copy a
posted `name` or `image` onto a new account, which is why the name has its
own route). The other seven are in `disabledPaths` (`CLOSED_PATHS`,
`lib/auth/emailCodeRules.ts`); two of them would put a password on a customer
row. `emailCodeBeforeHook` refuses any other request to a path containing
`email-otp`, so a route a plugin upgrade adds is a 403 until it is
allow-listed — the passkey hooks' rule. `hooks.before` and
`session.create.before` each hold two guards now; both are composed in
`lib/auth.ts` and `__tests__/emailCodeConfig.test.ts` reads that file to
check it, since `__tests__/emailCodeWiring.test.ts` drives the real plugin on
an instance of its own. Keep both passing.

**Fifteen unused routes are closed as well**, in the same `disabledPaths`:
`/update-user`, `/change-email`, `/delete-user`, `/delete-user/callback`,
`/send-verification-email`, `/verify-email`, `/link-social`,
`/unlink-account`, `/list-accounts`, `/account-info`, `/get-access-token`,
`/refresh-token`, `/verify-password` (a password oracle),
`/two-factor/send-otp` and `/two-factor/verify-otp` (the plugin's emailed
second factor, not configured). `/update-user` was the live hole: it let any signed-in
session, passkey step passed or not, set any name and picture, past every
rule above. Five of the fifteen were already refused by an unset option; they
are closed anyway, so that switching an option on later does not open a route
unnoticed (turning one on then takes two edits). The rest hand a session that
has not passed the passkey step the owner's Google profile and tokens, or
change who owns an address. `__tests__/emailCodeConfig.test.ts` pins every
`disabledPaths` entry. Deliberately still open: `/two-factor/get-totp-uri` and
`/two-factor/generate-backup-codes` (they need the account password and are
the natural routes for a future staff "show my authenticator / new backup
codes" screen).

**The answer to a code request never depends on the address.** New,
customer, staff and over-the-cap addresses all get `{ success: true }` in the
same time: the plugin awaits its mail callback, so the callback only
schedules `sendSignInCode` with `after()`, and everything that differs by
address happens there. Abuse limits: BotID on the send request; three codes
per address per hour (`takeSendSlot`, silent); thirty send requests per
network per hour (`SENDS_PER_NETWORK`) and ten code tries per network per
minute (`SIGN_IN_TRIES_PER_MINUTE`), both Better Auth's limiter and both
answering 429; and, outside the app, a Vercel firewall rule on the send route
at ninety an hour, three times the app's own so the app's message is always
met first (`docs/ops/customer-passkey-runbook.md`). Thirty is the owner's
starting figure, to be raised with the firewall rule if real customers on a
shared network are refused. The tries rule replaces the plugin's own three a
minute, which three typos or two customers behind one carrier address used
up. A 429 on a try is not an expired code: the form says "Too many tries.
Wait a minute, then try the same code again." (`verifyFailure`) and must
never suggest a new code, which would kill the good one and spend a send. Both app counters are rows in
`RateLimit` — `rateLimit.storage: "database"`, which every Better Auth route
now uses, so every `/api/auth` request reads and writes that table and the
migration `20261009000000_rate_limit` must be applied before this code serves
traffic, or nobody can sign in, staff included. The per-address rows share
that table and Better Auth prunes it by its longest configured window, so the
send rule's window must not drop below `SEND_WINDOW_S`. Because the cap is
silent, the form counts its own sends and shows "too many" itself
(`maySendAgain`). Accepted limits: anyone who knows an address can burn its
three codes an hour (a nuisance to that customer, no access); the per-network
send rule is a rolling count that never resets while requests keep arriving
under an hour apart, so it is really "thirty, then an hour's refusal" for a
busy shared network (an office, a mobile carrier's NAT); the tries rule rolls
the same way, resetting only after a minute with no try at all, so a customer
with the right code there can be told to wait more than once; and a lost
mailbox has no recovery.

**A code session is checked twice.** `refuseStaffCodeSession` before the
session is made, and `dropCodeSessionIfNotCustomer`
(`session.create.after`, ahead of the `lastLoginAt` stamp) once it exists:
if the row is no longer a customer's — a promotion committed while the
sign-in was in flight — the session is deleted. The response may still set a
cookie for it; the next request is signed out. A staff address never reaches
the second check, so it tells nothing apart. Its role read is tried twice,
because the code is already spent when it runs. The matching hole on the
invite side: a fresh invite whose sign-up was swallowed, because the
invitee's first code sign-in or another superadmin's invite made the row a
moment earlier. Better Auth answers a swallowed sign-up with a made-up row,
so the route compares the id it was given with the row it finds and answers
409 `signed_in_meanwhile` when they differ, instead of giving a role to a
row with no password or with someone else's. Pressing Invite again promotes
it properly, or says it is already staff. The grant itself is a conditional
write (still `CUSTOMER`, still holding a `credential` account) and the
row's sessions are deleted after it, as a promotion's are. Known limit: the
new row is unverified until the grant lands, so a code sign-in in flight
whose wipe of the row's sign-ins lands after the grant leaves a staff row
with no password; the way out is Delete and invite again.

**A customer's name needs a letter.** `parseCustomerName` answers
`name_required` for a name with no letter at all ("..", emoji alone,
zero-width spaces, Hangul fillers) and `name_refused` for one carrying a
control character, a line or paragraph separator or a Hangul filler. Format
characters (direction marks and overrides, zero-width spaces, soft hyphens)
are removed before anything is judged, not refused: they ride along on a
paste from a chat app and the customer cannot see them. Two are kept because
they spell things: the zero-width joiner (emoji) and non-joiner (Persian and
several Indian scripts). A flag emoji built from tag characters loses its
tags and is stored as a plain flag.

**Before a deploy**, two queries must answer 0 — unverified staff rows, and
`SELECT count(*) FROM "user" WHERE email <> lower(email);` (a mixed-case
staff row would be mailed codes and gain a shadow customer row) — and on the
preview, not after production, the `rateLimit` keys must start with a real
address, not `no-trusted-ip`. Migration `20261009000000_rate_limit` sorts
before the already-applied `20261009010000_notification_channel` and still
applies with `migrate deploy`. The runbook has the checklist.

**One email is one account.** Google joins an existing row only when Google
reports the email verified and our row is verified too — Better Auth's
default, with `trustedProviders: []` written down so no provider is ever
trusted past it.

**The owner hears when the lock changes.** Before the first passkey the
mailbox or the Google account is the only lock, and whoever holds it can
enrol their own. So the account's own address is mailed every time, for
every role: a passkey added, a passkey removed, passkeys reset by staff
(`lib/auth/passkeyMail.ts`). What happened, when in Malaysia time, and the
sales contact as a number — no link, so a forged copy has nothing to phish
with. `queuePasskeyMail` schedules it with `after()` from `passkeyAfterHook`
and the reset route, never throws and is never awaited; `pnpm
auth:reset-passkey` has no request to run after, so it awaits the send
itself. It cannot stop a change, only make it visible.

**Customer-facing text names a provider only on that provider's own button
and error.** `copy/__tests__/dictionary.test.ts` fails on any other string
that says Google. With no `RESEND_API_KEY` (local, preview) the code is
written to the server log and nothing is mailed; with one it is never logged.
In production (`VERCEL_ENV === "production"`) it is never logged either way:
a missing key there logs an error naming neither the code nor the address.
Mail delivery is now checkout-critical: a customer without Google cannot
order if their code does not arrive.

`lib/auth/permissions.ts` is the whole access model: ten permissions and a
`Role → Permission[]` constant, with a table-driven test that is its
specification. The permission names outlive the roles that motivated them —
`SALES` and `CATALOGUE` were specified and dropped, and reinstating either is
one row in that table rather than an audit of 29 route handlers.

`proxy.ts` only redirects; the boundary is `requireAuth()`, called by every
admin page and API route, and a test fails the build if one forgets. Roles are
never written into the session, so a role change or an offboarding bites on the
next request.

An invited staff row is created with `emailVerified: true`. That is not
cosmetic: Better Auth refuses to link a Google account to a row whose email is
unverified, and this app deliberately sends no verification email, so without it no
staff member could ever use the Google button. The superadmin typing a
colleague's work address is the assertion that it is theirs.

`AUTH_ENABLED=false` opens the admin surface and lets you open any customer
order page, for local work. It never lets checkout take an anonymous order —
every order needs an owner. Signed out, a local order belongs to one seeded
demo customer (`lib/auth/demoCustomer.ts`), so the planner can be demonstrated
end to end without Google; the quote screen learns this from
`/api/payments/config` and skips its sign-in card. It is
ignored whenever `VERCEL_ENV` is set — preview included, since a preview is a
public URL with real carrier credentials behind it. On customer order pages a
real Google session still wins over the bypass user, so local My orders lists
the signed-in account's orders.

Public password sign-up is closed (`disabledPaths: ["/sign-up/email"]` in
`lib/auth.ts`); invites and the seed call `auth.api.signUpEmail` server-side,
which the router never sees. Promoting an existing customer row strips any
password and session it carries before granting the role — a customer row
with a password was made by someone other than the address's owner. The
sessions are deleted a second time once the role is committed: a code
sign-in could land between the first delete and the commit, and from the
commit on `refuseStaffCodeSession` refuses any new one.

**Staff with a password need a second factor.** Better Auth's `twoFactor`
plugin (TOTP + backup codes); `AuthUser.mustSetupTwoFactor` is derived on
every read by `needsTwoFactorSetup` (`lib/auth/twoFactor.ts`) and enforced
beside `mustChangePassword` — `withAuth` refuses, `requirePage` redirects to
`/admin/setup-2fa`. Google-only staff are exempt, and the plugin gates
`/sign-in/email` only, so a staff member with both a password and a linked
Google account can still enter through Google without a code: accepted.
`/two-factor/disable` is closed; the only way to remove a second factor is a
superadmin's **Reset 2FA** on `/admin/users`, or `pnpm auth:reset-2fa <email>`
when the last superadmin is the one locked out. A superadmin can also press
**Remove password** on `/admin/users` to make a Google-linked staff account
Google-only (refused when it has no other sign-in), which the 2FA rule exempts
— the way out for staff who only use Google and never learned the invite
password. Both Reset 2FA and Remove password log the actor's and target's ids.

**Actions that move money or access ask twice, and ask for a passkey.**
Cancel order, mark paid, refund through the gateway, mark refunded, invite or
promote a staff member, change a role, delete user, reset passkey, reset 2FA
and remove password open a confirmation dialog
(`components/admin/ConfirmDialog.tsx`); suspend and restore are one click
with no dialog. All of their routes pass
`{ stepUp: true }` to `withAuth`: the session must have passed a passkey
authentication in the last five minutes (`lib/auth/stepUp.ts`), or the route
answers 403 `step_up_required` and the browser prompts and repeats the call
once (`components/admin/stepUp.ts`). `Session.passkeyVerifiedAt` records
when; `passkeyVerified` cannot, since it lasts the session's week and an
enrolment sets it with no authentication at all. A coverage test lists the
guarded routes by path — the order routes `cancel`, `paid`, `refunded` and
`refund`, and `POST /api/admin/users` and `PATCH /api/admin/users/[id]`
among them. The two user routes matter most: unguarded, a held superadmin
session could promote an account it controls and pass every other guard as
that account. Staff enrol at `/admin/security`; this is separate
from sign-in, where staff still use a password and code, or Google. A
superadmin's **Reset passkey** works on staff rows too, and
`pnpm auth:reset-passkey <email>` covers a sole superadmin who lost their
device. A passkey authentication replaces the session: `passkeyAfterHook`
deletes the one the request came in with, so signing out afterwards leaves
no older password or Google session behind. Five limits: **until a staff
member has enrolled a passkey, the step-up adds nothing for their account**,
because a first enrolment is free — whoever holds their session can enrol
one and pass every guard, so every staff member enrols on the day this
ships; a staff member's first passkey is enrolled by whoever holds their
session (logged, as with customers); the window covers any guarded action in those five minutes, not
one named action; the step-up is skipped with `AUTH_ENABLED=false`, where no
session exists to pass one; and user verification (biometric or PIN) is
required at enrolment (`authenticatorSelection`) but the plugin at 1.7.5
cannot enforce it at authentication.

**Suspend is reversible; Delete is not.** A superadmin's **Delete** on
`/admin/users` (`lib/auth/deleteUser.ts`) removes the row with its sessions,
sign-ins and second factor. It is refused on your own row and on any account
that placed orders — `Order.userId` is `Restrict`, so that account can only
be suspended. Orders a deleted staff member marked paid keep the name in
`Order.paidByName`; only `paidByUserId` goes null.

**Forgot password is email, staff only, and only after enrolment.**
`sendStaffReset` (`lib/auth/passwordReset.ts`) mails a link through Resend
(`lib/email.ts`, one `fetch`) when `canEmailReset` allows it: staff role, not
disabled, has a password, 2FA enabled. Better Auth's reset would otherwise
create a password on a customer row, and a mailbox alone must not be enough
to enrol an authenticator. The link never touches the second factor.
`RESEND_API_KEY` and `EMAIL_FROM` are production-only, like `WHATSAPP_TOKEN`.

**Signing in is not enough for a customer; a passkey is.** After sign-in, by
either route, a `CUSTOMER` session counts only once `session.passkeyVerified` is
set, which only a passkey ceremony does (`@better-auth/passkey`).
`AuthUser.mustVerifyPasskey` is derived on every read in
`lib/auth/session.ts` from `needsPasskeyCheck` (`lib/auth/passkeyRules.ts`)
and enforced where customer surfaces read the
viewer: `viewerOf` redirects to `/[lang]/verify`, and `POST /api/orders` and
the pay route answer 401 `passkey_required`. Staff are exempt. So are the
order surfaces with `AUTH_ENABLED=false` (`viewerOf` and the two order routes
check `authEnabled()`); the guard on `/passkey/*` and the verify page still
enforce.

`/api/payments/config` tells the quote screen when the passkey step is owed
(`passkeyRequired`), so `QuoteScreen` shows a passkey card in place of the
form, as it does for sign-in, and nothing typed is lost at the detour. The
401 `passkey_required` handling there is only the backstop.

**The limit: the first passkey is enrolled by whoever can sign in.** That is
whoever holds the Google account, or the mailbox a code is sent to. Until an
account has a passkey, anyone who can sign in to it can
set one up; that covers every existing customer on launch day and any
customer just after a reset. A passkey protects the account from then on,
not before. Operators read `docs/ops/customer-passkey-runbook.md` (reset
procedure, ring-back, deploy checklist).

Better Auth's session-management routes (`/list-sessions`, `/revoke-session`,
`/revoke-sessions`, `/revoke-other-sessions`, `/update-session`) are in
`disabledPaths`: the app calls none of them, and a session that signed in
with only Google or a code could otherwise list the owner's sessions or sign
the owner out everywhere.

The plugin's defaults would undo this, so `hooks.before` in `lib/auth.ts`
runs `passkeyBeforeHook` (`lib/auth/passkeyHooks.ts`), which calls
`checkPasskeyRequest` on every `/passkey/*` write: a session may register
the account's first passkey freely, but adding another, renaming or deleting
one needs a passkey authentication in the last five minutes
(`recentStepUp` on `Session.passkeyVerifiedAt`) — for every role, and not the
week-long `passkeyVerified` flag, on which anyone at an unlocked laptop could
enrol their own authenticator hours later and pass every step-up with it.
The last passkey is never deleted. `PasskeyList` prompts and repeats the
action once when the server answers `PASSKEY_VERIFICATION_REQUIRED`. `assertPasskeyOwner` (wired as the
plugin's `authentication.afterVerification`) refuses a passkey that belongs
to a different account than the Google session. Do not remove either to make
a flow easier. The hook bodies are exported functions (`passkeyBeforeHook`,
`passkeyAfterHook`, `verifiedIfPasskeySession`) wired in `auth.ts`, and
`__tests__/passkeyWiring.test.ts` drives them through the real plugin on
Better Auth's in-memory adapter — keep it passing; the unit tests alone
passed while a real bug shipped.

Three rules in those hooks look like candidates for tidying and are not:

- **A session is marked verified after a registration only on positive
  evidence** — the result is not an API error by `isAPIError`, *and* the
  account now has at least one passkey row. An earlier `instanceof APIError`
  check missed validation errors, so a malformed request could mark a session
  verified with no passkey at all. Do not simplify it back.
- **Unknown `/passkey/*` routes are refused** (fail closed). A plugin
  upgrade that adds a route needs it allow-listed in `passkeyHooks.ts`, or
  that route is a 403.
- **`createSession: true` on registration is refused**, because it would mint
  a second, unverified session and swap the cookie to it. Separately,
  `Passkey.credentialID` is `@@unique`: one credential belongs to one account,
  and lookups by credential id are unordered, so a duplicate id registered on
  another account could break the real owner's passkey step.

Enrolling needs a session under one day old — Better Auth's
fresh-session rule, kept deliberately so that a stolen old session cannot
enrol the thief's passkey. The verify screen sends a stale session back
through sign-in; adding another device from the Passkeys page renews
the session with a passkey prompt instead.

`safeCustomerNext` (`lib/auth/safeCustomerNext.ts`) decides where the verify
page sends a customer afterwards: only a same-site path, refusing control
characters, backslashes, empty path segments, a bare `/`, the verify page
itself in any spelling, and anything that does not re-parse to itself. It was broken twice in review (tab stripping, then dot
segments like `/a/..//example.com`), so any change must extend the
hostile-input tests in `__tests__/safeCustomerNext.test.ts`.

Recovery is a staff action only — **Reset passkey** on a customer's row in
`/admin/users`, which shows their recent order numbers and phone so staff can
confirm who is calling. It needs `users:manage`, which only `SUPERADMIN`
holds: an `ADMIN` cannot reset a customer's passkey or see the phone line.
There is deliberately no self-service path: anything a customer could do
with only their sign-in, so could whoever took it. A lost mailbox has no
recovery at all.

Passkeys are bound to the site's hostname (from `BETTER_AUTH_URL`). Changing
the production domain invalidates every customer's passkey, and a passkey
made on one preview URL does not work on another. Passkey dates on the
account page are pinned to Malaysia time (`passkeyDate.ts`), so the server
and the browser render the same day.

Design: `docs/superpowers/specs/2026-09-20-rbac-design.md`.

## Relationship to Factory Tracker

Separate repository, deliberately. Factory Tracker is an authenticated B2B dashboard where bundle size barely matters; this is a public marketing surface where three.js weight decides whether the lead ever loads the page. Different audiences, deploy cadences, and risk profiles. A planner hotfix must not redeploy a system the factory floor depends on.

Phase 4 integration is a **versioned HTTP contract**, not a monorepo. Factory Tracker exposes `POST /api/v1/production-orders`; the planner calls it with a signed payload. Extract a shared types package only if that becomes painful.

Separate Postgres database from Factory Tracker.

## Phasing

| Phase | Work |
| --- | --- |
| 0 | Catalogue + pricing spec workshop with client, including the design-intake process |
| 1 | Layout schema, rules, pricing — headless, tested against fixtures ✅ |
| 2 | Planner UI + 3D scene ✅ |
| 3 | Lead capture, share links, admin inbox (admin catalogue + designs ✅; paid checkout, orders admin, order → delivery pre-fill ✅; share links and a real payment gateway not started); L-shaped kitchens ✅ |
| 4 | Approved quote → **SKU list** → production job in Factory Tracker. Factory Tracker pushes production stages onto `POST /api/admin/orders/[id]/stage` (today an admin presses it). |

**Phase 4 changed shape when the planner started rendering the drafted model.** A derived cut list is no longer available, because the app no longer derives the cabinet — it draws the one the client already drew. What Factory Tracker receives is a SKU list (`1× BC 800mm`). For a factory that manufactures to standard modules that is arguably the more useful payload, but it is a change to the contract and **the client should hear it**.

## Known issues

Recorded rather than fixed. Do not paper over them; fix them deliberately.

1. **Drafter naming is load-bearing now.** `roles.ts` classifies mesh groups from the drafter's own names, and that classification decides which triangles take the customer's finish and which disappear on the doors-hidden toggle. A renamed group used to cost an inferred shelf count; it now costs the finish picker on that cabinet. The review table shows the classification before publish and the fallback is one material across the whole mesh, but this belongs in the Phase 0 conversation about drafting conventions.
2. **Until the first publish after the one-design-one-cabinet change, the live catalogue is the old one** — seed families with invented prices, and the junk `Testing123` among them. The first publish from `/admin/cabinet-designs` rebuilds it from design rows and removes them all. Set the base door style's surcharge to RM 0 before that publish, or every cabinet is charged its door twice.
3. **EasyParcel's webhooks are unsigned.** Nothing in their payload identifies the sender, so the callback URL carries a secret query token and that is the entire check — see `verifyWebhook` in `adapters/easyparcel.ts`.
4. **`pnpm easyparcel:ping` is the only thing that checks EasyParcel's real API shape**; CI runs against recorded fixtures and cannot see a renamed field. Run it before a release that touches `lib/logistics`, or wire it to a scheduled workflow with the credentials as repository secrets. It is deliberately not in PR CI: it needs secrets in the runner, it fails on EasyParcel's downtime rather than on our bugs, and a partner outage must not block an unrelated merge.
5. **City-Link is still a stub, and its API cannot price.** Its guide (Testing V1.21) documents a login, a shipment request and tracking — no rate operation, no cancel, no webhook — so a City-Link row would carry no price, an admin would undo a booking by phoning them, and tracking would be the cron poll only. The booking body's nesting is unverified: the guide groups the fields but prints no sample request. Plan and payloads in `docs/superpowers/plans/2026-09-16-citylink-carrier-adapter.md`; nothing is built.
6. **Corner doors stay shut on the doors-open toggle.** A drafted leaf deeper than half its width — an L corner unit's two touching leaves merge into one L-shaped leaf in `splitDoorLeaves` — is kept shut in `DesignedCabinet.tsx`, because `swingOf` assumes every leaf faces +z and would pivot it through the carcass. The procedural fallback of a corner unit is a plain box whose front the side run half covers, so it is never turned — every corner is the left-hand corner of the wall after it — and its doors stay shut too. Revisit both once EzCabinet's real corner export is seen.
7. **Free cabinets have no resize, replace or duplicate yet** — those controls are hidden on a free selection. **No floor-follow drag in elevation view**, since elevation is a flat wall-facing projection with nowhere for "off the wall" to go. **Switching to an L is refused silently** while a free cabinet stands in the notch's would-be area — the room panel just doesn't move. **A free cabinet can stand under an empty corner square's billed worktop**: `runFootprints` ignores an empty reserved corner square, so nothing stops a free cabinet occupying the same floor space that corner's worktop is priced over.
8. **A journey event fired next to a redirect can be lost.** `track()` in `lib/analytics.ts` loads `posthog-js` on idle and captures asynchronously, with no `sendBeacon` or `keepalive`. `sign_in_nudge` with `action: "accepted"` fires and is immediately followed by the Google OAuth redirect, so that leg of the sign-in funnel will under-count — the browser can navigate away before the beacon goes out. Not new, and not unique to that event: any event fired next to a redirect has the same problem. The fix, when someone wants one, is a `keepalive` fetch or firing the event server-side after the callback, and both are decisions about the funnel rather than cleanup.
9. **The Customers filter on `/admin/users` narrows client-side over a capped list.** `GET /api/admin/users` has `take: 200`, and `staff=0` drops the `NOT: { role: "CUSTOMER" }` clause rather than adding a customer-only one, so that cap is shared across staff and customers and the browser filters the result afterwards. A public planner accumulates customer sign-ups steadily, so once total accounts pass 200 the Customers view silently shows an incomplete list with nothing in the UI saying so. The fix is a `role` parameter on the endpoint's existing `where`, which removes both the truncation and the over-fetch of rows the customer view discards. Growth debt on an endpoint that is already reviewed and gated, not a defect: with three accounts today it cannot bite.
10. **Resolved: `mustChangePassword` is enforced.** `withAuth` refuses and `requirePage` redirects to `/admin/change-password` while it is set. Kept as a numbered entry so references to issue 11 stay valid.
11. **`advance` takes its actor from the session; `book` and `split` still take a client-typed one.** `DeliveryDetail.tsx`'s name field feeds `bookedBy` and `split`'s `actor`, and `split` falls back to the literal `"Admin"` when the field is left blank — so the delivery activity log has mixed provenance, a session user's real name on some rows and whatever an admin typed (or nothing) on others. Narrowed, not closed.
12. **`prisma.config.ts` sets no `shadowDatabaseUrl`.** That is why `prisma migrate dev` refuses non-interactively and `prisma migrate diff --from-migrations` cannot run — both need a shadow database to diff against. Until it is set, a migration written outside an interactive terminal has to be hand-written and independently verified (`prisma migrate diff --from-config-datasource --to-schema`) rather than generated. The fix is two lines in `prisma.config.ts` pointing at a disposable shadow database URL; not done here.
13. **FedEx's sandbox cannot check our requests.** It answers only its own canned inputs — any request that differs from a documented example returns `SERVICE.PACKAGECOMBINATION.INVALID`, and its canned Malaysian rates are USD — so `adapters/fedex.ts` is tested against fixtures built from FedEx's documented shapes, not against FedEx. `pnpm fedex:ping` against **production** checks only the token, rate and track calls — it never ships. Ship, pickup, both cancels and the label fetch are first exercised by the first real booking: run it once production credentials exist, watch it with FedEx Ship Manager open, and cancel it there if anything looks wrong. Production also needs label certification with FedEx, which can take weeks.
14. **Resolved: Better Auth's rate limits are counted in the database.** `rateLimit.storage: "database"` and the `RateLimit` table, added with customer email sign-in, so the per-network limit on `/request-password-reset` (and every other route) holds across serverless instances. What is left is by design: `sendStaffReset` still sends nothing once an account has more than three live reset links, and that count includes requests anyone made, so about four requests an hour for a staff address suppress that staff member's own reset mail while the page still says it was sent. Kept as a numbered entry so references to later issues stay valid.
15. **In-app browsers cannot do passkeys.** A customer who opens an order or
    tracking link inside WhatsApp, Facebook or Instagram is told to open it
    in Chrome or Safari (`passkeySupport.ts`); they cannot order from inside
    the in-app browser at all. `passkey_enrol_started` against
    `passkey_enrol_completed` in PostHog is the measure of what this costs.
16. **A verified customer session is long-lived and only staff can end it.** A
    verified session slides for seven days, the customer cannot sign other
    devices out (the session routes are disabled), and the only way to end a
    stolen verified session is a staff reset. Narrowed since: such a session
    can no longer add its own passkey or remove the owner's without a fresh
    passkey ceremony (five minutes), so it cannot make itself permanent. It
    can still act as the customer for its seven days. That is outside this
    feature's threat (someone holding only the sign-in), recorded so
    it is not mistaken for covered.
17. **Order mail has no bounce handling and no second chance on a dead WhatsApp.** Resend accepting a mail is recorded as sent; a mailbox that then rejects it is never seen. A customer with WhatsApp on gets no stage or delivery mail even when their WhatsApp sends are failing. A mail Resend refuses is retried five times, then shown as failed on the order's Messages card, where staff can resend it; a bad key, a rate limit, a 5xx or a timeout (`deliverEmail` → `unavailable`) uses up no try and holds the channel's rows until it answers, as a dead WhatsApp token does. `flush` reads each channel on its own, so one channel's backlog never takes the other's place. Order mail also needs `BETTER_AUTH_URL`: its links are built from it, and without it mail waits in the queue. `pnpm email:preview <dir>` writes every mail in every language for a read-through.

## Open questions — resolve before trusting pricing.ts

- **Flush ends are no longer charged.** Every room now has side walls all
  round, so a cabinet flush against one (within one board) wears no end
  panel — a straight run re-priced under the new floor plan can drop a
  panel it used to be charged. Tell EzCabinet before an old design's price
  changes on them.
- **Is a free-standing cabinet's exposed back charged as a panel?** The
  engine currently says no — only its two sides are billed as end panels,
  the same as a run's ends. Confirm with EzCabinet.
- **Are a corner unit's ends charged as end panels?** The engine assumes not —
  its ends are part of the drawing (`exposureOf` in `room.ts`). Confirm with
  EzCabinet, and ask whether a kick board runs along a corner unit's faces
  (not drawn or charged yet). Mock corner OBJs for browser testing can be
  generated with `pnpm tsx scripts/generate-corner-mock.ts <dir>`, for upload
  once a safe (non-production) Blob store is available.
- **How does EzCabinet actually price cabinets?** The engine models it **per design, all-in** — each uploaded design carries its own price with its door included, door styles add a per-width surcharge, worktop by the running foot. A customer cannot take a door off to pay less. Confirm that matches their price list.
- **Does the public tool show a firm price or an indicative range?** Sales teams often resist public exact pricing. This is a business decision and it changes the UI.
- **Their real module range** — which widths exist for each cabinet — which is now simply which designs they upload.
- **Their real module standard** for living room, bedroom, and foyer. Only the kitchen dimensions come from a real design export; the rest are invented.
- **What does `Door_L_` mean?** The left-hand leaf of a pair, or a door hinged
  on its left stile? `hingeSideFromName` reads the token, but only trusts it for
  a *lone* door — on a pair the outward rule already answers it, and guessing
  the convention would be reading handedness into what may only be position.
  Their answer decides whether a single door's drawn name can seed its swing.
- **Design-intake cadence.** How often do new exports arrive, and will the panel naming (`G-UEnd_(L)`, `G-Door(R)`, …) stay stable? Extraction depends on it, so a change in their drawing habits is a change to `lib/mesh`.
- **The workshop's real street address and phone.** `WORKSHOP_ADDRESS` is
  `"EzCabinet Sdn Bhd, Klang Valley, Selangor"`, which does not geocode
  to a pin, so Lalamove cannot price a pickup from it — every delivery would be
  quoted from wherever that phrase happens to resolve to. `WORKSHOP_PHONE` is a
  placeholder, and it is the number a Lalamove driver rings from the loading bay.
  `WORKSHOP_POSTCODE`, `WORKSHOP_CITY` and `WORKSHOP_STATE` are placeholders
  derived from `WORKSHOP_PIN`, and EasyParcel prices the origin zone off them —
  a wrong postcode there is a wrong price on every parcel quote. FedEx takes
  the shipper and pickup address from the same constants (GDEX avoided this
  with its account profile; FedEx cannot), plus `WORKSHOP_CLOSE_TIME`, also a
  placeholder.
- **Does EzCabinet's FedEx account sell `FEDEX_PRIORITY` domestically, and in
  MYR?** The adapter prefers it and falls back to the cheapest service
  offered; a non-MYR price is refused rather than shown as RM. Only production
  credentials or their FedEx rep can answer. `FEDEX_PRIORITY_EXPRESS_FREIGHT`
  (freight, over 68 kg) could carry whole cabinets — out of scope, worth
  asking.
- Does Prisma Postgres offer an ap-southeast region? If not, quote submission eats a transpacific round trip.
- Does EzCabinet have an EasyParcel account, and who tops up the wallet? `submit_orders` deducts at booking time and a shipment cannot be booked against an empty wallet.
- **City-Link: a live host, credentials, and whether a rate API exists.** The guide we hold documents only the test server (`devsvr2019a.citylinkexpress.com:21145`) and its credentials page is blank — ask for the company code, account number and meter number, the live URL, and whether anything prices a shipment. Without a rate call an admin compares City-Link blind on price.
- **Mail for sign-in codes needs EzCabinet's sending domain set up.** SPF,
  DKIM and DMARC on the domain in `EMAIL_FROM`, or Outlook, Yahoo and iCloud
  will junk the codes — and a junked code is a customer who cannot order.
  Checkout now depends on mail delivery for every customer without Google.
  Test with a real Outlook address before launch.
- **Is "first word starts with admin or support" too wide for a name?** The
  name step refuses it so nobody labels their account as the business. It
  was narrowed once already, from the whole name to the first word, for
  names like "Ad Minh". If a real customer's name is still caught, narrow
  `posesAsBusiness` (`lib/auth/customerName.ts`).
- **WhatsApp go-live is waiting on EzCabinet.** Meta Business verification, a dedicated number, a system-user token, a payment method, 24 template approvals, the factory's real stage names, the sales number and counsel's privacy sign-off. Checklist and template copy: `docs/ops/whatsapp-ezcabinet-setup.md`.
- **Which Malaysian payment gateway?** Stripe is wired as the sandbox-test gateway, chosen by the `payment-gateway` Vercel flag (`src/flags.ts`: Stripe on development and preview, manual on production); Fiuu is the likely production one, account in progress. Both are adapters behind `lib/payments` — swap plan in `STRIPE_INTEGRATION_TODO.md`. Only the verified webhook marks an order paid, never the customer's return. With no gateway set, orders fall back to manual bank transfer, and `BANK_TRANSFER` in `lib/orders/payment.ts` is still a placeholder account the confirmation page shows customers.
- **The delivery fee.** `RATES.deliveryFlatRm` is `85`, the figure from the client's Order Confirmation design; set the real one in the catalogue settings. It is flat — one fee whatever the load or the distance.
- **What happens when a paid design changes at re-measure?** The customer pays full price up front; the app refunds a whole cancelled order and nothing else, so there is no partial refund or top-up flow, and a re-measure that changes the cabinets is handled outside the app today.
- **Weights.** Parcel partners price by the kilogram. A design row's optional weight pre-fills its delivery rows; every design without one leaves the admin typing it per delivery.
- **The privacy notice, terms of sale and refund policy are drafts**
  (`/[lang]/privacy`, `/terms`, `/refunds`). EzCabinet is the seller and the
  PDPA data controller: their counsel approves the wording, and the PostHog
  DPA should be signed in their legal name. Ask too whether behavioural
  analytics counts as "systematic monitoring" under the DPO guideline, and
  whether their data volumes require appointing a DPO at all. The refund
  windows (7 days to report damage, 14 working days to pay) and the delivery
  estimate (4 to 6 weeks from re-measure) are our defaults; whether the price
  carries SST, and the company's SSM registration number for the seller
  block, are theirs to supply.
  The seller block on the terms page and at checkout reads
  `WORKSHOP_ADDRESS` and `WORKSHOP_PHONE`, both still placeholders — the
  Consumer Protection (Electronic Trade Transactions) Regulations 2024 want
  the registered address there, and the Malay page is the one the law reads. GDPR was checked and does not apply: an
  EU-hosted processor does not bring a Malaysian seller under it.
- **Order emails print placeholders.** `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE` and `BANK_TRANSFER` now appear in mail a customer keeps, and "Reply to this email" needs `EMAIL_FROM` to be a mailbox someone reads. The ms and zh mail wording (`lib/email/copy.ts`) needs a native read, as the WhatsApp templates do. The privacy notice's "Email and WhatsApp updates are optional" is no longer exact — order emails are not optional — and goes to counsel with the new "Order emails" paragraph.

## Conventions

- Sentence case in UI copy. Prices in RM.
- Every `lib/planner` function gets a test before it gets a caller.
- Commit catalogue changes separately from code changes so price history is greppable.
