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
	it.each(cases)(
		"%s, session verified %s → %s",
		(role, sessionVerified, expected) => {
			expect(needsPasskeyCheck({ role, sessionVerified })).toBe(expected);
		},
	);
});

describe("passkeyDecision", () => {
	const base = { signedIn: true, sessionVerified: false, passkeyCount: 0 };

	it("refuses every action when nobody is signed in", () => {
		for (const action of [
			"register",
			"manage",
			"delete",
			"authenticate",
		] as const) {
			expect(passkeyDecision({ ...base, action, signedIn: false })).toBe(
				"sign_in_required",
			);
		}
	});

	it("lets a fresh account register its first passkey", () => {
		expect(passkeyDecision({ ...base, action: "register" })).toBe("allow");
	});

	it("refuses a second passkey from a session that has not passed the first", () => {
		// The attack: whoever holds the Google account adds their own passkey.
		expect(
			passkeyDecision({ ...base, action: "register", passkeyCount: 1 }),
		).toBe("verification_required");
	});

	it("lets a verified session add another device", () => {
		expect(
			passkeyDecision({
				...base,
				action: "register",
				passkeyCount: 1,
				sessionVerified: true,
			}),
		).toBe("allow");
	});

	it("refuses rename and delete from an unverified session", () => {
		expect(
			passkeyDecision({ ...base, action: "manage", passkeyCount: 2 }),
		).toBe("verification_required");
		expect(
			passkeyDecision({ ...base, action: "delete", passkeyCount: 2 }),
		).toBe("verification_required");
	});

	it("refuses to delete the last passkey even when verified", () => {
		expect(
			passkeyDecision({
				...base,
				action: "delete",
				passkeyCount: 1,
				sessionVerified: true,
			}),
		).toBe("last_passkey");
	});

	it("lets a verified session delete one of several, and rename", () => {
		expect(
			passkeyDecision({
				...base,
				action: "delete",
				passkeyCount: 2,
				sessionVerified: true,
			}),
		).toBe("allow");
		expect(
			passkeyDecision({
				...base,
				action: "manage",
				passkeyCount: 1,
				sessionVerified: true,
			}),
		).toBe("allow");
	});

	it("lets a signed-in account answer a passkey prompt", () => {
		expect(
			passkeyDecision({ ...base, action: "authenticate", passkeyCount: 1 }),
		).toBe("allow");
	});
});
