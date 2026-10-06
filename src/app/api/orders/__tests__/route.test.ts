import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("botid/server", () => ({
	checkBotId: async () => ({ isBot: false }),
}));
// The 401 must come before any database work: the only prisma call these
// tests allow is the demo customer's upsert.
const upsert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { upsert } } }));
vi.mock("server-only", () => ({}));

const { POST } = await import("@/app/api/orders/route");

const post = () =>
	POST(
		new Request("http://localhost/api/orders", {
			method: "POST",
			body: "{}",
		}),
	);

beforeEach(() => {
	currentUser.mockReset();
	currentUser.mockResolvedValue(null);
	upsert.mockReset();
	upsert.mockResolvedValue({ id: "demo-customer" });
	vi.stubEnv("VERCEL_ENV", undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/orders without a signed-in user", () => {
	it("401s with auth enabled", async () => {
		vi.stubEnv("AUTH_ENABLED", "true");
		const response = await post();
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "sign_in_required" });
		expect(upsert).not.toHaveBeenCalled();
	});

	it("401s on any Vercel deployment, whatever AUTH_ENABLED says", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		vi.stubEnv("VERCEL_ENV", "preview");
		const response = await post();
		expect(response.status).toBe(401);
		expect(upsert).not.toHaveBeenCalled();
	});

	it("gives a local order to the demo customer with AUTH_ENABLED=false", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		const response = await post();
		// Past the session check: the empty body is what is refused now.
		expect(response.status).toBe(400);
		expect(upsert).toHaveBeenCalledOnce();
	});
});

describe("POST /api/orders for a customer who has not passed a passkey", () => {
	it("401s passkey_required and writes nothing", async () => {
		vi.stubEnv("AUTH_ENABLED", "true");
		currentUser.mockResolvedValue({
			id: "u1",
			role: "CUSTOMER",
			mustVerifyPasskey: true,
		});
		const response = await post();
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "passkey_required" });
		expect(upsert).not.toHaveBeenCalled();
	});
});
