import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const passkey = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/client", () => ({
	authClient: { signIn: { passkey } },
}));

const { fetchGuarded, PASSKEY_AGAIN, PASSKEY_DISMISSED, PASSKEY_FAILED } =
	await import("@/components/admin/stepUp");

const stepUpOwed = () =>
	new Response(JSON.stringify({ error: "step_up_required" }), { status: 403 });
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

const fetchMock = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("fetchGuarded", () => {
	it("asks for no passkey when the server does not want one", async () => {
		fetchMock.mockResolvedValue(ok());
		const res = await fetchGuarded("/x");
		expect(res).toBeInstanceOf(Response);
		expect(passkey).not.toHaveBeenCalled();
	});

	it("hands back a 403 that is not a step-up untouched", async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }),
		);
		const res = await fetchGuarded("/x");
		expect((res as Response).status).toBe(403);
		expect(passkey).not.toHaveBeenCalled();
	});

	it("prompts, then repeats the request once", async () => {
		fetchMock.mockResolvedValueOnce(stepUpOwed()).mockResolvedValueOnce(ok());
		passkey.mockResolvedValue({ data: {} });
		const res = await fetchGuarded("/x", { method: "POST" });
		expect((res as Response).status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it.each([
		["a dismissed prompt", { error: { code: "AUTH_CANCELLED" } }],
		["a timed-out prompt", { error: { code: "ERROR_CEREMONY_ABORTED" } }],
	])("says %s was dismissed, and does not repeat", async (_, outcome) => {
		fetchMock.mockResolvedValue(stepUpOwed());
		passkey.mockResolvedValue(outcome);
		expect(await fetchGuarded("/x")).toBe(PASSKEY_DISMISSED);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("says a prompt the browser rejected was dismissed", async () => {
		fetchMock.mockResolvedValue(stepUpOwed());
		passkey.mockRejectedValue(new DOMException("x", "NotAllowedError"));
		expect(await fetchGuarded("/x")).toBe(PASSKEY_DISMISSED);
	});

	it("says any other passkey failure failed", async () => {
		fetchMock.mockResolvedValue(stepUpOwed());
		passkey.mockResolvedValue({ error: { code: "PASSKEY_NOT_YOURS" } });
		expect(await fetchGuarded("/x")).toBe(PASSKEY_FAILED);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("asks to confirm again when the repeat still owes a step-up", async () => {
		fetchMock.mockImplementation(async () => stepUpOwed());
		passkey.mockResolvedValue({ data: {} });
		expect(await fetchGuarded("/x")).toBe(PASSKEY_AGAIN);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(passkey).toHaveBeenCalledTimes(1);
	});
});
