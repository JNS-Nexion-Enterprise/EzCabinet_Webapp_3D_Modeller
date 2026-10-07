import { describe, expect, it } from "vitest";
import { recentStepUp, STEP_UP_WINDOW_MS } from "@/lib/auth/stepUp";

const now = new Date("2026-10-07T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("recentStepUp", () => {
	it("refuses a session that never passed a passkey ceremony", () => {
		expect(recentStepUp(null, now)).toBe(false);
		expect(recentStepUp(undefined, now)).toBe(false);
	});

	it("accepts a ceremony inside the window", () => {
		expect(recentStepUp(ago(1_000), now)).toBe(true);
		expect(recentStepUp(ago(STEP_UP_WINDOW_MS), now)).toBe(true);
	});

	it("refuses a ceremony older than the window", () => {
		expect(recentStepUp(ago(STEP_UP_WINDOW_MS + 1), now)).toBe(false);
	});

	it("refuses a stamp from the future, beyond a minute of clock skew", () => {
		expect(recentStepUp(ago(-60_000), now)).toBe(true);
		expect(recentStepUp(ago(-60_001), now)).toBe(false);
		expect(recentStepUp(ago(-24 * 60 * 60_000), now)).toBe(false);
	});

	it("refuses an unparseable date", () => {
		expect(recentStepUp(new Date("nope"), now)).toBe(false);
	});
});
