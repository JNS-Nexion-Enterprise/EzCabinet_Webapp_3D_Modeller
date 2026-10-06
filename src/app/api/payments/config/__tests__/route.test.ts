import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/payments/registry", () => ({
	activeGateway: async () => null,
}));

const { GET } = await import("../route");

const customer = (mustVerifyPasskey: boolean): AuthUser => ({
	id: "c1",
	email: "c@x.com",
	name: "C",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey,
});

beforeEach(() => {
	vi.stubEnv("VERCEL_ENV", undefined);
	vi.stubEnv("AUTH_ENABLED", "true");
	currentUser.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/payments/config, passkeyRequired", () => {
	it("is false signed out", async () => {
		currentUser.mockResolvedValue(null);
		expect((await (await GET()).json()).passkeyRequired).toBe(false);
	});

	it("is false for a customer who has passed the passkey", async () => {
		currentUser.mockResolvedValue(customer(false));
		expect((await (await GET()).json()).passkeyRequired).toBe(false);
	});

	it("is true for a customer who owes it, and the answer is never cached", async () => {
		currentUser.mockResolvedValue(customer(true));
		const response = await GET();
		expect((await response.json()).passkeyRequired).toBe(true);
		expect(response.headers.get("Cache-Control")).toBe("no-store");
	});

	it("is false with AUTH_ENABLED off, without reading the user", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		currentUser.mockResolvedValue(customer(true));
		expect((await (await GET()).json()).passkeyRequired).toBe(false);
		expect(currentUser).not.toHaveBeenCalled();
	});
});
