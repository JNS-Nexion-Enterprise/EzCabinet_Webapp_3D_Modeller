import { beforeEach, describe, expect, it, vi } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import type { CompanyDetails } from "@/lib/company/details";

let company: CompanyDetails = testCompany();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/company/store", () => ({ getCompany: async () => company }));

const { getDictionary } = await import("../dictionary");

/**
 * Each maker is its own seller, so what the site promises — warranty,
 * installation, delivery time, refund windows — is that maker's saved
 * answer, never one maker's wording shipped to all of them.
 */
describe("the promises the site makes come from the company", () => {
	beforeEach(() => {
		company = testCompany();
	});

	it("claims no warranty and no installation until the maker says so", async () => {
		const t = await getDictionary("en");
		expect(t.landing.faq.q5).toBe("");
		expect(t.landing.faq.a2).toBe(t.landing.faq.a2None);
	});

	it("states the maker's own warranty and installation", async () => {
		company = testCompany({ warrantyYears: 3, installationOffered: true });
		const t = await getDictionary("en");
		expect(t.landing.faq.a5).toContain("3-year warranty");
		expect(t.landing.faq.a2).not.toBe(t.landing.faq.a2None);
	});

	it.each(["en", "ms", "zh"] as const)(
		"%s fills the delivery window and refund windows",
		async (locale) => {
			company = testCompany({
				deliveryWeeksMin: 3,
				deliveryWeeksMax: 5,
				damageReportDays: 10,
				refundWorkingDays: 21,
			});
			const t = await getDictionary(locale);
			expect(t.terms.delivery).toContain("3-5");
			expect(t.landing.faq.a1).toContain("3-5");
			expect(t.refunds.damaged).toContain("10");
			expect(t.refunds.howPaid).toContain("21");
			expect(JSON.stringify(t)).not.toMatch(
				/\{(deliveryWeeks|warrantyYears|damageReportDays|refundWorkingDays|seller|dpoName|dpoEmail)\}/,
			);
		},
	);

	it("prints the registered seller in the footer", async () => {
		company = testCompany({ ssmNumber: "202301012345" });
		const t = await getDictionary("en");
		expect(t.landing.footer.seller).toBe(
			"EzCabinet Sdn Bhd (202301012345), Lot 5, Jalan Kilang 2, 43800 Dengkil, Selangor",
		);
	});

	it("says Draft until counsel's approval is recorded", async () => {
		expect((await getDictionary("en")).privacy.draft).not.toBe("");
		company = testCompany({ policiesApproved: true });
		expect((await getDictionary("en")).privacy.draft).toBe("");
	});

	it("names the data protection officer, or falls back to the contact address", async () => {
		expect((await getDictionary("en")).privacy.dpo).toBe(
			"Write to hello@ezcabinet.com with any question or request about your personal data.",
		);
		company = testCompany({
			dpoName: "Aisyah Rahman",
			dpoEmail: "dpo@example.com",
		});
		const dpo = (await getDictionary("en")).privacy.dpo;
		expect(dpo).toContain("Aisyah Rahman");
		expect(dpo).toContain("dpo@example.com");
	});
});
