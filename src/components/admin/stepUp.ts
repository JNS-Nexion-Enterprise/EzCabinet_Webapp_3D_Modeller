import { failureReason } from "@/app/[lang]/verify/failureReason";
import { authClient } from "@/lib/auth/client";

/** The passkey step failed for a reason other than the prompt being dismissed. */
export const PASSKEY_FAILED =
	"Not confirmed with your passkey. If you have none on this device, set one up under Security first.";
/** The browser's prompt was closed or timed out. */
export const PASSKEY_DISMISSED =
	"The passkey prompt was dismissed, so nothing was changed. Try again when you are ready.";
/** The passkey step passed, yet the server still wants one. */
export const PASSKEY_AGAIN = "Confirm with your passkey again.";

const owesStepUp = async (response: Response): Promise<boolean> =>
	response.status === 403 &&
	(
		await response
			.clone()
			.json()
			.catch(() => null)
	)?.error === "step_up_required";

/**
 * `fetch` for a step-up guarded admin route (`withAuth`'s `stepUp`).
 *
 * The server decides whether a passkey is owed: a 403 `step_up_required`
 * means no ceremony in the last few minutes, so this runs one and repeats the
 * request once. Asking the server first means no prompt inside the window,
 * and none at all with auth off, where the server skips the check.
 *
 * A string is the message to show when the passkey step did not get the
 * request through; the action did not run.
 */
export async function fetchGuarded(
	input: string,
	init?: RequestInit,
): Promise<Response | string> {
	const response = await fetch(input, init);
	if (!(await owesStepUp(response))) return response;

	let code: string | undefined;
	try {
		const outcome = await authClient.signIn.passkey();
		if (outcome?.error) {
			// `code` is on the runtime error but missing from the inferred type.
			code = (outcome.error as { code?: string }).code ?? "unknown";
		}
	} catch {
		// A dismissed browser prompt can reject rather than resolve an error.
		code = "AUTH_CANCELLED";
	}
	if (code !== undefined) {
		return failureReason(code) === "cancelled"
			? PASSKEY_DISMISSED
			: PASSKEY_FAILED;
	}

	const repeated = await fetch(input, init);
	return (await owesStepUp(repeated)) ? PASSKEY_AGAIN : repeated;
}
