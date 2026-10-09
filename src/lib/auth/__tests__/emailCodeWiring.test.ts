import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { handleOAuthUserInfo } from "better-auth/oauth2";
import { emailOTP } from "better-auth/plugins";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({
	db: {} as Record<string, Row[]>,
	/** Every code that reached the mail module, newest last. */
	mailed: [] as { to: string; code: string }[],
	bot: false,
}));

vi.mock("botid/server", () => ({
	checkBotId: async () => ({ isBot: store.bot }),
}));
vi.mock("@/lib/email", () => ({
	sendEmail: async (message: { to: string; text: string }) => {
		store.mailed.push({
			to: message.to,
			code: /\d{6}/.exec(message.text)?.[0] ?? "",
		});
		return true;
	},
}));
// The app's own modules read through Prisma; here they see the same rows the
// plugin writes through the memory adapter.
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		user: {
			findUnique: async ({ where }: { where: Row }) =>
				store.db.user.find((r) =>
					"id" in where ? r.id === where.id : r.email === where.email,
				) ?? null,
		},
		rateLimit: {
			deleteMany: async ({
				where,
			}: {
				where: { key: string; lastRequest: { lt: number } };
			}) => {
				store.db.rateLimit = store.db.rateLimit.filter(
					(r) =>
						!(
							r.key === where.key &&
							(r.lastRequest as number) < where.lastRequest.lt
						),
				);
			},
			upsert: async ({
				where,
				create,
			}: {
				where: { key: string };
				create: Row;
			}) => {
				const row = store.db.rateLimit.find((r) => r.key === where.key);
				if (!row) {
					store.db.rateLimit.push(create);
					return create;
				}
				row.count = (row.count as number) + 1;
				return row;
			},
		},
		verification: {
			deleteMany: async ({ where }: { where: { identifier: string } }) => {
				store.db.verification = store.db.verification.filter(
					(r) => r.identifier !== where.identifier,
				);
			},
		},
		passkey: { count: async () => 0, findFirst: async () => null },
		session: { update: async () => null },
	},
}));

const { emailCodeBeforeHook, refuseStaffCodeSession } = await import(
	"@/lib/auth/emailCodeHooks"
);
const { sendSignInCode } = await import("@/lib/auth/emailCodeMail");
const {
	CLOSED_PATHS,
	CODE_ATTEMPTS,
	CODE_TTL_S,
	SEND_PATH,
	SEND_WINDOW_S,
	SENDS_PER_NETWORK,
	SIGN_IN_PATH,
} = await import("@/lib/auth/emailCodeRules");
const { passkeyBeforeHook, verifiedIfPasskeySession } = await import(
	"@/lib/auth/passkeyHooks"
);

const ORIGIN = "http://localhost:3000";

/** The same wiring as `lib/auth.ts`, minus `after()` and the cookie plugin. */
function makeAuth(opts: { rateLimit?: boolean } = {}) {
	return betterAuth({
		baseURL: ORIGIN,
		secret: "test-secret-test-secret-test-secret-0123",
		database: memoryAdapter(store.db),
		emailAndPassword: { enabled: true },
		disabledPaths: ["/sign-up/email", ...CLOSED_PATHS],
		rateLimit: {
			enabled: opts.rateLimit === true,
			storage: "database",
			customRules: {
				[SEND_PATH]: { window: SEND_WINDOW_S, max: SENDS_PER_NETWORK },
			},
		},
		user: {
			additionalFields: {
				role: { type: "string", input: false, defaultValue: "CUSTOMER" },
			},
		},
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				await emailCodeBeforeHook(ctx);
				await passkeyBeforeHook(ctx);
			}),
		},
		databaseHooks: {
			session: {
				create: {
					before: async (session, ctx) => {
						await refuseStaffCodeSession(session, ctx);
						return verifiedIfPasskeySession(session, ctx);
					},
				},
			},
		},
		plugins: [
			emailOTP({
				otpLength: 6,
				expiresIn: CODE_TTL_S,
				allowedAttempts: CODE_ATTEMPTS,
				storeOTP: "hashed",
				sendVerificationOTP: async ({ email, otp, type }) => {
					if (type === "sign-in") await sendSignInCode(email, otp);
				},
			}),
		],
	});
}

