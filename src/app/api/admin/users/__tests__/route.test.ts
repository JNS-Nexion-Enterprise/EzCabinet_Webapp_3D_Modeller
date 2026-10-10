import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.hoisted(() => vi.fn());
const findUnique = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
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
		user: { findUnique, update, updateMany },
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
	updateMany.mockResolvedValue({ count: 1 });
});

/** What Better Auth answers a sign-up with: the row it made, or a made-up one. */
const signedUp = (id: string) =>
	signUpEmail.mockResolvedValueOnce(
		Response.json({ token: null, user: { id } }),
	);

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
		signedUp("u9");
		const response = await invite();
		expect(response.status).toBe(201);
		// The grant carries its own conditions: still a customer's row, still
		// holding the password the sign-up gave it.
		expect(updateMany).toHaveBeenCalledWith({
			where: {
				id: "u9",
				role: "CUSTOMER",
				accounts: { some: { providerId: "credential" } },
			},
			data: {
				role: "SUPERADMIN",
				emailVerified: true,
				mustChangePassword: true,
				invitedById: "boss",
			},
		});
		expect(accountDeleteMany).not.toHaveBeenCalled();
	});

	// The invitee's code sign-in can land between the sign-up and the grant,
	// while the row is still a customer's, and both session hooks let it by.
	it("ends the new row's sessions once the role is granted", async () => {
		findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: "u9", role: "CUSTOMER" });
		signedUp("u9");
		await invite();
		expect(sessionDeleteMany).toHaveBeenCalledTimes(1);
		expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "u9" } });
		expect(sessionDeleteMany.mock.invocationCallOrder[0]).toBeGreaterThan(
			updateMany.mock.invocationCallOrder[0],
		);
	});

	// A swallowed duplicate sign-up answers with a made-up row. The row found
	// by address is then someone else's: the invitee's own first code sign-in,
	// or a second superadmin's invite, whose password is not the one typed here.
	it.each([
		["a code sign-in made", null],
		["another invite made", { id: "a9" }],
	])("409s when the row it finds is one %s", async (_label, credential) => {
		findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: "theirs", role: "CUSTOMER" });
		accountFindFirst.mockResolvedValue(credential);
		signedUp("made-up");
		const response = await invite();
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({
			error: "signed_in_meanwhile",
		});
		expect(updateMany).not.toHaveBeenCalled();
		expect(sendStaffInvite).not.toHaveBeenCalled();
	});

	// The row changed between the read and the grant: its password was wiped,
	// or it was given a role elsewhere. Nothing is granted and nothing mailed.
	it("409s when the grant no longer matches the row", async () => {
		findUnique
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce({ id: "u9", role: "CUSTOMER" });
		signedUp("u9");
		updateMany.mockResolvedValueOnce({ count: 0 });
		const response = await invite();
		expect(response.status).toBe(409);
		await expect(response.json()).resolves.toEqual({
			error: "signed_in_meanwhile",
		});
		expect(sendStaffInvite).not.toHaveBeenCalled();
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
			expect(accountDeleteMany).toHaveBeenCalledTimes(1);
			expect(accountDeleteMany).toHaveBeenCalledWith({
				where: { userId: "c1", providerId: "credential" },
			});
			expect(sendStaffInvite.mock.calls[0][0]).toMatchObject({
				hasPassword: true,
				name: "Aiman bin Ali",
			});
		});

		// The row was made while public password sign-up was open, by someone
		// other than the address's owner: that password must not outlive the
		// promotion, and must go before the invite's own is written.
		it("removes an old password before setting the invite's", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce(null);
			accountDeleteMany.mockReturnValueOnce({ count: 1 });
			await invite("aiman@outlook.com");
			expect(accountDeleteMany).toHaveBeenCalledWith({
				where: { userId: "c1", providerId: "credential" },
			});
			const ops = $transaction.mock.calls[0][0] as unknown[];
			expect(ops[0]).toEqual({ count: 1 });
			expect(accountDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
				accountCreate.mock.invocationCallOrder[0],
			);
		});

		// A code sign-in can land between the transaction's session delete and
		// its commit, while the row is still a customer's. Once the role is
		// committed the session hook refuses code sessions, so one more delete
		// then leaves none.
		it("ends the row's sessions again once the role is committed", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce(null);
			await invite("aiman@outlook.com");
			expect(sessionDeleteMany).toHaveBeenCalledTimes(2);
			for (const call of sessionDeleteMany.mock.calls) {
				expect(call[0]).toEqual({ where: { userId: "c1" } });
			}
			const committed = $transaction.mock.invocationCallOrder[0];
			expect(sessionDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(
				committed,
			);
			expect(sessionDeleteMany.mock.invocationCallOrder[1]).toBeGreaterThan(
				committed,
			);
		});

		it("ends a Google customer's sessions again too", async () => {
			findUnique.mockResolvedValueOnce(codeCustomer);
			accountFindFirst.mockResolvedValueOnce({ id: "a1" });
			await invite("aiman@outlook.com");
			expect(sessionDeleteMany).toHaveBeenCalledTimes(2);
			expect(sessionDeleteMany.mock.invocationCallOrder[1]).toBeGreaterThan(
				$transaction.mock.invocationCallOrder[0],
			);
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
			expect(sessionDeleteMany).not.toHaveBeenCalled();
		});
	});
});
