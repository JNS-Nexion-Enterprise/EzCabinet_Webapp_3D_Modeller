# Workshop address check Implementation Plan

**Status: shipped in #40. Kept as a record; do not re-execute.** `4876cff` supersedes its regex, gate copy and pin toggle, and the form now tidies the address on blur rather than per keystroke. `src/app/admin/company/` is the source of truth.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A superadmin moving the workshop pastes the new address and has Google Maps check it. The raw latitude/longitude box stops being something they have to understand.

**Architecture:** This changes the client only. `POST /api/admin/company/geocode` already returns `{ found: GeocodeResult | null, fault }`, and `GeocodeResult` already carries `formattedAddress`, so the server is untouched. The new logic lives in pure helpers in `src/app/admin/company/form.ts`, which is the one tested layer of this form (the repo has no component tests). `CompanyForm.tsx` renders the result.

**Tech Stack:** Next.js App Router client component, React state, Tailwind, Vitest, Biome.

**Spec:** None written. This is a small change agreed in chat on 2026-10-24, and the design below is the whole description. The user: _"Map pin is a feature which a normal user won't know so let them paste the address then they can validate using Google Maps API."_ The person doing this is a superadmin, and it happens when the factory moves.

## Design (decided)

- The **Address** field becomes a full-width, two-row `<textarea>`. An `<input type="text">` deletes line breaks on paste, which glues "Jalan Industri" and "43800" into one word. That breaks the exact case this change is for: pasting an address from a letterhead or a WhatsApp message. Line breaks become `", "`, because the stored address is one line and is read that way by carriers, `sellerLine` and mail.
- **Find on map** is renamed **Check address** ("Checking…" while it runs). It still fills in postcode, city and state, as it does today.
- A status line under the address says what the pin is:
  - after a successful check: `Google Maps found: <formattedAddress>` plus an **Open in Google Maps** link. Google's wording is shown so the admin can spot a wrong match. It is **never** written over the typed address: Google drops "EzCabinet Sdn Bhd" and the letterhead form is what customers see.
  - when the address has changed and nothing has confirmed a pin yet: `Press Check address so Google Maps can find the new address.`
  - otherwise, when the pin box reads: `The pin is set.` plus **Open in Google Maps**.
- **Map pin** is hidden behind a **Set the pin by hand** text button (**Hide the pin** when open). It opens by itself when:
  - a check fails,
  - the page loads with a `geocoderFault` (no key, or the key is refused),
  - the pin box can't be read,
  - the pin field has a save error.
- Editing the address or the pin by hand clears the last check's result, so the status line never vouches for a pin Google didn't place.
- The save gate is unchanged (`addressNeedsPin`). Its message moves under the Address field and reads `You changed the address. Press Check address, or set the pin by hand.`

**Left out on purpose:** checking automatically on paste or blur. The user said "then they can validate", so a button. Also left out: an embedded map preview, which would need a Maps JavaScript key and a browser-restricted key, and the link out does the same job.

## Global Constraints

- Sentence case in UI copy (CLAUDE.md Conventions).
- No new dependencies. No server, schema or migration changes.
- Copy strings in this plan are exact. Use them verbatim.
- Work in a git worktree. Other sessions edit `feature/development` in the main checkout at the same time.

## Review Focus

1. **A multi-line paste** (letterhead, WhatsApp) has to come out as one line with commas, not glued words and not `,,`. Pinned by the `oneLine` tests in Task 1.
2. **Editing the address after a successful check** must drop the "Google Maps found" line and fall back to "Press Check address…", and saving must be refused until it is re-checked. Pinned by the `pinStatus` tests in Task 1; checked by hand in Task 2.
3. **Typing a pin by hand after a check** must not keep showing Google's address as if it placed that pin. Pinned by the `pinStatus` "found is null" test in Task 1; Task 2 clears `found` on pin edit.
4. **A deployment with no geocoding key, or a refused one** (preview, local without the key) must open the pin field on load, so the only way forward is visible. Checked by hand in Task 2.
5. **Google matching the wrong place** (the company name pulls in another branch, or a street-level result has no postcode) must be visible: the formatted address shows, the postcode empties and validation asks for it (`placeFields`, already tested). Checked by hand in Task 2.

