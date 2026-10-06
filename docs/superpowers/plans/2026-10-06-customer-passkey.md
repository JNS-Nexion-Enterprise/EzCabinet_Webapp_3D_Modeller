# Customer passkey after Google sign-in — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer's Google account alone no longer opens their orders or places one: after Google sign-in the customer must also pass a passkey registered to the account.

**Architecture:** Better Auth's `@better-auth/passkey` plugin stores passkeys and runs WebAuthn. A boolean on the session row, `passkeyVerified`, is set only by a successful passkey ceremony; `AuthUser.mustVerifyPasskey` is derived from it on every read and enforced where customer surfaces already read the viewer (`viewerOf`, `POST /api/orders`, the pay route). Global Better Auth hooks close the plugin's default openings: an unverified session may register only the account's first passkey, may never delete one, and a passkey ceremony never signs in an account other than the one already signed in with Google.

**Tech Stack:** Next.js 16 App Router, Better Auth 1.7.5, `@better-auth/passkey@1.7.5` (new; brings `@simplewebauthn/server` and `/browser`), Prisma 7 + Postgres, Vitest 4, Biome, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-06-customer-passkey-design.md`

**Base:** `feature/development` at `b3d794c` (staff 2FA already merged into this branch: `AuthUser.mustSetupTwoFactor`, `lib/auth/twoFactor.ts`, `lib/auth/resetTwoFactor.ts`, `lib/auth/userRow.ts`, `UsersTable` with an `ArmedButton`).

## Global Constraints

- The passkey is a mandatory second step, not an alternative sign-in. A passkey ceremony without an existing Google session for the same account is refused.
- A `CUSTOMER` session counts as signed in only when `session.passkeyVerified = true`. Applies to `/[lang]/orders`, `/[lang]/order/[token]`, an order-owned `/[lang]/track/[token]`, `POST /api/orders` and `POST /api/orders/[token]/pay`. The planner, pricing and landing pages stay anonymous.
- Exempt: staff roles, and every surface when `AUTH_ENABLED=false` (local only).
- Register (`/passkey/generate-register-options`, `/passkey/verify-registration`): allowed only when the account has zero passkeys, or the session is verified.
- Delete and rename: only when the session is verified. Delete is refused for the account's last passkey.
- Recovery is a staff reset only. No recovery codes, no self-service re-enrolment through Google.
- A customer may register several passkeys.
- Migrations are hand-written (CLAUDE.md Known issue 12) and verified with `prisma migrate diff`.
- Every handler under `src/app/api/admin` is `export const METHOD = withAuth(...)`.
- Customer-facing copy lives in `src/lib/copy/{en,zh,ms}.ts`, all three, sentence case. `zh` and `ms` are typed against `Dictionary`, so a missing key fails typecheck.
- Telemetry: no credential ids, names or anything typed in an event payload.
- Commit messages end with the attribution lines used in this session.

## Review Focus

1. **A customer opens the order link inside WhatsApp's in-app browser** — no WebAuthn there. They must see "open this page in Chrome or Safari", not a dead button or a spinner. Pinned in Task 4 (`passkeySupport` test) and Task 8.
2. **Someone holding the Google account but not the passkey** tries to add their own passkey, or delete the real one, by calling `/api/auth/passkey/*` directly. Both refused. Pinned in Task 2 (`checkPasskeyRequest` tests) and Task 8.
3. **A passkey belonging to account B is presented while signed in to Google as account A** (shared family device). It must not switch the browser to account B, nor mark A verified. Pinned in Task 2 (`assertPasskeyOwner` test) and Task 8.
4. **The customer cancels the browser's passkey prompt, or it times out.** They stay on the verify page with a retry, not an error page; the planner draft is untouched. Pinned in Task 4 (hand check) and Task 8.
5. **`?next=` on the verify page is attacker-supplied** (`//evil.example`, `https://…`, `/\evil`). Only a same-site path is followed. Pinned in Task 4 (`safeCustomerNext` test).

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/auth/passkeyRules.ts` (new) | Pure rules: who owes a passkey check; what a session may do to passkeys |
| `src/lib/auth/passkeyHooks.ts` (new) | Server glue between Better Auth and the rules: request guard, owner check, session stamps |
| `prisma/schema.prisma`, `prisma/migrations/20261006020000_customer_passkey/` | `passkey` table, `session.passkeyVerified` |
| `src/lib/auth.ts`, `src/lib/auth/client.ts` | Plugin and hook wiring |
| `src/lib/auth/session.ts`, `src/lib/orders/access.ts`, `src/app/api/orders/route.ts`, `src/app/api/orders/[token]/pay/route.ts` | The derived flag and its enforcement |
| `src/app/[lang]/verify/` (new) | Enrol-or-prompt screen |
| `src/app/[lang]/(account)/passkeys/` (new) | List, add, rename, remove |
| `src/lib/auth/resetPasskeys.ts` (new), `src/app/api/admin/users/[id]/reset-passkey/route.ts` (new) | Staff reset |
| `src/lib/copy/{en,zh,ms}.ts`, `src/lib/analytics.ts` | Copy and events |

---

### Task 1: The rules

**Files:**
- Create: `src/lib/auth/passkeyRules.ts`
- Test: `src/lib/auth/__tests__/passkeyRules.test.ts`

**Interfaces:**
- Produces:
  - `needsPasskeyCheck(u: { role: Role; sessionVerified: boolean }): boolean`
  - `type PasskeyAction = "register" | "manage" | "delete" | "authenticate"`
  - `type PasskeyDecision = "allow" | "sign_in_required" | "verification_required" | "last_passkey"`
  - `passkeyDecision(s: { action: PasskeyAction; signedIn: boolean; sessionVerified: boolean; passkeyCount: number }): PasskeyDecision`

- [ ] **Step 1: Failing test**

```ts
// src/lib/auth/__tests__/passkeyRules.test.ts
import { describe, expect, it } from "vitest";
import { needsPasskeyCheck, passkeyDecision } from "@/lib/auth/passkeyRules";
import type { Role } from "@/lib/auth/permissions";

describe("needsPasskeyCheck", () => {
	const cases: [Role, boolean, boolean][] = [
		["CUSTOMER", false, true],
		["CUSTOMER", true, false],
		// Staff answer to the two-factor rule, not this one.
		["ADMIN", false, false],
		["SUPERADMIN", false, false],
	];
	it.each(cases)("%s, session verified %s → %s", (role, sessionVerified, expected) => {
		expect(needsPasskeyCheck({ role, sessionVerified })).toBe(expected);
	});
});

describe("passkeyDecision", () => {
	const base = { signedIn: true, sessionVerified: false, passkeyCount: 0 };

	it("refuses every action when nobody is signed in", () => {
		for (const action of ["register", "manage", "delete", "authenticate"] as const) {
			expect(passkeyDecision({ ...base, action, signedIn: false })).toBe("sign_in_required");
		}
	});

	it("lets a fresh account register its first passkey", () => {
		expect(passkeyDecision({ ...base, action: "register" })).toBe("allow");
	});

	it("refuses a second passkey from a session that has not passed the first", () => {
		// The attack: whoever holds the Google account adds their own passkey.
		expect(passkeyDecision({ ...base, action: "register", passkeyCount: 1 })).toBe("verification_required");
	});

	it("lets a verified session add another device", () => {
		expect(passkeyDecision({ ...base, action: "register", passkeyCount: 1, sessionVerified: true })).toBe("allow");
	});

	it("refuses rename and delete from an unverified session", () => {
		expect(passkeyDecision({ ...base, action: "manage", passkeyCount: 2 })).toBe("verification_required");
		expect(passkeyDecision({ ...base, action: "delete", passkeyCount: 2 })).toBe("verification_required");
	});

	it("refuses to delete the last passkey even when verified", () => {
		expect(passkeyDecision({ ...base, action: "delete", passkeyCount: 1, sessionVerified: true })).toBe("last_passkey");
	});

	it("lets a verified session delete one of several, and rename", () => {
		expect(passkeyDecision({ ...base, action: "delete", passkeyCount: 2, sessionVerified: true })).toBe("allow");
		expect(passkeyDecision({ ...base, action: "manage", passkeyCount: 1, sessionVerified: true })).toBe("allow");
	});

	it("lets a signed-in account answer a passkey prompt", () => {
		expect(passkeyDecision({ ...base, action: "authenticate", passkeyCount: 1 })).toBe("allow");
	});
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyRules.test.ts`
Expected: FAIL — cannot resolve `@/lib/auth/passkeyRules`.

- [ ] **Step 3: Implement**

```ts
// src/lib/auth/passkeyRules.ts
import type { Role } from "@/lib/auth/permissions";

/**
 * Whether this session still owes a passkey ceremony before it counts as a
 * signed-in customer. Staff are exempt: their second factor is the
 * authenticator code (`lib/auth/twoFactor.ts`).
 */
