import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { deliverEmail, sendEmail } = await import("@/lib/email");

const message = { to: "a@b.com", subject: "Hello", text: "Body" };
const fetchMock = vi.fn();

beforeEach(() => {
	fetchMock.mockReset();
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("sendEmail", () => {
	it("sends nothing and reports false when the key is missing", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
		await expect(sendEmail(message)).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("sends nothing and reports false when the from-address is missing", async () => {
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubEnv("EMAIL_FROM", "");
		await expect(sendEmail(message)).resolves.toBe(false);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("posts to Resend with the key as a bearer token", async () => {
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
		fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
		await expect(sendEmail(message)).resolves.toBe(true);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.resend.com/emails");
		expect(init.method).toBe("POST");
		expect(init.headers.Authorization).toBe("Bearer re_test");
		expect(JSON.parse(init.body)).toEqual({
			from: "EzCabinet <no-reply@example.com>",
			to: "a@b.com",
			subject: "Hello",
			text: "Body",
		});
	});

	it("reports false, without throwing, when Resend refuses", async () => {
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
		fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
		await expect(sendEmail(message)).resolves.toBe(false);
	});

	it("reports false, without throwing, when the network fails", async () => {
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
		fetchMock.mockRejectedValue(new Error("offline"));
		await expect(sendEmail(message)).resolves.toBe(false);
	});
});

// The outbox retries on this: a refused mail uses up a try, an unreachable
// or misconfigured service does not.
describe("deliverEmail", () => {
	const configured = () => {
		vi.stubEnv("RESEND_API_KEY", "re_test");
		vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
	};

	it("reports sent", async () => {
		configured();
		fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
		await expect(deliverEmail(message)).resolves.toBe("sent");
	});

	it("reports refused when Resend rejects this mail", async () => {
		configured();
		fetchMock.mockResolvedValue(new Response("nope", { status: 422 }));
		await expect(deliverEmail(message)).resolves.toBe("refused");
	});

	it.each([401, 403, 429, 500, 503])(
		"reports unavailable on a %i: our key, their limit or their outage",
		async (status) => {
			configured();
			fetchMock.mockResolvedValue(new Response("no", { status }));
			await expect(deliverEmail(message)).resolves.toBe("unavailable");
		},
	);

	it("reports unavailable when the network fails", async () => {
		configured();
		fetchMock.mockRejectedValue(new Error("offline"));
		await expect(deliverEmail(message)).resolves.toBe("unavailable");
	});

	it("reports unavailable when mail is not configured", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		await expect(deliverEmail(message)).resolves.toBe("unavailable");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
