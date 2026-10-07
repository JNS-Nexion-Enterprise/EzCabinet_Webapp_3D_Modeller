import { authClient } from "@/lib/auth/client";

/** Shown when the passkey prompt was dismissed, failed, or there is no passkey. */
export const PASSKEY_FAILED =
	"Not confirmed with your passkey. If you have none on this device, set one up under Security first.";

/**
 * `fetch` for a step-up guarded admin route (`withAuth`'s `stepUp`).
 *
 * The server decides whether a passkey is owed: a 403 `step_up_required`
 * means no ceremony in the last few minutes, so this runs one and repeats the
 * request once. Asking the server first means no prompt inside the window,
 * and none at all with auth off, where the server skips the check.
 *
 * Null when the passkey step did not succeed; the request was not repeated.
 */
export async function fetchGuarded(
	input: string,
	init?: RequestInit,
): Promise<Response | null> {
	const response = await fetch(input, init);
	if (response.status !== 403) return response;
	const body = await response
		.clone()
		.json()
		.catch(() => null);
	if (body?.error !== "step_up_required") return response;

	let failed = true;
	try {
		failed = Boolean((await authClient.signIn.passkey())?.error);
	} catch {
		// A dismissed browser prompt rejects rather than resolving an error.
	}
	return failed ? null : fetch(input, init);
}