export function needsPasskeyCheck(u: {
	role: Role;
	sessionVerified: boolean;
}): boolean {
	return u.role === "CUSTOMER" && !u.sessionVerified;
}

export type PasskeyAction = "register" | "manage" | "delete" | "authenticate";

export type PasskeyDecision =
	| "allow"
	| "sign_in_required"
	| "verification_required"
	| "last_passkey";

/**
 * What a session may do to its account's passkeys.
 *
 * The plugin's defaults let any fresh session register another passkey and
 * any session delete one — so whoever held only the Google account could add
 * their own and verify with it. Hence: the first passkey is free (there is
 * nothing to verify against yet), every later change needs a session that
 * has already passed one, and the last passkey is never deleted because the
 * account would fall back to "first passkey is free".
 *
 * `authenticate` needs a signed-in account because the passkey is a second
 * step after Google, never a sign-in on its own.
 */
export function passkeyDecision(s: {
	action: PasskeyAction;
	signedIn: boolean;
	sessionVerified: boolean;
	passkeyCount: number;
}): PasskeyDecision {
	if (!s.signedIn) return "sign_in_required";
	if (s.action === "authenticate") return "allow";
	if (s.action === "register") {
		return s.passkeyCount === 0 || s.sessionVerified
			? "allow"
			: "verification_required";
	}
	if (!s.sessionVerified) return "verification_required";
	if (s.action === "delete" && s.passkeyCount <= 1) return "last_passkey";
	return "allow";
}
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyRules.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/passkeyRules.ts src/lib/auth/__tests__/passkeyRules.test.ts
git commit -m "feat(auth): rules for the customer passkey step"
```

---

### Task 2: Plugin, table, and the guard around it

**Files:**
- Modify: `package.json` (add `@better-auth/passkey@1.7.5`)
- Modify: `prisma/schema.prisma`; Create: `prisma/migrations/20261006020000_customer_passkey/migration.sql`
- Create: `src/lib/auth/passkeyHooks.ts`; Test: `src/lib/auth/__tests__/passkeyHooks.test.ts`
- Modify: `src/lib/auth.ts`, `src/lib/auth/client.ts`

**Interfaces:**
- Consumes: `passkeyDecision`, `PasskeyAction` (Task 1).
- Produces: `prisma.passkey`; `session.passkeyVerified: boolean | null`; `authClient.passkey.addPasskey`, `authClient.signIn.passkey`, `authClient.passkey.deletePasskey`, `authClient.passkey.updatePasskey`; from `passkeyHooks.ts`: `actionFor(path: string): PasskeyAction | null`, `checkPasskeyRequest(path: string, session: { userId: string; verified: boolean } | null): Promise<void>`, `assertPasskeyOwner(sessionUserId: string | null, credentialId: string): Promise<void>`, `markSessionVerified(token: string): Promise<void>`. Error codes thrown to the client: `PASSKEY_SIGN_IN_REQUIRED`, `PASSKEY_VERIFICATION_REQUIRED`, `PASSKEY_LAST_ONE`, `PASSKEY_NOT_YOURS`.

- [ ] **Step 1: Dependency**

```bash
pnpm add @better-auth/passkey@1.7.5
```

Pin the exact version: it must match the installed `better-auth` (its peer range is `^1.7.5`).

- [ ] **Step 2: Schema**

In `model User`, after `twoFactors`:

```prisma
  passkeys           Passkey[]
```

In `model Session`, after `userAgent`:

```prisma
  /// Set only by a passkey ceremony on this session — see `lib/auth/passkeyHooks.ts`.
  passkeyVerified Boolean? @default(false)
```

After `model TwoFactor`:

```prisma
/// Better Auth's passkey plugin (`@better-auth/passkey`). One row per device.
model Passkey {
  id           String    @id
  name         String?
  publicKey    String
  userId       String
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  credentialID String
  counter      Int
  deviceType   String
  backedUp     Boolean
  transports   String?
  createdAt    DateTime?
  aaguid       String?

  @@index([userId])
  @@index([credentialID])
  @@map("passkey")
}
```

- [ ] **Step 3: Migration, by hand**

```sql
-- prisma/migrations/20261006020000_customer_passkey/migration.sql
ALTER TABLE "session" ADD COLUMN "passkeyVerified" BOOLEAN DEFAULT false;

CREATE TABLE "passkey" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "publicKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "counter" INTEGER NOT NULL,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3),
    "aaguid" TEXT,

    CONSTRAINT "passkey_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "passkey_userId_idx" ON "passkey"("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey"("credentialID");

ALTER TABLE "passkey" ADD CONSTRAINT "passkey_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

```bash
pnpm prisma migrate deploy
pnpm prisma generate
pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Expected: the migration applies; the diff reports no difference and exits 0. Local database only.

- [ ] **Step 4: Failing test for the glue**

```ts
// src/lib/auth/__tests__/passkeyHooks.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const sessionUpdate = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		passkey: { count, findFirst },
		session: { update: sessionUpdate },
	},
}));

const { actionFor, assertPasskeyOwner, checkPasskeyRequest, markSessionVerified } =
	await import("@/lib/auth/passkeyHooks");

const code = async (run: () => Promise<unknown>) => {
	try {
		await run();
		return "allowed";
	} catch (error) {
		return (error as { body?: { code?: string } }).body?.code ?? "threw";
	}
};

describe("actionFor", () => {
	it.each([
		["/passkey/generate-register-options", "register"],
		["/passkey/verify-registration", "register"],
		["/passkey/generate-authenticate-options", "authenticate"],
		["/passkey/verify-authentication", "authenticate"],
		["/passkey/delete-passkey", "delete"],
		["/passkey/update-passkey", "manage"],
		["/passkey/list-user-passkeys", null],
		["/sign-in/social", null],
	])("%s → %s", (path, action) => {
		expect(actionFor(path)).toBe(action);
	});
});

describe("checkPasskeyRequest", () => {
	beforeEach(() => vi.clearAllMocks());
	const unverified = { userId: "u1", verified: false };
	const verified = { userId: "u1", verified: true };

	it("ignores paths that are not passkey writes, without a query", async () => {
		expect(await code(() => checkPasskeyRequest("/sign-in/social", null))).toBe("allowed");
		expect(count).not.toHaveBeenCalled();
	});

	it("refuses every passkey path when signed out", async () => {
		expect(await code(() => checkPasskeyRequest("/passkey/verify-authentication", null))).toBe("PASSKEY_SIGN_IN_REQUIRED");
		expect(await code(() => checkPasskeyRequest("/passkey/generate-register-options", null))).toBe("PASSKEY_SIGN_IN_REQUIRED");
	});

	it("lets an account with no passkey register its first", async () => {
		count.mockResolvedValue(0);
		expect(await code(() => checkPasskeyRequest("/passkey/verify-registration", unverified))).toBe("allowed");
		expect(count).toHaveBeenCalledWith({ where: { userId: "u1" } });
	});

	it("refuses a Google-only session adding a passkey beside an existing one", async () => {
		count.mockResolvedValue(1);
		expect(await code(() => checkPasskeyRequest("/passkey/generate-register-options", unverified))).toBe("PASSKEY_VERIFICATION_REQUIRED");
		expect(await code(() => checkPasskeyRequest("/passkey/verify-registration", unverified))).toBe("PASSKEY_VERIFICATION_REQUIRED");
	});

	it("refuses a Google-only session deleting or renaming", async () => {
		count.mockResolvedValue(2);
		expect(await code(() => checkPasskeyRequest("/passkey/delete-passkey", unverified))).toBe("PASSKEY_VERIFICATION_REQUIRED");
		expect(await code(() => checkPasskeyRequest("/passkey/update-passkey", unverified))).toBe("PASSKEY_VERIFICATION_REQUIRED");
	});

	it("refuses deleting the last passkey", async () => {
		count.mockResolvedValue(1);
		expect(await code(() => checkPasskeyRequest("/passkey/delete-passkey", verified))).toBe("PASSKEY_LAST_ONE");
	});

	it("lets a verified session add, rename and delete one of several", async () => {
		count.mockResolvedValue(2);
		expect(await code(() => checkPasskeyRequest("/passkey/verify-registration", verified))).toBe("allowed");
		expect(await code(() => checkPasskeyRequest("/passkey/update-passkey", verified))).toBe("allowed");
		expect(await code(() => checkPasskeyRequest("/passkey/delete-passkey", verified))).toBe("allowed");
	});
});

