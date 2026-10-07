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
export async function sendEmail(message: {
	to: string;
	subject: string;
	text: string;
	html?: string;
}): Promise<boolean> {
	const key = process.env.RESEND_API_KEY;
	const from = process.env.EMAIL_FROM;
	if (!key || !from) {
		console.warn("Email not configured; nothing sent", message.subject);
		return false;
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
		if (!response.ok) {
			console.error("Resend refused an email", response.status);
			return false;
		}
		return true;
	} catch (error) {
		console.error("Could not reach Resend", error);
		return false;
	}
}
