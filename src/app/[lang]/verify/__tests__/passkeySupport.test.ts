import { describe, expect, it } from "vitest";
import { passkeysSupported } from "../passkeySupport";

describe("passkeysSupported", () => {
	it("is true where the browser exposes WebAuthn", () => {
		expect(
			passkeysSupported({
				PublicKeyCredential: function PublicKeyCredential() {},
			}),
		).toBe(true);
	});
	it("is false in an in-app browser without it", () => {
		expect(passkeysSupported({})).toBe(false);
	});
	it("is false on the server", () => {
		expect(passkeysSupported(undefined)).toBe(false);
	});
});
