import "server-only";

/**
 * The app's one outbound email, through Resend's HTTP API. A single POST, so
 * no SDK: the dependency would be larger than this file.
 *
 * Never throws and never blocks the caller on a failure: every caller is
 * reporting on something that has already happened, and the answer shown to
 * the person on screen must not depend on whether mail went out. Unset
 * credentials are the normal state on a preview deployment — preview never
 * gets `RESEND_API_KEY`, the same rule as `WHATSAPP_TOKEN`.
 */
/** Whether a send would even be attempted. The outbox asks before claiming a row. */
export const emailConfigured = (): boolean =>
	Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

/**
 * What became of one mail. The outbox retries on it: `refused` is Resend
 * saying no to this mail, which uses up a try; `unavailable` is our key,
 * their rate limit or their outage, where every mail would fail the same way
 * and none of them should be given up on.
 */
export type EmailOutcome = "sent" | "refused" | "unavailable";

export async function deliverEmail(message: {
	to: string;
	subject: string;
	text: string;
	html?: string;
}): Promise<EmailOutcome> {
	const key = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!key || !from) {
		console.warn("Email not configured; nothing sent", message.subject);
		return "unavailable";
	}
	try {
		const response = await fetch("https://api.resend.com/emails", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${key}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ from, ...message }),
			signal: AbortSignal.timeout(10_000),
		});
		if (response.ok) return "sent";
		console.error("Resend refused an email", response.status);
		const ours = [401, 403, 429].includes(response.status);
		return ours || response.status >= 500 ? "unavailable" : "refused";
	} catch (error) {
		console.error("Could not reach Resend", error);
		return "unavailable";
	}
}

/** For a caller that only reports on something already done: sent, or not. */
export async function sendEmail(
	message: Parameters<typeof deliverEmail>[0],
): Promise<boolean> {
	return (await deliverEmail(message)) === "sent";
}
