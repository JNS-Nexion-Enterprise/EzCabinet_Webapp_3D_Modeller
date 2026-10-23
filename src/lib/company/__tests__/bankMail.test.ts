import { beforeEach, describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogue/db", () => ({ prisma: { user: { findMany } } }));
vi.mock("@/lib/email", () => ({ sendEmail }));
vi.mock("next/server", () => ({ after: vi.fn() }));

const { testCompany } = await import("./company.fixture");
const { sendBankChange } = await import("../bankMail");

beforeEach(() => vi.clearAllMocks());

describe("sendBankChange", () => {
	it("mails every enabled superadmin once", async () => {
		findMany.mockResolvedValue([{ email: "a@x.test" }, { email: "b@x.test" }]);
		const next = testCompany({ bankName: "CIMB", bankAccountNumber: "1222" });
		await sendBankChange(testCompany(), next, "Aisyah", new Date());
		expect(findMany).toHaveBeenCalledWith({
			where: { role: "SUPERADMIN", disabled: false },
			select: { email: true },
		});
		expect(sendEmail).toHaveBeenCalledTimes(2);
		expect(sendEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "a@x.test" }),
		);
	});
});