let auth: ReturnType<typeof makeAuth>;

const post = (path: string, body: unknown) =>
	auth.handler(
		new Request(`${ORIGIN}/api/auth${path}`, {
			method: "POST",
			headers: { "content-type": "application/json", origin: ORIGIN },
			body: JSON.stringify(body),
		}),
	);

const send = (email: string) => post(SEND_PATH, { email, type: "sign-in" });
const signIn = (email: string, otp: string) =>
	post(SIGN_IN_PATH, { email, otp });
const codeOf = async (res: Response) =>
	((await res.json()) as { code?: string }).code;
const lastCode = () => store.mailed[store.mailed.length - 1].code;

/** A row as an invite would have left it. */
const plant = (email: string, role: string) =>
	store.db.user.push({
		id: `id-${email}`,
		email,
		name: "Planted",
		emailVerified: true,
		role,
		createdAt: new Date(),
		updatedAt: new Date(),
	});

/** The plugin's stored form of a code: unsalted SHA-256, base64url. */
async function stored(code: string) {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(code),
	);
	return `${Buffer.from(digest).toString("base64url")}:0`;
}

async function plantCode(email: string, code: string) {
	store.db.verification.push({
		id: `v-${email}`,
		identifier: `sign-in-otp-${email}`,
		value: await stored(code),
		expiresAt: new Date(Date.now() + 60_000),
		createdAt: new Date(),
		updatedAt: new Date(),
	});
}

/** Status and body exactly as sent: key order is part of what a caller sees. */
const raw = async (res: Response) => [res.status, await res.text()];

beforeEach(() => {
	store.db = {
		user: [],
		session: [],
		account: [],
		verification: [],
		rateLimit: [],
	};
	store.mailed = [];
	store.bot = false;
	process.env.RESEND_API_KEY = "test-key";
	auth = makeAuth();
});

afterEach(() => {
	delete process.env.RESEND_API_KEY;
	vi.useRealTimers();
});

describe("a new address", () => {
	it("is mailed a six-digit code, stored hashed", async () => {
		expect((await send("aiman@outlook.com")).status).toBe(200);
		expect(store.mailed).toHaveLength(1);
		expect(lastCode()).toMatch(/^\d{6}$/);
		expect(String(store.db.verification[0].value)).not.toContain(lastCode());
	});

	it("becomes a verified CUSTOMER with no name yet", async () => {
		await send("aiman@outlook.com");
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(200);
		expect(store.db.user).toHaveLength(1);
		expect(store.db.user[0]).toMatchObject({
			email: "aiman@outlook.com",
			// Asked for on the next screen, by its own route.
			name: "",
			role: "CUSTOMER",
			emailVerified: true,
		});
		expect(store.db.session).toHaveLength(1);
		expect(store.db.account).toHaveLength(0);
	});

	it("cannot post its own role, name or picture", async () => {
		await send("aiman@outlook.com");
		for (const extra of [
			{ role: "SUPERADMIN" },
			{ name: "Boss" },
			{ image: "https://evil.example/a.png" },
		]) {
			const res = await post(SIGN_IN_PATH, {
				email: "aiman@outlook.com",
				otp: lastCode(),
				...extra,
			});
			expect(res.status).toBe(403);
		}
		expect(store.db.user).toHaveLength(0);
	});
});

describe("one address is one account", () => {
	it("whatever case it is typed in", async () => {
		await send("Aiman@Outlook.com");
		expect((await signIn("AIMAN@outlook.com", lastCode())).status).toBe(200);
		await send("aiman@outlook.com");
		expect((await signIn("aiman@OUTLOOK.com", lastCode())).status).toBe(200);
		expect(store.db.user).toHaveLength(1);
		expect(store.db.user[0].email).toBe("aiman@outlook.com");
	});

	it("and a padded address is refused rather than made a second one", async () => {
		expect((await send(" aiman@outlook.com ")).status).toBe(400);
		expect(store.mailed).toHaveLength(0);
	});
});