describe("assertPasskeyOwner", () => {
	beforeEach(() => vi.clearAllMocks());

	it("accepts a passkey that belongs to the signed-in account", async () => {
		findFirst.mockResolvedValue({ userId: "u1" });
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe("allowed");
		expect(findFirst).toHaveBeenCalledWith({ where: { credentialID: "cred" }, select: { userId: true } });
	});

	it("refuses another account's passkey — it must not switch who is signed in", async () => {
		findFirst.mockResolvedValue({ userId: "someone-else" });
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe("PASSKEY_NOT_YOURS");
	});

	it("refuses when nobody is signed in", async () => {
		findFirst.mockResolvedValue({ userId: "u1" });
		expect(await code(() => assertPasskeyOwner(null, "cred"))).toBe("PASSKEY_NOT_YOURS");
	});

	it("refuses an unknown credential", async () => {
		findFirst.mockResolvedValue(null);
		expect(await code(() => assertPasskeyOwner("u1", "cred"))).toBe("PASSKEY_NOT_YOURS");
	});
});

describe("markSessionVerified", () => {
	it("stamps exactly the session named", async () => {
		await markSessionVerified("tok");
		expect(sessionUpdate).toHaveBeenCalledWith({ where: { token: "tok" }, data: { passkeyVerified: true } });
	});
});
```

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyHooks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement the glue**

```ts
// src/lib/auth/passkeyHooks.ts
import "server-only";
import { APIError } from "better-auth/api";
import { type PasskeyAction, passkeyDecision } from "@/lib/auth/passkeyRules";
import { prisma } from "@/lib/catalogue/db";

/** The plugin's write paths. Listing passkeys needs no rule beyond a session. */
const ACTIONS: Record<string, PasskeyAction> = {
	"/passkey/generate-register-options": "register",
	"/passkey/verify-registration": "register",
	"/passkey/generate-authenticate-options": "authenticate",
	"/passkey/verify-authentication": "authenticate",
	"/passkey/delete-passkey": "delete",
	"/passkey/update-passkey": "manage",
};

export function actionFor(path: string): PasskeyAction | null {
	return ACTIONS[path] ?? null;
}

const refuse = (status: "UNAUTHORIZED" | "FORBIDDEN" | "BAD_REQUEST", code: string, message: string) =>
	new APIError(status, { code, message });

/**
 * Runs before every Better Auth request (`hooks.before` in `lib/auth.ts`)
 * and throws unless `passkeyDecision` allows it. This is the load-bearing
 * guard of the whole feature: without it, whoever holds only the Google
 * account can register their own passkey or delete the real one.
 */
export async function checkPasskeyRequest(
	path: string,
	session: { userId: string; verified: boolean } | null,
): Promise<void> {
	const action = actionFor(path);
	if (action === null) return;

	const passkeyCount = session
		? await prisma.passkey.count({ where: { userId: session.userId } })
		: 0;
	const decision = passkeyDecision({
		action,
		signedIn: session !== null,
		sessionVerified: session?.verified ?? false,
		passkeyCount,
	});
	if (decision === "sign_in_required") {
		throw refuse("UNAUTHORIZED", "PASSKEY_SIGN_IN_REQUIRED", "Sign in first");
	}
	if (decision === "verification_required") {
		throw refuse("FORBIDDEN", "PASSKEY_VERIFICATION_REQUIRED", "Confirm with an existing passkey first");
	}
	if (decision === "last_passkey") {
		throw refuse("BAD_REQUEST", "PASSKEY_LAST_ONE", "An account keeps at least one passkey");
	}
}

/**
 * The plugin signs in whoever owns the presented passkey. Here a passkey is
 * a second step for the account already signed in with Google, so a passkey
 * that belongs to anyone else is refused — on a shared family device it
 * would otherwise switch the browser to the other person's account.
 */
export async function assertPasskeyOwner(
	sessionUserId: string | null,
	credentialId: string,
): Promise<void> {
	const passkey = await prisma.passkey.findFirst({
		where: { credentialID: credentialId },
		select: { userId: true },
	});
	if (sessionUserId === null || passkey?.userId !== sessionUserId) {
		throw refuse("UNAUTHORIZED", "PASSKEY_NOT_YOURS", "That passkey is for a different account");
	}
}

/** After a successful first registration: the session that enrolled has proved possession. */
export async function markSessionVerified(token: string): Promise<void> {
	await prisma.session.update({
		where: { token },
		data: { passkeyVerified: true },
	});
}
```

Run: `pnpm vitest run src/lib/auth/__tests__/passkeyHooks.test.ts`
Expected: PASS.

- [ ] **Step 6: Wire Better Auth**

`src/lib/auth.ts` — imports:

```ts
import { passkey } from "@better-auth/passkey";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { assertPasskeyOwner, checkPasskeyRequest, markSessionVerified } from "@/lib/auth/passkeyHooks";
```

In `session:` add:

```ts
		// Set only by the hooks below, never by a request body.
		additionalFields: {
			passkeyVerified: { type: "boolean", input: false, defaultValue: false },
		},
```

In `databaseHooks.session.create`, beside the existing `after`, add a `before`:

```ts
				// A session born from a passkey ceremony is a verified one. The
				// plugin creates it with `internalAdapter.createSession`, so this
				// is the one place the flag can be set atomically with the row.
				// `ctx` is the endpoint context
				// (node_modules/better-auth/dist/db/with-hooks.mjs passes it as
				// the second argument); it is null outside a request.
				before: async (session, ctx) => {
					if (ctx?.path !== "/passkey/verify-authentication") return;
					return { data: { ...session, passkeyVerified: true } };
				},
```

Add a top-level `hooks` block (sibling of `databaseHooks`):

```ts
	hooks: {
		// Every passkey write goes through `checkPasskeyRequest` first — see
		// that function for why the plugin's defaults are not enough.
		before: createAuthMiddleware(async (ctx) => {
			if (!ctx.path.startsWith("/passkey/")) return;
			const current = await getSessionFromCtx(ctx);
			await checkPasskeyRequest(
				ctx.path,
				current
					? {
							userId: current.user.id,
							verified: current.session.passkeyVerified === true,
						}
					: null,
			);
		}),
		// Enrolling the account's first passkey is itself the proof of
		// possession, so the enrolling session becomes verified. Only on
		// success: a failed registration returns an APIError here.
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/passkey/verify-registration") return;
			if (ctx.context.returned instanceof APIError) return;
			const current = await getSessionFromCtx(ctx);
			if (current) await markSessionVerified(current.session.token);
		}),
	},
```

Replace the `plugins` line:

```ts
	// `nextCookies()` stays last: it must see the cookies every other plugin sets.
	plugins: [
		twoFactor({ issuer: "EzCabinet Admin" }),
		passkey({
			rpName: "EzCabinet",
			authentication: {
				afterVerification: async ({ ctx, clientData }) => {
					const current = await getSessionFromCtx(ctx);
					await assertPasskeyOwner(current?.user.id ?? null, clientData.id);
				},
			},
		}),
		nextCookies(),
	],
```

The relying-party id defaults to the hostname of `BETTER_AUTH_URL`, and the expected origin to the request's `Origin` header — leave both unset.

Before moving on, confirm three things in `node_modules` and note what you found in your report; if any differs, adapt the wiring to what the installed version does while keeping the behaviour:
1. `createAuthMiddleware` and `getSessionFromCtx` are exported from `better-auth/api`.
2. In an `after` hook the endpoint's result is on `ctx.context.returned`, and a thrown `APIError` appears there as an `APIError` instance (search `returned` under `node_modules/better-auth/dist/api/`).
3. `getSessionFromCtx(ctx)` inside the plugin's `afterVerification` returns the session from the request's cookie (the Google session), not the one the endpoint is about to create.

`src/lib/auth/client.ts`:

```ts
"use client";
import { passkeyClient } from "@better-auth/passkey/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Same origin, so no baseURL: the handler is mounted at /api/auth. */
export const authClient = createAuthClient({
	plugins: [twoFactorClient(), passkeyClient()],
});
```

- [ ] **Step 7: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all pass. No behaviour has changed for anyone yet: nothing reads `passkeyVerified`.

```bash
git add package.json pnpm-lock.yaml prisma/schema.prisma prisma/migrations/20261006020000_customer_passkey src/lib/auth/passkeyHooks.ts src/lib/auth/__tests__/passkeyHooks.test.ts src/lib/auth.ts src/lib/auth/client.ts
git commit -m "feat(auth): passkey plugin, table, and the guard around its write paths"
```

---

### Task 3: `mustVerifyPasskey` and where it bites

**Files:**
- Modify: `src/lib/auth/session.ts`, `src/lib/auth/requireAuth.ts` (`BYPASS_USER`), `src/lib/auth/demoCustomer.ts`
- Modify: `src/lib/orders/access.ts`, `src/app/api/orders/route.ts`, `src/app/api/orders/[token]/pay/route.ts`
- Modify: `src/components/planner/QuoteScreen.tsx`
- Modify: every test fixture typed `AuthUser`
- Test: `src/lib/auth/__tests__/session.test.ts`, `src/lib/orders/__tests__/access.test.ts`, `src/lib/auth/__tests__/coverage.test.ts`, and the existing tests beside the two routes

**Interfaces:**
- Consumes: `needsPasskeyCheck` (Task 1); `session.passkeyVerified` (Task 2).
- Produces: `AuthUser.mustVerifyPasskey: boolean`; `viewerOf` redirects an unverified customer to `/${lang}/verify?next=<path>`; `POST /api/orders` and `POST /api/orders/[token]/pay` answer `401 { error: "passkey_required" }`.

- [ ] **Step 1: Failing tests**

`src/lib/auth/__tests__/session.test.ts` — `getSession` now returns the session row too. Change every `getSession.mockResolvedValue({ user: { id: "u1" } })` to `getSession.mockResolvedValue({ user: { id: "u1" }, session: { passkeyVerified: false } })`, add `mustVerifyPasskey: false` to the expected `user` constant (the fixture is an `ADMIN`), and add:

```ts
	it("asks a customer whose session has not passed a passkey", async () => {
		getSession.mockResolvedValue({ user: { id: "u1" }, session: { passkeyVerified: false } });
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({ mustVerifyPasskey: true });
	});

	it("does not ask once the session is passkey-verified", async () => {
		getSession.mockResolvedValue({ user: { id: "u1" }, session: { passkeyVerified: true } });
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({ mustVerifyPasskey: false });
	});

	it("treats a null flag as not verified", async () => {
		getSession.mockResolvedValue({ user: { id: "u1" }, session: { passkeyVerified: null } });
		findUnique.mockResolvedValue({ ...row, role: "CUSTOMER" });
		await expect(currentUser()).resolves.toMatchObject({ mustVerifyPasskey: true });
	});

	it("never asks staff, whatever the session says", async () => {
		getSession.mockResolvedValue({ user: { id: "u1" }, session: { passkeyVerified: false } });
		findUnique.mockResolvedValue(row);
		await expect(currentUser()).resolves.toMatchObject({ mustVerifyPasskey: false });
	});
