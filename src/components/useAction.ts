import { useCallback, useRef, useState } from "react";

/**
 * One state machine for a button that waits on the network.
 *
 * Handlers used to set a busy flag by hand and clear it after the response, so
 * a dropped connection left the button dead until a reload, a fast double-click
 * sent the request twice, and nothing showed that an action had finished. This
 * owns all three: the flag is always cleared, a second press while one is in
 * flight is dropped, and a success shows a done mark for a moment.
 */
export type ActionState = "idle" | "busy" | "done" | "failed";

/** How long a finished action shows its done mark. */
export const DONE_MS = 2000;

/** Admin screens' wording for a request that never got an answer. Customer pages use their dictionary. */
export const NETWORK_ERROR =
	"Couldn't reach the server. Check your connection and try again.";

/**
 * The framework-free core, so it can be tested under node.
 *
 * `fn` returns `false` when it handled a failure itself (it shows its own
 * message, so no done mark); anything else is a success. A throw is a request
 * that got no answer: the state becomes `failed` and stays until the next run,
 * and nothing is rethrown, because rendering `failed` is the handling.
 */
export async function trackAction(
	guard: { inFlight: boolean; seq: number },
	fn: () => Promise<boolean | void>,
	onState: (state: ActionState) => void,
): Promise<void> {
	if (guard.inFlight) return;
	guard.inFlight = true;
	const mine = ++guard.seq;
	onState("busy");
	try {
		const result = await fn();
		if (result === false) {
			onState("idle");
			return;
		}
		onState("done");
		// A newer run must not be reset to idle by an older run's timer.
		setTimeout(() => {
			if (guard.seq === mine) onState("idle");
		}, DONE_MS);
	} catch {
		onState("failed");
	} finally {
		guard.inFlight = false;
	}
}

export function useAction<A extends unknown[]>(
	fn: (...args: A) => Promise<boolean | void>,
) {
	const [state, setState] = useState<ActionState>("idle");
	const guard = useRef({ inFlight: false, seq: 0 });
	// Always the latest `fn`, so `run` can stay stable without calling a stale closure.
	const latest = useRef(fn);
	latest.current = fn;
	const run = useCallback(
		(...args: A) =>
			trackAction(guard.current, () => latest.current(...args), setState),
		[],
	);
	return {
		run,
		state,
		busy: state === "busy",
		done: state === "done",
		failed: state === "failed",
	};
}