describe("staff", () => {
	// Kept, not dropped: the plugin must count tries against it as it does for
	// anyone, or the fourth wrong guess tells a staff address apart.
	it("are sent nothing, and are counted like anyone", async () => {
		plant("boss@x.com", "ADMIN");
		expect((await send("boss@x.com")).status).toBe(200);
		expect(store.mailed).toHaveLength(0);
		expect(store.db.verification).toHaveLength(1);
		expect(store.db.rateLimit).toMatchObject([
			{ key: "email-code|boss@x.com", count: 1 },
		]);
	});

	it("lose the stored code past the cap, like anyone", async () => {
		plant("boss@x.com", "ADMIN");
		for (let i = 0; i < 4; i++) await send("boss@x.com");
		expect(store.mailed).toHaveLength(0);
		expect(store.db.verification).toHaveLength(0);
	});

	it("get no session from a code that exists anyway", async () => {
		plant("boss@x.com", "SUPERADMIN");
		await plantCode("boss@x.com", "123456");
		const res = await signIn("boss@x.com", "123456");
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(0);
	});

	// The code nobody was mailed, guessed right.
	it("get no session from the right code for their own request", async () => {
		plant("boss@x.com", "ADMIN");
		const before = { ...store.db.user[0] };
		await send("boss@x.com");
		store.db.verification[0].value = await stored("123456");
		const res = await signIn("boss@x.com", "123456");
		expect(res.status).toBe(400);
		expect(res.headers.get("set-cookie")).toBeNull();
		expect(store.db.session).toHaveLength(0);
		expect(store.db.account).toHaveLength(0);
		expect(store.db.user).toEqual([before]);
		// Spent, as a customer's would be.
		expect(store.db.verification).toHaveLength(0);
	});

	// Promoted between asking for the code and typing it.
	it("cannot use a code they were mailed as a customer", async () => {
		plant("ali@x.com", "CUSTOMER");
		await send("ali@x.com");
		store.db.user[0].role = "ADMIN";
		const res = await signIn("ali@x.com", lastCode());
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(0);
	});

	it("are not refused by the request hook: the plugin must run", async () => {
		plant("boss@x.com", "ADMIN");
		await expect(
			emailCodeBeforeHook({
				path: SIGN_IN_PATH,
				body: { email: "boss@x.com", otp: "123456" },
			} as never),
		).resolves.toBeUndefined();
	});

	it("are refused a code session even when the row is gone", async () => {
		await expect(
			refuseStaffCodeSession({ userId: "nobody" }, { path: SIGN_IN_PATH }),
		).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
	});

	it("still get a session from their password", async () => {
		await auth.api.signUpEmail({
			body: {
				email: "boss@x.com",
				name: "Boss",
				password: "a-long-enough-password",
			},
		});
		store.db.user[0].role = "ADMIN";
		store.db.session = [];
		const res = await post("/sign-in/email", {
			email: "boss@x.com",
			password: "a-long-enough-password",
		});
		expect(res.status).toBe(200);
		expect(store.db.session).toHaveLength(1);
	});
});

describe("the sign-in response says nothing about the address", () => {
	const three = () => {
		plant("cust@x.com", "CUSTOMER");
		plant("boss@x.com", "ADMIN");
		return ["new@x.com", "cust@x.com", "boss@x.com"];
	};

	it("is the same four answers to four wrong guesses after one send", async () => {
		const runs = [];
		for (const email of three()) {
			await send(email);
			const answers = [];
			for (let i = 0; i < 4; i++) {
				answers.push(await raw(await signIn(email, "abcdef")));
			}
			runs.push(answers);
		}
		expect(runs[0].map(([status]) => status)).toEqual([400, 400, 400, 403]);
		expect(runs[0][0][1]).toBe(
			'{"message":"Invalid OTP","code":"INVALID_OTP"}',
		);
		expect(runs[1]).toEqual(runs[0]);
		expect(runs[2]).toEqual(runs[0]);
	});

	it("is the same answer to a guess when no code was asked for", async () => {
		const answers = [];
		for (const email of three()) {
			answers.push(await raw(await signIn(email, "abcdef")));
		}
		expect(answers[0]).toEqual([
			400,
			'{"message":"Invalid OTP","code":"INVALID_OTP"}',
		]);
		expect(answers[1]).toEqual(answers[0]);
		expect(answers[2]).toEqual(answers[0]);
	});
});

