import { describe, expect, it } from "vitest";
import {
	can,
	type Permission,
	ROLE_PERMISSIONS,
	ROLES,
	STAFF_ROLES,
} from "@/lib/auth/permissions";

describe("can", () => {
	it("gives SUPERADMIN every permission", () => {
		const all = new Set<Permission>();
		for (const role of ROLES) {
			for (const permission of ROLE_PERMISSIONS[role]) all.add(permission);
		}
		for (const permission of all) {
			expect(can("SUPERADMIN", permission)).toBe(true);
		}
	});

	it("is the only role that manages users", () => {
		for (const role of ROLES) {
			expect(can(role, "users:manage")).toBe(role === "SUPERADMIN");
		}
	});

	it("is the only role that refunds an order", () => {
		for (const role of ROLES) {
			expect(can(role, "orders:refund")).toBe(role === "SUPERADMIN");
		}
	});

	it("gives ADMIN everything except managing users and refunding", () => {
		const superadminOnly = ["users:manage", "orders:refund"];
		for (const permission of ROLE_PERMISSIONS.SUPERADMIN) {
			expect(can("ADMIN", permission)).toBe(
				!superadminOnly.includes(permission),
			);
		}
	});

	it("gives CUSTOMER no admin permission at all", () => {
		expect(ROLE_PERMISSIONS.CUSTOMER).toHaveLength(0);
	});

	it("counts every role but CUSTOMER as staff", () => {
		expect([...STAFF_ROLES].sort()).toEqual(["ADMIN", "SUPERADMIN"]);
	});

	it("has exactly three roles", () => {
		expect([...ROLES].sort()).toEqual(["ADMIN", "CUSTOMER", "SUPERADMIN"]);
	});
});
