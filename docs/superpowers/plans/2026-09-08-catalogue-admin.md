# Catalogue Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/admin/catalogue` open on the draft it was sent to review, block publishing on unpriced rungs, group cabinets by room, and stop design pushes from discarding each other.

**Architecture:** Two pure helpers in `lib/catalogue/health.ts` and one Prisma query in `lib/catalogue/versions.ts` carry all the new logic and all the tests. `src/app/admin/catalogue/page.tsx` is then rewired to consume them — version resolution, a state header, a review panel above the tab bar, room-first grouping on the Cabinets tab, and the geometry block demoted to a derived read-only line. No schema change, no new API route.

**Tech Stack:** Next.js App Router (client component), TypeScript, zod, Prisma, Tailwind, vitest, biome.

**Spec:** `docs/superpowers/specs/2026-09-08-catalogue-admin-design.md`

## Global Constraints

- **Sentence case in UI copy. Prices in RM.** (project convention)
- **The word "publish" appears once on this page**, on the button that flips a version live. The design-library action is "Add to planner"; nothing else on this screen uses the word.
- **No schema change.** `plannerCatalogueSchema` and the Prisma models are untouched by every task here.
- **Everything still leaves through the existing gate:** `POST /api/admin/catalogue/versions` → `POST /api/admin/catalogue/versions/[id]/publish`.
- **`lib/planner` stays framework-free.** New helpers go in `lib/catalogue/`, which may import from `lib/planner` but not the reverse.
- Test command: `pnpm test` (vitest run). Lint: `pnpm lint` (biome). Types: `pnpm typecheck`.
- Commit catalogue _data_ changes separately from code changes. Every task here is code.

---

## File Structure