---

### Task 1: Pure helpers — one-line address, pin status

**Files:**
- Modify: `src/app/admin/company/form.ts` (add after `addressNeedsPin`, ~line 150)
- Test: `src/app/admin/company/__tests__/form.test.ts`

**Interfaces:**
- Consumes: `PinReading` (already in `form.ts`)
- Produces:
  - `oneLine(text: string): string`
  - `type PinStatus = { kind: "found"; formattedAddress: string; lat: number; lng: number } | { kind: "unchecked" } | { kind: "pinned"; lat: number; lng: number } | { kind: "none" }`
  - `pinStatus(found: { formattedAddress: string; lat: number; lng: number } | null, needsCheck: boolean, pin: PinReading): PinStatus`

- [ ] **Step 1: Write the failing tests** (add `oneLine` and `pinStatus` to the import from `"../form"`)

```ts
describe("oneLine", () => {
	it("joins a pasted letterhead address with commas", () =>
		expect(
			oneLine("Lot 5, Jalan Industri\nTaman Perindustrian\n43800 Dengkil"),
		).toBe("Lot 5, Jalan Industri, Taman Perindustrian, 43800 Dengkil"));
	it("does not double a comma already at the line end", () =>
		expect(oneLine("Lot 5,\nJalan Industri")).toBe("Lot 5, Jalan Industri"));
	it("treats CRLF and blank lines as one break", () =>
		expect(oneLine("Lot 5\r\n\r\n  Jalan Industri")).toBe(
			"Lot 5, Jalan Industri",
		));
	it("leaves a line being typed alone, trailing space included", () =>
		expect(oneLine("Lot 5 ")).toBe("Lot 5 "));
});

describe("pinStatus", () => {
	const found = {
		formattedAddress: "Jalan Industri, 43800 Dengkil",
		lat: 2.98,
		lng: 101.86,
	};
	const pin = { ok: true as const, lat: 3.1, lng: 101.6 };
	it("shows what Google found", () =>
		expect(pinStatus(found, false, pin)).toEqual({ kind: "found", ...found }));
	it("asks for a check when the address changed and nothing confirms it", () =>
		expect(pinStatus(null, true, pin)).toEqual({ kind: "unchecked" }));
	it("falls back to the pin in the box once found is cleared", () =>
		expect(pinStatus(null, false, pin)).toEqual({
			kind: "pinned",
			lat: 3.1,
			lng: 101.6,
		}));
	it("says nothing when the pin box cannot be read", () =>
		expect(pinStatus(null, false, { ok: false, message: "x" })).toEqual({
			kind: "none",
		}));
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm vitest run src/app/admin/company/__tests__/form.test.ts`
Expected: FAIL, with `oneLine` / `pinStatus` not exported.
- [ ] **Step 3: Implement both helpers in `form.ts`**

