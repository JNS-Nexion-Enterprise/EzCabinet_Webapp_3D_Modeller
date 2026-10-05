import { describe, expect, it } from "vitest";
import { twoFactorMessage } from "../twoFactorMessage";

describe("twoFactorMessage", () => {
	it("has one message for any wrong code", () => {
		const wrong = "That code didn't work. Try again";
		expect(twoFactorMessage("INVALID_CODE")).toBe(wrong);
		expect(twoFactorMessage("INVALID_BACKUP_CODE")).toBe(wrong);
		expect(twoFactorMessage(undefined)).toBe(wrong);
		expect(twoFactorMessage("SOMETHING_NEW")).toBe(wrong);
	});
	it("says so when the account is locked, instead of inviting another try", () => {
		const locked = "Too many attempts. Wait a few minutes, then sign in again";
		expect(twoFactorMessage("ACCOUNT_TEMPORARILY_LOCKED")).toBe(locked);
		expect(twoFactorMessage("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE")).toBe(locked);
	});
	it("sends an expired prompt back to the password", () => {
		expect(twoFactorMessage("INVALID_TWO_FACTOR_COOKIE")).toBe(
			"That took too long. Sign in again",
		);
	});
});