```

`src/lib/orders/__tests__/access.test.ts` — add `mustVerifyPasskey: false` to the `user()` factory's defaults, read how the existing `viewerOf` tests switch `AUTH_ENABLED` on and off, and add in the same style:

```ts
	it("sends a customer who has not passed a passkey to the verify page, and back", async () => {
		currentUser.mockResolvedValue(user({ mustVerifyPasskey: true }));
		await expect(viewerOf("en", "/en/orders")).rejects.toThrow(
			"REDIRECT:/en/verify?next=%2Fen%2Forders",
		);
	});

	it("lets a verified customer through", async () => {
		currentUser.mockResolvedValue(user({}));
		await expect(viewerOf("en", "/en/orders")).resolves.toMatchObject({ id: "u1" });
	});

	it("does not ask for a passkey with AUTH_ENABLED off", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		currentUser.mockResolvedValue(user({ mustVerifyPasskey: true }));
		await expect(viewerOf("en", "/en/orders")).resolves.toMatchObject({ id: "u1" });
	});
```

(If that file stubs `VERCEL_ENV` or `AUTH_ENABLED` differently, follow its convention; the three behaviours are what matter.)

In the existing test files for `src/app/api/orders/route.ts` and `src/app/api/orders/[token]/pay/route.ts` (find them under each route's `__tests__`), add one test each in the file's own style: with auth enabled and `currentUser` resolving a customer whose `mustVerifyPasskey` is `true`, the route answers status `401` with body `{ error: "passkey_required" }` and writes nothing (assert the mocked order create / payment start was not called). If `src/app/api/orders/route.ts` has no test file, create `src/app/api/orders/__tests__/passkey.test.ts` that mocks `botid/server`'s check, `@/lib/auth/session`, `@/lib/auth/demoCustomer` and `@/lib/catalogue/db`, and asserts only this behaviour.

Finally, so a page added to the account area next month cannot forget the gate, add to `src/lib/auth/__tests__/coverage.test.ts` (it already has a `walk` helper and `readFileSync`):

```ts
describe("every account page goes through viewerOf", () => {
	it("calls viewerOf in each page under the (account) group", async () => {
		const pages = (await walk("src/app/[lang]/(account)")).filter((f) =>
			f.endsWith("page.tsx"),
		);
		expect(pages.length).toBeGreaterThan(1);
		// `viewerOf` is the one place a signed-out visitor is sent to sign in
		// and an unverified customer to the passkey step. A page that reads
		// `currentUser()` itself skips both.
		const ungated = pages.filter(
			(file) => !/\bviewerOf\(/.test(readFileSync(file, "utf8")),
		);
		expect(ungated).toEqual([]);
	});
});
```

This one passes already (both existing pages call `viewerOf`); it is a guard for Task 5's new page and whatever follows.

Run: `pnpm vitest run src/lib/auth/__tests__/session.test.ts src/lib/orders/__tests__/access.test.ts src/app/api/orders`
Expected: FAIL on the new cases.

- [ ] **Step 2: Implement**

`src/lib/auth/session.ts`:

```ts
import { needsPasskeyCheck } from "@/lib/auth/passkeyRules";
```

Add to `AuthUser`:

```ts
	/** Derived on every read from the session row — see `needsPasskeyCheck`. */
	mustVerifyPasskey: boolean;
```

In `currentUser`, add `mustVerifyPasskey` to the returned object:

```ts
		mustVerifyPasskey: needsPasskeyCheck({
			role: user.role,
			sessionVerified: session.session.passkeyVerified === true,
		}),
```

`src/lib/auth/requireAuth.ts` `BYPASS_USER` and `src/lib/auth/demoCustomer.ts`'s returned object: add `mustVerifyPasskey: false`.

`src/lib/orders/access.ts` — in `viewerOf`, after the signed-out redirect and before `return user`:

```ts
	// A Google session alone is not a signed-in customer: the order's link
	// travels over WhatsApp, and so, sometimes, does a phone. The verify page
	// reads `currentUser()` directly, so this cannot loop.
	if (user.mustVerifyPasskey) {
		redirect(`/${lang}/verify?next=${encodeURIComponent(path)}`);
	}
```

Update the function's doc comment to say so.

`src/app/api/orders/route.ts` — directly after the `sign_in_required` block:

```ts
	// Same boundary as the order pages. `authEnabled()` keeps local checkout
	// working with AUTH_ENABLED off, where the demo customer never has one.
	if (authEnabled() && user.mustVerifyPasskey) {
		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
	}
```

(import `authEnabled` from `@/lib/auth/enabled` if the file does not already).

`src/app/api/orders/[token]/pay/route.ts` — directly after `viewer` is resolved:

```ts
	if (authEnabled() && viewer?.mustVerifyPasskey) {
		return NextResponse.json({ error: "passkey_required" }, { status: 401 });
	}
```

`src/components/planner/QuoteScreen.tsx` — directly after the `sign_in_required` branch in `placeOrder`:

```ts
			if (res?.status === 401 && body?.error === "passkey_required") {
				// Signed in with Google but not yet past the passkey. Same detour
				// as sign-in: the design is on disk and comes back on return.
				router.push(`/${locale}/verify?next=${encodeURIComponent(quoteUrl())}`);
				return;
			}
```

- [ ] **Step 3: Fix every other `AuthUser` the compiler finds**

Run: `pnpm typecheck`. Add `mustVerifyPasskey: false` to each object the compiler reports and nothing else. Expect the same files as the `mustSetupTwoFactor` change: the fixtures under `src/lib/auth/__tests__/`, `src/app/admin/change-password/__tests__/`, `src/app/api/orders/[token]/pay/__tests__/`, `src/app/[lang]/(account)/**/__tests__/`, `src/app/[lang]/track/[token]/__tests__/`, and the route tests under `src/app/api/admin/users/`.

- [ ] **Step 4: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

```bash
git add -A src
git commit -m "feat(auth): a customer session counts only after a passkey"
```

(`git add -A src` is scoped to `src/`; run `git status --short` first and confirm every path is one this task changed.)

After this commit a customer is redirected to `/[lang]/verify`, which Task 4 builds. Do not deploy between the two.

---

### Task 4: The verify screen

**Files:**
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/zh.ts`, `src/lib/copy/ms.ts`
- Modify: `src/lib/analytics.ts`
- Create: `src/lib/auth/safeCustomerNext.ts`; Test: `src/lib/auth/__tests__/safeCustomerNext.test.ts`
- Create: `src/app/[lang]/verify/passkeySupport.ts`; Test: `src/app/[lang]/verify/__tests__/passkeySupport.test.ts`
- Create: `src/app/[lang]/verify/page.tsx`, `src/app/[lang]/verify/PasskeyGate.tsx`

**Interfaces:**
- Consumes: `currentUser()` with `mustVerifyPasskey`; `prisma.passkey`; `authClient.passkey.addPasskey()`, `authClient.signIn.passkey()` — both resolve `{ data, error }`-shaped results where a truthy `error` means failure.
- Produces: `/[lang]/verify?next=`; `safeCustomerNext(next: string | undefined, lang: string): string`; `passkeysSupported(win: { PublicKeyCredential?: unknown } | undefined): boolean`; dictionary section `t.passkey`; events `passkey_enrol_started | passkey_enrol_completed | passkey_enrol_failed | passkey_verify_failed`.

- [ ] **Step 1: Failing tests for the two helpers**

```ts
// src/lib/auth/__tests__/safeCustomerNext.test.ts
import { describe, expect, it } from "vitest";
import { safeCustomerNext } from "@/lib/auth/safeCustomerNext";

describe("safeCustomerNext", () => {
	it("keeps a same-site path", () => {
		expect(safeCustomerNext("/en/order/abc", "en")).toBe("/en/order/abc");
		expect(safeCustomerNext("/ms/planner/kitchen?step=quote", "ms")).toBe("/ms/planner/kitchen?step=quote");
	});
	it.each([
		["nothing", undefined],
		["empty", ""],
		["another site", "https://evil.example/x"],
		["protocol-relative", "//evil.example/x"],
		["backslash trick", "/\\evil.example"],
		["no leading slash", "en/orders"],
		["javascript", "javascript:alert(1)"],
	])("falls back to My orders for %s", (_label, next) => {
		expect(safeCustomerNext(next, "zh")).toBe("/zh/orders");
	});
	it("never sends the customer back to the verify page itself", () => {
		expect(safeCustomerNext("/en/verify?next=/en/verify", "en")).toBe("/en/orders");
	});
});
```

```ts
// src/app/[lang]/verify/__tests__/passkeySupport.test.ts
import { describe, expect, it } from "vitest";
import { passkeysSupported } from "../passkeySupport";

describe("passkeysSupported", () => {
	it("is true where the browser exposes WebAuthn", () => {
		expect(passkeysSupported({ PublicKeyCredential: function PublicKeyCredential() {} })).toBe(true);
	});
	it("is false in an in-app browser without it", () => {
		expect(passkeysSupported({})).toBe(false);
	});
	it("is false on the server", () => {
		expect(passkeysSupported(undefined)).toBe(false);
	});
});
```

Run: `pnpm vitest run src/lib/auth/__tests__/safeCustomerNext.test.ts "src/app/[lang]/verify"`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement the helpers**

```ts
// src/lib/auth/safeCustomerNext.ts
/**
 * Where the verify page sends a customer afterwards. `next` comes from the
 * query string, so it is attacker-supplied: only a path on this site is
 * followed. `//host` and `/\host` both leave the site in a browser despite
 * starting with a slash.
 */
export function safeCustomerNext(next: string | undefined, lang: string): string {
	const fallback = `/${lang}/orders`;
	if (!next?.startsWith("/")) return fallback;
	if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
	if (/^\/[a-z-]+\/verify(\?|$|\/)/i.test(next)) return fallback;
	return next;
}
```

```ts
// src/app/[lang]/verify/passkeySupport.ts
/**
 * Whether this browser can do a passkey ceremony at all. The in-app browsers
 * a WhatsApp or Facebook link opens in usually cannot, and a button that
 * silently does nothing there is the worst outcome — the page says to open
 * the link in Chrome or Safari instead.
 */
export function passkeysSupported(
	win: { PublicKeyCredential?: unknown } | undefined,
): boolean {
	return typeof win?.PublicKeyCredential === "function";
}
```

Run the two test files again. Expected: PASS.

- [ ] **Step 3: Copy, in all three languages**

`src/lib/copy/en.ts` — add a `passkey` section after `signIn`, and `passkeys` to `account`:

```ts
	account: {
		navHeading: "Your account",
		myOrders: "My orders",
		passkeys: "Passkeys",
		signIn: "Sign in",
		signOut: "Sign out",
		menuLabel: "Account menu",
	},
```

```ts
	/** The second step after Google — see docs/superpowers/specs/2026-10-06-customer-passkey-design.md. */
	passkey: {
		heading: "One more step",
		enrolBody:
			"Set up a passkey so only you can open your orders. It uses this device's fingerprint, face or screen lock.",
		enrolButton: "Set up passkey",
		promptBody: "Confirm it's you with your passkey.",
		promptButton: "Use passkey",
		working: "Waiting for your device…",
		failed: "That didn't work. Try again",
		wrongAccount: "That passkey belongs to a different account",
		unsupported: "This browser can't use passkeys. Open this page in Chrome or Safari.",
		lostDevice: "Lost your device? Contact EzCabinet",
		listHeading: "Passkeys",
		listBody: "The devices that can confirm it's you.",
		unnamed: "Passkey",
		added: "Added {date}",
		add: "Add another device",
		rename: "Rename",
		save: "Save",
		cancel: "Cancel",
		remove: "Remove",
		removeLast: "You need at least one passkey",
		nameLabel: "Device name",
	},
```

`src/lib/copy/zh.ts` — `account.passkeys: "通行密钥"`, and:

```ts
	passkey: {
		heading: "还差一步",
		enrolBody: "设置通行密钥，确保只有您能查看订单。它使用本设备的指纹、面容或屏幕锁。",
		enrolButton: "设置通行密钥",
		promptBody: "请使用通行密钥确认是您本人。",
		promptButton: "使用通行密钥",
		working: "正在等待您的设备…",
		failed: "未能完成，请重试",
		wrongAccount: "该通行密钥属于另一个账户",
		unsupported: "此浏览器不支持通行密钥。请在 Chrome 或 Safari 中打开此页面。",
		lostDevice: "设备丢失？请联系 EzCabinet",
		listHeading: "通行密钥",
		listBody: "可用于确认您身份的设备。",
		unnamed: "通行密钥",
		added: "添加于 {date}",
		add: "添加另一台设备",
		rename: "重命名",
		save: "保存",
		cancel: "取消",
		remove: "移除",
		removeLast: "至少需要保留一个通行密钥",
		nameLabel: "设备名称",
	},
```

`src/lib/copy/ms.ts` — `account.passkeys: "Kunci laluan"`, and:

```ts
	passkey: {
		heading: "Satu langkah lagi",
		enrolBody:
			"Sediakan kunci laluan supaya hanya anda boleh membuka pesanan anda. Ia menggunakan cap jari, wajah atau kunci skrin peranti ini.",
		enrolButton: "Sediakan kunci laluan",
		promptBody: "Sahkan ini anda dengan kunci laluan anda.",
		promptButton: "Guna kunci laluan",
		working: "Menunggu peranti anda…",
		failed: "Tidak berjaya. Cuba lagi",
		wrongAccount: "Kunci laluan itu milik akaun lain",
		unsupported: "Pelayar ini tidak menyokong kunci laluan. Buka halaman ini dalam Chrome atau Safari.",
		lostDevice: "Peranti hilang? Hubungi EzCabinet",
		listHeading: "Kunci laluan",
		listBody: "Peranti yang boleh mengesahkan ini anda.",
		unnamed: "Kunci laluan",
		added: "Ditambah {date}",
		add: "Tambah peranti lain",
		rename: "Namakan semula",
		save: "Simpan",
		cancel: "Batal",
		remove: "Buang",
		removeLast: "Anda perlukan sekurang-kurangnya satu kunci laluan",
		nameLabel: "Nama peranti",
	},
```

Place each block where the file's key order puts `signIn`'s neighbours; `pnpm typecheck` fails if a language is missing a key.

`src/lib/analytics.ts` — extend the union:

```ts
	| "sign_in_nudge"
	| "passkey_enrol_started"
	| "passkey_enrol_completed"
	| "passkey_enrol_failed"
	| "passkey_verify_failed";
```

- [ ] **Step 4: The page**

```tsx
// src/app/[lang]/verify/page.tsx
import { notFound, redirect } from "next/navigation";
import { safeCustomerNext } from "@/lib/auth/safeCustomerNext";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { PasskeyGate } from "./PasskeyGate";

/** Never indexed: it exists only between Google sign-in and the page asked for. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The second step after Google. Reads `currentUser()` directly rather than
 * `viewerOf`, which redirects an unverified customer straight back here.
 */
export default async function VerifyPage({
	params,
	searchParams,
}: {
	params: Promise<{ lang: string }>;
	searchParams: Promise<{ next?: string }>;
}) {
	const [{ lang }, { next }] = await Promise.all([params, searchParams]);
	if (!isLocale(lang)) notFound();
	const target = safeCustomerNext(next, lang);

	const user = await currentUser();
	if (!user) {
		redirect(
			`/${lang}/sign-in?next=${encodeURIComponent(`/${lang}/verify?next=${encodeURIComponent(target)}`)}`,
		);
	}
	// Staff, and a customer who has already passed, have nothing to do here.
	if (!user.mustVerifyPasskey) redirect(target);

	const [t, enrolled] = await Promise.all([
		getDictionary(lang),
		prisma.passkey.count({ where: { userId: user.id } }),
	]);
	const sales = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] px-6 text-neutral-900">
			<div className="flex w-full max-w-[380px] flex-col gap-5 rounded-[14px] border border-neutral-200 bg-white px-7 py-8">
				<h1 className="font-semibold text-[22px]">{t.passkey.heading}</h1>
				<PasskeyGate
					mode={enrolled > 0 ? "prompt" : "enrol"}
					next={target}
					copy={t.passkey}
					helpHref={sales ? `https://wa.me/${sales}` : null}
				/>
			</div>
		</main>
	);
}
```

- [ ] **Step 5: The client gate**

```tsx
// src/app/[lang]/verify/PasskeyGate.tsx
"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { passkeysSupported } from "./passkeySupport";