`oneLine`: replace every run of optional whitespace, an optional comma, optional whitespace, one or more `\r`/`\n`, then whitespace, with `", "`. That is one regex, `/\s*,?\s*[\r\n]+\s*/g`. Don't trim: it runs on every keystroke. `pinStatus`: check `found`, then `needsCheck`, then `pin.ok`, in that order; the `found` branch copies only `formattedAddress`, `lat` and `lng`, since the caller passes a whole `GeocodeResult`. Give each a one-line doc comment that says _why_, in the file's own style. The `oneLine` comment should mention the text input deleting line breaks and the address being stored as one line.
- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/app/admin/company/__tests__/form.test.ts`
Expected: PASS, with the existing `readPin` / `placeFields` / `addressNeedsPin` tests still green.
- [ ] **Step 5: Commit**

```bash
git add src/app/admin/company/form.ts src/app/admin/company/__tests__/form.test.ts
git commit -m "feat(company): one-line a pasted address and say what the pin is"
```

---

### Task 2: Company form — paste, check, pin tucked away

**Files:**
- Modify: `src/app/admin/company/CompanyForm.tsx`:
  - copy constants (lines 24–27)
  - state (lines 117–124)
  - `findOnMap` (140–172)
  - `save` gate (225–230)
  - Workshop section (300–381)

**Interfaces:**
- Consumes: `oneLine`, `pinStatus`, `PinStatus` from Task 1. Also `addressNeedsPin`, `readPin`, `placeFields`, `mapsLink`, and `GeocodeResult.formattedAddress`, which already exist.

- [ ] **Step 1: Replace the copy and state**
  - Exact copy:
    - `MAP_DOWN = "Could not reach Google Maps. Try again, or set the pin by hand below."`
    - `MAP_MISS = "Google Maps could not find that address. Check it for typos, or set the pin by hand below."`
  - New state:
    - `found: GeocodeResult | null` (initially `null`)
    - `pinByHand: boolean` (initially `geocoderFault !== null`)
  - Derived:
    - `needsCheck = addressNeedsPin(initial.address, v.address, pinConfirmed)`
    - `status = pinStatus(found, needsCheck, pin)`
    - `pinOpen = pinByHand || !pin.ok || !!(errors.lat ?? errors.lng)`

- [ ] **Step 2: Update `findOnMap` and the edit handlers**
  - On success, `setFound(f)`.
  - On a miss or no reply, `setFound(null)` and `setPinByHand(true)`.
  - Address `onChange`: run the value through `oneLine` before `set("address")`, then `setFound(null)`.
  - Pin `onChange`: `setFound(null)`.
  - Save gate message, verbatim: `You changed the address. Press Check address, or set the pin by hand.`

- [ ] **Step 3: Re-lay the Workshop section**
  - Address `Field`:
    - give it `basis-full`. `Field` takes no className today, so add an optional `wide?: boolean` that appends `basis-full` to its wrapper div.
    - render `<textarea rows={2}>` with `INPUT` classes and `resize-none`.
    - put the button beside it, labelled `Check address` / `Checking…`.
    - `error={errors.address ?? pinNote ?? undefined}`.
  - Status line (`basis-full`, `role="status"`, same 12px muted style as the existing map note), one per `status.kind`:
    - `found`: `Google Maps found: {formattedAddress}` plus an **Open in Google Maps** link (`mapsLink(status.lat, status.lng)`, `target="_blank" rel="noreferrer"`)
    - `unchecked`: `Press Check address so Google Maps can find the new address.`
    - `pinned`: `The pin is set.` plus the same link
    - `none`: render nothing
  - After the status, a text button: `Set the pin by hand` when `!pinOpen`, `Hide the pin` when `pinOpen` and the pin reads cleanly.
  - Keep the `mapNote ?? geocoderFault` line as is.
  - Render the Map pin `Field` only when `pinOpen`:
    - drop its "Open in Google Maps" hint, since the status line has it now.
    - add `hint="Paste a Google Maps link, or type latitude, longitude."`
    - keep its error wiring, minus `pinNote`, which moved to Address.

- [ ] **Step 4: Static checks**

Run: `pnpm typecheck && pnpm lint && pnpm vitest run src/app/admin/company`
Expected: all three exit 0.
- [ ] **Step 5: Check it in the browser**

Run `pnpm dev` with `AUTH_ENABLED="false"` in `.env.local` and the existing `GOOGLE_GEOCODING_API_KEY`, then open `/admin/company`. Each line is one check:
- Paste a three-line address. It comes out as one line with commas.
- Press **Check address**. Postcode, city and state fill in, the "Google Maps found: …" line shows with a working link, and the pin field stays hidden.
- Type one more character into the address. The status switches to "Press Check address…" and **Save** shows the gate message under Address.
- Open **Set the pin by hand**, paste a full Google Maps link and save. It saves, and the status reads "The pin is set."
- Temporarily blank `GOOGLE_GEOCODING_API_KEY` and restart. The pin field is open on load and the fault sentence shows. Put the key back and set `AUTH_ENABLED` back to `"true"`.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin/company/CompanyForm.tsx
git commit -m "feat(company): paste the workshop address and check it with Google Maps"
```
