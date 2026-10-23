# GDEX user testing — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this task-by-task. Steps use `- [ ]` checkboxes.

**Goal:** A booking made in the admin lands in GDEX's portal as a real collection, and the admin can see that it did — without leaving the app or logging into GDEX.

**Architecture:** The GDEX adapter already quotes, books, tracks and cancels against the live sandbox (`f324a29`…`f9c8322`, verified end to end on 2026-09-06: quote RM 9.40 → book `TCN170001587` → track → cancel → wallet refunded). What is missing is everything that tells a _tester_ it worked. Three unused GDEX operations close that gap, and none of them needs a Prisma migration: `GetPickUpDateListing` (the days GDEX will actually collect), `CheckeWalletBalance` (the likeliest booking failure), and `GetUpcomingPickUpDetails` + `GetPickUpReference` (proof the collection reached GDEX's board).

**Tech stack:** TypeScript, Zod v4, Vitest 4, Next.js App Router, Prisma. No new dependencies.

**Spec:** the myGDEX Open API developer portal, plus `docs/superpowers/plans/2026-09-06-gdex-carrier-adapter.md` Appendix A. Every endpoint below was called against the live sandbox on 2026-09-06 — the shapes here are observed, not documented.

**Designs:** https://claude.ai/code/artifact/ad366952-3493-4c32-bb5e-2dc716915707 — five artboards. Wallet treatment **B** is the one chosen (2026-09-06): the warning appears only when the wallet cannot cover the quote.

---

## Context

GDEX works. The problem is that nothing on screen distinguishes "GDEX has this collection on their board" from "we sent a request and hope". During user testing that difference is the whole point, and today a tester would have to open `my-openapi.gdexpress.com` in another tab to find out.

Three failures already hit in one afternoon, all of which a tester will hit again:

| What happened                                            | Why it was invisible                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Booking refused with `Pick Up Day Unavailable`           | The job was scheduled 6 days out. GDEX collects within 5, and the date field offered every day of the year.                                      |
| The e-Wallet was at `0.0000` for part of the day         | Nothing showed the balance. A booking would have failed with `Insufficient Credit` after the admin had already picked GDEX and typed their name. |
| A booked consignment could not be confirmed from the app | We never call `GetUpcomingPickUpDetails`.                                                                                                        |

The adapter now refuses a bad day locally (`f9c8322`), which turns the first into a clear message. This plan replaces that guess with GDEX's own answer and closes the other two.

### Observed API facts this plan depends on

All verified against the sandbox on 2026-09-06. Several contradict or extend the documentation.
- **`GET /GetPickUpDateListing?PostCode=<sender postcode>`** → `data: ["2026-09-07T00:00:00", … 5 entries]`. Naive Malaysian local, always midnight. Requires the postcode; without it, 400 `"Please Provide PostCode"`. This is the authoritative list — the documented "5 days" is a coincidence of the day it was asked, and weekends and holidays are already excluded.
- **`GET /CheckeWalletBalance`** → `data` is a bare number (`1020.0000`). Cancelling a consignment refunds it.
- **`GET /GetUpcomingPickUpDetails`** → `data: []` when nothing is scheduled. **Its populated shape has never been observed** — Task 3 observes it before parsing it.
- **`GET /GetPickUpReference?ConsignmentNo=<n>`** → the parameter is **`ConsignmentNo`**, not `ConsignmentNumber` as every other operation uses. With the wrong name it answers `"Consignment Number Not Found"`, which reads like a bad consignment and is not. With the right one, a cancelled consignment answers `"Pickup Is Already Cancelled"` — so cancelling a consignment cancels its pickup too.
- **`GET /GetAvailablePickUpTimeSlots`** → 404 on the testing API with `PostCode`+`PickupDate`. Treat as not available; **the four ready-times on the Pickup artboard are invented** and must not ship as if they were GDEX's.

---

## Global constraints

- **Zod is the source of truth.** Every reply parsed with `readReply`, never cast.
- **No Prisma migration.** Pickup reference and wallet balance are read live; neither becomes a column. If a task seems to need one, re-read this line.
- **`lib/logistics/adapters/*` is `server-only`.**
- **Every `lib/logistics` function gets a test before it gets a caller.**
- **Booking is never retried.** `CreateConsignment` debits a wallet.
- **A read added to the quote path must not fail the quote.** A wallet or date lookup that errors degrades to silence, never to a missing price.
- Sentence case in UI copy. Prices in RM.
- Verification: `pnpm test`, `pnpm lint`, `pnpm typecheck`. Commit after every task.

---

## File structure

| File                                                | Status     | Responsibility                                                         |
| --------------------------------------------------- | ---------- | ---------------------------------------------------------------------- |
| `src/lib/logistics/adapters/gdex.ts`                | modify     | Three new reads: `pickupDays`, `walletBalance`, `pickupConfirmation`.  |
| `src/lib/logistics/__tests__/gdex.test.ts`          | modify     | Their tests, over stubbed fetch.                                       |
| `src/lib/logistics/types.ts`                        | modify     | `CarrierQuote.warning?`, and the `pickupDays` shape on the quote.      |
| `src/app/api/admin/deliveries/[id]/quotes/route.ts` | modify     | Carry the warning and the days through.                                |
| `src/app/api/admin/deliveries/[id]/pickup/route.ts` | **create** | The "is it on GDEX's board" read, for the booked view.                 |
| `src/app/admin/logistics/LogisticsManager.tsx`      | modify     | Grouped comparison, wallet warning, pickup confirmation, journey note. |
| `src/app/admin/logistics/tracking.ts`               | modify     | A journey that omits the stop a parcel network never reports.          |
| `docs/superpowers/plans/…-gdex-user-testing.md`     | this file  | The user-testing script lives in Task 6.                               |

---

## Task 1: Ask GDEX which days it will collect

Replaces the hardcoded five-day window with GDEX's own list, which already excludes weekends and holidays. The window check in `pickupDay` stays as the cheap local guard; this is the authoritative answer the UI offers.

**Files:**
- Modify: `src/lib/logistics/adapters/gdex.ts`
- Modify: `src/lib/logistics/__tests__/gdex.test.ts`

**Interfaces:**
- Produces: `pickupDays(): Promise<string[]>` — `YYYY-MM-DD` strings, soonest first.

- [ ] **Step 1: Write the failing test**

```ts
describe("pickupDays", () => {
	it("returns the days GDEX offers, as plain dates", async () => {
		stubResponses(userDetailsResponse, {
			statusCode: 200,
			data: [
				"2026-09-07T00:00:00",
				"2026-09-08T00:00:00",
				"2026-09-09T00:00:00",
			],
			message: null,
		});
		expect(await pickupDays()).toEqual([
			"2026-09-07",
			"2026-09-08",
			"2026-09-09",
		]);
	});

	it("asks against the sender's own postcode, which the endpoint requires", async () => {
		const fetchMock = stubResponses(userDetailsResponse, {
			statusCode: 200,
			data: [],
			message: null,
		});
		await pickupDays();
		// 400 "Please Provide PostCode" without it.
		expect(String(fetchMock.mock.calls[1][0])).toContain("PostCode=46050");
	});
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm vitest run src/lib/logistics/__tests__/gdex.test.ts -t pickupDays
```

Expected: FAIL — `pickupDays` is not exported.
- [ ] **Step 3: Implement**

```ts
const pickupDaysSchema = envelope(z.array(z.string()));

/**
 * The days GDEX will actually collect on, soonest first.
 *
 * Authoritative where `MAX_PICKUP_DAYS` only guesses: the list already excludes
 * weekends and public holidays, which the documented "five days" does not. The
 * local check stays as the cheap guard — this is what the admin is offered.
 *
 * The dates come back as `2026-09-08T00:00:00`, naive Malaysian local. Sliced
 * rather than parsed: `new Date()` on that string reads it as UTC and can move
 * the day backwards for anyone east of Greenwich, which is everyone here.
 */
export async function pickupDays(): Promise<string[]> {
	const sender = await senderDetails();
	const reply = readReply(
		pickupDaysSchema,
		await call(
			"GET",
			`/GetPickUpDateListing?PostCode=${encodeURIComponent(sender.PostalCode)}`,
			undefined,
			true,
		),
		"pickup day listing",
	);
	return reply.data.map((d) => d.slice(0, 10)).sort();
}
```

- [ ] **Step 4: Run the tests, then confirm against the sandbox**

```bash
pnpm vitest run src/lib/logistics/__tests__/gdex.test.ts
pnpm gdex:ping
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/logistics/adapters/gdex.ts src/lib/logistics/__tests__/gdex.test.ts
git commit -m "feat(logistics): ask GDEX which days it will collect"
```

---

## Task 2: Warn when the wallet cannot cover the quote

Wallet treatment **B**, chosen 2026-09-06. The balance is not displayed as a number on the comparison; a warning appears on the GDEX row only when the wallet is short. Parity is broken only where it buys something.

**Files:**
- Modify: `src/lib/logistics/adapters/gdex.ts`, `src/lib/logistics/types.ts`
- Modify: `src/app/admin/logistics/LogisticsManager.tsx`
- Modify: `src/lib/logistics/__tests__/gdex.test.ts`

**Interfaces:**
- Consumes: `CarrierQuote` from `../types`.
- Produces: `CarrierQuote.warning?: string` — advisory, never a refusal. A warned quote is still bookable.

- [ ] **Step 1: Add the field**

In `types.ts`, on `CarrierQuote`:

```ts
	/**
	 * Something the admin should see before booking, that is not a refusal.
	 * A warned quote is still bookable — the partner may yet accept it.
	 */
	warning?: string;
```

- [ ] **Step 2: Write the failing tests**

```ts
describe("gdexAdapter.quote wallet warning", () => {
	it("warns when the wallet will not cover the quote", async () => {
		stubResponses(userDetailsResponse, rateResponse, {
			statusCode: 200,
			data: 4.1,
			message: null,
		});
		const quote = await gdexAdapter.quote(job());
		expect(quote.priceRm).toBe(12.4);
		// Still bookable — GDEX decides, not us.
		expect(quote.warning).toMatch(/RM 4\.10/);
	});

	it("says nothing when the wallet covers it", async () => {
		stubResponses(userDetailsResponse, rateResponse, {
			statusCode: 200,
			data: 1020,
			message: null,
		});
		expect((await gdexAdapter.quote(job())).warning).toBeUndefined();
	});

	it("still returns the price when the balance cannot be read", async () => {
		const fetchMock = vi.fn();
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(userDetailsResponse), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(rateResponse), {
				status: 200,
				headers: { "content-type": "application/json" },
			}),
		);
		fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
		vi.stubGlobal("fetch", fetchMock);

		// A wallet read is advisory. Losing it must never cost the price.
		const quote = await gdexAdapter.quote(job());
		expect(quote.priceRm).toBe(12.4);
		expect(quote.warning).toBeUndefined();
	});
});
```

- [ ] **Step 3: Implement**

```ts
const walletSchema = envelope(z.number());

/** Null when it cannot be read — the caller must carry on without it. */
export async function walletBalance(): Promise<number | null> {
	try {
		const reply = readReply(
			walletSchema,
			await call("GET", "/CheckeWalletBalance", undefined, true),
			"wallet balance",
		);
		return reply.data;
	} catch (error) {
		trace("gdex.wallet", { error: String(error) });
		return null;
	}
}
```

In `quote()`, after the price is known:

```ts
// Advisory, not a refusal: GDEX decides whether it will take the booking,
// and a stale balance must never hide a price. `CreateConsignment` debits
// the wallet, so "Insufficient Credit" is the likeliest booking failure —
// and the one thing the admin can fix before spending their time on it.
const balance = await walletBalance();
const warning =
	balance !== null && priceRm !== null && balance < priceRm
		? `GDEX's wallet holds RM ${balance.toFixed(2)}, less than this booking — top it up or the booking will be refused`
		: undefined;
```

- [ ] **Step 4: Show it** — in `LogisticsManager.tsx`'s quote row, beneath `quote.notes`:

```tsx
{
	quote.warning && (
		<span className="pl-[18px] text-[11px] text-[#8a6d1f]">
			{quote.warning}
		</span>
	);
}
```

- [ ] **Step 5: Run everything, then commit**

```bash
pnpm test && pnpm typecheck && pnpm lint
git add -A src/lib/logistics src/app/admin/logistics
git commit -m "feat(logistics): warn when GDEX's wallet will not cover the booking"
```

---

## Task 3: Show that GDEX has the collection on its board

The task this plan exists for. After booking, the admin sees GDEX's own confirmation rather than inferring it from our own success.

**Files:**
- Modify: `src/lib/logistics/adapters/gdex.ts`
- Create: `src/app/api/admin/deliveries/[id]/pickup/route.ts`
- Modify: `src/app/admin/logistics/LogisticsManager.tsx`

- [ ] **Step 1: Observe the populated shape before parsing it**

`GetUpcomingPickUpDetails` has only ever been seen empty. Book one sandbox consignment, then:

```bash
node --env-file=.env.local -e '
const B="https://myopenapi.gdexpress.com/test/api/MyGDex";
const H={"User-Token":process.env.GDEX_USER_TOKEN,"subscription-key":process.env.GDEX_PRIMARY_API_KEY,accept:"application/json"};
console.log(await (await fetch(`${B}/GetUpcomingPickUpDetails`,{headers:H})).text());
'
```

**Write the observed JSON into `src/lib/logistics/__tests__/fixtures/gdex.ts` verbatim.** Do not invent this shape — the `IsValid` field on `GetLastShipmentStatus` is not in the documentation either, and reading a status off a row that did not exist reported a phantom parcel as booked.
- [ ] **Step 2: Implement against what you observed**

```ts
/**
 * What GDEX has scheduled for collection, and the reference for this job.
 *
 * `GetPickUpReference` takes **`ConsignmentNo`** — not `ConsignmentNumber`,
 * which every other operation uses and which this one answers with
 * "Consignment Number Not Found", a sentence that blames the consignment for a
 * misspelled parameter. Verified 2026-09-06.
 *
 * A cancelled consignment answers "Pickup Is Already Cancelled", so cancelling
 * the consignment cancels the collection with it.
 */
export async function pickupConfirmation(
	carrierOrderId: string,
): Promise<{ reference: string | null; message: string }> {
	// …parse against the fixture written in Step 1
}
```

- [ ] **Step 3: The route** — `src/app/api/admin/deliveries/[id]/pickup/route.ts`, `POST`, mirroring `track/route.ts`: load the delivery, refuse when `carrierId !== "gdex"` or `carrierOrderId === null`, return the confirmation.

- [ ] **Step 4: The UI** — the green confirmation panel on the booked-job artboard, with its "Check again" button calling that route. It renders only once a reference comes back; absence is not an error, because a collection can take a moment to appear on GDEX's board.

- [ ] **Step 5: Run everything and commit**

---

## Task 4: Group the comparison by what the partner actually is

From the Compare partners artboard. A 500 kg cabinet must not read as a plausible parcel next to a lorry quote 16× cheaper.

**Files:** `src/app/admin/logistics/LogisticsManager.tsx`, `src/app/admin/logistics/tracking.ts`
- [ ] **Step 1:** Split the quote list by `KIND[carrierId]` (`carriers.ts` already carries it) into "Vehicle partners" and "Parcel partners", each with the one-line explanation from the artboard.
- [ ] **Step 2:** Restate the job above the list — items, total weight, longest edge, destination.
- [ ] **Step 3:** Give the three failure kinds three looks, as designed: dashed grey for _no credentials, nothing was asked_; amber for _this job is wrong for this carrier_ (a `GdexNotDeliverable` / `EasyParcelNotDeliverable` message, which the admin can act on); red for _the carrier refused_.
- [ ] **Step 4:** Test `tracking.ts`'s grouping helper, run everything, commit.

---

## Task 5: A journey with the stop a parcel network never reports

**Files:** `src/app/admin/logistics/tracking.ts`, `src/app/admin/logistics/LogisticsManager.tsx`

`JOURNEY` is a module constant of five states including `DRIVER_ASSIGNED`. A GDEX job can never reach it, so the tracker always shows one dead stop.
- [ ] **Step 1:** Write the failing test — `journeySteps` for a GDEX job returns four stops, for a Lalamove job five.
- [ ] **Step 2:** Take the carrier id as an argument and drop `DRIVER_ASSIGNED` when the carrier's status table has no entry mapping to it. Derived from `CARRIER_STATUS_MAPS`, not hardcoded per carrier — a partner that starts reporting drivers gets the stop back for free.
- [ ] **Step 3:** Add the explanatory line from the artboard, so the absence reads as a fact about parcel networks rather than a missing feature.
- [ ] **Step 4:** Run everything and commit.

---

## Task 6: The user-testing script

Not code. This is what a tester follows, and what "it works" means.
- [ ] **Step 1: Write `docs/gdex-user-testing.md`** containing exactly this run-through:

**Before starting**
1. `pnpm gdex:ping` — expect `GetUserTokenValidity` 200, a wallet balance, and a rate in RM. Any 401 stops the test: the message names which credential and which portal.
2. Confirm the wallet covers a few bookings. It reached `0.0000` once already.

**The run**
3. Create a delivery to a real Klang Valley address. Give at least one item a weight — GDEX cannot quote without one.
4. Save it. Confirm the job shows a postcode; without `GOOGLE_GEOCODING_API_KEY` it will not, and both parcel partners refuse.
5. Set the scheduled date to a day GDEX offers (the pickup step lists them).
6. Compare partners. GDEX shows a price in RM. A wallet warning appears only if the balance is short.
7. Book. Expect a consignment number of the form `TCN…`.
8. **Confirm it reached GDEX**: the green panel names a pickup reference. If it does not appear, press "Check again" — a collection takes a moment to reach their board.
9. **Confirm it independently**: sign in at `my-openapi.gdexpress.com` and find the consignment. This is the step that proves the loop, and the reason this plan exists.
10. Print the consignment note. It must be a real PDF with the customer's address on it.
11. Cancel the job. The wallet balance returns to what it was — cancelling refunds, and it cancels the collection too.

**What is not a bug**
- No driver is ever named on a GDEX job. Use Lalamove when a named driver matters.
- Status updates lag up to ten minutes; the cron polls on that interval. "Refresh from carrier" is immediate.

- [ ] **Step 2: Commit.**

---

## Verification

```bash
pnpm test && pnpm typecheck && pnpm lint
pnpm gdex:ping
```

End to end is Task 6's script, run once in full by a person, ending at step 9 — the consignment visible in GDEX's own portal.

---

## Open questions — raise with the client, do not guess in code

- **The pickup ready-time options.** `GetAvailablePickUpTimeSlots` 404s on the testing API, so the four times on the Pickup artboard are invented. Ask GDEX what a collection window actually is before shipping that control.
- **A parcel weight ceiling.** Neither parcel adapter refuses on mass; GDEX quoted RM 1,409 for 500 kg. Needs GDEX's contracted per-consignment limit.
- **GDEX's volumetric divisor.** Decides whether `weightOf` stays actual-weight-only.
- **`WORKSHOP_POSTCODE` is still a placeholder** (`43800`). Every parcel origin zone is priced from it, and `GetPickUpDateListing` is asked against the GDEX account's postcode (`59200`) — two different places. Confirm which is the real workshop.
