import { beforeEach, describe, expect, it, vi } from "vitest";

const planFindMany = vi.hoisted(() => vi.fn());
const companyCreate = vi.hoisted(() => vi.fn());
const updateManyAndReturn = vi.hoisted(() => vi.fn());
const eventCreateMany = vi.hoisted(() => vi.fn());
const readCompany = vi.hoisted(() => vi.fn());
const revalidateTag = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const queueBankChangeMail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/catalogue/db", () => {
	const tx = {
		companyDetails: { create: companyCreate },
		delivery: { updateManyAndReturn },
		deliveryEvent: { createMany: eventCreateMany },
	};
	return {
		prisma: {
			delivery: { findMany: planFindMany },
			$transaction: (run: (client: typeof tx) => unknown) => run(tx),
		},
	};
});
vi.mock("@/lib/company/store", () => ({
	readCompany,
	COMPANY_CACHE_TAG: "company",
}));
vi.mock("@/lib/company/bankMail", () => ({ queueBankChangeMail }));
vi.mock("next/cache", () => ({ revalidateTag, revalidatePath }));

const { testCompany } = await import("./company.fixture");
const { workshopColumns } = await import("@/lib/logistics/carriers");
const { saveCompany } = await import("../save");

const prev = testCompany();
const moved = testCompany({
	address: "Lot 9, Jalan Baru, 47500 Subang Jaya, Selangor",
	postcode: "47500",
	city: "Subang Jaya",
	lat: 3.0757,
	lng: 101.5951,
});
const actor = { id: "u1", name: "Aisyah" };
const SAVED = new Date("2026-10-22T14:00:00.000Z");
const savedAt = SAVED.toISOString();

beforeEach(() => {
	vi.clearAllMocks();
	readCompany.mockResolvedValue({
		details: prev,
		savedAt: null,
		savedByName: null,
	});
	companyCreate.mockResolvedValue({ savedAt: SAVED });
	planFindMany.mockResolvedValue([]);
	updateManyAndReturn.mockResolvedValue([]);
});

describe("saveCompany", () => {
	it("saves a change that is not a move without asking, and touches no delivery", async () => {
		expect(
			await saveCompany({ ...prev, phone: "03-5555 1234" }, actor, false, null),
		).toEqual({ ok: true, repointed: 0, savedAt });
		expect(companyCreate).toHaveBeenCalledWith({
			data: {
				...prev,
				phone: "03-5555 1234",
				savedById: "u1",
				savedByName: "Aisyah",
			},
		});
		expect(updateManyAndReturn).not.toHaveBeenCalled();
		expect(revalidateTag).toHaveBeenCalledWith("company", { expire: 0 });
		expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
	});

	it("asks first when a move would touch deliveries, and writes nothing", async () => {
		planFindMany.mockResolvedValue([
			{ id: "d1", number: 41, status: "DRAFT", customerName: "Mei" },
			{ id: "d2", number: 42, status: "BOOKED", customerName: "Ali" },
		]);
		const result = await saveCompany(moved, actor, false, null);
		expect(result).toEqual({
			ok: false,
			error: "confirm_move",
			move: {
				repoint: [expect.objectContaining({ id: "d1" })],
				booked: [expect.objectContaining({ id: "d2" })],
			},
		});
		expect(companyCreate).not.toHaveBeenCalled();
		expect(revalidateTag).not.toHaveBeenCalled();
		expect(revalidatePath).not.toHaveBeenCalled();
		expect(queueBankChangeMail).not.toHaveBeenCalled();
		expect(planFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					fromWorkshop: true,
					status: { in: ["DRAFT", "QUOTED", "BOOKED", "DRIVER_ASSIGNED"] },
				},
			}),
		);
	});

	it("on confirm, moves every unbooked workshop delivery in one write and records each", async () => {
		updateManyAndReturn.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
		expect(await saveCompany(moved, actor, true, null)).toEqual({
			ok: true,
			repointed: 2,
			savedAt,
		});
		expect(updateManyAndReturn).toHaveBeenCalledWith({
			where: { fromWorkshop: true, status: { in: ["DRAFT", "QUOTED"] } },
			data: workshopColumns(moved),
			select: { id: true },
		});
		const message = `Pickup moved with the workshop: ${prev.address} → ${moved.address}`;
		expect(eventCreateMany).toHaveBeenCalledWith({
			data: [
				{ deliveryId: "d1", source: "ADMIN", actor: "Aisyah", message },
				{ deliveryId: "d2", source: "ADMIN", actor: "Aisyah", message },
			],
		});
	});

	it("records nothing when every job was booked in between", async () => {
		updateManyAndReturn.mockResolvedValue([]);
		expect(await saveCompany(moved, actor, true, null)).toEqual({
			ok: true,
			repointed: 0,
			savedAt,
		});
		expect(eventCreateMany).not.toHaveBeenCalled();
	});

	it("moves without asking when no delivery is affected", async () => {
		planFindMany.mockResolvedValue([]);
		expect(await saveCompany(moved, actor, false, null)).toEqual({
			ok: true,
			repointed: 0,
			savedAt,
		});
		expect(companyCreate).toHaveBeenCalled();
	});

	it("touches no delivery when confirmed but the workshop did not move", async () => {
		await saveCompany({ ...prev, phone: "03-5555 1234" }, actor, true, null);
		expect(updateManyAndReturn).not.toHaveBeenCalled();
		expect(eventCreateMany).not.toHaveBeenCalled();
	});

	it("refuses a save from a page loaded before a newer save, and writes nothing", async () => {
		readCompany.mockResolvedValue({
			details: moved,
			savedAt: new Date("2026-10-22T15:00:00.000Z"),
			savedByName: "Farid",
		});
		// A tab opened on the 14:00 row, or on the setup values before any save.
		for (const loadedAt of [savedAt, null]) {
			expect(
				await saveCompany(
					{ ...prev, phone: "03-5555 1234" },
					actor,
					false,
					loadedAt,
				),
			).toEqual({ ok: false, error: "stale" });
		}
		expect(companyCreate).not.toHaveBeenCalled();
		expect(planFindMany).not.toHaveBeenCalled();
		expect(revalidateTag).not.toHaveBeenCalled();
		expect(queueBankChangeMail).not.toHaveBeenCalled();
	});

	it("saves when the page loaded the newest row", async () => {
		readCompany.mockResolvedValue({
			details: prev,
			savedAt: SAVED,
			savedByName: "Farid",
		});
		expect(
			await saveCompany(
				{ ...prev, phone: "03-5555 1234" },
				actor,
				false,
				savedAt,
			),
		).toEqual({ ok: true, repointed: 0, savedAt });
	});

	it("announces a changed bank account, and only then", async () => {
		const next = { ...prev, bankAccountNumber: "111122223333" };
		await saveCompany(next, actor, false, null);
		expect(queueBankChangeMail).toHaveBeenCalledWith(prev, next, "Aisyah");

		queueBankChangeMail.mockClear();
		await saveCompany({ ...prev, phone: "03-5555 1234" }, actor, false, null);
		expect(queueBankChangeMail).not.toHaveBeenCalled();
	});
});
