import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedCompany } from "../details";
import { testCompany } from "./company.fixture";

const findFirst = vi.hoisted(() => vi.fn());
const findMany = vi.hoisted(() => vi.fn());
const count = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/catalogue/db", () => ({
	prisma: { companyDetails: { findFirst, findMany, count } },
}));

const { readCompany, getCompany, getReservedBrands, isFormerWorkshop } =
	await import("../store");

beforeEach(() => vi.clearAllMocks());

describe("company store", () => {
	it("reads the seed, unsaved, when no row exists", async () => {
		findFirst.mockResolvedValue(null);
		expect(await readCompany()).toEqual({
			details: seedCompany(),
			savedAt: null,
			savedByName: null,
		});
	});

	it("reads the newest row, and who saved it", async () => {
		const at = new Date("2026-10-22T02:00:00Z");
		findFirst.mockResolvedValue({
			id: "c2",
			...testCompany({ brand: "Kabinet Baru" }),
			savedById: "u1",
			savedByName: "Aisyah",
			savedAt: at,
		});
		expect(await readCompany()).toEqual({
			details: testCompany({ brand: "Kabinet Baru" }),
			savedAt: at,
			savedByName: "Aisyah",
		});
		expect(findFirst).toHaveBeenCalledWith({
			orderBy: [{ savedAt: "desc" }, { id: "desc" }],
		});
	});

	it("getCompany is the live details alone, so the cache holds only plain values", async () => {
		findFirst.mockResolvedValue(null);
		expect(await getCompany()).toEqual(seedCompany());
	});

	it("reserves the seed brand and every brand ever saved, once each", async () => {
		findMany.mockResolvedValue([
			{ brand: "EzCabinet" },
			{ brand: "Kabinet Baru" },
		]);
		expect((await getReservedBrands()).sort()).toEqual([
			"EzCabinet",
			"Kabinet Baru",
		]);
		expect(findMany).toHaveBeenCalledWith({
			distinct: ["brand"],
			select: { brand: true },
		});
	});
});

describe("isFormerWorkshop", () => {
	const now = testCompany();

	it("is not the workshop it is now, however it is padded", async () => {
		expect(await isFormerWorkshop(` ${now.address} `, now)).toBe(false);
		expect(count).not.toHaveBeenCalled();
	});

	it("is the setup address once the workshop has moved", async () => {
		expect(await isFormerWorkshop(seedCompany().address, now)).toBe(true);
	});

	it("is any address saved before", async () => {
		count.mockResolvedValue(1);
		expect(await isFormerWorkshop("Lot 1, Jalan Lama, Klang", now)).toBe(true);
		expect(count).toHaveBeenCalledWith({
			where: { address: "Lot 1, Jalan Lama, Klang" },
		});
	});

	it("is not an address the company never had", async () => {
		count.mockResolvedValue(0);
		expect(await isFormerWorkshop("12 Jalan Setia, Shah Alam", now)).toBe(
			false,
		);
	});
});
