import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ActionState, DONE_MS, trackAction } from "../useAction";

const setup = () => {
	const states: ActionState[] = [];
	const guard = { inFlight: false, seq: 0 };
	return { states, guard, onState: (s: ActionState) => states.push(s) };
};

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe("trackAction", () => {
	it("shows done for DONE_MS after a success, then goes idle", async () => {
		const { states, guard, onState } = setup();
		await trackAction(guard, async () => {}, onState);
		expect(states).toEqual(["busy", "done"]);
		vi.advanceTimersByTime(DONE_MS - 1);
		expect(states).toEqual(["busy", "done"]);
		vi.advanceTimersByTime(1);
		expect(states).toEqual(["busy", "done", "idle"]);
	});

	it("goes straight to idle when the callback returns false", async () => {
		const { states, guard, onState } = setup();
		await trackAction(guard, async () => false, onState);
		expect(states).toEqual(["busy", "idle"]);
		vi.advanceTimersByTime(DONE_MS * 2);
		expect(states).toEqual(["busy", "idle"]);
	});

	it("reports failed when the callback throws, and can run again", async () => {
		const { states, guard, onState } = setup();
		await trackAction(
			guard,
			async () => {
				throw new Error("offline");
			},
			onState,
		);
		expect(states).toEqual(["busy", "failed"]);
		expect(guard.inFlight).toBe(false);
		await trackAction(guard, async () => {}, onState);
		expect(states).toEqual(["busy", "failed", "busy", "done"]);
	});

	it("drops a second call while the first is in flight", async () => {
		const { states, guard, onState } = setup();
		let release = () => {};
		const fn = vi.fn(() => new Promise<void>((r) => (release = r)));
		const first = trackAction(guard, fn, onState);
		await trackAction(guard, fn, onState);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(states).toEqual(["busy"]);
		release();
		await first;
		expect(states).toEqual(["busy", "done"]);
	});

	it("does not let an older done timer reset a newer run", async () => {
		const { states, guard, onState } = setup();
		await trackAction(guard, async () => {}, onState);
		let release = () => {};
		const second = trackAction(
			guard,
			() => new Promise<void>((r) => (release = r)),
			onState,
		);
		vi.advanceTimersByTime(DONE_MS);
		expect(states).toEqual(["busy", "done", "busy"]);
		release();
		await second;
		expect(states).toEqual(["busy", "done", "busy", "done"]);
	});
});
