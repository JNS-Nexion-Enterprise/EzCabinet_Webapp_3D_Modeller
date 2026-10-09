import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = {
	id: string;
	channel: "WHATSAPP" | "EMAIL";
	status: string;
	attempts: number;
	lastError: string | null;
	to: string;
	template: string;
	locale: string;
	vars: { body: string[]; button: string };
	queuedAt: Date;
};

// Just enough of the Notification table for `flush`: the claim, the read and
// the write-back, over rows held in memory.
const rows: Row[] = [];
vi.mock("@/lib/catalogue/db", () => ({
	prisma: {
		notification: {
			updateMany: async ({
				where,
			}: {
				where: { id?: string; attempts?: number };
			}) => {
				const row = rows.find(
					(r) =>
						r.id === where.id &&
						r.status === "PENDING" &&
						r.attempts === where.attempts,
				);
				if (!row) return { count: 0 };
				row.attempts++;
				return { count: 1 };
			},
			// Copies, as Prisma returns: the claim must not reach into the snapshot.
			findMany: async ({ where }: { where: { channel?: { in: string[] } } }) =>
				rows
					.filter(
						(r) =>
							r.status === "PENDING" &&
							(where.channel?.in.includes(r.channel) ?? true),
					)
					.map((r) => ({ ...r })),
			update: async ({
				where,
				data,
			}: {
				where: { id: string };
				data: Partial<Row>;
			}) => Object.assign(rows.find((r) => r.id === where.id) ?? {}, data),
		},
	},
}));

const sendOrderEmail = vi.hoisted(() =>
	vi.fn(async (_row: unknown, _base: string) => true),
);
vi.mock("@/lib/email/orderMail", () => ({ sendOrderEmail }));

import { flush } from "../outbox";

const pending = (id: string): Row => ({
	id,
	channel: "WHATSAPP",
	status: "PENDING",
	attempts: 0,
	lastError: null,
	to: "+60123456789",
	template: "order_placed",
	locale: "en",
	vars: { body: ["Aisyah", "IC-20260926-001", "100.00"], button: "tok" },
	queuedAt: new Date(),
});

function metaAnswers(status: number, code: number) {
	const fetchMock = vi.fn(
		async () =>
			new Response(JSON.stringify({ error: { code, message: "no" } }), {
				status,
			}),
	);
	vi.stubGlobal("fetch", fetchMock);
	return fetchMock;
}

const loggedTypes = (spy: ReturnType<typeof vi.spyOn>) =>
	spy.mock.calls.map((call: unknown[]) => {
		try {
			return JSON.parse(String(call[0])).type;
		} catch {
			return null;
		}
	});

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
	rows.length = 0;
	process.env.WHATSAPP_TOKEN = "t0ken";
	process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
	errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	sendOrderEmail.mockReset().mockResolvedValue(true);
	vi.stubEnv("RESEND_API_KEY", "re_test");
	vi.stubEnv("EMAIL_FROM", "EzCabinet <no-reply@example.com>");
	vi.stubEnv("BETTER_AUTH_URL", "https://x.test");
});
afterEach(() => {
	vi.unstubAllEnvs();
	vi.unstubAllGlobals();
	errorSpy.mockRestore();
	process.env.WHATSAPP_TOKEN = undefined;
	process.env.WHATSAPP_PHONE_NUMBER_ID = undefined;
});

describe("flush with a dead token", () => {
	it("keeps every order's acknowledgement pending and stops sending", async () => {
		rows.push(pending("a"), pending("b"));
		const fetchMock = metaAnswers(401, 190);

		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(rows.map((r) => [r.id, r.status, r.attempts])).toEqual([
			["a", "PENDING", 0],
			["b", "PENDING", 0],
		]);
		expect(loggedTypes(errorSpy)).toContain("WHATSAPP_TOKEN_INVALID");
	});
});

describe("flush with a template Meta rejects", () => {
	it("raises an alert naming the template problem", async () => {
		rows.push(pending("a"));
		metaAnswers(400, 132018);

		await flush();

		expect(rows[0].status).toBe("FAILED");
		expect(loggedTypes(errorSpy)).toContain("WHATSAPP_TEMPLATE_REJECTED");
	});
});

const email = (id: string): Row => ({
	...pending(id),
	channel: "EMAIL",
	to: "a@example.com",
});

describe("flush with email rows", () => {
	it("sends one and marks it sent", async () => {
		rows.push(email("e"));
		await expect(flush()).resolves.toEqual({ sent: 1, failed: 0 });
		expect(sendOrderEmail).toHaveBeenCalledWith(
			expect.objectContaining({ id: "e", to: "a@example.com" }),
			"https://x.test",
		);
		expect(rows[0].status).toBe("SENT");
	});

	it("still sends mail while the WhatsApp token is dead", async () => {
		rows.push(pending("w1"), email("e"), pending("w2"));
		const fetchMock = metaAnswers(401, 190);

		await flush();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(rows.map((r) => [r.id, r.status, r.attempts])).toEqual([
			["w1", "PENDING", 0],
			["e", "SENT", 1],
			["w2", "PENDING", 0],
		]);
	});

	it("sends mail with WhatsApp not configured at all", async () => {
		// Not `= undefined`: assigning that to `process.env` stores the string.
		vi.stubEnv("WHATSAPP_TOKEN", "");
		rows.push(pending("w"), email("e"));
		await flush();
		expect(rows.map((r) => r.status)).toEqual(["PENDING", "SENT"]);
	});

	it("leaves mail pending and untouched with email not configured", async () => {
		vi.stubEnv("RESEND_API_KEY", "");
		rows.push(email("e"));
		await flush();
		expect(sendOrderEmail).not.toHaveBeenCalled();
		expect([rows[0].status, rows[0].attempts]).toEqual(["PENDING", 0]);
	});

	it("leaves mail pending with no site address to link to", async () => {
		vi.stubEnv("BETTER_AUTH_URL", "");
		rows.push(email("e"));
		await flush();
		expect(sendOrderEmail).not.toHaveBeenCalled();
	});

	it("retries a failed send, then gives up at the attempt limit", async () => {
		sendOrderEmail.mockResolvedValue(false);
		rows.push(email("e"));
		await flush();
		expect([rows[0].status, rows[0].attempts]).toEqual(["PENDING", 1]);
		rows[0].attempts = 4;
		await flush();
		expect(rows[0].status).toBe("FAILED");
	});

	it("survives a send that throws", async () => {
		sendOrderEmail.mockRejectedValue(new Error("db down"));
		rows.push(email("e1"), email("e2"));
		await expect(flush()).resolves.toEqual({ sent: 0, failed: 2 });
		expect(rows[0].lastError).toContain("db down");
	});
});
