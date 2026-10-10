import { describe, expect, it } from "vitest";
import { inviteFailure } from "../inviteFailure";

describe("inviteFailure", () => {
	it.each([
		["already_staff", "That email already has a staff account."],
		// The retry finds the row and promotes it, so the message says to retry.
		[
			"signed_in_meanwhile",
			"That address signed in as a customer a moment ago. Invite it again to promote that account.",
		],
		["create_failed", "Could not create that account."],
		[undefined, "Could not create that account."],
	])("%s", (error, message) => {
		expect(inviteFailure(error)).toBe(message);
	});
});