| File                                           | Responsibility                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src/lib/catalogue/health.ts`                  | **Create.** Pure derivations over a `PlannerCatalogue`: which rungs block a publish, which families no room offers. |
| `src/lib/catalogue/__tests__/health.test.ts`   | **Create.** Tests for the above.                                                                                    |
| `src/lib/catalogue/versions.ts`                | **Modify.** Add `latestDraftVersion`, beside `createDraftVersion`.                                                  |
| `src/lib/catalogue/__tests__/versions.test.ts` | **Create.** Tests `latestDraftVersion` against a mocked Prisma.                                                     |
| `src/lib/catalogue/publishDesigns.ts`          | **Modify (`:274-300`).** Merge onto the newest draft when one exists.                                               |
| `src/app/admin/catalogue/page.tsx`             | **Modify.** Version resolution, state header, review panel, room grouping, geometry line.                           |

Tasks 1 and 2 are independent of each other. Task 3 precedes 4. Tasks 5 and 6 are independent of everything after task 1.

---

### Task 1: Catalogue health derivations

**Files:**
- Create: `src/lib/catalogue/health.ts`
- Test: `src/lib/catalogue/__tests__/health.test.ts`

**Interfaces:**
- Consumes: `PlannerCatalogue` from `@/lib/planner/catalogueSchema`; `PLANNER_CATALOGUE` from `@/lib/planner/catalogue` (tests only).
- Produces:
  - `type PriceBlocker = { familyId: string; familyLabel: string; widthMm: number; meshDesignId?: string }`
  - `blockersOf(catalogue: PlannerCatalogue): PriceBlocker[]`
  - `strandedFamilyIds(catalogue: PlannerCatalogue): string[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/catalogue/__tests__/health.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";
import { blockersOf, strandedFamilyIds } from "../health";

/** Deep clone so a test can mutate without touching the live constant. */
const clone = (c: PlannerCatalogue): PlannerCatalogue =>
	JSON.parse(JSON.stringify(c));

describe("blockersOf", () => {
	it("finds nothing in a catalogue where every rung is priced", () => {
		expect(blockersOf(PLANNER_CATALOGUE)).toEqual([]);
	});

	it("reports a rung priced at zero", () => {
		const next = clone(PLANNER_CATALOGUE);
		next.families[0].sizes[0].priceRm = 0;

		expect(blockersOf(next)).toEqual([
			{
				familyId: next.families[0].id,
				familyLabel: next.families[0].label,
				widthMm: next.families[0].sizes[0].widthMm,
				meshDesignId: next.families[0].sizes[0].meshDesignId,
			},
		]);
	});

	it("reports every unpriced rung, in family then ladder order", () => {
		const next = clone(PLANNER_CATALOGUE);
		next.families[1].sizes[0].priceRm = 0;
		next.families[0].sizes[1].priceRm = 0;

		expect(blockersOf(next).map((b) => b.widthMm)).toEqual([
			next.families[0].sizes[1].widthMm,
			next.families[1].sizes[0].widthMm,
		]);
	});

	it("treats a negative price as unpriced too", () => {
		const next = clone(PLANNER_CATALOGUE);
		next.families[0].sizes[0].priceRm = -10;

		expect(blockersOf(next)).toHaveLength(1);
	});
});

describe("strandedFamilyIds", () => {
	it("finds nothing when every family is offered by a room", () => {
		expect(strandedFamilyIds(PLANNER_CATALOGUE)).toEqual([]);
	});

	it("names a family no room offers", () => {
		const next = clone(PLANNER_CATALOGUE);
		next.families.push({
			...PLANNER_CATALOGUE.families[0],
			id: "test-orphan",
			label: "Testing123",
		});

		expect(strandedFamilyIds(next)).toEqual(["test-orphan"]);
	});

	it("does not report a family offered by only one room", () => {
		const next = clone(PLANNER_CATALOGUE);
		const id = next.families[0].id;
		for (const room of next.roomTypes) {
			room.familyIds = room.familyIds.filter((f) => f !== id);
		}
		next.roomTypes[0].familyIds.push(id);

		expect(strandedFamilyIds(next)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/catalogue/__tests__/health.test.ts`
Expected: FAIL — `Failed to resolve import "../health"`.
- [ ] **Step 3: Write the implementation**

Create `src/lib/catalogue/health.ts`:

```ts
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * What is wrong with a catalogue, as data the review screen can render.
 *
 * Both answers used to be invisible. A rung priced at nothing is
 * schema-valid — `priceRm` has no positive constraint, deliberately, because
 * a free rung is a thing a maker could genuinely offer — so the only thing
 * standing between "the merge gave this size no price" and a customer seeing
 * RM 0 was somebody noticing. And a family in no room's `familyIds` is
 * unreachable from the planner while looking perfectly healthy in the editor,
 * which is how `Testing123` has survived in the live catalogue.
 *
 * Pure, and separate from `diff.ts`: that one answers "what changed against
 * live", this one answers "what is wrong regardless of what changed".
 */

export type PriceBlocker = {
	familyId: string;
	familyLabel: string;
	widthMm: number;
	/** The design drawing this rung, if any — lets the review row say where
	 * the unpriced size came from. */
	meshDesignId?: string;
};

/** Every rung that must not reach a customer at the price it carries. */
export function blockersOf(catalogue: PlannerCatalogue): PriceBlocker[] {
	const blockers: PriceBlocker[] = [];
	for (const family of catalogue.families) {
		for (const size of family.sizes) {
			if (size.priceRm > 0) continue;
			blockers.push({
				familyId: family.id,
				familyLabel: family.label,
				widthMm: size.widthMm,
				meshDesignId: size.meshDesignId,
			});
		}
	}
	return blockers;
}

/**
 * Families no room offers.
 *
 * `roomTypes[].familyIds` is the whole of a family's reachability: the palette
 * is built from it, so a family absent from every room exists only in the
 * document. Deriving this rather than storing a flag keeps one source of
 * truth — and makes "untick every room" a working retire path.
 */
export function strandedFamilyIds(catalogue: PlannerCatalogue): string[] {
	const offered = new Set(
		catalogue.roomTypes.flatMap((room) => room.familyIds),
	);
	return catalogue.families
		.filter((family) => !offered.has(family.id))
		.map((family) => family.id);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/catalogue/__tests__/health.test.ts`
Expected: PASS, 7 tests.

If "finds nothing in a catalogue where every rung is priced" fails, the seed catalogue has a rung at 0 — that is a real finding, not a test bug. Report it rather than weakening the assertion.
- [ ] **Step 5: Commit**

```bash
git add src/lib/catalogue/health.ts src/lib/catalogue/__tests__/health.test.ts
git commit -m "feat(catalogue): derive unpriced rungs and stranded families

A rung priced RM 0 is schema-valid and reaches a customer at that price; a
family in no room's familyIds is unreachable while looking healthy in the
editor. Both are now values the review screen can render."
```

---

### Task 2: Design pushes stack instead of forking

**Files:**
- Modify: `src/lib/catalogue/versions.ts` (append after `createDraftVersion`)
- Modify: `src/lib/catalogue/publishDesigns.ts:274-300`
- Test: `src/lib/catalogue/__tests__/versions.test.ts` (create)

**Interfaces:**
- Consumes: `prisma` from `./db`; `Product` from `@/generated/prisma/enums`.
- Produces: `latestDraftVersion(product: Product): Promise<{ id: string; version: number; data: unknown } | null>`

**Background.** `publishDesigns.ts:274-279` currently reads:

```ts
const {
	id: baseId,
	version,
	data: base,
} = await getPublishedPlannerCatalogue();
```

Because the base is always the published version, publishing design A then design B produces two drafts, the second built without A. Publishing the second silently discards A.
- [ ] **Step 1: Write the failing test**

Create `src/lib/catalogue/__tests__/versions.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("../db", () => ({
	prisma: { catalogueVersion: { findFirst } },
}));

// Imported after the mock so `versions.ts` closes over the fake prisma.
const { latestDraftVersion } = await import("../versions");

describe("latestDraftVersion", () => {
	beforeEach(() => {
		findFirst.mockReset();
	});

	it("asks for the highest-numbered DRAFT of that product", async () => {
		findFirst.mockResolvedValue({ id: "v13", version: 13, data: {} });

		await latestDraftVersion("PLANNER");

		expect(findFirst).toHaveBeenCalledWith({
			where: { product: "PLANNER", status: "DRAFT" },
			orderBy: { version: "desc" },
			select: { id: true, version: true, data: true },
		});
	});

	it("returns the row when a draft exists", async () => {
		findFirst.mockResolvedValue({ id: "v13", version: 13, data: { a: 1 } });

		expect(await latestDraftVersion("PLANNER")).toEqual({
			id: "v13",
			version: 13,
			data: { a: 1 },
		});
	});

	it("returns null when there is no draft", async () => {
		findFirst.mockResolvedValue(null);

		expect(await latestDraftVersion("PLANNER")).toBeNull();
	});
});
```

The `orderBy` assertion is the point of this test. A draft picked in insertion order rather than by version is the same data-loss bug wearing a different hat.
- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run src/lib/catalogue/__tests__/versions.test.ts`
Expected: FAIL — `latestDraftVersion is not a function`.
- [ ] **Step 3: Add `latestDraftVersion`**

Append to `src/lib/catalogue/versions.ts`, after `createDraftVersion`:

```ts
/**
 * The newest DRAFT for a product, or null.
 *
 * A design push used to merge onto the published catalogue every time, so two
 * pushes in one sitting produced two drafts that each omitted the other's
 * work — and publishing the second silently discarded the first. Merging onto
 * an open draft instead makes pushes stack.
 *
 * Ordered by `version`, not `createdAt`: version is the number the admin sees
 * on screen and the one `createDraftVersion` guarantees is monotonic.
 */
export async function latestDraftVersion(product: Product) {
	return prisma.catalogueVersion.findFirst({
		where: { product, status: "DRAFT" },
		orderBy: { version: "desc" },
		select: { id: true, version: true, data: true },
	});
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run src/lib/catalogue/__tests__/versions.test.ts`
Expected: PASS, 3 tests.
- [ ] **Step 5: Merge onto the draft in `publishDesigns.ts`**

Add to the imports at the top of `src/lib/catalogue/publishDesigns.ts` — the file already imports `createDraftVersion` from `./versions` at line 30, so extend that import:

```ts
import { createDraftVersion, latestDraftVersion } from "./versions";
```

Then replace lines 274-279 — the block shown under **Background** above — with:

```ts
// The published version is what a change is *measured* against, and what a
// push falls back to. It is not always what a push builds on: an open draft
// already carries work this merge must not drop.
const published = await getPublishedPlannerCatalogue();
const openDraft = await latestDraftVersion("PLANNER");
const { id: baseId, data: base } = openDraft
	? {
			id: openDraft.id,
			data: plannerCatalogueSchema.parse(openDraft.data),
		}
	: published;
const version = published.version;
```

`plannerCatalogueSchema` must be imported if it is not already — check the file's import block and add if missing:

```ts
import { plannerCatalogueSchema } from "@/lib/planner/catalogueSchema";
```

Nothing else in the function changes. `base.construction` at `:281-296` reads the same field either way; `publishedVersion: version` at `:352` and `:376` keeps reporting the published version, which is what the UI means by it.
- [ ] **Step 6: Name both sources in the draft's note**

Replace the `createDraftVersion` call at `publishDesigns.ts:364-368` with:

```ts
const draft = await createDraftVersion({
	product: "PLANNER",
	data: catalogue,
	// Say what this draft was built on when it stacked. Without it the note
	// reads as though the draft holds one design when it may hold five.
	note: openDraft
		? `${label} added from the design library, on top of draft v${openDraft.version}`
		: `${label} added from the design library`,
});
```

- [ ] **Step 7: Verify the whole suite and types**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; no type errors.
- [ ] **Step 8: Commit**

```bash
git add src/lib/catalogue/versions.ts src/lib/catalogue/publishDesigns.ts src/lib/catalogue/__tests__/versions.test.ts
git commit -m "fix(catalogue): stack design pushes instead of forking drafts

publishDesigns always based its merge on the published catalogue, so pushing
design A then design B produced two drafts that each omitted the other. The
second publish discarded the first, with nothing on screen to show the loss.
A push now merges onto the newest open draft when there is one."
```

---

### Task 3: The page opens on the draft, and says which version it is on

**Files:**
- Modify: `src/app/admin/catalogue/page.tsx:377` (state), `:436-470` (load effect), `:550-556` (header)

**Interfaces:**
- Consumes: nothing from tasks 1-2.
- Produces: component state `openedVersion: OpenedVersion | null`, where

```ts
type OpenedVersion = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED";
	note: string | null;
	publishedAt: string | null;
	/** The published version, for the "open the live catalogue" link. Both
	 * fields, because the link needs the id and the label needs the number. */
	publishedVersion: number | null;
	publishedVersionId: string | null;
};
```

Task 4 reads `openedVersion` and calls `publish(openedVersion.id)`.

The versions endpoint already returns `id, version, status, note, createdAt, publishedAt` ordered `version: "desc"` (`api/admin/catalogue/versions/route.ts:22-36`), so nothing server-side changes.
- [ ] **Step 1: Add the state**

After line 377 (`const [draft, setDraft] = useState<PlannerCatalogue | null>(null);`) add:

```ts
/** Which version the editor is looking at — a DRAFT waiting to be reviewed,
 * or the live one. Drives the header and the review panel's copy. */
const [openedVersion, setOpenedVersion] = useState<OpenedVersion | null>(null);
```

And declare the type next to `SaveState` (near line 57):

```ts
type OpenedVersion = {
	id: string;
	version: number;
	status: "DRAFT" | "PUBLISHED";
	note: string | null;
	publishedAt: string | null;
	publishedVersion: number | null;
	publishedVersionId: string | null;
};
```

- [ ] **Step 2: Resolve the version draft-first**

Replace the body of the load effect from `const published = body.versions?.find(` down to the two `setLive`/`setDraft` calls (`:449-469`) with:

```ts
   type VersionRow = {
    id: string;
    version: number;
    status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
    note: string | null;
    publishedAt: string | null;
    data: PlannerCatalogue;
   };
   const versions: VersionRow[] = body.versions ?? [];
   const published = versions.find((v) => v.status === "PUBLISHED");

   // `?version=` still wins — that is how /admin/import hands over the
   // draft it just built. Absent it, an open DRAFT is what the admin was
   // sent here to deal with: the design library tells them to price it
   // here, and opening the live catalogue instead showed them a screen
   // with none of their work in it.
   const asked = versionId
    ? versions.find((v) => v.id === versionId)
    : (versions.find((v) => v.status === "DRAFT") ?? null);

   if (versionId && !asked) {
    setLoadError("That catalogue version no longer exists");
    return;
   }
   if (!published && !asked) {
    setLoadError("No published planner catalogue to edit yet");
    return;
   }
   const opened = asked ?? published;
   if (!opened) return;

   // Edits are always diffed against what is live, even when the editor
   // opened on a draft — "what changes if I publish this" is the only
   // comparison that means anything.
   setLive(published?.data ?? opened.data);
   setDraft(JSON.parse(JSON.stringify(opened.data)));
   setOpenedVersion({
    id: opened.id,
    version: opened.version,
    status: opened.status === "PUBLISHED" ? "PUBLISHED" : "DRAFT",
    note: opened.note,
    publishedAt: opened.publishedAt,
    publishedVersion: published?.version ?? null,
    publishedVersionId: published?.id ?? null,
   });
```

- [ ] **Step 3: Replace the page header with a state header**

Replace lines 551-556 — the `<h1>Catalogue</h1>` block and its paragraph — with:

```tsx
<div className="mb-5">
	{openedVersion?.status === "DRAFT" ? (
		<>
			<span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-[11px] text-amber-900 uppercase tracking-wide">
				<span className="h-1.5 w-1.5 rounded-full bg-amber-600" />
				Draft v{openedVersion.version} · not live
			</span>
			<h1 className="mt-2 font-semibold text-lg">
				Review this draft before customers see it
			</h1>
			<p className="text-neutral-500 text-sm">
				{openedVersion.note ??
					"Nothing on this draft reaches the planner until you publish it."}
			</p>
			{openedVersion.publishedVersionId && (
				<a
					href={`/admin/catalogue?version=${openedVersion.publishedVersionId}`}
					className="mt-1 inline-block text-[12px] text-neutral-500 underline"
				>
					Open the live catalogue (v{openedVersion.publishedVersion}) instead
				</a>
			)}
		</>
	) : (
		<>
			<span className="inline-flex items-center gap-1.5 rounded-full border border-green-300 bg-green-50 px-2.5 py-1 font-semibold text-[11px] text-green-900 uppercase tracking-wide">
				<span className="h-1.5 w-1.5 rounded-full bg-green-600" />
				Live{openedVersion ? ` · v${openedVersion.version}` : ""}
			</span>
			<h1 className="mt-2 font-semibold text-lg">Catalogue</h1>
			<p className="text-neutral-500 text-sm">
				What the planner offers and what it charges. Changes are saved as a
				draft first — nothing reaches customers until you publish.
			</p>
		</>
	)}
</div>;
```

The link carries the published version's **id**, not an empty `?version=`. An
empty value comes back from `useSearchParams().get("version")` as `""`, which
is falsy, so the resolution in step 2 would fall straight back to the draft and
the link would appear to do nothing.
- [ ] **Step 4: Verify types and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. Biome will flag an unused `published` binding if step 2 was applied partially — that is a real signal, re-read the hunk.
- [ ] **Step 5: Verify in the running app**

Run: `pnpm dev`, sign in at `/admin/login`, open `/admin/catalogue`.
Expected: with a DRAFT in the database, the page opens on it and the header reads `Draft vN · not live`. Follow the "open the live catalogue" link: the header flips to `Live · vN`. With no draft in the database, the page opens live as before.

If there is no DRAFT to test against, create one: `/admin/cabinet-designs` → any design → "Add to planner".
- [ ] **Step 6: Commit**

```bash
git add src/app/admin/catalogue/page.tsx
git commit -m "feat(admin): open the catalogue on the draft it was sent to review

The page resolved its version as ?version ?? published. The design library
sends an admin here with no query string, so someone who had just added a
design to the planner landed on the live catalogue with none of their work in
it and no sign a draft existed. An open draft is now what the page opens on,
and the header says which version is on screen and whether it is live."
```

---

### Task 4: Review panel above the tabs, gated on unpriced rungs

**Files:**
- Modify: `src/app/admin/catalogue/page.tsx` — imports, a `blockers` memo beside `issues` (`:477-484`), a new panel above the tab bar (`:567`), and the publish button's `disabled` (`:1330`)

**Interfaces:**
- Consumes: `blockersOf`, `PriceBlocker` from `@/lib/catalogue/health` (Task 1); `openedVersion` (Task 3).
- Produces: nothing later tasks read.

- [ ] **Step 1: Import and derive the blockers**

Add to the imports:

```ts
import { blockersOf } from "@/lib/catalogue/health";
```

After the `issues` memo (`:477-484`) add:

```ts
// A rung priced at nothing is schema-valid, so `issues` never sees it. It is
// the one thing a design file structurally cannot supply, which makes it the
// blocker that actually occurs.
const blockers = useMemo(() => (draft ? blockersOf(draft) : []), [draft]);
```

- [ ] **Step 2: Render the panel above the tab bar**

Insert immediately before `<div className="flex flex-wrap gap-1.5">` (the tab row, `:567`), inside `{draft && (`:

```tsx
{
	changes.length > 0 && (
		<div className="rounded-lg border border-neutral-200 bg-white">
			<div className="flex flex-wrap items-baseline gap-2.5 border-neutral-100 border-b px-4 py-3">
				<p className="text-[11px] text-neutral-500 uppercase tracking-wide">
					Needs you
				</p>
				<span className="text-[12px] text-neutral-400">
					{blockers.length === 0
						? "nothing blocking · ready to publish"
						: `${blockers.length} rung${
								blockers.length === 1 ? "" : "s"
							} still need${blockers.length === 1 ? "s" : ""} a price`}
				</span>
			</div>

			<ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-neutral-100 border-b px-4 py-3">
				{changes.map((line) => (
					<li key={line} className="text-[13px] text-neutral-700">
						· {line}
					</li>
				))}
			</ul>

			{blockers.map((blocker) => {
				const fi = draft.families.findIndex((f) => f.id === blocker.familyId);
				const si = draft.families[fi]?.sizes.findIndex(
					(s) => s.widthMm === blocker.widthMm,
				);
				if (fi < 0 || si === undefined || si < 0) return null;
				return (
					<div
						key={`${blocker.familyId}-${blocker.widthMm}`}
						className="flex flex-wrap items-center justify-between gap-3 border-neutral-100 border-b px-4 py-3 last:border-b-0"
					>
						<div className="min-w-0">
							<p className="text-sm">
								<span className="font-medium">{blocker.familyLabel}</span> ·{" "}
								<span className="tabular-nums">{blocker.widthMm} mm</span>
							</p>
							<p className="text-[12px] text-neutral-500">
								{blocker.meshDesignId
									? "Drawn from a design, but carries no price"
									: "No price set"}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-[12px] text-neutral-400">RM</span>
							<Num
								value={draft.families[fi].sizes[si].priceRm}
								width="w-24"
								onChange={(v) =>
									edit((n) => {
										n.families[fi].sizes[si].priceRm = v;
									})
								}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}
```

The price field writes `draft.families[fi].sizes[si].priceRm` — the same path the Cabinets tab edits, through the same `edit` helper. One state object, two views.
- [ ] **Step 3: Gate publishing on the blockers**

The publish button at `:1330` currently reads:

```tsx
           disabled={changes.length === 0 || issues.length > 0}
```

Replace with:

```tsx
           disabled={
            changes.length === 0 ||
            issues.length > 0 ||
            blockers.length > 0
           }
```

- [ ] **Step 4: Say why the button is shut**

In the existing review block, immediately after the `{issues.length > 0 && (` red box closes (`:1321`), add:

```tsx
{
	blockers.length > 0 && (
		<p className="mt-3 text-[12px] text-amber-800">
			{blockers.length} rung
			{blockers.length === 1 ? "" : "s"} still need
			{blockers.length === 1 ? "s" : ""} a price before this can go live.
		</p>
	);
}
```

- [ ] **Step 5: Verify types, lint and the suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean.
- [ ] **Step 6: Verify in the running app**

Run: `pnpm dev`, open `/admin/catalogue` on a draft, set any rung's price to 0 on the Cabinets tab.
Expected: the rung appears in the "Needs you" panel within a render; the publish button greys out; typing a price into the panel's field clears the row and re-enables the button. Confirm the Cabinets tab shows the same number — one state, two views.
- [ ] **Step 7: Commit**

```bash
git add src/app/admin/catalogue/page.tsx
git commit -m "feat(admin): hold a publish until every rung carries a price

priceRm has no positive constraint, so a rung the merge gave no price was
schema-valid and went live at RM 0. Unpriced rungs are now listed above the
tab bar with an inline price field, and the publish button stays shut until
they are gone."
```

---

### Task 5: Room-first Cabinets tab

**Files:**
- Modify: `src/app/admin/catalogue/page.tsx:584-901` — the `{tab === "families" && (` block

**Interfaces:**
- Consumes: `strandedFamilyIds` from `@/lib/catalogue/health` (Task 1).
- Produces: nothing later tasks read.

The family card body (name/type/depth/height/sizes) is **unchanged** — only the wrapper around it changes: families are grouped by room, and each card gains a room-membership row.
- [ ] **Step 1: Import and derive the groups**

Add to the imports:

```ts
import { strandedFamilyIds } from "@/lib/catalogue/health";
```

Add a search box's state beside the other `useState` calls (near `:381`):

```ts
/** Filters the Cabinets tab by family label or rung width. At ~200 rungs a
 * flat scroll stops being navigable, and a width is how someone hunts. */
const [familyQuery, setFamilyQuery] = useState("");
```

After the `blockers` memo add:

```ts
/**
 * The Cabinets tab, grouped the way an admin arrives thinking: one room at a
 * time. Membership comes from `roomTypes[].familyIds`, which the tab used to
 * ignore entirely — so a family in no room looked healthy here while being
 * unreachable from the planner.
 */
const familyGroups = useMemo(() => {
	if (!draft) return [];
	const q = familyQuery.trim().toLowerCase();
	const matches = (family: Family) =>
		q === "" ||
		family.label.toLowerCase().includes(q) ||
		family.sizes.some((s) => String(s.widthMm).includes(q));

	const stranded = new Set(strandedFamilyIds(draft));
	const indexOf = new Map(draft.families.map((f, i) => [f.id, i]));

	const groups = draft.roomTypes.map((room) => ({
		key: room.id,
		label: room.label,
		stranded: false,
		indices: room.familyIds
			.map((id) => indexOf.get(id))
			.filter((i): i is number => i !== undefined)
			.filter((i) => matches(draft.families[i])),
	}));

	groups.push({
		key: "__stranded",
		label: "In no room — customers cannot see these",
		stranded: true,
		indices: draft.families
			.map((f, i) => (stranded.has(f.id) ? i : -1))
			.filter((i) => i >= 0)
			.filter((i) => matches(draft.families[i])),
	});

	return groups.filter((g) => g.indices.length > 0);
}, [draft, familyQuery]);
```

`Family` is already imported from `@/lib/planner/catalogueSchema` at the top of the file.
- [ ] **Step 2: Wrap the families list in the groups**

The block at `:584` opens:

```tsx
      {tab === "families" && (
       <div className="flex flex-col gap-3">
        {draft.families.map((family, fi) => (
```

Replace those three lines with:

```tsx
      {tab === "families" && (
       <div className="flex flex-col gap-3">
        <input
         type="search"
         value={familyQuery}
         onChange={(e) => setFamilyQuery(e.target.value)}
         placeholder="Search cabinets or a width, e.g. 900"
         className={fieldClass(false, "w-full max-w-xs")}
        />

        {familyGroups.map((group) => (
         <div key={group.key} className="flex flex-col gap-3">
          <div
           className={`flex flex-wrap items-baseline gap-2 pt-1 ${
            group.stranded ? "text-amber-800" : "text-neutral-500"
           }`}
          >
           <p className="text-[11px] uppercase tracking-wide">
            {group.label}
           </p>
           <span className="text-[12px] text-neutral-400">
            {group.indices.length} famil
            {group.indices.length === 1 ? "y" : "ies"} ·{" "}
            {group.indices.reduce(
             (n, i) => n + draft.families[i].sizes.length,
             0,
            )}{" "}
            rungs ·{" "}
            {group.indices.reduce(
             (n, i) =>
              n +
              draft.families[i].sizes.filter(
               (s) => s.meshDesignId,
              ).length,
             0,
            )}{" "}
            drawn
           </span>
          </div>

          {group.indices.map((fi) => {
           const family = draft.families[fi];
           return (
```

- [ ] **Step 3: Close the new nesting**

Find the end of the families map — the `))}` that closes `draft.families.map((family, fi) => (` just before `{tab === "doors" && (` at `:903`. It currently reads:

```tsx
        ))}
        <button
```

(the `+ Add cabinet` button follows). Replace the closing `))}` with:

```tsx
           );
          })}
         </div>
        ))}
```

so the family card closes, then the group map, then the group div.
- [ ] **Step 4: Put room membership on the family card**

Inside the family `SectionCard`, immediately before the `Sizes & prices` block (`:807`, the `<div className="mt-3 border-neutral-100 border-t pt-3">` that holds it), insert:

```tsx
<div className="mt-3 border-neutral-100 border-t pt-3">
	<p className="mb-2 text-[11px] text-neutral-500 uppercase tracking-wide">
		Offered in
	</p>
	<div className="flex flex-wrap gap-1.5">
		{draft.roomTypes.map((room, ri) => {
			const on = room.familyIds.includes(family.id);
			return (
				<button
					key={room.id}
					type="button"
					onClick={() =>
						edit((n) => {
							const ids = n.roomTypes[ri].familyIds;
							n.roomTypes[ri].familyIds = on
								? ids.filter((id) => id !== family.id)
								: [...ids, family.id];
							// A starter layout may not place a cabinet the
							// room no longer offers.
							if (on) {
								n.roomTypes[ri].starter = n.roomTypes[ri].starter.filter(
									(s) => s.familyId !== family.id,
								);
							}
						})
					}
					className={chipClass(on)}
				>
					{room.label}
				</button>
			);
		})}
	</div>
	{!draft.roomTypes.some((r) => r.familyIds.includes(family.id)) && (
		<p className="mt-2 text-[12px] text-amber-800">
			No room offers this cabinet, so no customer can see it. Ticking a room is
			what puts it in the planner; unticking every room retires it without
			losing its prices.
		</p>
	)}
</div>;
```

`chipClass` is already imported from `@/components/admin/styles` at the top of the file. This mirrors the toggle on the Rooms tab (`:1184-1210`) including its starter cleanup — the Rooms tab keeps its own copy, since it is still the right place to edit a room.
- [ ] **Step 5: Verify types, lint and the suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean. A JSX nesting mistake in step 3 surfaces here as a parse error — re-read that hunk rather than guessing.
- [ ] **Step 6: Verify in the running app**

Run: `pnpm dev`, open `/admin/catalogue` → Cabinets.
Expected: families grouped under Kitchen / Living room / Bedroom / Foyer with per-group counts; `Testing123` under "In no room — customers cannot see these"; typing `900` filters to families carrying a 900 rung; typing a family name filters by name; ticking a room on a family card moves it into that group; unticking every room moves it to the stranded group and shows the amber note.
- [ ] **Step 7: Commit**

```bash
git add src/app/admin/catalogue/page.tsx
git commit -m "feat(admin): group cabinets by the rooms that offer them

roomTypes[].familyIds decides whether a customer ever sees a family, and it
was editable only on the Rooms tab — so adding a family here and having it
appear in no palette was a silent failure. The Cabinets tab now groups by
room, gives every family its room chips, and lists families no room offers as
their own warned group. Search spans family names and rung widths, which is
how anyone will navigate this once there is one design per width."
```

---

### Task 6: "What it holds" becomes a derived line

**Files:**
- Modify: `src/app/admin/catalogue/page.tsx:686-806` (the geometry block), `:664` (the top-level `Drawers` field)

**Interfaces:**
- Consumes: `fitOutOf`, `standOf` from `@/lib/planner/parts`; `constructionOf` from `@/lib/planner/catalogue`.
- Produces: nothing.

- [ ] **Step 1: Import the resolvers and derive construction**

Add to the imports:

```ts
import { constructionOf } from "@/lib/planner/catalogue";
import { fitOutOf, standOf } from "@/lib/planner/parts";
```

After the `familyGroups` memo add:

```ts
/** The workshop constants the scene resolves with — board thickness and
 * plinth height decide the fit-out the fallback draws. */
const construction = useMemo(
	() => (draft ? constructionOf(draft) : null),
	[draft],
);
```

- [ ] **Step 2: Add the summary helper**

Add above `function CatalogueEditor()` (near the other module-level helpers, around `:114`):

```ts
/**
 * What the scene falls back to for this family, in one line.
 *
 * Computed with the same functions the renderer calls — `fitOutOf` and
 * `standOf` — rather than by reading `family.geometry` directly. That is the
 * point: on a rung with a design the drawn mesh overrides these numbers
 * anyway, and `fitOutOf` already encodes the precedence (a drawer bank carries
 * no shelf; a leaf count belongs to the width, not the family). Restating the
 * stored fields as inputs invited edits the scene would ignore.
 */
function fitOutSummary(family: Family, construction: Construction): string {
	const widest = Math.max(...family.sizes.map((s) => s.widthMm));
	const fit = fitOutOf(family, widest, construction);
	const stand = standOf(family, construction);

	const parts: string[] = [];
	parts.push(
		fit.shelves === 0
			? "no shelf"
			: `${fit.shelves} shelf${fit.shelves === 1 ? "" : "s"}`,
	);
	if (fit.drawers > 0) parts.push(`${fit.drawers} drawers`);
	parts.push(
		fit.doorLeaves === 0
			? "no door"
			: `${fit.doorLeaves} door leaf${fit.doorLeaves === 1 ? "" : "s"} at ${widest} mm`,
	);
	parts.push(fit.hasBack ? "back panel" : "open back");
	if (stand.legs > 0) {
		const diameter = family.geometry?.legDiameterMm ?? 0;
		parts.push(
			`${stand.legs} legs, ${stand.heightMm} mm${
				diameter > 0 ? ` × ⌀${diameter}` : ""
			}, ${stand.insetMm} mm in`,
		);
	} else if (family.kind !== "wall") {
		parts.push(`recessed plinth, ${stand.heightMm} mm`);
	}
	return parts.join(" · ");
}
```

`Construction` needs importing as a type alongside `constructionOf`:

```ts
import { type Construction, constructionOf } from "@/lib/planner/catalogue";
```

- [ ] **Step 3: Replace the geometry block's chrome**

The block at `:693-706` opens the section and prints the subtitle. Replace from `<div className="mt-3 border-neutral-100 border-t pt-3">` (`:693`) through the closing `</div>` of the header row (`:706`, just before `<div className="flex flex-wrap items-end gap-3">`) with:

```tsx
          <div className="mt-3 border-neutral-100 border-t pt-3">
           <p className="text-[11px] text-neutral-500 uppercase tracking-wide">
            What it holds
           </p>
           <p className="mt-1 text-[13px] text-neutral-700">
            {construction
             ? fitOutSummary(family, construction)
             : "—"}
            <span className="text-neutral-400">
             {family.geometry
              ? " — measured from a design"
              : " — no design yet, planner defaults"}
            </span>
           </p>
           <details className="mt-2">
            <summary className="cursor-pointer text-[12px] text-neutral-500 underline">
             Override these
            </summary>
            <p className="mt-2 text-[12px] text-neutral-500">
             Only for correcting a bad parse. A rung with a design
             draws the mesh, not these numbers.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
```

- [ ] **Step 4: Close the disclosure**

The geometry inputs end at `:805-806`:

```tsx
           </div>
          </div>
```

Replace with:

```tsx
            </div>
           </details>
          </div>
```

The nine `Num`/checkbox controls between them, and every `withGeometry(...)` writer, are untouched — they now live inside the disclosure.
- [ ] **Step 5: Make the top-level `Drawers` field read-only when a design set it**

At `:662-671` the field reads:

```tsx
<Num
	label="Drawers"
	value={family.drawers}
	width="w-16"
	onChange={(v) =>
		edit((n) => {
			n.families[fi].drawers = v;
		})
	}
/>;
```

`fitOutOf:181` prefers `family.geometry.drawers` when geometry exists, so the input is a lie in that case. Replace the whole `<Num label="Drawers" … />` element with:

```tsx
{
	family.geometry ? (
		<div className="flex flex-col gap-1">
			<span className="text-[11px] text-neutral-500">Drawers</span>
			<p className="px-2.5 py-2 text-neutral-700 text-sm tabular-nums">
				{family.geometry.drawers}
				<span className="ml-1.5 text-[12px] text-neutral-400">from design</span>
			</p>
		</div>
	) : (
		<Num
			label="Drawers"
			value={family.drawers}
			width="w-16"
			onChange={(v) =>
				edit((n) => {
					n.families[fi].drawers = v;
				})
			}
		/>
	);
}
```

- [ ] **Step 6: Verify types, lint and the suite**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean.
- [ ] **Step 7: Verify in the running app**

Run: `pnpm dev`, open `/admin/catalogue` → Cabinets.
Expected: every family shows one "What it holds" line. Base cabinet (which has geometry) reads something like `1 shelf · 2 door leafs at 900 mm · back panel · 4 legs, 100 mm × ⌀57, 17 mm in — measured from a design`; Drawer base reads `no shelf · 3 drawers · … — no design yet, planner defaults`. "Override these" reveals the nine inputs, and editing one still changes the line above it.

Check the pluralisation reads correctly — "2 door leafs" is wrong English; if the line shows it, fix `fitOutSummary` to use `leaf`/`leaves` and re-run.
- [ ] **Step 8: Commit**

```bash
git add src/app/admin/catalogue/page.tsx
git commit -m "feat(admin): show what a cabinet holds instead of asking for it

Those numbers are measured at intake, and on a rung with a design the drawn
mesh overrides them anyway — so a default-open row of inputs invited edits the
scene would ignore. The block is now one line computed by the same functions
the renderer calls, with the inputs behind an explicit override for correcting
a bad parse. The top-level drawers field goes read-only when geometry has set
it, since fitOutOf discards it there."
```

---

## Final verification

- [ ] Run `pnpm test && pnpm typecheck && pnpm lint` — all clean.
- [ ] In the running app, walk the whole path once: `/admin/cabinet-designs` → "Add to planner" on two different designs → `/admin/catalogue` opens on one draft carrying **both** → price the flagged rungs → publish → header flips to `Live`.
- [ ] Confirm the published catalogue carries both designs' families. That is the data-loss defect from Task 2, end to end.
