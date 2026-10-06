// Pinned, not the runtime's zone: this renders on the server (UTC) and again
// in the browser, and a passkey made after 16:00 UTC is a different day in
// each, which React reports as a hydration mismatch. Customers are in Malaysia.
const ZONE = "Asia/Kuala_Lumpur";

export function passkeyDate(iso: string | null, lang: string): string {
	if (!iso) return "";
	return new Date(iso).toLocaleDateString(lang, {
		dateStyle: "medium",
		timeZone: ZONE,
	});
}