/**
 * One button, two ceremonies. `enrol` registers the account's first passkey
 * (which is itself the proof of possession); `prompt` asks for one that
 * already exists. Either way the server marks this session verified, and a
 * full navigation follows so the next page is rendered against it.
 *
 * A cancelled or timed-out browser prompt is not an error page: the customer
 * stays here with the button live again.
 */
export function PasskeyGate({
	mode,
	next,
	copy,
	helpHref,
}: {
	mode: "enrol" | "prompt";
	next: string;
	copy: Dictionary["passkey"];
	helpHref: string | null;
}) {
	// Unknown until mounted: the server cannot see the browser's capabilities.
	const [supported, setSupported] = useState<boolean | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		setSupported(passkeysSupported(window));
	}, []);

	async function run() {
		setBusy(true);
		setError(null);
		if (mode === "enrol") track("passkey_enrol_started");
		let failure: { code?: string } | null = null;
		try {
			const result =
				mode === "enrol"
					? await authClient.passkey.addPasskey()
					: await authClient.signIn.passkey();
			failure = result?.error ?? null;
		} catch {
			// The browser's own prompt was dismissed or timed out.
			failure = {};
		}
		if (failure) {
			track(mode === "enrol" ? "passkey_enrol_failed" : "passkey_verify_failed");
			setError(
				failure.code === "PASSKEY_NOT_YOURS" ? copy.wrongAccount : copy.failed,
			);
			setBusy(false);
			return;
		}
		if (mode === "enrol") track("passkey_enrol_completed");
		window.location.assign(next);
	}

	if (supported === false) {
		return (
			<p role="alert" className="text-[14px] text-neutral-700 leading-5">
				{copy.unsupported}
			</p>
		);
	}

	return (
		<>
			<p className="text-[14px] text-neutral-500 leading-5">
				{mode === "enrol" ? copy.enrolBody : copy.promptBody}
			</p>
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
				>
					{error}.
				</p>
			)}
			<button
				type="button"
				onClick={run}
				disabled={busy || supported === null}
				className="flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
			>
				{busy && <Spinner />}
				{busy
					? copy.working
					: mode === "enrol"
						? copy.enrolButton
						: copy.promptButton}
			</button>
			{mode === "prompt" &&
				(helpHref ? (
					<a
						href={helpHref}
						className="text-center text-[12px] text-neutral-500 hover:text-neutral-900"
					>
						{copy.lostDevice}
					</a>
				) : (
					<p className="text-center text-[12px] text-neutral-500">
						{copy.lostDevice}
					</p>
				))}
		</>
	);
}
```

Read `node_modules/@better-auth/passkey/dist/client.mjs` for what `addPasskey()` and `signIn.passkey()` resolve to on success and on failure in 1.7.5 (for example whether success is `undefined` or `{ data }`, and where the error's `code` sits). Adjust the three lines that read `result` to match, and say what you found in your report. If `track`'s signature requires a second argument, pass `{}`.

- [ ] **Step 6: Check by hand**

With `AUTH_ENABLED=true`, signed in with Google as a customer in Chrome:

1. Open `/en/orders` → redirected to `/en/verify?next=%2Fen%2Forders`.
2. "Set up passkey" → the browser's passkey sheet. Cancel it → "That didn't work. Try again.", button live again.
3. Again, complete it → lands on `/en/orders`.
4. Sign out, sign in with Google, open `/en/orders` → verify page now says "Confirm it's you" → use the passkey → `/en/orders`.
5. Open `/en/verify?next=https://example.com` while verified → lands on `/en/orders`.
6. Switch the site to 中文 and Bahasa and repeat step 1: the page is translated.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add src/lib/copy src/lib/analytics.ts src/lib/auth/safeCustomerNext.ts src/lib/auth/__tests__/safeCustomerNext.test.ts "src/app/[lang]/verify"
git commit -m "feat: passkey step after Google sign-in"
```

---

### Task 5: Passkeys in the account area

**Files:**
- Create: `src/app/[lang]/(account)/passkeys/page.tsx`, `src/app/[lang]/(account)/passkeys/PasskeyList.tsx`
- Modify: `src/app/[lang]/(account)/layout.tsx` (nav item)

**Interfaces:**
- Consumes: `viewerOf` (Task 3), `t.passkey` and `t.account.passkeys` (Task 4), `authClient.passkey.addPasskey({ name })`, `authClient.passkey.updatePasskey({ id, name })`, `authClient.passkey.deletePasskey({ id })`, `authClient.signIn.passkey()`.
- Produces: `/[lang]/passkeys`.

- [ ] **Step 1: The page**

```tsx
// src/app/[lang]/(account)/passkeys/page.tsx
import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { viewerOf } from "@/lib/orders/access";
import { PasskeyList } from "./PasskeyList";

