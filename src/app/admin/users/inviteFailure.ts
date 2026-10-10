/**
 * What the invite form says for a refused invite. `signed_in_meanwhile` is
 * the invitee's first code sign-in landing mid-invite: nothing was granted,
 * and a second press finds that row and promotes it.
 */
export function inviteFailure(error: unknown): string {
	if (error === "already_staff") {
		return "That email already has a staff account.";
	}
	if (error === "signed_in_meanwhile") {
		return "That address signed in as a customer a moment ago. Invite it again to promote that account.";
	}
	return "Could not create that account.";
}
