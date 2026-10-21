import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/catalogue/db";
import { type CompanyDetails, seedCompany } from "./details";

/**
 * The company's live facts — the one read path. Append-only table, newest row
 * wins; with no row yet the seed answers, so nothing needs seeding.
 */

export const COMPANY_CACHE_TAG = "company";

export type SavedCompany = {
	details: CompanyDetails;
	savedAt: Date | null;
	savedByName: string | null;
};

/**
 * Straight off Postgres, for the admin page and the save: after a save the
 * reload must show the change, and `revalidateTag` may not land before it.
 *
 * Mapped field by field with no re-parse: every row was validated when saved.
 */
export async function readCompany(): Promise<SavedCompany> {
	const row = await prisma.companyDetails.findFirst({
		orderBy: [{ savedAt: "desc" }, { id: "desc" }],
	});
	if (!row) return { details: seedCompany(), savedAt: null, savedByName: null };
	return {
		details: {
			brand: row.brand,
			legalName: row.legalName,
			ssmNumber: row.ssmNumber,
			contactEmail: row.contactEmail,
			phone: row.phone,
			address: row.address,
			postcode: row.postcode,
			city: row.city,
			state: row.state,
			lat: row.lat,
			lng: row.lng,
			closeTime: row.closeTime,
			bankName: row.bankName,
			bankAccountName: row.bankAccountName,
			bankAccountNumber: row.bankAccountNumber,
			orderPrefix: row.orderPrefix,
		},
		savedAt: row.savedAt,
		savedByName: row.savedByName,
	};
}

/**
 * Details alone, not the whole `SavedCompany`: `unstable_cache` round-trips
 * through JSON, so a `Date` would come back a string.
 */
export const getCompany = unstable_cache(
	async () => (await readCompany()).details,
	["company"],
	{ tags: [COMPANY_CACHE_TAG] },
);

/** Every brand the company has used, so a name change cannot unreserve one. */
export const getReservedBrands = unstable_cache(
	async () => {
		const rows = await prisma.companyDetails.findMany({
			distinct: ["brand"],
			select: { brand: true },
		});
		return [...new Set([seedCompany().brand, ...rows.map((r) => r.brand)])];
	},
	["company-brands"],
	{ tags: [COMPANY_CACHE_TAG] },
);
