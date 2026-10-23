# Company details, edited by the client — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A superadmin edits every company fact (name, address, pin, phone, bank, order prefix) at `/admin/company`. Everything reads the saved value on the next request. Moving the factory re-points every delivery not yet booked, and changes nothing already done.

**Architecture:** An append-only `CompanyDetails` table; the newest row is live, and with no row the app reads the `tenant.ts` seed. One zod `companyDetailsSchema` is shared by the form, the save route and the reader. Server code reads `getCompany()`, which is `unstable_cache`d under tag `company` and purged on save. Client components get company facts already filled into the dictionary, or through the admin context — never from `tenant.ts`. Orders and deliveries store their reference prefix when created. A delivery records `fromWorkshop` and carries the workshop's own pin and place, so the `address === WORKSHOP_ADDRESS` fallbacks disappear.

**Tech Stack:** Next.js 16 App Router, Prisma 7 (Postgres), zod 4, Better Auth 1.7.5, vitest 4, Biome.

**Spec:** `docs/superpowers/specs/2026-10-19-company-details-design.md`

**Owner decision since the spec (2026-10-21):** superadmin only — confirmed. The point of the page is that when the factory moves, EzCabinet's own superadmin changes the address with no developer involved.

## Global Constraints

- Who: superadmin only. A new permission `company:manage` in `SUPERADMIN_ONLY` (`lib/auth/permissions.ts`). The save route passes `{ stepUp: true }` to `withAuth`. The tab sits beside People in `SUPERADMIN_TABS`.
- Field rules, verbatim from the spec: brand required, 2–60 chars. Legal name required. SSM registration number optional, shown in the seller block when set. Contact email must be an email. Phone must normalise with `toE164` (`lib/logistics/phone.ts`). Address line required. Postcode 5 digits. State an ISO 3166-2:MY code (`lib/logistics/malaysia.ts`). Map pin required lat/lng inside Malaysia. Courier close time `HH:MM`, Malaysia time. Bank name, account name and account number; account number digits only. Order prefix 1–5 uppercase letters/digits.
- Every field is required except the SSM number.
- Zod is the single source: one `companyDetailsSchema`, used by the form, the route and the reader.
- `lib/planner` is untouched.
- Nothing new in the planner's first load may import three. `QuoteScreen.tsx` and `error.tsx` are client components and cannot read the database.
- No new dependency.
- Every mail goes through `renderEmail` (`lib/email/layout.ts`); `oneLook.test.ts` must keep passing.
- Every admin route is `export const METHOD = withAuth(...)`; `src/lib/auth/__tests__/coverage.test.ts` must keep passing.
- Sentence case in UI copy. Biome formatting (tabs). Comments match the surrounding density: a docblock says _why_, not what.
- Migrations are hand-written (CLAUDE.md Known issue 12) and checked with `prisma migrate diff`.
- Never set `TENANT` in `.env.local`.
- Commit messages: conventional (`feat(company): …`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisions this plan makes (the spec left them to the builder)

1. **`refPrefix`, not a full `ref`.** `Order.refPrefix` and `Delivery.refPrefix` hold the prefix live when the row was made. The number and the creation day never change, so the prefix is the only part of a reference that could drift. Storing the full ref would need the auto-increment number before the insert. A SQL migration cannot know each deployment's prefix (EzCabinet `IC`, demo `PO`). So the column is nullable: `null` means "made before refs were stored", and `orderRef`/`deliveryRef` read it as the seed prefix (`seedCompany().orderPrefix`). That is exactly the prefix those rows were made under. This is the spec's "backfill with each deployment's own prefix", done at read time in one function.
2. **The delivery backfill is SQL, keyed on the two seed addresses.** Each database only holds its own workshop string. So one migration can mark `fromWorkshop` and fill a missing pin and place for EzCabinet's `EzCabinet Sdn Bhd, Klang Valley, Selangor` and the demo's `JNS Nexion Enterprise, Subang Jaya Industrial Park, 47500 Subang Jaya, Selangor`, without knowing which deployment it runs in. The seed address strings in `tenant.ts` stay exactly as they are, so an unsaved company and its legacy rows still match.
3. **The passkey `rpName` stays at the seed brand; the TOTP issuer goes live.** Better Auth copies the passkey options when the instance is built (`{ ...options }` in `@better-auth/passkey`). Building is synchronous, and a database read at module load would break CI, which has no database. The 2FA enable endpoint takes an `issuer` in its body, so the setup screen sends `${brand} Admin` live. This narrows the spec's accepted limit: a rename reaches new authenticator apps at once, and reaches passkey prompts only when the seed changes. Cosmetic.
4. **The error page links "Home", not the brand.** `error.tsx` takes no props and must not read the database. Its link goes to `/${locale}`, so a localised "Home" is accurate and leaves no company fact in the bundle.
5. **The seller line is `legalName (SSM), address`.** It is used by the terms page, the checkout and the mail footer. The name is not repeated when the address already starts with it — both seed addresses do.
6. **The move is confirmed with a 409, then a second POST.** `POST /api/admin/company` answers `409 { error: "confirm_move", move }` when a save would move the workshop and any delivery is affected. The page shows the list and re-posts with `confirmMove: true`. Re-pointing acts on whatever is unbooked when the save commits, not on the list shown.
7. **Typing is normalised.** Spaces and dashes come out of the account number before the digits check, and the order prefix is upper-cased. People type `5621 2345 6789` and `ic`.
8. **The GDEX notice has three states.** With GDEX configured, the page always reminds staff to update the GDEX profile. It warns when the profile's postcode differs from the saved one. It says "could not check" when GDEX does not answer.
9. **No seeding script.** The store falls back to the seed when the table is empty, as the spec says; the first save writes the first row.

## Review Focus

1. **A pin outside Malaysia, or latitude and longitude swapped** (`101.86, 2.98`). The admin expects to be refused with "The pin must be inside Malaysia", not a pin saved in the sea. → Task 1 test.
2. **An account number typed with spaces or dashes, or a lower-case prefix.** It is expected to save normalised, not be refused. → Task 1 test.
3. **Re-saving the same address with stray whitespace, or saving only a new phone.** Expected: no move, no confirmation, no deliveries touched. → Task 1 (`workshopMoved`) and Task 11 tests.
4. **A delivery booked between the confirmation and the commit.** Expected: it is not moved and gets no "moved" event; the carrier already has its pickup. → Task 11 test.
5. **GDEX down when the page loads.** Expected: the page renders and says it could not check GDEX; it does not fail. → Task 13 test.

---

## Before Task 1: workspace

Other Claude sessions edit the main checkout, so this work goes in its own worktree with its own database.
- [ ] Create the worktree from `feature/development`. The branch is `feature/company-details` at `.claude/worktrees/company-details`; enter it with `EnterWorktree`. Inside it, every git command is plain and alone.
- [ ] Run `pnpm install`.
- [ ] Copy `.env.local` from the main checkout. Set its `DATABASE_URL` database name to `cabinet_company`.
- [ ] Create the database: `docker compose -f /Users/tenghaoooi/Documents/JNS_Nexion_Projects/3d_cabinet_webapp/docker-compose.yml exec -T postgres createdb -U cabinet cabinet_company`
- [ ] Run `pnpm exec prisma migrate deploy && pnpm db:seed`. Expected: every migration applies, and the seed finishes.
- [ ] Run `pnpm test`. Expected: all pass. This is the baseline; note any failures that were already there.

Below, `PSQL` means `docker compose -f /Users/tenghaoooi/Documents/JNS_Nexion_Projects/3d_cabinet_webapp/docker-compose.yml exec -T postgres psql -U cabinet -d cabinet_company -c`.

---

### Task 1: The company details schema and the seed

**Files:**
- Create: `src/lib/company/details.ts`
- Create: `src/lib/company/__tests__/company.fixture.ts`
- Test: `src/lib/company/__tests__/details.test.ts`
- Modify: `src/lib/tenant.ts` (docblock only)

**Interfaces:**
- Produces, all from `@/lib/company/details` (pure and isomorphic; imports only zod, `tenant`, `toE164` and `MALAYSIAN_STATES`):
  - `companyDetailsSchema` (zod object), `type CompanyDetails = z.output<typeof companyDetailsSchema>` with fields `brand, legalName, ssmNumber: string | null, contactEmail, phone, address, postcode, city, state, lat: number, lng: number, closeTime, bankName, bankAccountName, bankAccountNumber, orderPrefix`
  - `seedCompany(): CompanyDetails`
  - `sellerLine(c: Pick<CompanyDetails, "legalName" | "ssmNumber" | "address">): string`
  - `workshopMoved(prev: CompanyDetails, next: CompanyDetails): boolean`
  - `bankChanged(prev: CompanyDetails, next: CompanyDetails): boolean`
  - `lastFour(accountNumber: string): string`
  - `mapsLink(lat: number, lng: number): string`
- Produces for tests: `testCompany(over?: Partial<CompanyDetails>): CompanyDetails` from `src/lib/company/__tests__/company.fixture.ts`

- [ ] **Step 1: Write the fixture.** `testCompany` returns the values below, then `...over`:

```ts
{
	brand: "EzCabinet",
	legalName: "EzCabinet Sdn Bhd",
	ssmNumber: null,
	contactEmail: "hello@ezcabinet.com",
	phone: "03-1234 5678",
	address: "Lot 5, Jalan Kilang 2, 43800 Dengkil, Selangor",
	postcode: "43800",
	city: "Dengkil",
	state: "MY-10",
	lat: 2.9848868,
	lng: 101.861807,
	closeTime: "18:00",
	bankName: "Maybank",
	bankAccountName: "EzCabinet Sdn Bhd",
	bankAccountNumber: "562123456789",
	orderPrefix: "IC",
}
```

- [ ] **Step 2: Write the failing tests** in `details.test.ts`:

```ts
const input = (over: Record<string, unknown> = {}) => ({
	...testCompany(),
	ssmNumber: "",
	...over,
});
const ok = (over = {}) => companyDetailsSchema.safeParse(input(over)).success;

describe("companyDetailsSchema", () => {
	it("accepts a complete company and turns a blank SSM number into null", () => {
		expect(companyDetailsSchema.parse(input()).ssmNumber).toBeNull();
		expect(
			companyDetailsSchema.parse(input({ ssmNumber: " 202301012345 " }))
				.ssmNumber,
		).toBe("202301012345");
	});
	it.each([
		"brand",
		"legalName",
		"contactEmail",
		"phone",
		"address",
		"postcode",
		"city",
		"state",
		"closeTime",
		"bankName",
		"bankAccountName",
		"bankAccountNumber",
		"orderPrefix",
	])("requires %s", (field) => expect(ok({ [field]: "  " })).toBe(false));
	it("keeps the brand between 2 and 60 characters", () => {
		expect(ok({ brand: "E" })).toBe(false);
		expect(ok({ brand: "E".repeat(61) })).toBe(false);
	});
	it("refuses a pin outside Malaysia, including one with lat and lng swapped", () => {
		expect(ok({ lat: 101.861807, lng: 2.9848868 })).toBe(false);
		expect(ok({ lat: 51.5, lng: -0.12 })).toBe(false);
		expect(ok({ lat: 5.98, lng: 116.07 })).toBe(true); // Kota Kinabalu
	});
	it("strips spaces and dashes from the account number, then wants digits only", () => {
		expect(
			companyDetailsSchema.parse(input({ bankAccountNumber: "5621 2345-6789" }))
				.bankAccountNumber,
		).toBe("562123456789");
		expect(ok({ bankAccountNumber: "5621-ABCD" })).toBe(false);
	});
	it("upper-cases the order prefix and keeps it to five letters or digits", () => {
		expect(
			companyDetailsSchema.parse(input({ orderPrefix: "po" })).orderPrefix,
		).toBe("PO");
		expect(ok({ orderPrefix: "ABCDEF" })).toBe(false);
		expect(ok({ orderPrefix: "I-C" })).toBe(false);
	});
	it("wants a phone a courier can call", () =>
		expect(ok({ phone: "call the office" })).toBe(false));
	it("wants a five-digit postcode and an ISO state code", () => {
		expect(ok({ postcode: "4380" })).toBe(false);
		expect(ok({ state: "Selangor" })).toBe(false);
	});
	it("wants the close time as HH:MM", () => {
		expect(ok({ closeTime: "6pm" })).toBe(false);
		expect(ok({ closeTime: "24:00" })).toBe(false);
		expect(ok({ closeTime: "17:30" })).toBe(true);
	});
	it("wants an email", () =>
		expect(ok({ contactEmail: "hello at ezcabinet" })).toBe(false));
});

describe("workshopMoved", () => {
	const a = testCompany();
	it("is false for the same address with stray whitespace, or for a new phone", () => {
		expect(workshopMoved(a, { ...a, address: ` ${a.address}  ` })).toBe(false);
		expect(workshopMoved(a, { ...a, phone: "03-5555 1234" })).toBe(false);
	});
	it.each([
		["address", "Lot 9, Jalan Baru, 47500 Subang Jaya"],
		["lat", 3.07],
		["lng", 101.59],
		["postcode", "47500"],
		["city", "Subang Jaya"],
		["state", "MY-14"],
	])("is true when %s changes", (field, value) =>
		expect(workshopMoved(a, { ...a, [field]: value })).toBe(true),
	);
});

describe("bankChanged", () => {
	const a = testCompany();
	it.each([
		["bankName", "CIMB"],
		["bankAccountName", "EzCabinet Trading"],
		["bankAccountNumber", "8000111222"],
	])("is true when %s changes", (field, value) =>
		expect(bankChanged(a, { ...a, [field]: value })).toBe(true),
	);
	it("is false when only the address changes", () =>
		expect(bankChanged(a, { ...a, address: "elsewhere" })).toBe(false));
});

describe("sellerLine", () => {
	it("names the company, its registration and the address", () =>
		expect(sellerLine(testCompany({ ssmNumber: "202301012345" }))).toBe(
			"EzCabinet Sdn Bhd (202301012345), Lot 5, Jalan Kilang 2, 43800 Dengkil, Selangor",
		));
	it("does not repeat the name when the address already starts with it", () =>
		expect(
			sellerLine({
				legalName: "EzCabinet Sdn Bhd",
				ssmNumber: null,
				address: "EzCabinet Sdn Bhd, Klang Valley, Selangor",
			}),
		).toBe("EzCabinet Sdn Bhd, Klang Valley, Selangor"));
});

describe("seedCompany", () => {
	it("is this deployment's tenant values, with no SSM number and an 18:00 close", () => {
		const seed = seedCompany();
		expect(seed).toMatchObject({
			brand: "EzCabinet",
			orderPrefix: "IC",
			ssmNumber: null,
			closeTime: "18:00",
			address: "EzCabinet Sdn Bhd, Klang Valley, Selangor",
			lat: 2.9848868,
		});
	});
});

it("lastFour keeps the last four digits, and nothing when there are none", () => {
	expect(lastFour("5621 2345 6789")).toBe("6789");
	expect(lastFour("To be confirmed")).toBe("");
});

it("mapsLink opens the pin in Google Maps", () =>
	expect(mapsLink(2.98, 101.86)).toBe(
		"https://www.google.com/maps/search/?api=1&query=2.98,101.86",
	));
```

- [ ] **Step 3: Run** `pnpm vitest run src/lib/company/__tests__/details.test.ts`. Expected: FAIL, cannot resolve `../details`.

- [ ] **Step 4: Implement `src/lib/company/details.ts`.**
  - Inside Malaysia is the bounding box lat `0.8`–`7.5`, lng `99.5`–`119.5`. Add a `ponytail:` comment: the box also takes in Singapore, Brunei and the Thai border; a real polygon if that ever bites. People can still check by eye, because the form shows a Maps link.
  - `contactEmail` is `z.string().trim().pipe(z.email())`.
  - `state` is `z.enum(MALAYSIAN_STATES.map((s) => s.code) as [string, ...string[]])`.
  - `ssmNumber` is `z.string().trim().max(40).nullable().transform((v) => v || null)`.
  - `seedCompany()` maps `tenant`: `phone: tenant.workshopPhone`, `address: tenant.workshopAddress`, pin and place from `tenant.workshopPin/Postcode/City/State`, `closeTime: "18:00"`, `bankName: "Bank to be confirmed"`, `bankAccountName: tenant.legalName`, `bankAccountNumber: "To be confirmed"` (today's `BANK_TRANSFER` placeholders, so nothing a customer sees changes before the first save).
  - `workshopMoved` compares the trimmed address, `lat`, `lng`, `postcode`, `city` and `state`.

- [ ] **Step 5: Update the `tenant.ts` docblock.** Its company facts are now **seed values**: what an unsaved company reads, and the prefix of every order made before refs were stored. So `orderPrefix` and `workshopAddress` must never be edited for an existing deployment. Live values come from `getCompany()`. `heroFrames` and `finishPhotos` remain switches.

- [ ] **Step 6: Run** `pnpm vitest run src/lib/company/__tests__/details.test.ts`. Expected: PASS.

- [ ] **Step 7: Commit:** `git add src/lib/company src/lib/tenant.ts`, then `git commit -m "feat(company): one schema for the company's editable facts"`

---

### Task 2: The table, the stored prefixes and the delivery backfill

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261022000000_company_details/migration.sql`

**Interfaces:**
- Produces:
  - Prisma model `CompanyDetails`, with the Task 1 fields as columns (`ssmNumber String?`, `lat Float`, `lng Float`, the rest `String`), plus `id String @id @default(cuid())`, `savedById String?`, `savedByName String`, `savedAt DateTime @default(now())`, and `@@index([savedAt])`.
  - `Order.refPrefix String?`
  - `Delivery.refPrefix String?`
  - `Delivery.fromWorkshop Boolean @default(false)`

- [ ] **Step 1: Edit `schema.prisma`.** Docblocks:
  - On the model: append-only; the newest row is live; the history of the address and the bank account _is_ this table, the way `CatalogueVersion` is the price history.
  - `savedById`: no relation, so deleting a staff row keeps the record; `savedByName` stays, like `Order.paidByName`.
  - `refPrefix`: the prefix live when the row was made; null on rows made before 2026-10-22, which were all made under the seed prefix (`orderRef` / `deliveryRef`).
  - `fromWorkshop`: true when the job leaves from the workshop; such a job carries the workshop's pin and place, and moves with the workshop until it is booked (`lib/company/save.ts`).
  - Update `Order.number`'s comment: the format is `<refPrefix>-YYYYMMDD-NNN`.

- [ ] **Step 2: Insert two legacy deliveries** before the migration exists, so the backfill can be seen working:

```bash
PSQL "INSERT INTO \"Delivery\" (id, \"customerName\", \"customerPhone\", \"siteAddress\", \"pickupAddress\", \"publicToken\", \"updatedAt\") VALUES ('legacy-workshop','Mei','+60123456789','1 Jalan Satu','EzCabinet Sdn Bhd, Klang Valley, Selangor','tok-legacy-1',now()), ('legacy-other','Mei','+60123456789','1 Jalan Satu','12 Jalan Lain, Shah Alam','tok-legacy-2',now());"
```

- [ ] **Step 3: Write `migration.sql` by hand:**
  - `CREATE TABLE "CompanyDetails"` matching the model, with `"savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`, the primary key, and `CREATE INDEX "CompanyDetails_savedAt_idx"`.
  - `ALTER TABLE "Order" ADD COLUMN "refPrefix" TEXT;`
  - `ALTER TABLE "Delivery" ADD COLUMN "refPrefix" TEXT, ADD COLUMN "fromWorkshop" BOOLEAN NOT NULL DEFAULT false;`
  - Two `UPDATE "Delivery"` statements, one per seed address (decision 2). Each sets `"fromWorkshop" = true`, and fills only what is missing with `COALESCE`: `pickupLat`, `pickupLng`, `pickupGeocodedFor` (to `"pickupAddress"`), `pickupPostcode`, `pickupCity`, `pickupState`, all matched on `btrim("pickupAddress") = '<seed address>'`:
    - EzCabinet: `'EzCabinet Sdn Bhd, Klang Valley, Selangor'` → `2.9848868, 101.861807, '43800', 'Dengkil', 'MY-10'`
    - Demo: `'JNS Nexion Enterprise, Subang Jaya Industrial Park, 47500 Subang Jaya, Selangor'` → `3.0757, 101.5951, '47500', 'Subang Jaya', 'MY-10'`
  - A leading SQL comment explains why both are here: each database holds only its own, and a row that is neither is an admin-typed pickup and stays `false`.

- [ ] **Step 4: Apply:** `pnpm exec prisma migrate deploy`. Expected: `20261022000000_company_details` applied.

- [ ] **Step 5: Check the backfill:**

```bash
PSQL "SELECT id, \"fromWorkshop\", \"pickupLat\", \"pickupPostcode\", \"refPrefix\" FROM \"Delivery\" WHERE id LIKE 'legacy-%' ORDER BY id;"
```

Expected: `legacy-other | f | (null) | (null) | (null)` and `legacy-workshop | t | 2.9848868 | 43800 | (null)`.
- [ ] **Step 6: Check the schema matches the database:** `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`. Expected: an empty migration (`-- This is an empty migration.`).

- [ ] **Step 7: Clean up and regenerate:** `PSQL "DELETE FROM \"Delivery\" WHERE id LIKE 'legacy-%';"`, then `pnpm exec prisma generate`, then `pnpm typecheck`. Expected: typecheck passes; nothing reads the new columns yet.

- [ ] **Step 8: Commit:** `git add prisma`, then `git commit -m "feat(company): table for the company's details, stored ref prefixes, deliveries that know they leave from the workshop"`

---

### Task 3: Reading the live company

**Files:**
- Create: `src/lib/company/store.ts`
- Test: `src/lib/company/__tests__/store.test.ts`

**Interfaces:**
- Consumes: `CompanyDetails`, `seedCompany` (Task 1); `prisma.companyDetails` (Task 2).
- Produces, from `@/lib/company/store` (`server-only`):
  - `COMPANY_CACHE_TAG = "company"`
  - `type SavedCompany = { details: CompanyDetails; savedAt: Date | null; savedByName: string | null }`
  - `readCompany(): Promise<SavedCompany>` — uncached, newest row
  - `getCompany(): Promise<CompanyDetails>` — `unstable_cache(..., ["company"], { tags: [COMPANY_CACHE_TAG] })`
  - `getReservedBrands(): Promise<string[]>` — `unstable_cache(..., ["company-brands"], { tags: [COMPANY_CACHE_TAG] })`

- [ ] **Step 1: Write the failing tests.** Mock `next/cache` as `{ unstable_cache: (fn: unknown) => fn }`. Mock `@/lib/catalogue/db` with `prisma.companyDetails.{ findFirst, findMany }`.

```ts
it("reads the seed, unsaved, when no row exists", async () => {
	findFirst.mockResolvedValue(null);
	expect(await readCompany()).toEqual({
		details: seedCompany(),
		savedAt: null,
		savedByName: null,
	});
});
it("reads the newest row, and who saved it", async () => {
	const at = new Date("2026-10-22T02:00:00Z");
	findFirst.mockResolvedValue({
		id: "c2",
		...testCompany({ brand: "Kabinet Baru" }),
		savedById: "u1",
		savedByName: "Aisyah",
		savedAt: at,
	});
	expect(await readCompany()).toEqual({
		details: testCompany({ brand: "Kabinet Baru" }),
		savedAt: at,
		savedByName: "Aisyah",
	});
	expect(findFirst).toHaveBeenCalledWith({
		orderBy: [{ savedAt: "desc" }, { id: "desc" }],
	});
});
it("getCompany is the live details alone, so the cache holds only plain values", async () => {
	findFirst.mockResolvedValue(null);
	expect(await getCompany()).toEqual(seedCompany());
});
it("reserves the seed brand and every brand ever saved, once each", async () => {
	findMany.mockResolvedValue([
		{ brand: "EzCabinet" },
		{ brand: "Kabinet Baru" },
	]);
	expect((await getReservedBrands()).sort()).toEqual([
		"EzCabinet",
		"Kabinet Baru",
	]);
	expect(findMany).toHaveBeenCalledWith({
		distinct: ["brand"],
		select: { brand: true },
	});
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/company/__tests__/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `store.ts`.** Follow `lib/catalogue/store.ts`: one fetch function, an uncached export for the admin screen and the save, and a cached export. The docblock says why `getCompany` returns only `details`: `unstable_cache` round-trips through JSON, and a `Date` would come back a string. The row is mapped field by field, with no re-parse: every row was validated when it was saved.
- [ ] **Step 4: Run** the same test file. Expected: PASS.
- [ ] **Step 5: Commit:** `git add src/lib/company`, then `git commit -m "feat(company): read the live company, cached until a save"`

---

### Task 4: References fixed when they are made

**Files:**
- Modify: `src/lib/orders/ref.ts`, `src/lib/logistics/publicTracking.ts`
- Modify (write the prefix): `src/app/api/orders/route.ts`, `src/app/api/admin/deliveries/route.ts`, `src/app/api/admin/deliveries/[id]/split/route.ts`
- Modify (readers): `src/app/admin/orders/page.tsx`, `src/app/admin/orders/[id]/page.tsx`, `src/app/admin/logistics/[id]/page.tsx`, `src/app/[lang]/(account)/order/[token]/page.tsx`, `src/app/[lang]/(account)/orders/page.tsx`, `src/app/[lang]/track/[token]/page.tsx`, `src/lib/auth/userRow.ts`, `src/lib/orders/refund.ts`, `src/lib/payments/start.ts`, `src/lib/orders/payment.ts`, `src/lib/email/templates/order.ts`, `src/lib/email/orderMail.ts`, `src/lib/whatsapp/templates.ts`
- Test: `src/lib/orders/__tests__/orders.test.ts`, `src/lib/logistics/__tests__/publicTracking.test.ts`, `src/app/api/orders/__tests__/route.test.ts`, `src/app/api/admin/deliveries/__tests__/route.test.ts`, plus fixtures the typecheck flags (`orderTemplate.test.ts`, `userRow.test.ts`, whatsapp tests)

**Interfaces:**
- Consumes: `seedCompany` (Task 1), `getCompany` (Task 3), `refPrefix` columns (Task 2).
- Produces:
  - `orderRef(order: { refPrefix: string | null; number: number; createdAt: Date | string }): string` in `@/lib/orders/ref`
  - `deliveryRef(delivery: { refPrefix: string | null; number: number }): string` in `@/lib/logistics/publicTracking` (replaces that file's `orderRef(number)`)
  - `NOTIFY_ORDER_SELECT` and `NotifyOrder` gain `refPrefix`; `OrderMailInput["order"]` gains `refPrefix: string | null`

- [ ] **Step 1: Write the failing tests.**

`orders.test.ts`, replacing the `orderRef` block:

```ts
describe("orderRef", () => {
	it("prints the prefix the order was placed under", () =>
		expect(
			orderRef({
				refPrefix: "PO",
				number: 14,
				createdAt: "2026-08-26T07:12:00Z",
			}),
		).toBe("PO-20260826-014"));
	it("keeps the day in Malaysia", () =>
		expect(
			orderRef({
				refPrefix: "IC",
				number: 14,
				createdAt: "2026-08-26T17:30:00Z",
			}),
		).toBe("IC-20260827-014"));
	it("reads an order made before refs were stored under the seed prefix", () =>
		expect(
			orderRef({
				refPrefix: null,
				number: 14,
				createdAt: "2026-08-26T07:12:00Z",
			}),
		).toBe(`${seedCompany().orderPrefix}-20260826-014`));
});
```

`publicTracking.test.ts`: `deliveryRef({ refPrefix: "PO", number: 41 })` → `"PO-00041"`; `deliveryRef({ refPrefix: null, number: 120_000 })` → `"IC-120000"`.

`src/app/api/orders/__tests__/route.test.ts`: mock `@/lib/company/store` with `getCompany` resolving `testCompany({ orderPrefix: "PO" })`. Add: `it("stamps the order with the prefix live when it is placed")` — assert `tx.order.create` was called with `data` containing `refPrefix: "PO"`. This is the ref snapshot: an order keeps that prefix whatever the company changes to later, because `orderRef` reads only the stored one.

`src/app/api/admin/deliveries/__tests__/route.test.ts`: mock `@/lib/company/store` likewise; assert `create` data contains `refPrefix: "PO"`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/orders src/lib/logistics/__tests__/publicTracking.test.ts src/app/api/orders/__tests__/route.test.ts src/app/api/admin/deliveries/__tests__/route.test.ts`. Expected: FAIL.
- [ ] **Step 3: Change `orderRef` and `deliveryRef`.** Their docblocks say the prefix is the stored one, and that null means legacy, read as the seed.
- [ ] **Step 4: Write the prefix at creation.**
  - `api/orders/route.ts`: `refPrefix: (await getCompany()).orderPrefix` in `tx.order.create`, read before the transaction.
  - Delivery create: `refPrefix: company.orderPrefix`.
  - Split: both halves copy `delivery.refPrefix` — one order's jobs keep one prefix.
- [ ] **Step 5: Move every reader to `orderRef(order)` / `deliveryRef(delivery)`.** Add `refPrefix: true` wherever a `select` feeds one (`NOTIFY_ORDER_SELECT`, `start.ts`, `refund.ts`, `orderMail.ts`, `USER_ROW_SELECT`'s orders, the track page's delivery select). Run `pnpm typecheck` until it is clean; it names every miss.
- [ ] **Step 6: Run** `pnpm test`. Expected: PASS.
- [ ] **Step 7: Commit:** `git add -A src`, then `git commit -m "feat(company): an order and a delivery keep the prefix they were made with"`

---

### Task 5: The dictionary, the checkout seller block, terms and the error page

**Files:**
- Modify: `src/lib/copy/dictionary.ts`, `src/lib/copy/en.ts`, `src/lib/copy/ms.ts`, `src/lib/copy/zh.ts`, `src/components/planner/QuoteScreen.tsx`, `src/app/[lang]/terms/page.tsx`, `src/app/[lang]/error.tsx`
- Test: `src/lib/copy/__tests__/dictionary.test.ts` (new); `src/lib/copy/__tests__/brand.test.ts` keeps passing

**Interfaces:**
- Consumes: `getCompany` (Task 3), `sellerLine` (Task 1).
- Produces: `getDictionary(locale)` keeps its signature. It now returns `quote.soldBy` and `terms.seller` already filled, and fills `{brand}`, `{legalName}` and `{orderPrefix}` everywhere.

- [ ] **Step 1: Write the failing test** in `dictionary.test.ts`. Mock `@/lib/company/store` with a `getCompany` `vi.fn`.

```ts
const company = testCompany({
	brand: "Kabinet Baru",
	legalName: "Kabinet Baru Sdn Bhd",
	orderPrefix: "KB",
	ssmNumber: "202301012345",
});

it("fills the company's facts into the copy", async () => {
	getCompany.mockResolvedValue(company);
	const t = await getDictionary("en");
	expect(t.common.brand).toBe("Kabinet Baru");
	expect(t.landing.footer.email).toBe(company.contactEmail);
	expect(t.privacy.draft).toContain("Kabinet Baru Sdn Bhd");
	expect(JSON.stringify(t)).not.toMatch(
		/\{(brand|legalName|orderPrefix|seller)\}/,
	);
});
it.each(["en", "ms", "zh"] as const)(
	"%s: the seller block names the seller, email and phone",
	async (locale) => {
		getCompany.mockResolvedValue(company);
		const t = await getDictionary(locale);
		for (const line of [t.quote.soldBy, t.terms.seller]) {
			expect(line).toContain(sellerLine(company));
			expect(line).toContain(company.contactEmail);
			expect(line).toContain(company.phone);
		}
	},
);
it("leaves a customer's own {email} for the page to fill", async () => {
	getCompany.mockResolvedValue(company);
	expect((await getDictionary("en")).signIn.codeSent).toContain("{email}");
});
it("shows a saved change on the next call", async () => {
	getCompany.mockResolvedValue(company);
	await getDictionary("en");
	getCompany.mockResolvedValue({ ...company, brand: "Kabinet Lagi" });
	expect((await getDictionary("en")).common.brand).toBe("Kabinet Lagi");
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/copy`. Expected: the new file FAILS.
- [ ] **Step 3: Edit the copy.** In all three locales, `quote.soldBy` and `terms.seller` say `{seller}` where they said `{address}`. `privacy.draft` says `{legalName}` where it said `{brand} Sdn Bhd`.
- [ ] **Step 4: Change `getDictionary`.**
  - It awaits `getCompany()`.
  - `branded()` fills `brand`, `legalName` and `orderPrefix`.
  - The two seller strings are filled with `{ seller: sellerLine(company), email: company.contactEmail, phone: company.phone }`, next to the existing `common.brand` and `landing.footer.email` overrides.
  - The memo is keyed by the locale plus the JSON of those facts. Mark it `ponytail:`: it grows by one entry per locale per save in a warm instance.
- [ ] **Step 5: Update the pages.**
  - `QuoteScreen.tsx` renders `t.quote.soldBy` as is, and drops the `carriers` import.
  - The terms page uses `s.seller`, drops the `carriers` import, and its docblock now points to `/admin/company`.
  - `error.tsx`: each `COPY` entry gains `home` (`"Home"`, `"首页"`, `"Laman utama"`); the link shows `t.home`; the `tenant` import goes.
- [ ] **Step 6: Run** `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 7: Commit:** `git add -A src`, then `git commit -m "feat(company): customer pages print the saved company"`

---

### Task 6: Carrier adapters read the job, not constants

**Files:**
- Modify: `src/lib/logistics/types.ts` (`DeliveryJob`), `src/lib/logistics/store.ts` (`toJob`), `src/app/api/admin/deliveries/[id]/quotes/route.ts`, `src/app/api/admin/deliveries/[id]/book/route.ts`, `src/lib/logistics/adapters/lalamove.ts`, `easyparcel.ts`, `fedex.ts`, `gdex.ts`
- Test: `src/lib/logistics/__tests__/lalamove.test.ts`, `easyparcel.test.ts`, `fedex.test.ts`, `gdex.test.ts`; create `src/lib/logistics/__tests__/toJob.test.ts`

**Interfaces:**
- Consumes: `CompanyDetails` (Task 1), `getCompany` (Task 3), `deliveryRef` (Task 4).
- Produces:
  - `DeliveryJob` gains `ref: string` and `sender: { brand: string; legalName: string; phone: string; closeTime: string }`
  - `toJob(row: Delivery, company: CompanyDetails): DeliveryJob` — `ref: deliveryRef(row)`; `sender` taken from the company (live, so a rename or a new phone reaches every unbooked job)
  - `gdexSenderPostcode(): Promise<string | null>` exported from `adapters/gdex.ts` — the GDEX profile's `PostalCode`, or null when GDEX does not answer

- [ ] **Step 1: Update the four test fixtures.**
  - Each `job()` gains `ref: "IC-00007"` and `sender: { brand: "EzCabinet", legalName: "EzCabinet Sdn Bhd", phone: "03-1234 5678", closeTime: "18:00" }`.
  - Each gets a stored pickup place, `pickupPostcode: "43800", pickupCity: "Dengkil", pickupState: "MY-10"`, wherever it relied on the workshop fallback. The easyparcel test drops its `WORKSHOP_ADDRESS` import and uses a literal pickup address.
- [ ] **Step 2: Write the failing tests:**
  - lalamove: with `sender: { brand: "Kabinet Baru", phone: "03-5555 1234", … }`, `orderBody(...).data.sender` is `{ stopId, name: "Kabinet Baru", phone: "+60355551234" }`.
  - easyparcel: `submitBody` sender has `name` and `company` from `job.sender`, the phone from `job.sender.phone`, and `address_1` = `job.pickupAddress`. A job whose `pickupPostcode` and `pickupState` are null is refused with `EasyParcelNotDeliverable`, even when its pickup address is the seed workshop string — there is no fallback any more. `cancel` sends `remark: "Cancelled by Kabinet Baru"` when `getCompany` (mocked) answers that brand.
  - fedex: `shipBody(...).requestedShipment.shipper.contact.companyName` = `job.sender.legalName`; `pickupBody(...).originDetail.customerCloseTime` = `"17:30:00"` for `closeTime: "17:30"`; a job with a null `pickupPostcode` throws `FedexNotDeliverable`.
  - gdex: `consignmentBody(job({ ref: "PO-00007" }), sender).Consignments[0].OrderId` = `"PO-00007"`. `gdexSenderPostcode()` resolves to the profile `PostalCode` from the mocked `GetUserDetails` reply, and to `null` when that call rejects.
  - `toJob.test.ts`: mock `@/lib/catalogue/db` and `@/lib/whatsapp/outbox`. `toJob(row, testCompany({ phone: "03-5555 1234" }))` gives `ref: "IC-00007"` (for `refPrefix: "IC", number: 7`) and `sender.phone: "03-5555 1234"`.
- [ ] **Step 3: Run** `pnpm vitest run src/lib/logistics`. Expected: FAIL.
- [ ] **Step 4: Implement.**
  - The adapters read `job.sender` and the job's own `pickupPostcode/City/State`. Delete `senderPlace`'s and `pickupPlaceOf`'s calls to `pickupPlace`, `SHIPPER_NAME`, and the adapters' `tenant` and `WORKSHOP_*` imports.
  - The FedEx close time is `` `${job.sender.closeTime}:00` ``.
  - easyparcel `cancel` reads `(await getCompany()).brand`.
  - The quotes and book routes call `toJob(delivery, await getCompany())`.
  - Update docblocks that cite `pickupPlace` or the workshop fallback: the job now carries its own place (Task 7 writes it).
- [ ] **Step 5: Run** `pnpm vitest run src/lib/logistics && pnpm typecheck`. Expected: PASS. `carriers.ts` still exports its constants until Task 7; nothing in the adapters uses them.
- [ ] **Step 6: Commit:** `git add -A src`, then `git commit -m "feat(company): carriers send the saved company and the job's own pickup"`

---

### Task 7: A delivery records where it leaves from

**Files:**
- Modify: `src/lib/logistics/carriers.ts`, `src/app/api/admin/deliveries/route.ts`, `src/app/api/admin/deliveries/[id]/route.ts`, `src/app/api/admin/deliveries/[id]/split/route.ts`, `src/app/admin/logistics/page.tsx`
- Test: `src/lib/logistics/__tests__/carriers.test.ts` (rewrite the pickup blocks), `src/app/api/admin/deliveries/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `CompanyDetails` (Task 1), `getCompany` (Task 3).
- Produces, from `@/lib/logistics/carriers` (still isomorphic; the `CompanyDetails` import is type-only):
  - `type PickupColumns = { pickupAddress: string; pickupLat: number; pickupLng: number; pickupGeocodedFor: string; pickupPostcode: string; pickupCity: string; pickupState: string }`
  - `type Workshop = Pick<CompanyDetails, "address" | "lat" | "lng" | "postcode" | "city" | "state">`
  - `workshopColumns(workshop: Workshop): PickupColumns`
  - `workshopPickup(address: string, given: { lat: number; lng: number } | null, workshop: Workshop): PickupColumns | null` — the workshop's columns when the trimmed address is the workshop's and no pin was typed; null otherwise
- Removes: `WORKSHOP_ADDRESS`, `WORKSHOP_PIN`, `WORKSHOP_POSTCODE`, `WORKSHOP_CITY`, `WORKSHOP_STATE`, `WORKSHOP_PHONE`, `WORKSHOP_CLOSE_TIME`, `pickupPin`, `pickupPlace`, `Place`, and the `tenant` import.

- [ ] **Step 1: Write the failing tests.**

`carriers.test.ts`, replacing the `pickupPin`/`pickupPlace` blocks:

```ts
const workshop = testCompany();
describe("workshopPickup", () => {
	it("gives the workshop's own pin and place when the job leaves from the workshop", () =>
		expect(workshopPickup(` ${workshop.address} `, null, workshop)).toEqual({
			pickupAddress: workshop.address,
			pickupLat: workshop.lat,
			pickupLng: workshop.lng,
			pickupGeocodedFor: workshop.address,
			pickupPostcode: "43800",
			pickupCity: "Dengkil",
			pickupState: "MY-10",
		}));
	it("is null for any other address", () =>
		expect(
			workshopPickup("12 Jalan Setia, Shah Alam", null, workshop),
		).toBeNull());
	it("is null when the admin typed a pin, even at the workshop's address", () =>
		expect(
			workshopPickup(workshop.address, { lat: 3.1, lng: 101.6 }, workshop),
		).toBeNull());
});
```

`deliveries/__tests__/route.test.ts`, with `getCompany` mocked to `testCompany()`:
- `it("writes the workshop's pickup without geocoding it")`: posting `pickupAddress: testCompany().address` creates with `fromWorkshop: true` and `pickupLat: testCompany().lat`. `resolveCoordinates` is called once (the site only).
- `it("geocodes any other pickup and does not mark it from the workshop")`: the existing body (`"Workshop, Klang"`) creates with `fromWorkshop: false`.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/logistics/__tests__/carriers.test.ts src/app/api/admin/deliveries`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Create: `const company = await getCompany()` and `const given = pinFor(pickupLat, pickupLng, rest.pickupAddress)`. With `workshop = workshopPickup(rest.pickupAddress, given, company)`, the pickup is `workshop ?? <columns from resolveCoordinates(…, blank, given)>`, and `fromWorkshop: workshop !== null`.
  - Edit (PATCH): the same, with `existing` seeding `resolveCoordinates`.
  - Split: both halves copy `fromWorkshop`.
  - `GET /api/admin/deliveries` returns `workshopAddress: company.address`; the logistics page passes `company.address` to `LogisticsManager` and `formFromOrder`.
  - Delete the removed exports. Rewrite the `carriers.ts` docblocks: the workshop is the company's (`/admin/company`), and a job leaving from it carries its pin and place, so nothing matches address strings at quote time.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: PASS. `grep -rn "WORKSHOP_\|pickupPin\|pickupPlace" src` finds only the mail layout, terms and passkey mail readers left for Task 8. If anything else turns up, fix it in this task.
- [ ] **Step 5: Commit:** `git add -A src`, then `git commit -m "feat(company): a delivery from the workshop carries the workshop's pin and place"`

---

### Task 8: Mail reads the saved company

**Files:**
- Modify: `src/lib/email/copy.ts`, `src/lib/email/layout.ts`, `src/lib/email/templates/{order,signInCode,staffInvite,staffReset,passkeyChange}.ts`, `src/lib/email/orderMail.ts`, `src/lib/auth/{emailCodeMail,passkeyMail,inviteMail,passwordReset}.ts`, `src/lib/orders/payment.ts`, `src/app/[lang]/(account)/order/[token]/page.tsx`
- Test: `src/lib/email/__tests__/{layout,accountTemplates,orderTemplate,orderMail,copy}.test.ts`, `src/lib/auth/__tests__/{passkeyMail,emailCodeMail,inviteMail,passwordReset}.test.ts`

**Interfaces:**
- Consumes: `CompanyDetails`, `sellerLine` (Task 1); `getCompany` (Task 3); `orderRef(order)` (Task 4).
- Produces:
  - `type MailCompany = Pick<CompanyDetails, "brand" | "legalName" | "ssmNumber" | "address" | "phone">`, exported from `lib/email/layout.ts`; `EmailContent` gains `company: MailCompany`
  - Every template's input gains `company` (`MailCompany`; `orderEmail` takes `CompanyDetails`, for the bank)
  - `paymentInstructions(order: { refPrefix: string | null; number: number; createdAt: Date | string; totalRm: number }, company: CompanyDetails): PaymentInstructions`
  - `export function when(at: Date): string` from `lib/auth/passkeyMail.ts` (made public for Task 12)
- Removes: `BRAND` (copy.ts), `BANK_TRANSFER` (payment.ts)

- [ ] **Step 1: Write the failing tests.**
  - `layout.test.ts`: `base` gains `company: testCompany({ brand: "Kabinet Baru", ssmNumber: "202301012345" })`. New: `it("wears the company's name, seller line and phone")` — the html contains `>Kabinet Baru<` and `>K<` (the logo letter); both html and text contain `sellerLine(company)`; for `about: "order"` both contain `company.phone`.
  - `accountTemplates.test.ts`: each call passes `company: testCompany()`; subjects stay `"Reset your EzCabinet admin password"` and so on. Add one case with `brand: "Kabinet Baru"` showing it in the `staffInvite` subject.
  - `orderTemplate.test.ts`: the input gains `company: testCompany({ bankName: "CIMB", bankAccountNumber: "8000111222" })`. `ORDER_PLACED` (manual, unpaid) text contains `CIMB` and `8000111222`.
  - `passkeyMail.test.ts` and `emailCodeMail.test.ts`: mock `@/lib/company/store` (`getCompany` → `testCompany({ brand: "Kabinet Baru", phone: "03-5555 1234" })`). The passkey mail with no sales number says `call Kabinet Baru on 03-5555 1234`; the code mail's subject is `Your Kabinet Baru sign-in code`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/email src/lib/auth`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `copy.ts` strings say `{brand}` where they interpolated `BRAND`. Templates fill `{ brand: company.brand }` alongside their own values, and `orderEmail`'s `vars` spread `{ bank: company.bankName, accountName: company.bankAccountName, accountNumber: company.bankAccountNumber }` where they spread `BANK_TRANSFER`.
  - `renderEmail` takes everything company-shaped from `content.company`.
  - Each server caller does `const company = await getCompany()` and passes it on.
  - The order page passes `await getCompany()` to `paymentInstructions`.
  - `copy.test.ts` keeps its token-parity check across locales.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: PASS. `grep -rn "WORKSHOP_\|BANK_TRANSFER\|BRAND\b" src` returns nothing.
- [ ] **Step 5: Commit:** `git add -A src`, then `git commit -m "feat(company): every mail signs with the saved company"`

---

### Task 9: Admin chrome, 2FA issuer and the Stripe description

**Files:**
- Modify: `src/app/admin/AdminUserContext.tsx`, `src/app/admin/layout.tsx`, `src/components/admin/AdminHeader.tsx`, `src/app/admin/login/page.tsx`, `src/app/admin/setup-2fa/SetupTwoFactor.tsx`, `src/lib/auth.ts`, `src/lib/payments/types.ts`, `src/lib/payments/start.ts`, `src/lib/payments/stripe.ts`
- Test: `src/lib/payments/__tests__/stripe.test.ts`

**Interfaces:**
- Consumes: `getCompany` (Task 3), `seedCompany` (Task 1).
- Produces:
  - `AdminUserProvider` takes `brand: string`; `useAdminBrand(): string`
  - `PaymentOrder` gains `brand: string`

- [ ] **Step 1: Write the failing test** in `stripe.test.ts`. The start order fixture gains `brand: "Kabinet Baru"`; assert `paymentIntents.create` was called with `description: "Kabinet Baru order IC-20260826-014"`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/payments`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `start.ts` passes `brand: (await getCompany()).brand`, and `stripe.ts` uses `order.brand`.
  - `admin/layout.tsx` swaps `export const metadata` for `generateMetadata()`, titled `${brand} · Admin`, and passes `brand` to the provider.
  - `AdminHeader` and the login page read `useAdminBrand()`. The login page keeps `tenant.heroFrames`, a switch.
  - `SetupTwoFactor` sends `issuer: \`${useAdminBrand()} Admin\``in`twoFactor.enable`.
  - `auth.ts` uses `seedCompany().brand` for `rpName` and the default `issuer`, with a comment giving decision 3's reason.
- [ ] **Step 4: Run** `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add -A src`, then `git commit -m "feat(company): admin chrome, 2FA issuer and payment description use the saved name"`

---

### Task 10: Every brand the company has used stays reserved

**Files:**
- Modify: `src/lib/auth/customerName.ts`, `src/app/api/account/name/route.ts`
- Test: `src/lib/auth/__tests__/customerName.test.ts`, `src/app/api/account/name/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `getReservedBrands` (Task 3).
- Produces: `parseCustomerName(input: unknown, brands: readonly string[]): { name: string } | { error: "name_required" | "name_refused" }`. The `tenant` import and the literal `"ezcabinet"` go. `customerNameSchema` becomes `customerNameSchema(brands: readonly string[])`.

- [ ] **Step 1: Write the failing tests.**
  - Every existing `parseCustomerName(x)` becomes `parseCustomerName(x, ["EzCabinet"])`; every existing expectation holds.
  - New: `parseCustomerName("Kabinet Baru Sales", ["EzCabinet", "Kabinet Baru"])` → `{ error: "name_refused" }` (a past brand); `parseCustomerName("Ezcabinet Fan", ["JNS Nexion Enterprise"])` → `{ name: "Ezcabinet Fan" }` (never this company's name).
  - The route test mocks `@/lib/company/store`'s `getReservedBrands` → `["EzCabinet", "Kabinet Baru"]` and posts `"Kabinet Baru"` → 422 `name_refused`. Use whatever status the route already answers for `name_refused`.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/auth/__tests__/customerName.test.ts src/app/api/account`. Expected: FAIL.
- [ ] **Step 3: Implement.** The brands are folded with the existing `fold`. The docblock's "ezcabinet" sentence becomes "the current brand and every brand saved before it (`getReservedBrands`)".
- [ ] **Step 4: Run** the same files, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit:** `git add -A src`, then `git commit -m "feat(company): a customer name cannot pose as any brand the company has used"`

---

### Task 11: Saving, and moving the open deliveries with the workshop

**Files:**
- Modify: `src/lib/auth/permissions.ts`
- Create: `src/lib/company/save.ts`, `src/app/api/admin/company/route.ts`
- Test: `src/lib/auth/__tests__/permissions.test.ts`, `src/lib/auth/__tests__/coverage.test.ts`, `src/lib/company/__tests__/save.test.ts`, `src/app/api/admin/company/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `companyDetailsSchema`, `workshopMoved` (Task 1); `readCompany`, `COMPANY_CACHE_TAG` (Task 3); `workshopColumns` (Task 7).
- Produces:
  - `"company:manage"` in `PERMISSIONS` and `SUPERADMIN_ONLY`
  - From `@/lib/company/save`:
    - `type MoveJob = { id: string; number: number; status: string; customerName: string }`
    - `type MovePlan = { repoint: MoveJob[]; booked: MoveJob[] }` — `repoint`: `fromWorkshop` and `DRAFT`/`QUOTED`; `booked`: `fromWorkshop` and `BOOKED`/`DRIVER_ASSIGNED`
    - `type SaveResult = { ok: true; repointed: number } | { ok: false; error: "confirm_move"; move: MovePlan }`
    - `saveCompany(next: CompanyDetails, actor: { id: string | null; name: string }, confirmMove: boolean): Promise<SaveResult>`
  - `POST /api/admin/company`: body `{ details: <companyDetailsSchema input>, confirmMove?: boolean }` → `200 { ok: true, repointed }` | `400 { error: "invalid_body", issues }` | `409 { error: "confirm_move", move }`

- [ ] **Step 1: Write the failing tests.**

`permissions.test.ts`: `it("is the only role that manages the company")`, and the ADMIN-excludes list becomes `["users:manage", "orders:refund", "company:manage"]`.

`coverage.test.ts`: add `["company/route.ts", "POST"]` to `guarded`.

`save.test.ts`:
- Mock `@/lib/catalogue/db` with `prisma.delivery.findMany` (the plan) and `$transaction(fn)` over a `tx` that has `companyDetails.create`, `delivery.findMany`, `delivery.updateMany` and `deliveryEvent.create`.
- Mock `@/lib/company/store`'s `readCompany` and `next/cache`'s `revalidateTag` and `revalidatePath`.
- Shared setup: `prev = testCompany()`, `moved = testCompany({ address: "Lot 9, Jalan Baru, 47500 Subang Jaya, Selangor", postcode: "47500", city: "Subang Jaya", lat: 3.0757, lng: 101.5951 })`, `actor = { id: "u1", name: "Aisyah" }`.

```ts
it("saves a change that is not a move without asking, and touches no delivery", async () => {
	expect(
		await saveCompany({ ...prev, phone: "03-5555 1234" }, actor, false),
	).toEqual({ ok: true, repointed: 0 });
	expect(companyCreate).toHaveBeenCalledWith({
		data: {
			...prev,
			phone: "03-5555 1234",
			savedById: "u1",
			savedByName: "Aisyah",
		},
	});
	expect(txFindMany).not.toHaveBeenCalled();
	expect(revalidateTag).toHaveBeenCalledWith("company", { expire: 0 });
	expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
});
it("asks first when a move would touch deliveries, and writes nothing", async () => {
	planFindMany.mockResolvedValue([
		{ id: "d1", number: 41, status: "DRAFT", customerName: "Mei" },
		{ id: "d2", number: 42, status: "BOOKED", customerName: "Ali" },
	]);
	const result = await saveCompany(moved, actor, false);
	expect(result).toEqual({
		ok: false,
		error: "confirm_move",
		move: {
			repoint: [expect.objectContaining({ id: "d1" })],
			booked: [expect.objectContaining({ id: "d2" })],
		},
	});
	expect(companyCreate).not.toHaveBeenCalled();
	expect(planFindMany).toHaveBeenCalledWith(
		expect.objectContaining({
			where: {
				fromWorkshop: true,
				status: { in: ["DRAFT", "QUOTED", "BOOKED", "DRIVER_ASSIGNED"] },
			},
		}),
	);
});
it("on confirm, moves every unbooked workshop delivery with the workshop and records it", async () => {
	txFindMany.mockResolvedValue([{ id: "d1" }]);
	updateMany.mockResolvedValue({ count: 1 });
	expect(await saveCompany(moved, actor, true)).toEqual({
		ok: true,
		repointed: 1,
	});
	expect(txFindMany).toHaveBeenCalledWith({
		where: { fromWorkshop: true, status: { in: ["DRAFT", "QUOTED"] } },
		select: { id: true },
	});
	expect(updateMany).toHaveBeenCalledWith({
		where: {
			id: "d1",
			fromWorkshop: true,
			status: { in: ["DRAFT", "QUOTED"] },
		},
		data: workshopColumns(moved),
	});
	expect(eventCreate).toHaveBeenCalledWith({
		data: {
			deliveryId: "d1",
			source: "ADMIN",
			actor: "Aisyah",
			message: `Pickup moved with the workshop: ${prev.address} → ${moved.address}`,
		},
	});
});
it("leaves a delivery booked between the question and the save where it is", async () => {
	txFindMany.mockResolvedValue([{ id: "d1" }]);
	updateMany.mockResolvedValue({ count: 0 });
	expect(await saveCompany(moved, actor, true)).toEqual({
		ok: true,
		repointed: 0,
	});
	expect(eventCreate).not.toHaveBeenCalled();
});
it("moves without asking when no delivery is affected", async () => {
	planFindMany.mockResolvedValue([]);
	txFindMany.mockResolvedValue([]);
	expect(await saveCompany(moved, actor, false)).toEqual({
		ok: true,
		repointed: 0,
	});
	expect(companyCreate).toHaveBeenCalled();
});
```

`route.test.ts`:
- Mock `requireAuth` the way `deliveries/__tests__/route.test.ts` does, and mock `saveCompany`. A superadmin with `passkeyVerifiedAt` = now.
- `400 invalid_body` for `{ details: { ...testCompany(), lat: 101.86, lng: 2.98 } }`.
- `409` passes `move` through.
- `200` calls `saveCompany(parsedDetails, { id: "u1", name: "Aisyah" }, true)`.
- `BYPASS_USER` saves with `id: null`.

- [ ] **Step 2: Run** `pnpm vitest run src/lib/auth/__tests__/permissions.test.ts src/lib/auth/__tests__/coverage.test.ts src/lib/company src/app/api/admin/company`. Expected: FAIL.
- [ ] **Step 3: Implement `save.ts`.**
  - Read `previous` with `readCompany()`.
  - When `workshopMoved`, build the plan from one `prisma.delivery.findMany` (select `id, number, status, customerName`, ordered by `number`). If it is non-empty and not `confirmMove`, return `confirm_move`.
  - Otherwise, in one `$transaction`: create the row; when moved, find the unbooked workshop ids, then for each one a conditional `updateMany`, plus an event only when `count === 1`.
  - After commit: `revalidateTag(COMPANY_CACHE_TAG, { expire: 0 })` and `revalidatePath("/", "layout")`. The comment notes that the second is what refreshes the statically rendered landing and terms pages.
  - Docblock: the anti-goals it protects (a job quoted from one place while showing another; booked jobs left alone because the carrier already has a pickup).
- [ ] **Step 4: Implement the route.** It follows `orders/[id]/paid/route.ts`: `withAuth("company:manage", …, { stepUp: true })`, `bodySchema = z.object({ details: companyDetailsSchema, confirmMove: z.boolean().default(false) })`, and `BYPASS_USER` saves with `id: null`.
- [ ] **Step 5: Run** the Step 2 command, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit:** `git add -A src`, then `git commit -m "feat(company): save the company's details and move open deliveries with the workshop"`

---

### Task 12: A bank change is announced

**Files:**
- Create: `src/lib/email/templates/bankChange.ts`, `src/lib/company/bankMail.ts`
- Modify: `src/lib/company/save.ts`
- Test: `src/lib/email/__tests__/accountTemplates.test.ts`, `src/lib/company/__tests__/bankMail.test.ts`, `src/lib/company/__tests__/save.test.ts`

**Interfaces:**
- Consumes: `renderEmail`, `MailCompany`, `when` (Task 8); `bankChanged`, `lastFour` (Task 1).
- Produces:
  - `bankChange(input: { company: MailCompany; actorName: string; when: string; before: { bankName: string; last4: string }; after: { bankName: string; last4: string } }): { subject: string; html: string; text: string }`
  - `sendBankChange(previous: CompanyDetails, next: CompanyDetails, actorName: string, at: Date): Promise<void>`
  - `queueBankChangeMail(previous: CompanyDetails, next: CompanyDetails, actorName: string): void` — `after()`, never throws, never awaited (same shape as `queuePasskeyMail`)

- [ ] **Step 1: Write the failing tests.**
  - Template: the subject is `"The bank account for customer payments was changed"`. The text contains `Aisyah`, the `when` string, `"Maybank, account ending 6789"` and `"CIMB, account ending 1222"`. An empty `last4` reads `"no account number"`. Neither part contains the full number `562123456789`, and the html contains no `href`.
  - `bankMail.test.ts`: mock `@/lib/catalogue/db` (`user.findMany`), `@/lib/email` (`sendEmail`) and `next/server` (`after`). `sendBankChange` queries `{ where: { role: "SUPERADMIN", disabled: false }, select: { email: true } }` and calls `sendEmail` once per address returned.
  - `save.test.ts`: mock `@/lib/company/bankMail`. `queueBankChangeMail` is called with `(prev, next, "Aisyah")` when `bankAccountNumber` changes, and not when only the phone changes.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/company src/lib/email`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - The template is English, `about: "account"`, with no button, and its footnote is `"If nobody at {brand} meant to change it, sign in to the admin, put the old account back and find out who saved it."` filled with the brand. The docblock says why there is no link: the same reasoning as `passkeyMail.ts`.
  - `saveCompany` calls `queueBankChangeMail` after the commit when `bankChanged(previous, next)`.
- [ ] **Step 4: Run** `pnpm test`. Expected: PASS, including `oneLook.test.ts`.
- [ ] **Step 5: Commit:** `git add -A src`, then `git commit -m "feat(company): every superadmin hears when the bank account changes"`

---

### Task 13: The `/admin/company` page

**Files:**
- Create: `src/app/admin/company/page.tsx`, `src/app/admin/company/CompanyForm.tsx`, `src/app/admin/company/form.ts`, `src/app/api/admin/company/geocode/route.ts`
- Modify: `src/components/admin/AdminHeader.tsx` (tab)
- Test: `src/app/admin/company/__tests__/form.test.ts`, `src/app/api/admin/company/geocode/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `companyDetailsSchema`, `mapsLink` (Task 1); `readCompany` (Task 3); `gdexSenderPostcode`, `gdexAdapter` (Task 6); `MovePlan` (Task 11); `fetchGuarded` and `ConfirmDialog` (existing); `geocodeAddress`, `refreshGeocoderHealth`, `geocoderFault` (existing); `parseCoords` (existing).
- Produces, from `src/app/admin/company/form.ts` (pure):
  - `readPin(text: string): { ok: true; lat: number; lng: number } | { ok: false; message: string }`
  - `fieldErrors(error: z.ZodError): Partial<Record<keyof CompanyDetails, string>>` — the first issue per field, worded from `FIELD_MESSAGES`
  - `type GdexNotice = null | { kind: "reminder" } | { kind: "mismatch"; gdexPostcode: string } | { kind: "unchecked" }`
  - `gdexNotice(configured: boolean, gdexPostcode: string | null, savedPostcode: string): GdexNotice`
- `POST /api/admin/company/geocode`: body `{ address: string }` → `{ found: GeocodeResult | null, fault: string | null }`, gated by `withAuth("company:manage", …)`. No step-up: it only reads.

Field messages (exact copy):

| Field             | Message                                        |
| ----------------- | ---------------------------------------------- |
| brand             | Between 2 and 60 characters.                   |
| legalName         | Enter the registered company name.             |
| ssmNumber         | Up to 40 characters.                           |
| contactEmail      | Enter an email address.                        |
| phone             | Enter a Malaysian number a courier can call.   |
| address           | Enter the full address, as on your letterhead. |
| postcode          | Five digits.                                   |
| city              | Enter the town.                                |
| state             | Choose a state.                                |
| lat, lng          | The pin must be inside Malaysia.               |
| closeTime         | Use 24-hour time, like 18:00.                  |
| bankName          | Enter the bank's name.                         |
| bankAccountName   | Enter the name on the account.                 |
| bankAccountNumber | Digits only. Spaces and dashes are fine.       |
| orderPrefix       | One to five letters or digits.                 |
- [ ] **Step 1: Write the failing tests.**

`form.test.ts`:

```ts
describe("readPin", () => {
	it("reads latitude, longitude", () =>
		expect(readPin("2.98489, 101.86181")).toEqual({
			ok: true,
			lat: 2.98489,
			lng: 101.86181,
		}));
	it("reads a full Google Maps link", () =>
		expect(
			readPin(
				"https://www.google.com/maps/place/X/@2.9,101.8,17z/data=!3d2.9848868!4d101.861807",
			),
		).toMatchObject({ ok: true, lat: 2.9848868 }));
	it("explains a short link instead of failing silently", () =>
		expect(readPin("https://maps.app.goo.gl/abc123")).toEqual({
			ok: false,
			message:
				"That is a short link. Open it, then copy the full address from the browser bar.",
		}));
	it("asks for a pin when the box is empty", () =>
		expect(readPin(" ")).toEqual({
			ok: false,
			message:
				"Enter the pin as latitude, longitude, or paste a Google Maps link.",
		}));
	it("says what it could not read", () =>
		expect(readPin("near the mamak")).toEqual({
			ok: false,
			message:
				"Could not read a pin from that. Use latitude, longitude, like 2.98489, 101.86181.",
		}));
});
describe("fieldErrors", () => {
	it("words each failing field once", () => {
		const parsed = companyDetailsSchema.safeParse({
			...testCompany(),
			ssmNumber: "",
			postcode: "4380",
			lat: 101.8,
		});
		expect(parsed.success).toBe(false);
		if (!parsed.success)
			expect(fieldErrors(parsed.error)).toEqual({
				postcode: "Five digits.",
				lat: "The pin must be inside Malaysia.",
			});
	});
});
describe("gdexNotice", () => {
	it("says nothing when GDEX is not set up", () =>
		expect(gdexNotice(false, null, "43800")).toBeNull());
	it("still renders when GDEX did not answer", () =>
		expect(gdexNotice(true, null, "43800")).toEqual({ kind: "unchecked" }));
	it("warns when GDEX would collect from another postcode", () =>
		expect(gdexNotice(true, "43900", "43800")).toEqual({
			kind: "mismatch",
			gdexPostcode: "43900",
		}));
	it("only reminds when they agree", () =>
		expect(gdexNotice(true, "43800", "43800")).toEqual({ kind: "reminder" }));
});
```

`geocode/__tests__/route.test.ts`, with `requireAuth` mocked as in the other admin route tests and `@/lib/logistics/geocode` mocked: a superadmin posting `{ address: "Lot 5, Jalan Kilang 2, Dengkil" }` gets `{ found, fault: null }` with `geocodeAddress` called on the trimmed address; an empty address gets 400.
- [ ] **Step 2: Run** `pnpm vitest run src/app/admin/company src/app/api/admin/company`. Expected: FAIL.
- [ ] **Step 3: Implement `form.ts` and the geocode route.**
- [ ] **Step 4: Implement the page.**
  - `requirePage("company:manage")` and `readCompany()`.
  - The GDEX notice: `gdexAdapter.isConfigured()`, then `gdexSenderPostcode()`.
  - Geocoder health: `refreshGeocoderHealth()` and `geocoderFault()`.
  - Header `<AdminHeader trail={[{ label: "Admin" }, { label: "Company" }]} />`, in the layout of `users/page.tsx` (`max-w-[960px]`).
  - Heading `Company details`. Subline: `What customers, couriers and mail see. Changes show everywhere on the next page load.`
  - Under the heading, from `savedAt`: `Last changed by {savedByName} on {Malaysia date and time}`; with no save yet, `Not saved yet. These are the starting values from setup — check each one and save.`
- [ ] **Step 5: Implement `CompanyForm.tsx`** (client, `"use client"`), in four sections:
  - **Company:** brand, legal name, SSM number (hint `Optional. Shown to customers when set.`), contact email, phone (hint `Couriers ring this from the loading bay, and mail says to call it.`).
  - **Workshop:**
    - Address with a **Find on map** button. The button posts to the geocode route and fills postcode, city, state and the pin text (`lat, lng`); everything stays editable. When `found` is null, it shows `fault` or `Google could not place that address. Type the pin, or paste a Google Maps link.`
    - Postcode, city, a state `<select>` over `MALAYSIAN_STATES`.
    - Pin text, read with `readPin` on change, with an **Open in Google Maps** link (`mapsLink`) shown whenever it reads.
    - Courier close time (`<input type="time">`).
    - The GDEX notice:
      - reminder: `GDEX collects from the address on your GDEX account. Change it there too.`
      - mismatch: `GDEX's account says postcode {gdexPostcode}, but the workshop here is {postcode}. GDEX will collect from its own — update the GDEX account.`
      - unchecked: `Could not reach GDEX to compare its pickup address. Check the GDEX account by hand.`
  - **Bank transfer:** bank name, account name, account number (hint `Customers paying by transfer see this. Every superadmin is emailed when it changes.`).
  - **Orders:** order prefix (hint `New orders only. Orders already placed keep their number.` with a live example `{prefix}-20261022-001`).
- [ ] **Step 6: Wire saving in the form.**
  - On save, run `companyDetailsSchema.safeParse` on the form values. On failure, show `fieldErrors` under each field and stop.
  - Otherwise `fetchGuarded("/api/admin/company", POST { details, confirmMove: false })`.
  - On `409 confirm_move`, open `ConfirmDialog` with `stepUp`:
    - Title `Move the workshop?`
    - Body: `These deliveries are not booked yet and will be collected from the new address:` with `#{number} {customerName}` per job. Then, if any are booked: `Already booked — the courier still has the old address. Rebook or phone these in:` with the same rows.
    - Confirm label `Move and save`.
    - `run` re-posts with `confirmMove: true`.
  - On 200: `router.refresh()` and a line `Saved.`, plus `{n} deliveries now leave from the new address.` when `repointed > 0`.
  - On a string from `fetchGuarded`: show it.
- [ ] **Step 7: Add the tab.** `SUPERADMIN_TABS` gets `{ label: "Company", href: "/admin/company" }`, before People.
- [ ] **Step 8: Run** `pnpm test && pnpm typecheck && pnpm lint`. Expected: PASS.
- [ ] **Step 9: Check it in the browser.** Use the `run` skill: `pnpm dev`, signed in as the seeded superadmin, with `GOOGLE_GEOCODING_API_KEY` set or unset.
  - Change only the phone → saves with no dialog; the landing footer and `/en/terms` show the new phone after a reload.
  - Create a delivery from the workshop on `/admin/logistics`, then change the address → the dialog lists it → confirm → the delivery shows the new pickup and a "Pickup moved with the workshop" event.
  - Type `101.86, 2.98` as the pin → refused under the pin field.
  - Set the order prefix to `po` → saved as `PO`; place an order → `PO-…`; an older order still reads `IC-…`.
- [ ] **Step 10: Commit:** `git add -A src`, then `git commit -m "feat(company): /admin/company, where a superadmin edits the company"`

---

### Task 14: The guard test, and the docs that described constants

**Files:**
- Create: `src/lib/company/__tests__/noCompanyConstants.test.ts`
- Modify: `CLAUDE.md`, `docs/superpowers/plans/2026-10-11-multi-company-rollout.md`, `docs/superpowers/specs/2026-10-19-company-details-design.md` (status line)

**Interfaces:** none new.
- [ ] **Step 1: Write the guard test.** Walk `src` (not `__tests__`, not `src/generated`):
  - The files that import `@/lib/tenant` are exactly `["src/app/admin/login/page.tsx", "src/lib/company/details.ts", "src/lib/finishPhotos.ts"]`. The login page and `finishPhotos` read switches; `details.ts` reads the seed.
  - No file matches `/WORKSHOP_[A-Z]+|BANK_TRANSFER/`.
  - The `it` message says why: a company fact read from code is one EzCabinet cannot change.
- [ ] **Step 2: Run** `pnpm vitest run src/lib/company/__tests__/noCompanyConstants.test.ts`. Expected: PASS. If anything is listed, move that reader to `getCompany()` in this task.
- [ ] **Step 3: Update `CLAUDE.md`.**
  - Status: `/admin/company` is built.
  - Directory layout: `lib/company/` (`details.ts`, `store.ts`, `save.ts`, `bankMail.ts`).
  - Auth: "ten permissions" → eleven; `company:manage` joins the superadmin-only and step-up lists.
  - The 3D section's `WORKSHOP_PIN` mentions, if any.
  - Open questions: the workshop address/phone/postcode/close-time entry and the `BANK_TRANSFER` mentions (the gateway entry, the terms entry, "Order emails print placeholders") change from "placeholder in code" to "EzCabinet enters it at `/admin/company`".
  - Accepted limits: the passkey `rpName` reads the seed brand (decision 3), and a `null` `refPrefix` reads as the seed prefix (decision 1).
- [ ] **Step 4: Amend Phase 2 of the rollout plan.** "Point `WORKSHOP_*` and `BANK_TRANSFER` at the tenant file" is replaced: those fields left the tenant file for `/admin/company`; the tenant file seeds them for a new company's first run.
- [ ] **Step 5: Mark the spec built.** Its status line reads `Status: built 2026-10-xx (plan docs/superpowers/plans/2026-10-21-company-details.md).`
- [ ] **Step 6: Run** `pnpm lint && pnpm typecheck && pnpm test`. Expected: all PASS.
- [ ] **Step 7: Commit:** `git add -A`, then `git commit -m "docs(company): company details are edited at /admin/company, not in code"`
