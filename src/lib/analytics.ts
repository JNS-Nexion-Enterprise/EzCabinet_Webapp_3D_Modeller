/**
 * Customer-journey telemetry: PostHog Cloud EU, reached through `/api/ph`.
 *
 * Client-only and lazy. `posthog-js` is imported on idle, never on the LCP
 * path, and nothing here touches `window` at module scope — components that
 * call it are also rendered on the server, where every call is a no-op.
 *
 * Consent (PDPA): until the visitor chooses, capture runs cookieless — no
 * cookies, no storage, a per-day server-side hash, no replay. That is
 * `opt_out_capturing_by_default` plus `cookieless_mode: "on_reject"`: without
 * the first, "pending" would capture *with* cookies. Accepting opts in to
 * cookies and the error-triggered replay configured in the PostHog project.
 *
 * Never pass form fields. Nothing a customer types belongs in an event.
 *
 * Never send a payment credential either. Stripe's return URL carries the
 * PaymentIntent's client secret, and PostHog copies the page URL into every
 * event, the initial attribution and the replay's own page URL. So the
 * secret leaves the address bar before PostHog starts, and `before_send`
 * removes it from anything that still holds it (a `$referrer`, say).
 */
import type { CaptureResult, PostHog, Properties } from "posthog-js";

export type JourneyEvent =
	| "screen_viewed"
	| "room_picked"
	| "planner_started"
	| "room_shape_changed"
	| "wall_painted"
	| "cabinet_added"
	| "cabinet_removed"
	| "cabinet_resized"
	| "cabinet_replaced"
	| "finish_changed"
	| "door_style_changed"
	| "doors_toggled"
	| "view_changed"
	| "tool_used"
	| "quote_viewed"
	| "quote_submitted"
	| "sign_in_nudge"
	| "passkey_enrol_started"
	| "passkey_enrol_completed"
	| "passkey_enrol_failed"
	| "passkey_verify_failed";

type Props = Record<string, string | number | boolean | null>;

/**
 * What Stripe appends to a payment return URL, less `redirect_status`: the
 * order page reads that one, and it is not secret. The client secret can
 * read and confirm the PaymentIntent.
 */
const SECRET_PARAMS = ["payment_intent_client_secret", "payment_intent"];
const SECRET_VALUE = /((?:^|[?&])payment_intent(?:_client_secret)?=)[^&#]*/g;

/** `value` without the payment parameters; anything else is returned as is. */
export function redactUrl(value: string): string {
	if (!value.includes("payment_intent")) return value;
	try {
		const url = new URL(value);
		for (const name of SECRET_PARAMS) url.searchParams.delete(name);
		return url.href;
	} catch {
		return value.replace(SECRET_VALUE, "$1<redacted>");
	}
}

/** The SDK's last look at every event: automatic, custom and `$snapshot`. */
export function redactEvent(event: CaptureResult | null): CaptureResult | null {
	if (event === null) return null;
	const { properties } = event;
	for (const bag of [
		properties,
		properties.$set as Properties | undefined,
		properties.$set_once as Properties | undefined,
		event.$set,
		event.$set_once,
	]) {
		if (!bag) continue;
		for (const [key, value] of Object.entries(bag)) {
			if (typeof value === "string") bag[key] = redactUrl(value);
		}
	}
	return event;
}

/**
 * The replay records `window.location.href` as it is, past `before_send`,
 * so the secret must be gone from the address bar first. Next.js keeps its
 * router in step with a native `replaceState`.
 */
function redactLocation(): void {
	const clean = redactUrl(window.location.href);
	if (clean !== window.location.href) {
		window.history.replaceState(null, "", clean);
	}
}

let client: Promise<PostHog | null> | undefined;

function load(): Promise<PostHog | null> {
	const token = process.env.POSTHOG_PROJECT_TOKEN;
	if (typeof window === "undefined" || !token) return Promise.resolve(null);
	if (client) return client;
	redactLocation();
	client = new Promise<void>((resolve) => {
		if ("requestIdleCallback" in window) {
			window.requestIdleCallback(() => resolve(), { timeout: 3000 });
		} else {
			setTimeout(resolve, 1);
		}
	})
		.then(() => import("posthog-js"))
		.then(({ default: posthog }) => {
			posthog.init(token, {
				// The rewrites in next.config.ts point at the EU region. A project
				// created in US would need both changed — the region is fixed at
				// install, so this is not read from POSTHOG_HOST (next.config.ts reads that).
				api_host: "/api/ph",
				ui_host: "https://eu.posthog.com",
				defaults: "2026-05-30",
				capture_pageview: "history_change",
				capture_exceptions: true,
				person_profiles: "identified_only",
				cookieless_mode: "on_reject",
				opt_out_capturing_by_default: true,
				session_recording: { maskAllInputs: true },
				before_send: redactEvent,
				disable_surveys: true,
			});
			return posthog;
		})
		// Blocked script, offline, bad deploy: telemetry must never break the
		// planner, so a failed load is just silence.
		.catch(() => null);
	return client;
}

export function track(event: JourneyEvent, props?: Props): void {
	void load().then((posthog) => posthog?.capture(event, props));
}

/** For failures that are handled — and therefore never reach autocapture. */
export function captureError(error: unknown, context?: Props): void {
	void load().then((posthog) => posthog?.captureException(error, context));
}

/** `null` when analytics is not running at all (server, no token, blocked). */
export async function consentStatus(): Promise<
	"granted" | "denied" | "pending" | null
> {
	return (await load())?.get_explicit_consent_status() ?? null;
}

export function setConsent(granted: boolean): void {
	void load().then((posthog) =>
		granted ? posthog?.opt_in_capturing() : posthog?.opt_out_capturing(),
	);
}
