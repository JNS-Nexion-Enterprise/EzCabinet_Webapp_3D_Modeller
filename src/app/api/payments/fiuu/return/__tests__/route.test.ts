import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";

const findUnique = vi.fn(async () => ({ locale: "ms", publicToken: "tok" }));
vi.mock("@/lib/catalogue/db", () => ({ prisma: { order: { findUnique } } }));

process.env.FIUU_MERCHANT_ID = "SB_ACME";
process.env.FIUU_VERIFY_KEY = "verify";
process.env.FIUU_SECRET_KEY = "secret";

const { POST } = await import("../route");

const md5 = (text: string) => createHash("md5").update(text).digest("hex");
function returned(status: string) {
	const f = {
		tranID: "418607",
		orderid: "ord1",
		status,
		domain: "SB_ACME",
		amount: "2641.76",
		currency: "MYR",
		appcode: "",
		paydate: "2026-11-03 21:00:00",
	};
	const pre = md5(
		f.tranID + f.orderid + f.status + f.domain + f.amount + f.currency,
	);
	const skey = md5(`${f.paydate}${f.domain}${pre}${f.appcode}secret`);
	return new URLSearchParams({ ...f, skey }).toString();
}
const post = (body: string) =>
	POST(
		new Request("https://x/api/payments/fiuu/return", { method: "POST", body }),
	);

it.each([
	["00", "succeeded"],
	["22", "processing"],
	["11", "failed"],
])("sends status %s back to the order page as %s", async (status, shown) => {
	const res = await post(returned(status));
	expect(res.status).toBe(303);
	expect(res.headers.get("location")).toBe(
		`https://x/ms/order/tok?redirect_status=${shown}`,
	);
});

// A made-up post must not learn an order's page address.
it("refuses a forged return without looking the order up", async () => {
	findUnique.mockClear();
	const res = await post(returned("00").replace("2641.76", "1.00"));
	expect(res.status).toBe(400);
	expect(findUnique).not.toHaveBeenCalled();
});
