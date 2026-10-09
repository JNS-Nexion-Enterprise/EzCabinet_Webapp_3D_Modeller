import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/auth/demoCustomer", () => ({ demoCustomer: async () => null }));

const findUnique = vi.hoisted(() => vi.fn());
const orderUpdateMany = vi.hoisted(() => vi.fn());
const notificationUpdateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		order: { findUnique },
		$transaction: (run: (tx: unknown) => unknown) =>
			run({
				order: { updateMany: orderUpdateMany },
				notification: { updateMany: notificationUpdateMany },
			}),
	},
}));

const { PATCH } = await import("@/app/api/orders/[token]/route");

const customer = (id: string): AuthUser => ({
	id,
	email: `${id}@x.com`,
	name: id,
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: false,
});

const details = {
	name: "Aisyah",
	phone: "012 345 6789",
	email: "a@example.com",
	siteAddress: "12 Jalan Meranti 4, 47120 Puchong",
	addressNotes: null,
	whatsappOptIn: true,
};

const edit = (body: unknown = details) =>
	PATCH(
		new Request("http://localhost/api/orders/tok", {
			method: "PATCH",
			body: JSON.stringify(body),
		}),
		{ params: Promise.resolve({ token: "tok" }) },
	);

beforeEach(() => {
	vi.stubEnv("VERCEL_ENV", undefined);
	vi.stubEnv("AUTH_ENABLED", "true");
	currentUser.mockReset();
	currentUser.mockResolvedValue(customer("owner"));
	findUnique.mockReset();
	findUnique.mockResolvedValue({
		id: "o1",
		userId: "owner",
		whatsappOptIn: false,
	});
	orderUpdateMany.mockReset();
	orderUpdateMany.mockResolvedValue({ count: 1 });
	notificationUpdateMany.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("PATCH /api/orders/[token]", () => {
	it("saves the owner's corrections, phone as E.164", async () => {
		const response = await edit();
		expect(response.status).toBe(200);
		const { where, data } = orderUpdateMany.mock.calls[0][0];
		expect(where).toMatchObject({
			id: "o1",
			status: { not: "CANCELLED" },
			productionStage: null,
			deliveries: { none: {} },
		});
		expect(data).toMatchObject({
			customerName: "Aisyah",
			customerPhone: "+60123456789",
			customerEmail: "a@example.com",
			siteAddress: "12 Jalan Meranti 4, 47120 Puchong",
			whatsappOptIn: true,
		});
		expect(data.whatsappOptInAt).toBeInstanceOf(Date);
	});

	it("re-points queued WhatsApp messages, and only queued ones", async () => {
		await edit();
		expect(notificationUpdateMany).toHaveBeenCalledWith({
			where: { orderId: "o1", status: "PENDING" },
			data: { to: "+60123456789" },
		});
	});

	it("keeps the original opt-in time when it was already on", async () => {
		findUnique.mockResolvedValue({
			id: "o1",
			userId: "owner",
			whatsappOptIn: true,
		});
		await edit();
		expect(orderUpdateMany.mock.calls[0][0].data.whatsappOptInAt).toBe(
			undefined,
		);
	});

	it("409s once the order is locked, re-pointing nothing", async () => {
		orderUpdateMany.mockResolvedValue({ count: 0 });
		const response = await edit();
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: "locked" });
		expect(notificationUpdateMany).not.toHaveBeenCalled();
	});

	it.each([
		["another customer", customer("stranger")],
		["staff who can read orders", { ...customer("s"), role: "ADMIN" as const }],
		["a signed-out visitor", null],
	])("404s for %s, writing nothing", async (_, who) => {
		currentUser.mockResolvedValue(who);
		expect((await edit()).status).toBe(404);
		expect(orderUpdateMany).not.toHaveBeenCalled();
	});

	it("404s an unknown token the same way", async () => {
		findUnique.mockResolvedValue(null);
		expect((await edit()).status).toBe(404);
	});

	it("401s name_required for the owner without a name, writing nothing", async () => {
		currentUser.mockResolvedValue({
			...customer("owner"),
			mustSetName: true,
		});
		const response = await edit();
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "name_required" });
		expect(orderUpdateMany).not.toHaveBeenCalled();
	});

	it("401s passkey_required for the owner without a passkey", async () => {
		currentUser.mockResolvedValue({
			...customer("owner"),
			mustVerifyPasskey: true,
		});
		const response = await edit();
		expect(response.status).toBe(401);
		expect(orderUpdateMany).not.toHaveBeenCalled();
	});

	it.each([
		["a missing name", { ...details, name: " " }, 400],
		["a short address", { ...details, siteAddress: "x" }, 400],
		["no opt-in answer", { ...details, whatsappOptIn: undefined }, 400],
		["a phone nobody can ring", { ...details, phone: "12" }, 422],
	])("refuses %s", async (_, body, status) => {
		expect((await edit(body)).status).toBe(status);
		expect(orderUpdateMany).not.toHaveBeenCalled();
	});
});
