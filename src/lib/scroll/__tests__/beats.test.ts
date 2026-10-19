import { describe, expect, it } from "vitest";
import { clamp01, trackProgress } from "../beats";

describe("clamp01", () => {
	it("passes through the unit interval and clamps outside it", () => {
		expect(clamp01(0.4)).toBe(0.4);
		expect(clamp01(-3)).toBe(0);
		expect(clamp01(9)).toBe(1);
	});
});

describe("trackProgress", () => {
	// A 2-viewport track on an 800px viewport has 800px of runway inside it:
	// progress is 0 the moment its top reaches the viewport top, 1 once the
	// page has scrolled that runway away.
	it("is 0 when the track top sits at the viewport top", () => {
		expect(trackProgress(0, 1600, 800)).toBe(0);
	});

	it("is 1 once the whole runway has been scrolled", () => {
		expect(trackProgress(-800, 1600, 800)).toBe(1);
	});

	it("is linear in between", () => {
		expect(trackProgress(-400, 1600, 800)).toBeCloseTo(0.5);
	});

	it("clamps before the track is reached and after it is left", () => {
		expect(trackProgress(500, 1600, 800)).toBe(0);
		expect(trackProgress(-5000, 1600, 800)).toBe(1);
	});

	// A track no taller than the viewport has no runway. It must not divide by
	// zero — it is simply "not started" until its top passes, then "done".
	it("degenerates safely when the track is not taller than the viewport", () => {
		expect(trackProgress(10, 800, 800)).toBe(0);
		expect(trackProgress(-10, 800, 800)).toBe(1);
	});
});
