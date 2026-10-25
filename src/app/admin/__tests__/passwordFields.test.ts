import { describe, expect, it } from "vitest";
import {
	changePasswordFailure,
	checkNewPassword,
	resetPasswordFailure,
} from "../passwordFields";

describe("checkNewPassword", () => {
	it("marks a short new password, and a confirmation that differs", () => {
		expect(checkNewPassword("short", "short")).toEqual({
			newPassword: "New password must be at least 12 characters.",
		});
		expect(checkNewPassword("a-long-enough-one", "another-long-one")).toEqual({
			confirm: "The two passwords do not match.",
		});
	});

	it("marks both when both are wrong, new first", () => {
		expect(Object.keys(checkNewPassword("short", "other"))).toEqual([
			"newPassword",
			"confirm",
		]);
	});

	it("passes a long matching pair", () => {
		expect(checkNewPassword("a-long-enough-one", "a-long-enough-one")).toEqual(
			{},
		);
	});
});

describe("changePasswordFailure", () => {
	it("puts a wrong current password on its field", () => {
		expect(changePasswordFailure("INVALID_PASSWORD")).toEqual({
			errors: { current: "That is not your current password." },
			banner: null,
		});
	});

	it("puts a short password on the new field", () => {
		expect(changePasswordFailure("PASSWORD_TOO_SHORT").errors.newPassword).toBe(
			"New password must be at least 12 characters.",
		);
	});

	it("keeps the rest in a banner, in plain words", () => {
		expect(changePasswordFailure("flag_not_cleared").banner).toMatch(
			/password was changed/,
		);
		expect(changePasswordFailure("toString")).toEqual({
			errors: {},
			banner: "Could not change password. Try again.",
		});
	});
});

describe("resetPasswordFailure", () => {
	it("marks a short password and calls anything else a dead link", () => {
		expect(resetPasswordFailure("PASSWORD_TOO_SHORT").errors.newPassword).toBe(
			"New password must be at least 12 characters.",
		);
		expect(resetPasswordFailure("INVALID_TOKEN")).toEqual({
			errors: {},
			banner: "This link has expired or was already used. Request a new one.",
		});
	});
});
