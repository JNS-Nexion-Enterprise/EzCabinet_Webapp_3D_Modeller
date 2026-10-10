/**
 * Whether this browser can do a passkey ceremony at all. The in-app browsers
 * a WhatsApp or Facebook link opens in usually cannot, and a button that
 * silently does nothing there is the worst outcome — the page says to open
 * the link in Chrome or Safari instead.
 */
export function passkeysSupported(
	win: { PublicKeyCredential?: unknown } | undefined,
): boolean {
	return typeof win?.PublicKeyCredential === "function";
}
