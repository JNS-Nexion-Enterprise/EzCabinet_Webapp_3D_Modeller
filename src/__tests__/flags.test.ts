import { afterEach, describe, expect, it, vi } from "vitest";

// The definition itself is what is under test: what the flag answers when
// Vercel Flags cannot (the SDK returns `defaultValue` on any adapter error).
vi.mock("flags/next", () => ({ flag: (definition: unknown) => definition }));
vi.mock("@flags-sdk/vercel", () => ({ vercelAdapter: {} }));

const fallback = async () => {
	vi.resetModules();
	const { paymentGatewayFlag } = await import("@/flags");
	return (paymentGatewayFlag as unknown as { defaultValue: string })
		.defaultValue;
};

afterEach(() => vi.unstubAllEnvs());

describe("payment-gateway flag, when Vercel Flags cannot answer", () => {
	it("falls back to bank transfer when nothing is configured", async () => {
		vi.stubEnv("PAYMENT_GATEWAY_FALLBACK", "");
		await expect(fallback()).resolves.toBe("manual");
	});

	// A flags outage, or an expired local token, must not switch online
	// payment off for an environment that is meant to have it.
	it("falls back to the gateway the environment names", async () => {
		vi.stubEnv("PAYMENT_GATEWAY_FALLBACK", "stripe");
		await expect(fallback()).resolves.toBe("stripe");
	});
});
