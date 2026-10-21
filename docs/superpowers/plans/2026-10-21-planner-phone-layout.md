# Planner phone layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Below 760 px the planner's three screens become the design's phone layout — a scrolling page with a sticky header and a fixed bottom bar, and a studio of view toggle, 300 px canvas card and four tabs — while every feature and rule the app has stays.

**Architecture:** Start and Quote are server-rendered or share one DOM, so they go responsive with `max-[759px]:` / `min-[760px]:` classes only — no hook, no flash of the desktop layout on a phone. The studio is only ever rendered in the browser and changes structure, so `StudioScreen` keeps every piece of state and every handler, builds each panel body once as a JSX value, and hands them to either today's desktop tree or a new `PhoneStudio` tree, chosen by a `usePhone()` hook. The tab rules are pure functions with tests.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, vitest, Biome. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-planner-phone-layout.md` — every pixel value and every design-vs-app decision. Read it before Task 2.

## Global Constraints

- Phone = viewport `< 760px`. At `≥ 760px` every planner screen renders byte-for-byte as before (desktop and the `max-lg` tablet stack). Use `max-[759px]:` / `min-[760px]:` variants, never `sm`/`md`/`lg`, for phone-only rules.
- No new dependencies. No testing-library — logic goes in pure modules with vitest tests; layout is checked in a browser.
- Copy lives in `src/lib/copy/{en,ms,zh}.ts`; `ms` and `zh` are typed against `Dictionary`, so a missing key fails `pnpm typecheck`. Sentence case. No new user-facing string outside the dictionary.
- Nothing from the spec's "Decisions" table gets built: no starting layout, no width ladder, no "Infinite Cabinet", no invented prices, no admin link, no change to checkout fields, sign-in, passkey or terms.
- `src/lib/planner` is not touched.
- Nothing the planner's first load imports may import three: new files import neither `three` nor `@react-three/*`, and `PlannerScene` stays a `dynamic()` import.
- Primary green `#1f5138`, hover `#17402c`, active `#123322`. Tap targets ≥ 44 px on phone.
- Work in a git worktree off `feature/development` (other sessions share the main checkout). Before each commit: `pnpm lint && pnpm typecheck && pnpm test`.
- Browser checks: `pnpm dev -p 3110` in the worktree; Playwright or Chrome device mode at **390 × 844** and **1280 × 800**.

## Review Focus

1. **Crossing 760 px mid-edit** (rotating a tablet, resizing a window) swaps the studio tree. Selection, door state, measure points and the layout must survive, because the state lives in `StudioScreen`. The canvas remounting is fine. → Task 3, Step 6.
2. **The fixed bar must never cover the last thing on the page**: the last Run row, the Room tab's last control, the quote's error message and terms box, all on a 360 × 640 screen. → Task 3, Step 6 and Task 4, Step 3.
3. **The phone start screen is server-rendered.** The first paint at 390 px must already be the phone layout, with no desktop flash. That is why it is CSS-only. → Task 2, Step 5.
4. **An empty room opens on Room**, "Next: add cabinets" goes to Add, and Get a quote stays disabled with 0 cabinets. → Task 1 tests and Task 3, Step 6.
5. **Desktop regressions**: at 1280 px the studio, start and quote screens look exactly as before, and right-click menu, drag-to-add and the tool rail still work. → Task 3, Step 7 and Task 5, Step 2.

---

### Task 1: Phone tab rules and the phone hook

**Files:**
- Create: `src/components/planner/studio/phoneStudio.ts`
- Create: `src/components/planner/usePhone.ts`
- Test: `src/components/planner/__tests__/phoneStudio.test.ts`
- Modify: `src/components/planner/StudioScreen.tsx:111-121` (the `DoorView` type moves out)

**Interfaces:**
- Produces, in `phoneStudio.ts`:
  - `type PhoneTab = "selected" | "add" | "room" | "run"`
  - `const PHONE_TABS: readonly PhoneTab[]` = `["selected", "add", "room", "run"]` (design order)
  - `type DoorView = "closed" | "open" | "hidden"` (moved from `StudioScreen.tsx`, doc comment moves with it)
  - `initialPhoneTab(cabinetCount: number): PhoneTab`
  - `tabAfterSelection(current: PhoneTab, selectedCount: number): PhoneTab`
  - `nextDoorView(current: DoorView): DoorView`
