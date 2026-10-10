/** The first character whole: `charAt(0)` would cut an emoji or a rare Han character in half. */
const head = (text: string): string => [...text][0] ?? "";

/**
 * Up to two characters for an avatar: the first and last word of the name
 * that start with a letter or a digit, else the email. A word that starts
 * with anything else — an emoji, a dash — is skipped.
 */
export function initialsOf(
	name: string | null | undefined,
	email: string,
): string {
	const words = (name ?? "")
		.split(/\s+/)
		.filter((word) => /^[\p{L}\p{N}]/u.test(word));
	if (words.length === 0) return head(email).toUpperCase();
	const last = words.length > 1 ? head(words[words.length - 1]) : "";
	return (head(words[0]) + last).toUpperCase();
}