/** The devices that can pass this account's second step. */
export default async function PasskeysPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	// Redirects through sign-in and the passkey step, so whoever reaches the
	// list has already proved one of the devices on it.
	const viewer = await viewerOf(lang, `/${lang}/passkeys`);
	const [t, passkeys] = await Promise.all([
		getDictionary(lang),
		prisma.passkey.findMany({
			where: { userId: viewer.id },
			select: { id: true, name: true, createdAt: true },
			orderBy: { createdAt: "asc" },
		}),
	]);

	return (
		<section className="rounded-[14px] border border-[#e5e5e5] bg-white p-6">
			<h1 className="font-semibold text-[20px]">{t.passkey.listHeading}</h1>
			<p className="mt-1 text-[#5c574e] text-[13px]">{t.passkey.listBody}</p>
			<PasskeyList
				lang={lang}
				copy={t.passkey}
				initial={passkeys.map((p) => ({
					id: p.id,
					name: p.name,
					createdAt: p.createdAt?.toISOString() ?? null,
				}))}
			/>
		</section>
	);
}
```

- [ ] **Step 2: The list**

```tsx
// src/app/[lang]/(account)/passkeys/PasskeyList.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";

type Row = { id: string; name: string | null; createdAt: string | null };

/**
 * The server is the authority on every action here (`checkPasskeyRequest`):
 * the disabled Remove on a lone passkey is a courtesy, not the rule.
 */
