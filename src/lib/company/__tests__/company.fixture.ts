import type { CompanyDetails } from "../details";

/** A complete company for tests: what a superadmin would have saved. */
export const testCompany = (
	over: Partial<CompanyDetails> = {},
): CompanyDetails => ({
	brand: "EzCabinet",
	legalName: "EzCabinet Sdn Bhd",
	ssmNumber: null,
	contactEmail: "hello@ezcabinet.com",
	phone: "03-1234 5678",
	address: "Lot 5, Jalan Kilang 2, 43800 Dengkil, Selangor",
	postcode: "43800",
	city: "Dengkil",
	state: "MY-10",
	lat: 2.9848868,
	lng: 101.861807,
	closeTime: "18:00",
	bankName: "Maybank",
	bankAccountName: "EzCabinet Sdn Bhd",
	bankAccountNumber: "562123456789",
	orderPrefix: "IC",
	...over,
});
