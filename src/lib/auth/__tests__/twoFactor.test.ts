import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/auth/permissions";
import { canEmailReset, needsTwoFactorSetup } from "@/lib/auth/twoFactor";

describe("needsTwoFactorSetup", () => {
	const cases: [Role, boolean, boolean, boolean][] = [
		// role, hasPassword, twoFactorEnabled, expected
		["SUPERADMIN", true, false, true],
		["ADMIN", true, false, true],
		["SUPERADMIN", true, true, false],
		["ADMIN", true, true, false],
		// Google-only staff: Google carries its own second factor.
		["SUPERADMIN", false, false, false],
		["ADMIN", false, false, false],
		// A customer is never asked, whatever the row holds.
		["CUSTOMER", true, false, false],
		["CUSTOMER", false, false, false],
	];
	it.each(cases)(
		"%s, password %s, enabled %s → %s",
		(role, hasPassword, twoFactorEnabled, expected) => {
			expect(needsTwoFactorSetup({ role, hasPassword, twoFactorEnabled })).toBe(
				expected,
			);
		},
	);
});

describe("canEmailReset", () => {
	const ok = {
		role: "ADMIN" as Role,
		disabled: false,
		hasPassword: true,
		twoFactorEnabled: true,
	};
	it("allows enrolled, active staff with a password", () => {
		expect(canEmailReset(ok)).toBe(true);
		expect(canEmailReset({ ...ok, role: "SUPERADMIN" })).toBe(true);
	});
	it("refuses a customer — a reset would create a password on the row", () => {
		expect(canEmailReset({ ...ok, role: "CUSTOMER" })).toBe(false);
	});
	it("refuses Google-only staff for the same reason", () => {
		expect(canEmailReset({ ...ok, hasPassword: false })).toBe(false);
	});
	it("refuses a disabled account", () => {
		expect(canEmailReset({ ...ok, disabled: true })).toBe(false);
	});
	it("refuses staff who have not enrolled — a mailbox alone must not be enough", () => {
		expect(canEmailReset({ ...ok, twoFactorEnabled: false })).toBe(false);
	});
});