export function PasskeyList({
	lang,
	copy,
	initial,
}: {
	lang: string;
	copy: Dictionary["passkey"];
	initial: Row[];
}) {
	const router = useRouter();
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [name, setName] = useState("");

	async function act(key: string, run: () => Promise<{ error?: unknown } | undefined | null>) {
		setBusy(key);
		setError(null);
		let failed = false;
		try {
			failed = Boolean((await run())?.error);
		} catch {
			failed = true;
		}
		setBusy(null);
		if (failed) {
			setError(copy.failed);
			return;
		}
		setEditing(null);
		router.refresh();
	}

	// Adding a device needs a session less than a day old (the plugin's
	// "fresh session" rule). An older one is renewed by one passkey prompt
	// on the device in hand, then the add is retried once.
	const add = () =>
		act("add", async () => {
			const first = await authClient.passkey.addPasskey();
			const code = (first as { error?: { code?: string } } | undefined)?.error?.code;
			if (code !== "SESSION_NOT_FRESH") return first;
			const again = await authClient.signIn.passkey();
			if (again?.error) return again;
			return authClient.passkey.addPasskey();
		});

	const date = (iso: string | null) =>
		iso
			? fill(copy.added, {
					date: new Date(iso).toLocaleDateString(lang, { dateStyle: "medium" }),
				})
			: "";

	return (
		<div className="mt-5 flex flex-col gap-3">
			{error && (
				<p role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm">
					{error}.
				</p>
			)}
			<ul className="divide-y divide-[#f1f0ec] rounded-[10px] border border-[#ecebe7]">
				{initial.map((p) => (
					<li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
						{editing === p.id ? (
							<form
								className="flex flex-1 items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									act(`rename:${p.id}`, () =>
										authClient.passkey.updatePasskey({ id: p.id, name: name.trim() }),
									);
								}}
							>
								<label className="sr-only" htmlFor={`name-${p.id}`}>
									{copy.nameLabel}
								</label>
								<input
									id={`name-${p.id}`}
									value={name}
									maxLength={60}
									onChange={(e) => setName(e.target.value)}
									className="min-h-[38px] flex-1 rounded-[9px] border border-[#d4d4d4] px-3 text-[13px]"
								/>
								<button type="submit" disabled={busy !== null || !name.trim()} className="font-medium text-[13px] disabled:opacity-60">
									{copy.save}
								</button>
								<button type="button" onClick={() => setEditing(null)} className="text-[#5c574e] text-[13px]">
									{copy.cancel}
								</button>
							</form>
						) : (
							<>
								<span className="min-w-0">
									<span className="block truncate font-medium text-[14px]">{p.name || copy.unnamed}</span>
									<span className="block text-[#5c574e] text-[12px]">{date(p.createdAt)}</span>
								</span>
								<span className="flex items-center gap-3 text-[13px]">
									<button
										type="button"
										disabled={busy !== null}
										onClick={() => {
											setName(p.name ?? "");
											setEditing(p.id);
										}}
										className="text-[#404040] hover:text-[#171717] disabled:opacity-60"
									>
										{copy.rename}
									</button>
									<button
										type="button"
										disabled={busy !== null || initial.length <= 1}
										title={initial.length <= 1 ? copy.removeLast : undefined}
										onClick={() => act(`remove:${p.id}`, () => authClient.passkey.deletePasskey({ id: p.id }))}
										className="text-[#7f1d1d] disabled:opacity-40"
									>
										{copy.remove}
									</button>
								</span>
							</>
						)}
					</li>
				))}
			</ul>
			<button
				type="button"
				onClick={add}
				disabled={busy !== null}
				className="flex min-h-10 items-center justify-center gap-2 self-start rounded-[9px] border border-[#d4d4d4] bg-white px-4 font-medium text-[13px] disabled:opacity-60"
			>
				{busy === "add" && <Spinner />}
				{copy.add}
			</button>
		</div>
	);
}
```

Biome may reformat long lines; run `pnpm biome check --write` on the two files. As in Task 4, match the client methods' real result shape in 1.7.5.

- [ ] **Step 3: Nav item**

`src/app/[lang]/(account)/layout.tsx` — count passkeys beside orders and add the item:

```ts
	const [orders, passkeys] = user
		? await Promise.all([
				prisma.order.count({ where: { userId: user.id } }),
				prisma.passkey.count({ where: { userId: user.id } }),
			])
		: [0, 0];
```

```tsx
							{
								href: `/${lang}/passkeys`,
								label: t.account.passkeys,
								count: passkeys,
								matches: [`/${lang}/passkeys`],
							},
```

If `src/app/[lang]/(account)/__tests__/layout.test.ts` mocks `prisma.order.count` only, add `passkey: { count }` to its mock so it keeps passing, and assert the new nav item is rendered with its count.

- [ ] **Step 4: Check by hand**

1. Verified customer → **Your account → Passkeys** shows one row; Remove is disabled with the "at least one" tooltip.
2. Rename it → the new name survives a reload.
3. Add another device (a second browser profile's authenticator, or a phone via QR) → two rows; Remove now works on either; removing one leaves the other.
4. In the console, as a Google-only (unverified) session on another browser: `fetch("/api/auth/passkey/delete-passkey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "<any id>" }) }).then(r => r.status)` → `403`.

- [ ] **Step 5: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add "src/app/[lang]/(account)"
git commit -m "feat(account): manage passkeys"
```

---

### Task 6: Staff reset

**Files:**
- Create: `src/lib/auth/resetPasskeys.ts`; Test: `src/lib/auth/__tests__/resetPasskeys.test.ts`
- Create: `src/app/api/admin/users/[id]/reset-passkey/route.ts`; Test: beside it
- Modify: `src/lib/auth/userRow.ts`, `src/app/api/admin/users/route.ts`, `src/app/admin/users/page.tsx`, `src/app/admin/users/UsersTable.tsx`

**Interfaces:**
- Produces: `resetPasskeys(userId: string): Promise<void>`; `POST /api/admin/users/[id]/reset-passkey` → `200 { ok: true }` | `404 { error: "not_found" }`; people-list rows gain `passkeyCount: number` and `recentOrders: { ref: string; phone: string }[]`.

- [ ] **Step 1: Failing test for the function**

```ts
// src/lib/auth/__tests__/resetPasskeys.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const passkeyDeleteMany = vi.hoisted(() => vi.fn(() => "passkeys"));
const sessionDeleteMany = vi.hoisted(() => vi.fn(() => "sessions"));
const $transaction = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		passkey: { deleteMany: passkeyDeleteMany },
		session: { deleteMany: sessionDeleteMany },
		$transaction,
	},
}));

const { resetPasskeys } = await import("@/lib/auth/resetPasskeys");

describe("resetPasskeys", () => {
	beforeEach(() => vi.clearAllMocks());

	it("removes every passkey and every session, in one transaction", async () => {
		await resetPasskeys("u1");
		expect(passkeyDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		// A verified session must not outlive the passkeys that verified it.
		expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
		expect($transaction).toHaveBeenCalledWith(["passkeys", "sessions"]);
	});
});
```

Run: `pnpm vitest run src/lib/auth/__tests__/resetPasskeys.test.ts` → FAIL, module not found.

- [ ] **Step 2: Implement**

```ts
// src/lib/auth/resetPasskeys.ts
import "server-only";
import { prisma } from "@/lib/catalogue/db";

/**
 * A customer lost every device that held a passkey. Their account goes back
 * to "no passkey", so the next Google sign-in enrols a new one.
 *
 * That is exactly what an attacker holding the Google account wants, which
 * is why this is a staff action and not a button on the verify page: the
 * check is a person at EzCabinet confirming who is calling (order number and
 * the phone on the order — both shown on the row).
 */
export async function resetPasskeys(userId: string): Promise<void> {
	await prisma.$transaction([
		prisma.passkey.deleteMany({ where: { userId } }),
		prisma.session.deleteMany({ where: { userId } }),
	]);
}
```

Run again → PASS.

- [ ] **Step 3: Route, test first**

```ts
// src/app/api/admin/users/[id]/reset-passkey/__tests__/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const resetPasskeys = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>("@/lib/auth/requireAuth");
	return { ...actual, requireAuth };
});
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findUnique } } }));
vi.mock("@/lib/auth/resetPasskeys", () => ({ resetPasskeys }));

const { POST } = await import("../route");
const { AuthError } = await import("@/lib/auth/requireAuth");

const superadmin = {
	id: "boss", email: "boss@x.com", name: "Boss", image: null, role: "SUPERADMIN" as const,
	disabled: false, mustChangePassword: false, mustSetupTwoFactor: false, mustVerifyPasskey: false,
};
const call = (id: string) => POST(new Request("http://x", { method: "POST" }), { params: Promise.resolve({ id }) });

describe("POST /api/admin/users/[id]/reset-passkey", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "info").mockImplementation(() => {});
	});

	it("asks for users:manage", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "c1" });
		await call("c1");
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
	});

	it("refuses without the permission and resets nothing", async () => {
		requireAuth.mockRejectedValue(new AuthError(403));
		expect((await call("c1")).status).toBe(403);
		expect(resetPasskeys).not.toHaveBeenCalled();
	});

	it("404s for a user that does not exist", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue(null);
		expect((await call("ghost")).status).toBe(404);
		expect(resetPasskeys).not.toHaveBeenCalled();
	});

	it("resets the named user and records who did it", async () => {
		requireAuth.mockResolvedValue(superadmin);
		findUnique.mockResolvedValue({ id: "c1" });
		expect((await call("c1")).status).toBe(200);
		expect(resetPasskeys).toHaveBeenCalledWith("c1");
		expect(console.info).toHaveBeenCalledWith("Passkeys reset", { actor: "boss", target: "c1" });
	});
});
```

```ts
// src/app/api/admin/users/[id]/reset-passkey/route.ts
import { NextResponse } from "next/server";
import { resetPasskeys } from "@/lib/auth/resetPasskeys";
import { withAuth } from "@/lib/auth/route";
import { prisma } from "@/lib/catalogue/db";

export const runtime = "nodejs";

