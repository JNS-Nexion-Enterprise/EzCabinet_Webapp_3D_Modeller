import { fieldsFromIssues } from "@/lib/fieldIssues";

/**
 * Which invite inputs a refused invite can be pinned on, and what each says.
 * The role is a select with fixed options, so it never fails on its own.
 */
export type InviteField = "email" | "name" | "password";
export type InviteErrors = Partial<Record<InviteField, string>>;

const MESSAGES: Record<InviteField, string> = {
	email: "Enter a valid work email.",
	name: "Enter the person's name.",
	password: "Use at least 12 characters.",
};

/** Staff cannot be invited twice, so the address itself is what is wrong. */
export const ALREADY_STAFF = "That address already belongs to a staff member.";

/** The API's field names are ours; anything else (role) maps to no input. */
const isInviteField = (key: unknown): key is InviteField =>
	typeof key === "string" && Object.hasOwn(MESSAGES, key);

/** The marks a rejected invite puts on the form. Empty when no input can carry the failure. */
export function inviteErrors(status: number, body: unknown): InviteErrors {
	const reply = body as { error?: unknown; issues?: unknown } | null;
	if (reply?.error === "already_staff") return { email: ALREADY_STAFF };
	if (status !== 400) return {};
	return Object.fromEntries(
		fieldsFromIssues(reply?.issues, (path) =>
			isInviteField(path[0]) ? path[0] : null,
		).map((f) => [f, MESSAGES[f]]),
	);
}
