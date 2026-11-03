import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The merchant, verify key and order from the vcode example in Fiuu's API
// spec v13.97, whose published answer is the known-good hash below.
process.env.FIUU_MERCHANT_ID = "ACME";
process.env.FIUU_VERIFY_KEY = "f5bb0c8de146c67b44babbf4e6584cc0";
process.env.FIUU_SECRET_KEY = "secret";

const { fiuuGateway, settlingIn } = await import("@/lib/payments/fiuu");
const { BadSignature, PaymentInProgress } = await import(
	"@/lib/payments/types"
);

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
beforeEach(() => fetchMock.mockReset());

const gateway = fiuuGateway();
if (!gateway) throw new Error("fiuu gateway not configured");

const order = {
	id: "OD8842",
	ref: "IC-20261103-001",
	brand: "EzCabinet",
	totalRm: 27.6,
	customerName: "Siti",
	customerEmail: "siti@example.com",
	customerPhone: "+60123456789",
	previousRef: null,
};
const urls = { returnUrl: "https://x/en/order/tok", notifyUrl: "unused" };

const md5 = (text: string) => createHash("md5").update(text).digest("hex");
function notification(over: Record<string, string> = {}) {
	const f = {
		nbcb: "2",
		tranID: "418607",
		orderid: "ord1",
		status: "00",
		domain: "ACME",
		amount: "2641.76",
		currency: "MYR",
		appcode: "123456",
		paydate: "2026-11-03 21:00:00",
		...over,
	};
	const pre = md5(
		f.tranID + f.orderid + f.status + f.domain + f.amount + f.currency,
	);
	const skey = md5(f.paydate + f.domain + pre + f.appcode + "secret");
	return new URLSearchParams({ ...f, skey }).toString();
}

describe("start", () => {
	it("signs the form with the spec's extended vcode", async () => {
		const start = await gateway.start(order, urls);
		expect(start).toMatchObject({
			kind: "redirect",
			ref: "OD8842",
			url: "https://pay.fiuu.com/RMS/pay/ACME/",
			method: "POST",
		});
		if (start.kind !== "redirect") throw new Error();
		expect(start.fields).toMatchObject({
			amount: "27.60",
			orderid: "OD8842",
			currency: "MYR",
			cancelurl: urls.returnUrl,
			vcode: "5bf33e6500a53830d4f80087b67e13de",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	const retry = { ...order, previousRef: "OD8842" };
	const answer = (text: string, status = 200) =>
		fetchMock.mockResolvedValue(new Response(text, { status }));

	// Paid at the bank, notification still on its way: another form could be
	// a second charge.
	it.each(["00", "22"])(
		"refuses a retry while Fiuu holds a %s",
		async (code) => {
			answer(
				`TranID\tBillingDate\tStatCode\n418603\t2026-11-03\t11\tfailed\n418607\t2026-11-03\t${code}\tx\t27.60\n`,
			);
			await expect(gateway.start(retry, urls)).rejects.toBeInstanceOf(
				PaymentInProgress,
			);
		},
	);

	it("offers a retry after a failed payment", async () => {
		answer("418603\t2026-11-03\t11\tfailed\t27.60\tSiti\tMYR\n");
		await expect(gateway.start(retry, urls)).resolves.toMatchObject({
			kind: "redirect",
		});
	});

	// Refusing a retry is recoverable; a double charge is a refund.
	it.each([
		["an answer it cannot read", () => answer("error: invalid skey")],
		["a failed request", () => answer("", 500)],
	])("fails closed on %s", async (_label, arrange) => {
		arrange();
		await expect(gateway.start(retry, urls)).rejects.toThrow();
	});
});

describe("verify", () => {
	it("reads a signed payment", async () => {
		await expect(
			gateway.verify(notification(), new Headers()),
		).resolves.toEqual({
			outcome: "paid",
			orderId: "ord1",
			ref: "418607",
			amountSen: 264176,
			currency: "myr",
		});
	});

	it("maps failed and pending, and ignores the rest", async () => {
		const read = (status: string) =>
			gateway.verify(notification({ status }), new Headers());
		await expect(read("11")).resolves.toMatchObject({ outcome: "failed" });
		await expect(read("22")).resolves.toMatchObject({ outcome: "pending" });
		await expect(read("99")).resolves.toBeNull();
	});

	it.each([
		["a changed amount", notification().replace("2641.76", "1.00")],
		["another merchant's signature", notification({ domain: "OTHER" })],
	])("refuses %s", async (_label, body) => {
		await expect(gateway.verify(body, new Headers())).rejects.toBeInstanceOf(
			BadSignature,
		);
	});
});

describe("ack", () => {
	it("answers a callback with Fiuu's token", async () => {
		const res = await gateway.ack?.(notification({ nbcb: "1" }));
		await expect(res?.text()).resolves.toBe("CBTOKEN:MPSTATOK");
	});

	it("acknowledges a notification by posting it back with treq=1", async () => {
		fetchMock.mockResolvedValue(new Response("ok"));
		const body = notification();
		await gateway.ack?.(body);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://pay.fiuu.com/RMS/API/chkstat/returnipn.php",
			expect.objectContaining({ method: "POST", body: `${body}&treq=1` }),
		);
	});
});

describe("settlingIn", () => {
	it("is null with no transactions listed", () => {
		expect(settlingIn("")).toBeNull();
	});
});
