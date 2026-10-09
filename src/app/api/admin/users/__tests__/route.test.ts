import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const signUpEmail = vi.hoisted(() => vi.fn());
const hash = vi.hoisted(() => vi.fn(async (_password: string) => "hashed!"));
const accountFindFirst = vi.hoisted(() => vi.fn());
const accountCreate = vi.hoisted(() => vi.fn());
const accountDeleteMany = vi.hoisted(() => vi.fn());
const sessionDeleteMany = vi.hoisted(() => vi.fn());
const $transaction = vi.hoisted(() => vi.fn(async (ops: unknown[]) => ops));
const sendStaffInvite = vi.hoisted(() =>
	vi.fn(async (_input: { hasPassword: boolean; name: string }) => true),
);

vi.mock("@/lib/auth/requireAuth", async () => {
	const actual = await vi.importActual<typeof import("@/lib/auth/requireAuth")>(
		"@/lib/auth/requireAuth",
	);
	return { ...actual, requireAuth };
});
vi.mock("@/lib/auth", () => ({
	auth: {
		api: { signUpEmail },
		$context: Promise.resolve({ password: { hash } }),
	},
}));
vi.mock("@/lib/auth/inviteMail", () => ({ sendStaffInvite }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: { findUnique, update },
		account: {
			findFirst: accountFindFirst,
			create: accountCreate,
			deleteMany: accountDeleteMany,
		},
		session: { deleteMany: sessionDeleteMany },
		$transaction,
	},
}));

const { POST } = await import("../route");

const superadmin = {
	id: "boss",
	email: "boss@x.com",
	name: "Boss",
	image: null,
	role: "SUPERADMIN" as const,
	disabled: false,
	mustChangePassword: false,
	mustSetupTwoFactor: false,
	passkeyVerifiedAt: new Date(),
};

const invite = (email = "new@x.com") =>
	POST(
		new Request("http://x", {
			method: "POST",
			body: JSON.stringify({
				email,
				name: "New",
				role: "SUPERADMIN",
				password: "a-long-enough-password",
			}),
		}),
		undefined as never,
	);

beforeEach(() => {
	vi.clearAllMocks();
	requireAuth.mockResolvedValue(superadmin);
});

describe("POST /api/admin/users", () => {
	// An invite grants a role. Without the step-up, a held superadmin session
	// could promote an account it controls and enrol that account's passkey.
	it("403s without a recent passkey ceremony and creates nobody", async () => {
		requireAuth.mockResolvedValue({ ...superadmin, passkeyVerifiedAt: null });
		const response = await invite();
		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: "step_up_required",
		});
		expect(requireAuth).toHaveBeenCalledWith("users:manage");
		expect(findUnique).not.toHaveBeenCalled();
		expect(signUpEmail).not.toHaveBeenCalled();
		expect(update).not.toHaveBeenCalled();
	});

	it("invites once the passkey step has passed", async () => {
		findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: "u9", role: "CUSTOMER" });
		const response = await invite();
		expect(response.status).toBe(201);
		expect(update.mock.calls[0][0]).toMatchObject({
			where: { id: "u9" },
			data: { role: "SUPERADMIN", invitedById: "boss" },
		});
	});

	describe("promoting an existing customer", () => {
		// Signed up with an emailed code: no Google, no password.
		const codeCustomer = {
			id: "c1",
			email: "aiman@outlook.com",
			name: "Aiman bin Ali",
			role: "CUSTOMER",
		};

		it("gives a code-only customer the invite password, since staff cannot use a code", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce(null);
			const response = await invite("aiman@outlook.com");
			expect(response.status).toBe(200);
			await expect(response.json()).resolves.toMatchObject({
				promoted: true,
				passwordSet: true,
			});
			expect(accountFindFirst).toHaveBeenCalledWith({
				where: { userId: "c1", providerId: "google" },
				select: { id: true },
			});
			expect(hash).toHaveBeenCalledWith("a-long-enough-password");
			expect(accountCreate.mock.calls[0][0].data).toMatchObject({
				accountId: "c1",
				providerId: "credential",
				userId: "c1",
				password: "hashed!",
			});
			expect(update.mock.calls[0][0]).toMatchObject({
				where: { id: "c1" },
				data: {
					role: "SUPERADMIN",
					emailVerified: true,
					mustChangePassword: true,
					// Their own name stays; the form's is for a row without one.
					name: "Aiman bin Ali",
				},
			});
			// Old sign-ins and sessions go in the same transaction as the role.
			expect($transaction.mock.calls[0][0]).toHaveLength(4);
			expect(sendStaffInvite.mock.calls[0][0]).toMatchObject({
				hasPassword: true,
				name: "Aiman bin Ali",
			});
		});

		it("leaves a Google customer signing in with Google, with no password", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce({ id: "a1" });
			const response = await invite("aiman@outlook.com");
			await expect(response.json()).resolves.toMatchObject({
				promoted: true,
				passwordSet: false,
			});
			expect(hash).not.toHaveBeenCalled();
			expect(accountCreate).not.toHaveBeenCalled();
			expect(update.mock.calls[0][0].data).not.toHaveProperty(
				"mustChangePassword",
			);
			expect(sendStaffInvite.mock.calls[0][0]).toMatchObject({
				hasPassword: false,
				name: "Aiman bin Ali",
			});
		});

		it("finds the customer when the address is typed with capitals", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce(null);
			await invite("Aiman@Outlook.com");
			expect(findUnique).toHaveBeenCalledWith({
				where: { email: "aiman@outlook.com" },
			});
		});

		it("uses the typed name for a customer who never gave one", async () => {
			findUnique.mockResolvedValueOnce({ ...codeCustomer, name: "" });
			accountFindFirst.mockResolvedValueOnce(null);
			await invite("aiman@outlook.com");
			expect(update.mock.calls[0][0].data.name).toBe("New");
			expect(sendStaffInvite.mock.calls[0][0].name).toBe("New");
		});

		it("still refuses an address that is already staff", async () => {
			findUnique.mockResolvedValueOnce({ ...codeCustomer, role: "ADMIN" });
			const response = await invite("aiman@outlook.com");
			expect(response.status).toBe(409);
			expect(accountCreate).not.toHaveBeenCalled();
			expect(update).not.toHaveBeenCalled();
		});
	});
});
