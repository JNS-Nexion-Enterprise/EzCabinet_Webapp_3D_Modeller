import { afterEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
	init: vi.fn(),
	capture: vi.fn(),
	captureException: vi.fn(),
	opt_in_capturing: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: posthog }));

/** Synthetic: the shape of Stripe's return parameters, never a real value. */
const SECRET = "pi_test123_secret_abc456";
const RETURN_URL = `https://example.test/en/order/tok?payment_intent=pi_test123&payment_intent_client_secret=${SECRET}&redirect_status=succeeded`;
const CLEAN_URL = "https://example.test/en/order/tok?redirect_status=succeeded";

/** A browser window whose `replaceState` moves the address bar, as a real one does. */
function browserAt(href: string) {
	const location = { href };
	const history = {
		replaceState: vi.fn((_state: unknown, _unused: string, url: string) => {
			location.href = new URL(url, location.href).href;
		}),
	};
	vi.stubGlobal("window", { location, history });
	return { location, history };
}

/** A fresh module each time — the client promise is a module-level singleton. */
async function fresh() {
	vi.resetModules();
	return import("../analytics");
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.clearAllMocks();
});

describe("analytics", () => {
	it("stays inert on the server, where the planner is also rendered", async () => {
		vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
		const { captureError, consentStatus, track } = await fresh();

		track("planner_started", { room: "kitchen" });
		captureError(new Error("boom"));

		expect(await consentStatus()).toBeNull();
		expect(posthog.init).not.toHaveBeenCalled();
	});

	it("stays inert without a token, so local dev sends nothing", async () => {
		vi.stubGlobal("window", {});
		const { consentStatus, track } = await fresh();

		track("planner_started", { room: "kitchen" });

		expect(await consentStatus()).toBeNull();
		expect(posthog.init).not.toHaveBeenCalled();
	});

	it("initialises once, cookieless until consent, and forwards events in order", async () => {
		vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
		browserAt("https://example.test/en");
		const { track } = await fresh();

		track("planner_started", { room: "kitchen" });
		track("quote_viewed", { cabinets: 3 });

		await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalledTimes(2));
		expect(posthog.init).toHaveBeenCalledTimes(1);
		// The PDPA default: without opt-out-by-default, "pending" sets cookies.
		expect(posthog.init.mock.calls[0][1]).toMatchObject({
			api_host: "/api/ph",
			cookieless_mode: "on_reject",
			opt_out_capturing_by_default: true,
		});
		expect(posthog.capture).toHaveBeenNthCalledWith(1, "planner_started", {
			room: "kitchen",
		});
	});

	it("removes the payment secret from the address bar before PostHog starts", async () => {
		vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
		const { location, history } = browserAt(RETURN_URL);
		// Replay's page URL and the first pageview both read the live address.
		let hrefAtInit: string | undefined;
		posthog.init.mockImplementationOnce(() => {
			hrefAtInit = location.href;
		});
		let hrefAtOptIn: string | undefined;
		posthog.opt_in_capturing.mockImplementationOnce(() => {
			hrefAtOptIn = location.href;
		});
		const { setConsent, track } = await fresh();

		track("quote_submitted");
		setConsent(true);

		await vi.waitFor(() => expect(posthog.opt_in_capturing).toHaveBeenCalled());
		expect(hrefAtInit).toBe(CLEAN_URL);
		expect(hrefAtOptIn).toBe(CLEAN_URL);
		expect(history.replaceState).toHaveBeenCalledTimes(1);
		expect(posthog.init.mock.calls[0][1].before_send).toBeTypeOf("function");
	});

	it("leaves an ordinary address alone", async () => {
		vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
		const { history } = browserAt(
			"https://example.test/en/planner?room=kitchen",
		);
		const { track } = await fresh();

		track("planner_started");

		await vi.waitFor(() => expect(posthog.capture).toHaveBeenCalled());
		expect(history.replaceState).not.toHaveBeenCalled();
	});
});

describe("redactUrl", () => {
	it("drops both payment parameters and keeps the rest", async () => {
		const { redactUrl } = await fresh();
		expect(redactUrl(RETURN_URL)).toBe(CLEAN_URL);
		expect(
			redactUrl(
				`https://example.test/en/order/tok?payment_intent_client_secret=${SECRET}`,
			),
		).toBe("https://example.test/en/order/tok");
	});

	it("masks the value where the string is not a URL", async () => {
		const { redactUrl } = await fresh();
		expect(redactUrl(`?payment_intent_client_secret=${SECRET}&x=1`)).toBe(
			"?payment_intent_client_secret=<redacted>&x=1",
		);
	});

	it("returns other strings unchanged", async () => {
		const { redactUrl } = await fresh();
		expect(redactUrl("https://example.test/en?a=1+2")).toBe(
			"https://example.test/en?a=1+2",
		);
		expect(redactUrl("kitchen")).toBe("kitchen");
	});
});

describe("redactEvent", () => {
	it("scrubs URL, referrer and initial attribution, wherever the SDK puts them", async () => {
		const { redactEvent } = await fresh();
		const event = redactEvent({
			uuid: "u",
			event: "$pageview",
			properties: {
				$current_url: RETURN_URL,
				$referrer: RETURN_URL,
				$set_once: { $initial_current_url: RETURN_URL },
				cabinets: 3,
			},
			$set_once: { $initial_referrer: RETURN_URL },
		});

		expect(JSON.stringify(event)).not.toContain(SECRET);
		expect(event?.properties.$current_url).toBe(CLEAN_URL);
		expect(event?.properties.cabinets).toBe(3);
	});

	it("passes a dropped event through", async () => {
		const { redactEvent } = await fresh();
		expect(redactEvent(null)).toBeNull();
	});
});
