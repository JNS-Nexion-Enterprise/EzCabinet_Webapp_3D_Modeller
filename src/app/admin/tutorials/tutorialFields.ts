import { fieldsFromIssues } from "@/lib/fieldIssues";

/** The server's caps (`tutorialInputSchema`, `lib/tutorials.ts`), so the inputs can stop typing at them. */
export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 1000;

export type TutorialField = "title" | "description";
export type TutorialErrors = Partial<Record<TutorialField, string>>;

const MESSAGES: Record<TutorialField, string> = {
	title: `Enter a title of ${TITLE_MAX} characters or fewer.`,
	description: `Keep the description to ${DESCRIPTION_MAX} characters or fewer.`,
};

const fieldOf = (head: unknown): TutorialField | null =>
	typeof head === "string" && Object.hasOwn(MESSAGES, head)
		? (head as TutorialField)
		: null;

/**
 * What a rejected publish says: marks for the inputs the server's `issues`
 * name, and a plain-words banner for whatever no input carries (the raw
 * "invalid tutorial" code is not for staff to read).
 */
export function tutorialFailure(body: unknown): {
	errors: TutorialErrors;
	banner: string | null;
} {
	const issues = (body as { issues?: unknown } | null)?.issues;
	const mapped = fieldsFromIssues(issues, (path) => fieldOf(path[0]));
	const errors = Object.fromEntries(mapped.map((f) => [f, MESSAGES[f]]));
	const list = Array.isArray(issues) ? issues : [];
	// Issues the form has no input for would otherwise go unsaid.
	const carried = list.every(
		(i) => fieldOf((i as { path?: unknown[] } | null)?.path?.[0]) !== null,
	);
	if (list.length > 0 && carried) return { errors, banner: null };
	return {
		errors,
		banner:
			list.length > 0
				? "Some details were not accepted. Reload the page and try again."
				: "Could not publish this tutorial.",
	};
}
