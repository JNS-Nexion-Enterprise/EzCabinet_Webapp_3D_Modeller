/**
 * The fields a server's zod `issues` name, first-failing first, each once.
 * Anything that is not an issue with an array `path`, or that `toField` does
 * not recognise, is skipped: a reply that cannot be mapped to a field must
 * leave the caller on its generic message, never throw.
 */
export function fieldsFromIssues<K extends string>(
	issues: unknown,
	toField: (path: readonly PropertyKey[]) => K | null,
): K[] {
	if (!Array.isArray(issues)) return [];
	const out: K[] = [];
	for (const issue of issues) {
		const path = (issue as { path?: unknown } | null)?.path;
		if (!Array.isArray(path)) continue;
		const field = toField(path);
		if (field !== null && !out.includes(field)) out.push(field);
	}
	return out;
}
