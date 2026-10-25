import { describe, expect, it } from "vitest";
import { inviteErrors } from "../inviteFields";

describe("inviteErrors", () => {
	it("puts an existing staff address on the email field", () => {
		expect(inviteErrors(409, { error: "already_staff" })).toEqual({
			email: "That address already belongs to a staff member.",
		});
	});

	it("maps issues onto fields, once each", () => {
		const errors = inviteErrors(400, {
			error: "invalid_body",
			issues: [
				{ path: ["password"] },
				{ path: ["email"] },
				{ path: ["password"] },
				{ path: ["role"] },
			],
		});
		expect(Object.keys(errors)).toEqual(["password", "email"]);
		expect(errors.password).toBe("Use at least 12 characters.");
	});

	it("ignores prototype keys and non-400 replies", () => {
		expect(inviteErrors(400, { issues: [{ path: ["toString"] }] })).toEqual({});
		expect(inviteErrors(500, { error: "create_failed" })).toEqual({});
		expect(inviteErrors(400, null)).toEqual({});
	});
});