- Produces, in `usePhone.ts`: `const PHONE_QUERY = "(max-width: 759px)"` and `usePhone(): boolean`.

- [ ] **Step 1: Write the failing test** `src/components/planner/__tests__/phoneStudio.test.ts`

```ts
import { describe, expect, it } from "vitest";
import {
	initialPhoneTab,
	nextDoorView,
	PHONE_TABS,
	tabAfterSelection,
} from "../studio/phoneStudio";

describe("phone studio tabs", () => {
	it("lists the design's four tabs in its order", () => {
		expect(PHONE_TABS).toEqual(["selected", "add", "room", "run"]);
	});
	it("opens an empty room on Room, a furnished one on Selected", () => {
		expect(initialPhoneTab(0)).toBe("room");
		expect(initialPhoneTab(3)).toBe("selected");
	});
	it("jumps to Selected when something is selected, and stays put when not", () => {
		expect(tabAfterSelection("run", 1)).toBe("selected");
		expect(tabAfterSelection("add", 2)).toBe("selected");
		expect(tabAfterSelection("add", 0)).toBe("add");
		expect(tabAfterSelection("room", 0)).toBe("room");
	});
});

describe("doors button", () => {
	it("cycles closed → open → hidden → closed", () => {
		expect(nextDoorView("closed")).toBe("open");
		expect(nextDoorView("open")).toBe("hidden");
		expect(nextDoorView("hidden")).toBe("closed");
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/components/planner/__tests__/phoneStudio.test.ts`
Expected: FAIL, cannot resolve `../studio/phoneStudio`.

- [ ] **Step 3: Implement `phoneStudio.ts`** with the exports above. It is a pure module: no React and no copy. Move `DoorView` and its doc comment out of `StudioScreen.tsx` and import it back there. `doorModes` stays in `StudioScreen`.

- [ ] **Step 4: Implement `usePhone.ts`.** Use `useSyncExternalStore(subscribe, () => matchMedia(PHONE_QUERY).matches, () => false)`, where `subscribe` adds and removes a `change` listener on `matchMedia(PHONE_QUERY)`. The server snapshot is `false` because only the studio uses this, and the studio never renders on the server. Say so in a one-line comment, so nobody reaches for it on the start screen.

- [ ] **Step 5: Run the test, then the gates**