describe("the send response says nothing about the address", () => {
	it("is identical for new, customer, staff and capped addresses", async () => {
		plant("cust@x.com", "CUSTOMER");
		plant("boss@x.com", "ADMIN");
		for (let i = 0; i < 3; i++) await send("capped@x.com");
		const answers = [];
		for (const email of [
			"new@x.com",
			"cust@x.com",
			"boss@x.com",
			"capped@x.com",
		]) {
			const res = await send(email);
			answers.push([res.status, await res.text()]);
		}
		expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
		expect(answers[0]).toEqual([200, '{"success":true}']);
	});
});

describe("the per-address cap", () => {
	it("mails three codes an hour and drops the fourth", async () => {
		for (let i = 0; i < 4; i++) await send("aiman@outlook.com");
		expect(store.mailed).toHaveLength(3);
		// The fourth request's code is not left to be guessed at.
		expect(store.db.verification).toHaveLength(0);
	});

	it("starts again an hour after the first", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		for (let i = 0; i < 4; i++) await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T01:00:01Z"));
		await send("aiman@outlook.com");
		expect(store.mailed).toHaveLength(4);
	});

	it("is per address", async () => {
		for (let i = 0; i < 4; i++) await send("a@x.com");
		await send("b@x.com");
		expect(store.mailed.filter((m) => m.to === "b@x.com")).toHaveLength(1);
	});
});

describe("the code", () => {
	it("refuses a wrong one and still takes the right one", async () => {
		await send("aiman@outlook.com");
		const wrong = lastCode() === "000000" ? "000001" : "000000";
		const res = await signIn("aiman@outlook.com", wrong);
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("INVALID_OTP");
		expect((await signIn("aiman@outlook.com", lastCode())).status).toBe(200);
	});

	it("works once", async () => {
		await send("aiman@outlook.com");
		await signIn("aiman@outlook.com", lastCode());
		const again = await signIn("aiman@outlook.com", lastCode());
		expect(again.status).toBe(400);
		expect(await codeOf(again)).toBe("INVALID_OTP");
		expect(store.db.session).toHaveLength(1);
	});

	it("expires after ten minutes", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T00:10:01Z"));
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(400);
		expect(await codeOf(res)).toBe("OTP_EXPIRED");
	});

	it("is still good at nine minutes", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		vi.setSystemTime(new Date("2026-10-08T00:09:00Z"));
		expect((await signIn("aiman@outlook.com", lastCode())).status).toBe(200);
	});

	it("is dead after three wrong tries, even for the right code", async () => {
		await send("aiman@outlook.com");
		const wrong = lastCode() === "000000" ? "000001" : "000000";
		for (let i = 0; i < 3; i++) {
			expect(await codeOf(await signIn("aiman@outlook.com", wrong))).toBe(
				"INVALID_OTP",
			);
		}
		const res = await signIn("aiman@outlook.com", lastCode());
		expect(res.status).toBe(403);
		expect(await codeOf(res)).toBe("TOO_MANY_ATTEMPTS");
		expect(store.db.session).toHaveLength(0);
	});

	// Asked twice, then typed the first mail's code: only the newest counts,
	// and the mistake costs one try, not the code.
	it("refuses an older code once a newer one was sent", async () => {
		vi.useFakeTimers({ now: new Date("2026-10-08T00:00:00Z") });
		await send("aiman@outlook.com");
		const first = lastCode();
		// The form's own wait. The plugin picks the newest row by time.
		vi.setSystemTime(new Date("2026-10-08T00:00:31Z"));
		await send("aiman@outlook.com");
		const second = lastCode();
		// One time in a million the two codes are the same number.
		if (first !== second) {
			const res = await signIn("aiman@outlook.com", first);
			expect(res.status).toBe(400);
			expect(await codeOf(res)).toBe("INVALID_OTP");
		}
		expect((await signIn("aiman@outlook.com", second)).status).toBe(200);
	});
});

