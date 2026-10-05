/** The key to type by hand when the QR code cannot be scanned. */
export function secretOf(totpURI: string): string {
	try {
		return new URL(totpURI).searchParams.get("secret") ?? "";
	} catch {
		return "";
	}
}
