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

describe("POST /api/orders terms acceptance", () => {
	const postBody = (body: unknown) =>
		POST(
			new Request("http://localhost/api/orders", {
				method: "POST",
				body: JSON.stringify(body),
			}),
		);
	/** The zod issue paths in a 400, e.g. "termsAccepted", "customer". */
	const issuePaths = async (response: Response) =>
		((await response.json()).issues as { path: (string | number)[] }[]).map(
			(issue) => issue.path.join("."),
		);

	// Past the session check on the local demo-customer path, so the body is
	// what is being judged. The body is otherwise incomplete on purpose: the
	// refusal happens at the schema, before any catalogue or database work.
	beforeEach(() => vi.stubEnv("AUTH_ENABLED", "false"));

	it("refuses an order that has not accepted the terms", async () => {
		const response = await postBody({ remeasureAccepted: true });
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).toContain("termsAccepted");
	});

	it("refuses termsAccepted: false — it is a condition, not a preference", async () => {
		const response = await postBody({ termsAccepted: false });
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).toContain("termsAccepted");
	});

	it("has no complaint about the terms once they are accepted", async () => {
		const response = await postBody({ termsAccepted: true });
		// Still 400 — the rest of the body is missing — but not for the terms.
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).not.toContain("termsAccepted");
	});
});