/** The only way back in for a customer who lost every passkey — see `resetPasskeys`. */
export const POST = withAuth<{ params: Promise<{ id: string }> }>(
	"users:manage",
	async (_request, { params }, actor) => {
		const { id } = await params;
		const target = await prisma.user.findUnique({
			where: { id },
			select: { id: true },
		});
		if (!target) {
			return NextResponse.json({ error: "not_found" }, { status: 404 });
		}
		await resetPasskeys(target.id);
		// Ids only. The one action that removes a customer's second step leaves a trace.
		console.info("Passkeys reset", { actor: actor.id, target: target.id });
		return NextResponse.json({ ok: true });
	},
);
```

Run: `pnpm vitest run "src/app/api/admin/users/[id]/reset-passkey" src/lib/auth/__tests__/coverage.test.ts` → PASS.

- [ ] **Step 4: People list**

`src/lib/auth/userRow.ts` currently exports `HAS_PASSWORD_SELECT` and `withHasPassword`. Read it, then extend it so the page and the GET route still share one select and one mapper:

- the select also takes `_count: { select: { passkeys: true } }` and `orders: { select: { number: true, createdAt: true, customerPhone: true }, orderBy: { createdAt: "desc" }, take: 3 }` (the relation on `User` is `orders`, relation name `"OrderCustomer"`);
- the mapper also returns `passkeyCount: row._count.passkeys` and `recentOrders: row.orders.map((o) => ({ ref: orderRef(o), phone: o.customerPhone }))`, and strips `_count` and `orders` from what reaches the browser. `orderRef` is in `src/lib/orders/ref.ts`; call it the way `src/app/[lang]/(account)/orders/page.tsx` does and select whatever fields it needs.

Rename the exports to what they now are (`USER_ROW_SELECT`, `toUserRow`), update both callers, and add `src/lib/auth/__tests__/userRow.test.ts` asserting, for one input row: `hasPassword`, `passkeyCount`, `recentOrders` are present and correct, and `accounts`, `_count`, `orders` are absent.

`src/app/admin/users/UsersTable.tsx`:
- `UserRow` gains `passkeyCount: number` and `recentOrders: { ref: string; phone: string }[]`.
- A `resetPasskey(id)` handler that POSTs to `/api/admin/users/${id}/reset-passkey`, mirroring the existing `resetTwoFactor` handler (same busy/armed/error handling; failure message "Could not reset the passkey.").
- For a `CUSTOMER` row: under the email, when `recentOrders.length > 0`, one muted line listing them as `IC-… · +60…` separated by commas — so staff can confirm who is calling before resetting. In the actions cell, when `passkeyCount > 0`, an `ArmedButton` labelled "Reset passkey" (confirm label as the existing ones use), sharing the existing armed-state key scheme (`passkey:${id}`).
- Do not change the grid template or anything on staff rows.

- [ ] **Step 5: Verify and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add src/lib/auth/resetPasskeys.ts src/lib/auth/userRow.ts src/lib/auth/__tests__ "src/app/api/admin/users" src/app/admin/users
git commit -m "feat(admin): reset a customer's passkeys"
```

---

### Task 7: Record it

**Files:**
- Modify: `CLAUDE.md`, `docs/ops/staff-2fa-test-checklist.md`

- [ ] **Step 1: `CLAUDE.md`**

In `## Auth`, after the "Forgot password is email…" paragraph, add:

```markdown
**A customer's Google session is not enough; a passkey is.** After Google
sign-in a `CUSTOMER` session counts only once `session.passkeyVerified` is
set, which only a passkey ceremony does (`@better-auth/passkey`).
`AuthUser.mustVerifyPasskey` is derived on every read
(`lib/auth/passkeyRules.ts`) and enforced where customer surfaces read the
viewer: `viewerOf` redirects to `/[lang]/verify`, and `POST /api/orders` and
the pay route answer 401 `passkey_required`. Staff are exempt, and so is
everything with `AUTH_ENABLED=false`.

The plugin's defaults would undo this, so `hooks.before` in `lib/auth.ts`
runs `checkPasskeyRequest` (`lib/auth/passkeyHooks.ts`) on every
`/passkey/*` write: an unverified session may register only the account's
first passkey, never delete or rename one, and the last passkey is never
deleted. `assertPasskeyOwner` refuses a passkey that belongs to a different
account than the Google session. Do not remove either to make a flow easier.

Recovery is a staff action only — **Reset passkey** on a customer's row in
`/admin/users`, which shows their recent order numbers and phone so staff can
confirm who is calling. There is deliberately no self-service path: anything
a customer could do with only their Google account, so could whoever took it.

Passkeys are bound to the site's hostname (from `BETTER_AUTH_URL`). Changing
the production domain invalidates every customer's passkey, and a passkey
made on one preview URL does not work on another.
```

In the "UX flow" section's paragraph that begins "**No login to configure — but checkout now requires an account.**", after the sentence ending "…the design intact via the autosaved draft (`lib/plannerDraft.ts`).", add: " A first-time customer then meets one more step, `/[lang]/verify`, to set up a passkey before the order is placed."

In `## Known issues`, append:

```markdown
15. **In-app browsers cannot do passkeys.** A customer who opens an order or
    tracking link inside WhatsApp, Facebook or Instagram is told to open it
    in Chrome or Safari (`passkeySupport.ts`); they cannot order from inside
    the in-app browser at all. `passkey_enrol_started` against
    `passkey_enrol_completed` in PostHog is the measure of what this costs.
```

- [ ] **Step 2: Test checklist**

Append a section "## Customer passkey" to `docs/ops/staff-2fa-test-checklist.md` with checkboxes for: first Google sign-in lands on the verify page and enrols; cancelling the browser sheet leaves a retry; second sign-in prompts and passes; My orders, an order page and an order's tracking page all bounce an unverified session; placing an order from the quote screen while unverified detours through verify and returns with the design intact; Passkeys page lists, renames, adds a second device, refuses to remove the last; the three console attempts (register a second passkey, delete one, both from an unverified session → `403`; delete the last from a verified one → `400`); a passkey from another account on the same device is refused with "belongs to a different account"; Reset passkey on the customer's row signs them out and the next sign-in enrols again; the verify page inside an in-app browser shows the "open in Chrome or Safari" message; zh and ms render translated; a staff account is never sent to the verify page.

- [ ] **Step 3: Commit**

```bash
pnpm lint && pnpm typecheck && pnpm test
git add CLAUDE.md docs/ops/staff-2fa-test-checklist.md
git commit -m "docs: customer passkey in the auth notes and test checklist"
```

---

### Task 8: End-to-end check (controller, not a subagent)

Against a production build on a spare port with `AUTH_ENABLED=true` and `BETTER_AUTH_URL` set to that origin, using a throwaway local `CUSTOMER` created with `auth.api.signUpEmail` (a password session stands in for the Google session — the passkey rules do not care which first step made the session) and Chromium's virtual authenticator (`WebAuthn.addVirtualAuthenticator` over CDP). Remove the account afterwards.

- [ ] Unverified session: `/en/orders` → 307 to `/en/verify?next=%2Fen%2Forders`; `POST /api/orders` → 401 `passkey_required`.
- [ ] Enrol on the verify page → lands on `/en/orders`; the session row has `passkeyVerified = true`; one `passkey` row.
- [ ] New unverified session for the same account: `POST /api/auth/passkey/generate-register-options` → 403 `PASSKEY_VERIFICATION_REQUIRED`; `POST /api/auth/passkey/delete-passkey` → 403 (Review Focus 2).
- [ ] Prompt on the verify page with the virtual authenticator → verified; the browser is still signed in as the same account.
- [ ] Second throwaway account B with its own passkey in the same virtual authenticator; signed in as A, present B's credential → `PASSKEY_NOT_YOURS`, still signed in as A, A's session not verified (Review Focus 3).
- [ ] Signed out entirely: `POST /api/auth/passkey/generate-authenticate-options` → 401 `PASSKEY_SIGN_IN_REQUIRED` (a passkey is never a sign-in on its own).
- [ ] Verified session: delete the only passkey → 400 `PASSKEY_LAST_ONE`.
- [ ] Remove the virtual authenticator's credential and click the button → the page shows the retry message, no navigation (Review Focus 4).
- [ ] With `window.PublicKeyCredential` deleted before load → the unsupported message, no button (Review Focus 1).
- [ ] `/en/verify?next=//evil.example` when verified → lands on `/en/orders` (Review Focus 5).
- [ ] Staff session → `/en/orders` opens with no verify detour.
- [ ] Reset passkey as superadmin → `passkey` rows gone, sessions gone, next sign-in enrols.

---

## Rollout

1. Decide the production domain first. Passkeys are tied to it; a later change strands every customer.
2. Deploy. Every existing customer session becomes unverified: at their next visit to an order page they are asked to set up a passkey. Tell EzCabinet's sales team this is coming and what the screen looks like.
3. Staff resetting a customer's passkey must confirm identity from the order number and the phone on the order, by phone — never on the strength of an email or a WhatsApp message alone.
4. Watch `passkey_enrol_started` → `passkey_enrol_completed` in PostHog for the first week. That drop is the price of this feature at checkout.
