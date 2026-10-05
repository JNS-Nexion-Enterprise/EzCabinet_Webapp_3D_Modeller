import { describe, expect, it } from "vitest";
import { secretOf } from "../totpSecret";

describe("secretOf", () => {
	it("reads the secret out of an otpauth URI", () => {
		expect(
			secretOf(
				"otpauth://totp/EzCabinet%20Admin:a%40b.com?secret=JBSWY3DPEHPK3PXP&issuer=EzCabinet%20Admin&digits=6&period=30",
			),
		).toBe("JBSWY3DPEHPK3PXP");
	});
	it("is empty rather than throwing on something that is not a URI", () => {
		expect(secretOf("not a uri")).toBe("");
	});
});
