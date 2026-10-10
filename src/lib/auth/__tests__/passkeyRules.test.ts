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
	const base = { signedIn: true, recentPasskey: false, passkeyCount: 0 };
	const recent = { ...base, recentPasskey: true };

	it("refuses every action when nobody is signed in", () => {
		for (const action of [
			"register",
			"manage",
			"delete",
			"authenticate",
		] as const) {
			expect(passkeyDecision({ ...recent, action, signedIn: false })).toBe(
				"sign_in_required",
			);
		}
	});

	it("lets a fresh account register its first passkey", () => {
		expect(passkeyDecision({ ...base, action: "register" })).toBe("allow");
	});

	it("refuses a second passkey from a session with no recent passkey ceremony", () => {
		// The attack: whoever holds the Google account, or finds a verified
		// session's laptop unlocked hours later, adds their own passkey.
		expect(
			passkeyDecision({ ...base, action: "register", passkeyCount: 1 }),
		).toBe("verification_required");
	});

	it("lets a session that just used a passkey add another device", () => {
		expect(
			passkeyDecision({ ...recent, action: "register", passkeyCount: 1 }),
		).toBe("allow");
	});

	it("refuses rename and delete without a recent passkey ceremony", () => {
		expect(
			passkeyDecision({ ...base, action: "manage", passkeyCount: 2 }),
		).toBe("verification_required");
		expect(
			passkeyDecision({ ...base, action: "delete", passkeyCount: 2 }),
		).toBe("verification_required");
	});

	it("refuses to delete the last passkey even just after a ceremony", () => {
		expect(
			passkeyDecision({ ...recent, action: "delete", passkeyCount: 1 }),
		).toBe("last_passkey");
	});

	it("lets a session that just used a passkey delete one of several, and rename", () => {
		expect(
			passkeyDecision({ ...recent, action: "delete", passkeyCount: 2 }),
		).toBe("allow");
		expect(
			passkeyDecision({ ...recent, action: "manage", passkeyCount: 1 }),
		).toBe("allow");
	});

	it("lets a signed-in account answer a passkey prompt", () => {
		expect(
			passkeyDecision({ ...base, action: "authenticate", passkeyCount: 1 }),
		).toBe("allow");
	});
});