Run: `pnpm vitest run src/components/planner/__tests__/phoneStudio.test.ts && pnpm lint && pnpm typecheck`
Expected: 4 tests pass; lint and typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/planner/studio/phoneStudio.ts src/components/planner/usePhone.ts src/components/planner/__tests__/phoneStudio.test.ts src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): phone tab rules and the phone media hook"
```

---

### Task 2: Phone chrome, copy, and the start screen

**Files:**
- Create: `src/components/planner/PhoneChrome.tsx`
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/ms.ts`, `src/lib/copy/zh.ts` (new `planner.phone` block, beside `planner.tools`)
- Modify: `src/components/planner/StartScreen.tsx`
- Modify: `src/components/LanguageSwitcher.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces, in `PhoneChrome.tsx` (spec § Shared chrome has every value):
  - `PhoneHeader({ back, title, subtitle?, right?, className? })`. `back` is `{ label: string; href: string } | { label: string; onClick: () => void }`; it renders a `next/link` or a `<button>` styled as the back pill. `className` lets Start and Quote add `min-[760px]:hidden`.
  - `phoneBar` and `phonePrimary`: class strings (like `chrome.ts`'s exports) for the fixed bottom bar and its 52 px green button. **Every class in them carries the `max-[759px]:` variant**, so Start and Quote can put them beside their desktop classes on the same element and they only apply on a phone.
  - `PhoneBar({ children })`: `<div className={phoneBar}>`, for the studio's phone-only tree.
  - `Segmented<T extends string>({ label, options: { id: T; label: string }[], value: T, onPickAction: (id: T) => void })`: a `role="group"` with `aria-label={label}`, one button per option with `aria-pressed`.
- Produces copy, `t.planner.phone`:

| key | en | ms | zh |
| --- | --- | --- | --- |
| `backHome` | Home | Utama | 首页 |
| `backRooms` | Rooms | Bilik | 房间 |
| `backEdit` | Edit | Sunting | 编辑 |
| `wallSubtitle` | {m} m wall | Dinding {m} m | {m} 米墙面 |
| `tapHint` | Tap a cabinet to edit it | Ketik kabinet untuk menyuntingnya | 点击柜子即可编辑 |
| `tabsLabel` | Studio panels | Panel studio | 工作室面板 |
| `tabs.selected` | Selected | Dipilih | 已选 |
| `tabs.add` | Add | Tambah | 添加 |
| `tabs.room` | Room | Bilik | 房间 |
| `tabs.run` | Run | Susunan | 布局 |
| `doorsAria` | Doors: {mode}. Tap to change. | Pintu: {mode}. Ketik untuk tukar. | 门板：{mode}。点击切换。 |

(`{mode}` is filled with the existing `planner.room.doorsClosed` / `doorsOpen` / `doorsHidden`. "Susunan" and "布局" match the words `planner.run.heading` already uses.)

- [ ] **Step 1: Add the copy** to all three dictionaries, then run `pnpm typecheck && pnpm vitest run src/lib/copy`.
Expected: clean. The dictionary tests pass, including "has no empty strings".

- [ ] **Step 2: Write `PhoneChrome.tsx`** to the spec's values. No `"use client"` directive: it has no hooks, and every caller (`StartScreen`, `StudioScreen`, `QuoteScreen`) is already inside `PlannerApp`'s client tree. No three imports.

- [ ] **Step 3: `LanguageSwitcher.tsx`.**
  - The strip (the non-`inline` branch) gains `max-[759px]:hidden` when `tail` starts with `planner`.
  - Add an optional `tall?: boolean` prop: the inline links become `min-h-11 px-2.5` instead of `min-h-9 px-1`, and the current locale gets `text-[#171717]`.

- [ ] **Step 4: `StartScreen.tsx`, CSS-only** (it is server-rendered — see Review Focus 3):
  - `<main>`: phone `max-[759px]:h-auto max-[759px]:min-h-dvh max-[759px]:bg-white`.
  - `PlannerHeader` wrapped `max-[759px]:hidden`. Add `<PhoneHeader className="min-[760px]:hidden" back={{ label: t.planner.phone.backHome, href: `/${locale}` }} title={t.planner.crumbs.roomPlanner} />`.
  - Body column: phone left-aligned with padding `24px 20px 128px`, gap 28. h1 and subtitle as the spec says. Cards in a 2-column grid with the spec's card style, plus the picked outline and check badge, which are rendered only when `active && ready`.
  - The language row: `<Suspense fallback={null}><LanguageSwitcher current={locale} label={t.common.language} inline tall /></Suspense>`, inside a `min-[760px]:hidden` row with a top border.
  - The CTA: keep one `<button>`; wrap it in a `<div className={phoneBar}>`, which is a plain block at `≥760`; the button adds `phonePrimary` beside its desktop classes.

- [ ] **Step 5: Check it in the browser** at 390 × 844, `/en/planner`:
  - `curl -s localhost:3110/en/planner` HTML already contains the phone header markup (no hook means the server sends it).
  - The language strip is not visible at 390, and the EN/中文/MS row is at the bottom with 44 px targets (`getBoundingClientRect().height === 44`).
  - The CTA is fixed to the bottom and the last card's bottom is above the bar.
  - At 1280 × 800 the start screen looks as it does on `feature/development`; compare screenshots.

- [ ] **Step 6: Gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/planner/PhoneChrome.tsx src/lib/copy/en.ts src/lib/copy/ms.ts src/lib/copy/zh.ts src/components/planner/StartScreen.tsx src/components/LanguageSwitcher.tsx
git commit -m "feat(planner): phone start screen and the shared phone header and bar"
```

---

### Task 3: The phone studio

**Files:**
- Create: `src/components/planner/studio/PhoneStudio.tsx`
- Modify: `src/components/planner/StudioScreen.tsx`
- Modify: `src/components/planner/studio/PriceFooter.tsx`

**Interfaces:**
- Consumes:
  - From Task 1: `PhoneTab`, `PHONE_TABS`, `DoorView`, `initialPhoneTab`, `tabAfterSelection`, `nextDoorView`, `usePhone`.
  - From Task 2: `PhoneHeader`, `PhoneBar`, `Segmented`, and `t.planner.phone.*`.
- Produces: `PhoneStudio` (props below) and `PriceFooter`'s new `variant?: "panel" | "bar"` prop (default `"panel"`, which is today's markup unchanged).

```ts
// PhoneStudio.tsx — a layout, no state of its own.
export function PhoneStudio(props: {
	roomLabel: string;
	wallMetres: string;          // "4.20", already formatted
	onBackAction: () => void;    // to the room picker
	view: PlannerView;
	onViewAction: (view: PlannerView) => void;
	scene: React.ReactNode;      // the one PlannerScene element
	chip: React.ReactNode;       // run-of-wall · units text
	footnote: React.ReactNode;   // measure readout, tap hint, or null
	doors: { view: DoorView; onCycleAction: () => void; disabled: boolean };
	measuring: boolean;
	onMeasureAction: () => void;
	onResetViewAction: () => void;
	tab: PhoneTab;
	onTabAction: (tab: PhoneTab) => void;
	body: React.ReactNode;       // the active tab's body
	bar: React.ReactNode;        // <PriceFooter variant="bar" … />
}): React.JSX.Element;
```

- [ ] **Step 1: `PriceFooter` bar variant.** `variant="bar"` renders one row, per spec § Studio item 6:
  - on the left, the total as a `<button>` that opens the existing breakdown dialog, holding the "Estimated total" label, the ESTIMATE badge (`t.planner.price.estimateBadge`) and the total;
  - on the right, the CTA (`t.planner.price.cta`, `ctaDisabled` honoured, `phonePrimary` with `px-[22px]` and no `w-full`).
  `notice` is ignored in this variant. The dialog markup is shared by both variants. The panel variant is untouched.

- [ ] **Step 2: Split `StudioScreen`'s render into values.** No behaviour changes in this step. Pull these out of the returned tree into `const`s above `return`, and use them in the desktop tree exactly where they were:
  - `scene`: the `<PlannerScene …/>` element. `showWallNumbers` and `showPanPuck` read `roomOpen` (below).
  - `measureReadout`: the inner content of the `measureMode &&` block at lines 990–1062, without its absolute-positioned wrapper. The desktop keeps the wrapper.
  - `selectionBody`: the `selection.length === 0 ? <DesignRecap…> : selected ? <SelectionPanel…> : <multi…>` expression at lines 1093–1277.
  - `runList`: the `<RunList …/>` at 1279.
  - `finishBody`: the finish block's contents at 1313–1352.
  - `roomOpen = phone ? tab === "room" : panel === "room"`, replacing `panel === "room"` in `wallRanges` and `roomBody`. Both are only built while Room is showing, as now.
  Run `pnpm typecheck`, then at 1280 × 800 open the studio and check the tool rail, every panel, right-click menu and drag-to-add behave as before.

- [ ] **Step 3: Phone state and wiring in `StudioScreen`.**
  - `const phone = usePhone();`
  - `const [tab, setTab] = useState<PhoneTab>(() => initialPhoneTab(allPositions(layout).length));`
  - an effect on `selectedIds` that runs `setTab((current) => tabAfterSelection(current, selectedIds.length))`;
  - `RoomPanel`'s `onNextAction` and `DesignRecap`'s `onAddAction` call `setTab("add")` on phone and `setTool("add")` otherwise;
  - `RoomPanel`'s `onOpenDefaultsAction` becomes optional, and the link at `RoomPanel.tsx:472` renders only when it is passed. On phone it is not passed, because the defaults sit right under it in the same tab.
  - `doorView` as now; the Doors button calls the same code the Doors panel's options call at lines 705–712, with `nextDoorView(doorView)`. Factor that into one `applyDoorView(mode: DoorView)` used by both. It is disabled when `withDoors.length === 0`.

- [ ] **Step 4: Write `PhoneStudio.tsx`** to spec § Studio and § Decisions:
  - Wrap everything in `<main className="min-h-dvh bg-white text-neutral-900">`.
  - `PhoneHeader`: back `t.planner.phone.backRooms`; subtitle `fill(t.planner.phone.wallSubtitle, { m: wallMetres })`; right, the tutorials link (same `href="/tutorials"` as the desktop header), 44 px round, `aria-label={t.planner.diyTutorials}`.
  - The view toggle: `Segmented`, label `t.planner.panel.viewTitle`.
  - The canvas card: 300 px, holding `scene`, the chip top-left, and a top-right column of three 44 px round buttons. They are Doors (with a 12 px caption naming the mode, and `aria-label = fill(t.planner.phone.doorsAria, { mode })`), Measure (`aria-pressed`, label `t.planner.measure.measure`) and Reset view (`t.planner.panel.resetView`). `footnote` sits at the bottom, centred.
  - The tabs: `Segmented` over `PHONE_TABS`, label `t.planner.phone.tabsLabel`.
  - The body, with padding `16px 16px 140px`.
  - `<PhoneBar>{bar}</PhoneBar>`.
  Use typed glyphs for the three icon buttons, as `ToolRail` does: `◫` doors, `⟺` measure, `⤾` reset. No icon library.

- [ ] **Step 5: Return the phone tree** when `phone` is true, building the props from the values in Step 2:
  - `body` per tab:
    - selected: `selectionBody` then `finishBody`;
    - add: `addBody`;
    - room: `roomBody` then `defaultsBody`, with a top border between them;
    - run: `runList`, then the `SignInNudge`.
  - `footnote`: `measureMode ? measureReadout : selection.length === 0 ? t.planner.phone.tapHint : null`.
  - `chip`: the same `runOfWall` text and unit count as the desktop chip.
  - `bar`: `<PriceFooter variant="bar" …/>`, with the same props as the desktop footer.
  - No `onContextMenu` and no drop handlers on phone.
  The desktop return is otherwise unchanged.

- [ ] **Step 6: Check it in the browser at 390 × 844 and 360 × 640** (`/en/planner`, pick Kitchen, Start planning):
  - Empty room: Room tab active, the language strip hidden, Get a quote disabled. "Next: add cabinets" → Add tab active.
  - Tap two cabinets in Add: still on Add, the bar total rises, and the chip says 2 units.
  - Tap a cabinet in the canvas → Selected tab with that cabinet's `SelectionPanel`. Then Remove.
  - Doors button: closed → open → hidden → closed, and the scene follows each time.
  - Measure: the readout replaces the hint; tapping it off restores the hint.
  - The canvas card is exactly 300 px tall (`getBoundingClientRect().height`). The page scrolls when you swipe below the card.
  - Run tab with 7+ cabinets at 360 × 640: scrolled to the end, the last row's bottom is above the bar's top.
  - Room tab: the last control (the Setup section's close-gaps link) clears the bar.
  - With a cabinet selected and doors open, resize to 1280 and back to 390: the selection and the open doors survive.
  - The bar's total opens the breakdown dialog.

- [ ] **Step 7: Desktop regression at 1280 × 800.** Tool rail, all five panels, right-click menu, drag-to-add, PriceFooter with the sign-in nudge — compare screenshots with `feature/development`.

- [ ] **Step 8: Gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/planner/studio/PhoneStudio.tsx src/components/planner/StudioScreen.tsx src/components/planner/studio/PriceFooter.tsx src/components/planner/studio/RoomPanel.tsx
git commit -m "feat(planner): phone studio — view toggle, canvas card, four tabs, total bar"
```

---

### Task 4: Phone tap sizes

**Files:**
- Modify: `src/components/planner/studio/chrome.ts`
- Modify: `src/components/planner/studio/RunList.tsx:66-70`
- Modify: `src/components/planner/DimensionField.tsx:86-93`
- Modify: `src/components/planner/StudioScreen.tsx` (the finish swatch class inside `finishBody`)

**Interfaces:**
- Consumes: nothing new. It changes only class strings, and only below 760 px.

- [ ] **Step 1: Phone-only additions** (spec § Shared chrome, last bullet):
  - `chip()`: `max-[759px]:min-h-11 max-[759px]:rounded-[10px] max-[759px]:px-4 max-[759px]:text-[14px]`.
  - `listBtn()` and `verbBtn()`: `max-[759px]:min-h-11`.
  - The RunList row: `max-[759px]:min-h-12 max-[759px]:text-[15px]` (the name button's `text-[13px]` gets the same override).
  - The DimensionField number input: `max-[759px]:min-h-10 max-[759px]:w-[84px] max-[759px]:text-[16px]`.
  - The DimensionField range input: `max-[759px]:h-8`.
  - The finish swatch: `max-[759px]:size-11 max-[759px]:rounded-[10px]`. The selected ring stays the box-shadow it is.

- [ ] **Step 2: Check at 390 × 844.** In the studio's Selected and Room tabs, every chip, swatch and option is ≥ 44 px tall. Number inputs compute `font-size: 16px`. Run rows are ≥ 48 px.

- [ ] **Step 3: Check that nothing moved at 1280 × 800 or 900 × 1000.** The tablet stack must look unchanged too, which is why the variant is `max-[759px]` and not `max-lg`.

- [ ] **Step 4: Gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/planner/studio/chrome.ts src/components/planner/studio/RunList.tsx src/components/planner/DimensionField.tsx src/components/planner/StudioScreen.tsx
git commit -m "feat(planner): 44px tap targets in the studio on phone"
```

---

### Task 5: The phone quote screen

**Files:**
- Modify: `src/components/planner/QuoteScreen.tsx` (`FIELD` at 38–42, the shell at 373–405, the submit at 724–748, the aside at 753–772)

**Interfaces:**
- Consumes: from Task 2, `PhoneHeader`, `phoneBar`, `phonePrimary` and `t.planner.phone.backEdit`.

- [ ] **Step 1: CSS-only changes.**
  - `<main>`: phone `max-[759px]:h-auto max-[759px]:min-h-dvh max-[759px]:bg-white`.
  - `PlannerHeader` wrapped `max-[759px]:hidden`. Add `<PhoneHeader className="min-[760px]:hidden" back={{ label: t.planner.phone.backEdit, onClick: onBackToStudioAction }} title={t.planner.crumbs.quote} />`.
  - The scroll container: phone `max-[759px]:overflow-visible max-[759px]:px-5 max-[759px]:pt-5 max-[759px]:pb-[120px]`.
  - The aside: phone `max-[759px]:order-first max-[759px]:p-2.5 max-[759px]:rounded-2xl`. Its scene box becomes `max-[759px]:h-[84px] max-[759px]:w-[112px]` beside the summary text: wrap the scene box and the summary `<div>` in a row that is `flex-row items-center gap-3.5` on phone and the current column at `≥760`. The price lines and totals stay under it; they are the receipt.
  - `FIELD`: add `max-[759px]:min-h-[50px] max-[759px]:rounded-[10px] max-[759px]:px-3.5`. The terms checkbox and the WhatsApp opt-in checkbox: `max-[759px]:size-[22px]`.
  - The submit button: wrap it in a `<div className={phoneBar}>`, which is a plain block above 760. The button stays inside the `<form>`, so submit semantics, `disabled` and the busy spinner are untouched. It takes `phonePrimary` on phone, which turns it green there; desktop keeps its black.

- [ ] **Step 2: Check at 390 × 844, signed in with `AUTH_ENABLED=false` and a design of 2+ cabinets:**
  - The summary card is first, with a 112 × 84 scene.
  - Inputs are 50 px tall.
  - Pay or Place order is fixed at the bottom.
  - Submitting empty shows the field errors. The error paragraph and the terms box are reachable above the bar at 360 × 640.
  - Edit returns to the studio with the design intact.
  - At 1280 × 800 the quote screen matches `feature/development`.

- [ ] **Step 3: Gates and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add src/components/planner/QuoteScreen.tsx
git commit -m "feat(planner): phone quote screen — summary first, pay button in the bar"
```

---

### Task 6: Bundle check and docs

**Files:**
- Modify: `CLAUDE.md` (§ UX flow → "The studio's own chrome")

- [ ] **Step 1: The bundle.** Run `pnpm build`, then read `.next/diagnostics/route-bundle-stats.json` for `/[lang]/planner`. The first-load JS must not include `three` or `@react-three`, and must stay within 10 KB gzipped of the figure on `feature/development` (measure that first, from a build of the base commit).

- [ ] **Step 2: Docs.** Add a short paragraph to "The studio's own chrome" in `CLAUDE.md`:
  - below 760 px the planner is a scrolling page;
  - the studio uses `PhoneStudio`'s four tabs (Room = Room panel + Setup);
  - Doors / Measure / Reset view sit on the canvas card;
  - `usePhone` is for the studio only, because Start is server-rendered and stays CSS-only;
  - the spec path.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the planner's phone layout"
```
