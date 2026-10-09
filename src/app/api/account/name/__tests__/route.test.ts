import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "@/lib/auth/session";

const currentUser = vi.hoisted(() => vi.fn<() => Promise<AuthUser | null>>());
const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ currentUser }));
vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { updateMany } } }));

const { POST } = await import("../route");

const nameless = (over: Partial<AuthUser> = {}): AuthUser => ({
	id: "c1",
	email: "aiman@outlook.com",
	name: "",
	image: null,
	role: "CUSTOMER",
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	mustVerifyPasskey: true,
	mustSetName: true,
	...over,
});

const post = (body: unknown) =>
	POST(
		new Request("http://x/api/account/name", {
			method: "POST",
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
	);

beforeEach(() => {
	vi.clearAllMocks();
	currentUser.mockResolvedValue(nameless());
	updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /api/account/name", () => {
	it("sets the caller's own name, trimmed, and nothing else", async () => {
		const response = await post({
			name: "  Aiman bin Ali ",
			role: "SUPERADMIN",
			email: "boss@x.com",
			id: "someone-else",
		});
		expect(response.status).toBe(200);
		expect(updateMany).toHaveBeenCalledTimes(1);
		expect(updateMany).toHaveBeenCalledWith({
			where: { id: "c1", role: "CUSTOMER", name: "" },
			data: { name: "Aiman bin Ali" },
		});
	});

	// Two requests that both read "no name yet": the write itself decides.
	it("409s the second of two writes, and the first name stands", async () => {
		let stored = "";
		updateMany.mockImplementation(async ({ where, data }) => {
			if (stored !== where.name) return { count: 0 };
			stored = data.name;
			return { count: 1 };
		});
		const [first, second] = await Promise.all([
			post({ name: "Aiman bin Ali" }),
			post({ name: "Somebody Else" }),
		]);
		expect(first.status).toBe(200);
		expect(second.status).toBe(409);
		expect(await second.json()).toEqual({ error: "name_set" });
		expect(stored).toBe("Aiman bin Ali");
	});

	it.each([
		["Chinese", "李明"],
		["Jawi", "أيمن بن علي"],
		["an emoji", "Aiman 🙂"],
	])("stores a name in %s as typed", async (_label, name) => {
		expect((await post({ name })).status).toBe(200);
		expect(updateMany.mock.calls[0][0].data).toEqual({ name });
	});

	it("401s a signed-out caller and writes nothing", async () => {
		currentUser.mockResolvedValue(null);
		const response = await post({ name: "Aiman" });
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({ error: "sign_in_required" });
		expect(updateMany).not.toHaveBeenCalled();
	});

	it.each(["ADMIN", "SUPERADMIN"] as const)(
		"403s %s and writes nothing",
		async (role) => {
			currentUser.mockResolvedValue(
				nameless({ role, mustSetName: false, mustVerifyPasskey: false }),
			);
			expect((await post({ name: "Aiman" })).status).toBe(403);
			expect(updateMany).not.toHaveBeenCalled();
		},
	);

	// No rename: a session that has only signed in must not relabel an account.
	it("409s a customer who already has a name", async () => {
		currentUser.mockResolvedValue(
			nameless({ name: "Aiman", mustSetName: false }),
		);
		const response = await post({ name: "Somebody Else" });
		expect(response.status).toBe(409);
		expect(updateMany).not.toHaveBeenCalled();
	});

	it.each([
		["nothing", { name: "" }, "name_required"],
		["one letter", { name: "A" }, "name_required"],
		["no name key", {}, "name_required"],
		["a body that is not JSON", "not json", "name_required"],
		["a name that is not a string", { name: 42 }, "name_required"],
		["the business", { name: "EzCabinet Support" }, "name_refused"],
		["admin", { name: "admin" }, "name_refused"],
		["a direction override", { name: "Aiman‮ilA" }, "name_refused"],
		["81 characters", { name: "a".repeat(81) }, "name_refused"],
	])("400s %s and writes nothing", async (_label, body, error) => {
		const response = await post(body);
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error });
		expect(updateMany).not.toHaveBeenCalled();
	});
});
