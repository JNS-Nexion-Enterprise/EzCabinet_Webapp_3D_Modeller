import { describe, expect, it } from "vitest";
import { passkeysSupported } from "../passkeySupport";

// At module level: inside a function, Biome reads the capitalised key as a
// React component defined in a render.
const withWebAuthn = { PublicKeyCredential: () => {} };

describe("passkeysSupported", () => {
	it("is true where the browser exposes WebAuthn", () => {
		expect(passkeysSupported(withWebAuthn)).toBe(true);
	});
	it("is false in an in-app browser without it", () => {
		expect(passkeysSupported({})).toBe(false);
	});
	it("is false on the server", () => {
		expect(passkeysSupported(undefined)).toBe(false);
	});
});
