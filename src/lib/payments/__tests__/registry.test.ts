import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const paymentGatewayFlag = vi.hoisted(() => vi.fn());
const stripeGateway = vi.hoisted(() => vi.fn());

vi.mock("@/flags", () => ({ paymentGatewayFlag }));
vi.mock("../stripe", () => ({ stripeGateway }));

const { activeGateway } = await import("../registry");

const stripe = { id: "stripe" };
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	vi.clearAllMocks();
	logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

describe("activeGateway", () => {
	it("is the gateway the flag names", async () => {
		paymentGatewayFlag.mockResolvedValue("stripe");
		stripeGateway.mockReturnValue(stripe);
		await expect(activeGateway()).resolves.toBe(stripe);
		expect(logged).not.toHaveBeenCalled();
	});

	// Bank transfer chosen on purpose is not a fault.
	it("is none, quietly, when the flag says manual", async () => {
		paymentGatewayFlag.mockResolvedValue("manual");
		await expect(activeGateway()).resolves.toBeNull();
		expect(logged).not.toHaveBeenCalled();
	});

	// Customers are shown bank transfer while the business believes online
	// payment is on. Nothing on screen says so, so the log must.
	it.each([
		["a gateway whose keys are missing", "stripe"],
		["a gateway this build does not know", "fiuu"],
	])("says so when the flag names %s", async (_label, id) => {
		paymentGatewayFlag.mockResolvedValue(id);
		stripeGateway.mockReturnValue(null);
		await expect(activeGateway()).resolves.toBeNull();
		expect(logged).toHaveBeenCalledTimes(1);
		expect(logged.mock.calls[0][0]).toContain("Online payment is off");
		expect(logged.mock.calls[0][1]).toEqual({ gateway: id });
	});
});