describe("the plugin's other routes", () => {
	it.each(CLOSED_PATHS)("%s is closed", async (path) => {
		const res = await post(path, {
			email: "aiman@outlook.com",
			otp: "123456",
			password: "a-long-enough-password",
			newEmail: "b@x.com",
			type: "sign-in",
		});
		expect(res.status).toBe(404);
	});

	it.each(["email-verification", "forget-password", "change-email"])(
		"a %s code is not sent",
		async (type) => {
			const res = await post(SEND_PATH, { email: "aiman@outlook.com", type });
			expect(res.status).toBe(403);
			expect(await codeOf(res)).toBe("EMAIL_CODE_ROUTE_REFUSED");
			expect(store.db.verification).toHaveLength(0);
		},
	);

	it("a send with a field the form does not send is refused", async () => {
		const res = await post(SEND_PATH, {
			email: "aiman@outlook.com",
			type: "sign-in",
			name: "x",
		});
		expect(res.status).toBe(403);
		expect(await codeOf(res)).toBe("EMAIL_CODE_ROUTE_REFUSED");
		expect(store.db.verification).toHaveLength(0);
	});

	// What a plugin upgrade's new route would meet. The hook is asked directly
	// because a path the router does not know never reaches a hook.
	it.each(["/email-otp/some-new-route", "/sign-in/email-otp/extra"])(
		"%s is refused",
		async (path) => {
			await expect(
				emailCodeBeforeHook({ path, body: {} } as never),
			).rejects.toMatchObject({ body: { code: "EMAIL_CODE_ROUTE_REFUSED" } });
		},
	);

	it("leaves every other route alone", async () => {
		await expect(
			emailCodeBeforeHook({ path: "/sign-in/social", body: {} } as never),
		).resolves.toBeUndefined();
		await expect(
			emailCodeBeforeHook({ path: undefined, body: {} } as never),
		).resolves.toBeUndefined();
	});
});

describe("abuse", () => {
	it("refuses a bot before anything is stored or mailed", async () => {
		store.bot = true;
		const res = await send("aiman@outlook.com");
		expect(res.status).toBe(403);
		expect(store.db.verification).toHaveLength(0);
		expect(store.mailed).toHaveLength(0);
	});

	it("bot-checks a browser's request only, not a server-side call", async () => {
		store.bot = true;
		const call = {
			path: SEND_PATH,
			body: { email: "a@x.com", type: "sign-in" },
		};
		await expect(emailCodeBeforeHook(call as never)).resolves.toBeUndefined();
		await expect(
			emailCodeBeforeHook({
				...call,
				request: new Request(`${ORIGIN}/api/auth${SEND_PATH}`),
			} as never),
		).rejects.toMatchObject({ body: { code: "EMAIL_CODE_BOT" } });
	});

	it("limits one network across addresses, counted in the database", async () => {
		auth = makeAuth({ rateLimit: true });
		for (let i = 0; i < SENDS_PER_NETWORK; i++) {
			expect((await send(`a${i}@x.com`)).status).toBe(200);
		}
		expect((await send("one-more@x.com")).status).toBe(429);
		expect(
			store.db.rateLimit.some((r) => String(r.key).endsWith(`|${SEND_PATH}`)),
		).toBe(true);
	});
});

describe("Google joining an existing account", () => {
	/** What the OAuth callback does once Google has answered. */
	const arrive = async (email: string, emailVerified: boolean) =>
		handleOAuthUserInfo({ context: await auth.$context } as never, {
			userInfo: { id: "g-1", email, name: "Aiman", emailVerified },
			account: { providerId: "google", accountId: "g-1" },
			callbackURL: "/",
		});

	const codeCustomer = async () => {
		await send("aiman@outlook.com");
		await signIn("aiman@outlook.com", lastCode());
	};

	it("links when Google says the email is verified", async () => {
		await codeCustomer();
		const result = await arrive("Aiman@Outlook.com", true);
		expect(result.error).toBeNull();
		expect(store.db.user).toHaveLength(1);
		expect(store.db.account).toMatchObject([
			{ providerId: "google", userId: store.db.user[0].id },
		]);
	});

	it("is refused when Google does not", async () => {
		await codeCustomer();
		const result = await arrive("aiman@outlook.com", false);
		expect(result.error).toBe("account not linked");
		expect(store.db.user).toHaveLength(1);
		expect(store.db.account).toHaveLength(0);
	});
});
