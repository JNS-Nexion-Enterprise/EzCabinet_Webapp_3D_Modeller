import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
const CLIENT = { kind: "stripe-elements", publishableKey: "pk_test" };
vi.mock("@/lib/payments/registry", () => ({
	activeGateway: async () => ({ client: CLIENT }),
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

	it("is false for staff", async () => {
		currentUser.mockResolvedValue({ ...customer(false), role: "ADMIN" });
		expect((await (await GET()).json()).passkeyRequired).toBe(false);
	});

	it("still answers 200 with the gateway when reading the user fails", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		currentUser.mockRejectedValue(new Error("db down"));
		const response = await GET();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			client: CLIENT,
			signIn: true,
			nameRequired: false,
			passkeyRequired: false,
		});
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});

	it("is false with AUTH_ENABLED off, without reading the user", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		currentUser.mockResolvedValue(customer(true));
		expect((await (await GET()).json()).passkeyRequired).toBe(false);
		expect(currentUser).not.toHaveBeenCalled();
	});
});

describe("GET /api/payments/config, nameRequired", () => {
	it("is false signed out and for a customer with a name", async () => {
		currentUser.mockResolvedValue(null);
		expect((await (await GET()).json()).nameRequired).toBe(false);
		currentUser.mockResolvedValue(customer(true));
		expect((await (await GET()).json()).nameRequired).toBe(false);
	});

	it("is true for a customer who owes a name, beside the passkey", async () => {
		currentUser.mockResolvedValue({
			...customer(true),
			name: "",
			mustSetName: true,
		});
		expect(await (await GET()).json()).toMatchObject({
			nameRequired: true,
			passkeyRequired: true,
		});
	});

	it("is false with AUTH_ENABLED off", async () => {
		vi.stubEnv("AUTH_ENABLED", "false");
		currentUser.mockResolvedValue({ ...customer(false), mustSetName: true });
		expect((await (await GET()).json()).nameRequired).toBe(false);
	});
});
