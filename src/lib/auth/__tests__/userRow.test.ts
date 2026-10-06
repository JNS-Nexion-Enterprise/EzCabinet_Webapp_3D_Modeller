import { describe, expect, it } from "vitest";
import { toUserRow } from "@/lib/auth/userRow";

describe("toUserRow", () => {
	const row = {
		id: "c1",
		email: "c@x.com",
		accounts: [{ id: "a1" }],
		_count: { passkeys: 2 },
		orders: [
			{
				number: 14,
				createdAt: new Date("2026-08-26T03:00:00Z"),
				customerPhone: "+60123456789",
			},
			{
				number: 9,
				createdAt: new Date("2026-08-20T03:00:00Z"),
				customerPhone: "+60198765432",
			},
		],
	};

	it("derives password, passkey count and recent orders", () => {
		const out = toUserRow(row);
		expect(out.hasPassword).toBe(true);
		expect(out.passkeyCount).toBe(2);
		expect(out.recentOrders).toEqual([
			{ ref: "IC-20260826-014", phone: "+60123456789" },
			{ ref: "IC-20260820-009", phone: "+60198765432" },
		]);
	});

	it("keeps the raw relations out of what reaches the browser", () => {
		const out = toUserRow(row);
		expect(out).not.toHaveProperty("accounts");
		expect(out).not.toHaveProperty("_count");
		expect(out).not.toHaveProperty("orders");
	});
});
