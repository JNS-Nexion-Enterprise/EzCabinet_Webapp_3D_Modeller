import { z } from "zod";
import { MALAYSIAN_STATES } from "@/lib/logistics/malaysia";
import { toE164 } from "@/lib/logistics/phone";
import { tenant } from "@/lib/tenant";

/**
 * The company's editable facts, as one schema the form, the save route and the
 * reader all parse with. Pure and isomorphic: the quote screen prints the
 * seller block in the browser, so nothing here may touch the database.
 */
const required = (what: string) =>
	z.string().trim().min(1, `${what} is required`);

// ponytail: a bounding box, so it also takes in Singapore, Brunei and the Thai
// border. A real polygon if that ever bites; the form shows a Maps link so a
// person can still check the pin by eye.
const inMalaysia = {
	lat: [0.8, 7.5],
	lng: [99.5, 119.5],
} as const;

const coordinate = (axis: keyof typeof inMalaysia) =>
	z
		.number()
		.min(inMalaysia[axis][0], `${axis} is outside Malaysia`)
		.max(inMalaysia[axis][1], `${axis} is outside Malaysia`);

/** A whole number typed into a form box: "7" and 7 both parse. */
const wholeNumber = (min: number, max: number) =>
	z.coerce
		.number()
		.int(`Enter a whole number`)
		.min(min, `At least ${min}`)
		.max(max, `At most ${max}`);

/** Optional text: empty means "not set", stored as null. */
const optionalText = (max: number) =>
	z
		.string()
		.trim()
		.max(max)
		.nullable()
		.transform((v) => v || null);

export const companyDetailsSchema = z
	.object({
		brand: required("Brand").pipe(z.string().min(2).max(60)),
		legalName: required("Legal name"),
		ssmNumber: z
			.string()
			.trim()
			.max(40)
			.nullable()
			.transform((v) => v || null),
		contactEmail: z.string().trim().pipe(z.email()),
		phone: required("Phone").refine((v) => toE164(v) !== null, {
			message: "Enter a phone number a courier can call",
		}),
		address: required("Address"),
		postcode: z
			.string()
			.trim()
			.regex(/^\d{5}$/, "Postcode is five digits"),
		city: required("City"),
		state: z.enum(MALAYSIAN_STATES.map((s) => s.code) as [string, ...string[]]),
		lat: coordinate("lat"),
		lng: coordinate("lng"),
		closeTime: z
			.string()
			.trim()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM, Malaysia time"),
		bankName: required("Bank name"),
		bankAccountName: required("Account name"),
		bankAccountNumber: z
			.string()
			.trim()
			.transform((v) => v.replace(/[\s-]/g, ""))
			.pipe(z.string().regex(/^\d+$/, "Account number is digits only")),
		orderPrefix: z
			.string()
			.trim()
			.transform((v) => v.toUpperCase())
			.pipe(z.string().regex(/^[A-Z0-9]{1,5}$/, "1 to 5 letters or digits")),
		/**
		 * The promises this maker makes to its customers. Each maker is its own
		 * seller, so the landing page, terms and refund policy read these rather
		 * than carry one maker's promises into every deployment. 0 years means no
		 * warranty is claimed anywhere on the site.
		 */
		warrantyYears: wholeNumber(0, 25),
		installationOffered: z.boolean(),
		deliveryWeeksMin: wholeNumber(1, 52),
		deliveryWeeksMax: wholeNumber(1, 52),
		damageReportDays: wholeNumber(1, 90),
		refundWorkingDays: wholeNumber(1, 60),
		/** PDPA s.12A: the data protection officer the privacy notice names. */
		dpoName: optionalText(80),
		dpoEmail: z
			.string()
			.trim()
			.nullable()
			.transform((v) => v || null)
			.pipe(z.email().nullable()),
		/**
		 * Counsel has approved the terms, refund policy and privacy notice: the
		 * pages stop saying "Draft".
		 */
		policiesApproved: z.boolean(),
	})
	.refine((c) => c.deliveryWeeksMax >= c.deliveryWeeksMin, {
		path: ["deliveryWeeksMax"],
		message: "Must not be less than the shortest estimate",
	});

export type CompanyDetails = z.output<typeof companyDetailsSchema>;

/**
 * What an unsaved company reads: this deployment's tenant values. The bank
 * fields are the old bank-transfer placeholders, so nothing a customer sees
 * changes before the first save.
 */
export function seedCompany(): CompanyDetails {
	return {
		brand: tenant.brand,
		legalName: tenant.legalName,
		ssmNumber: null,
		contactEmail: tenant.contactEmail,
		phone: tenant.workshopPhone,
		address: tenant.workshopAddress,
		postcode: tenant.workshopPostcode,
		city: tenant.workshopCity,
		state: tenant.workshopState,
		lat: tenant.workshopPin.lat,
		lng: tenant.workshopPin.lng,
		closeTime: "18:00",
		bankName: "Bank to be confirmed",
		bankAccountName: tenant.legalName,
		bankAccountNumber: "To be confirmed",
		orderPrefix: tenant.orderPrefix,
		// No promise is made until the maker states its own.
		warrantyYears: 0,
		installationOffered: false,
		deliveryWeeksMin: 4,
		deliveryWeeksMax: 6,
		damageReportDays: 7,
		refundWorkingDays: 14,
		dpoName: null,
		dpoEmail: null,
		policiesApproved: false,
	};
}

/** "4-6", or "4" when both ends agree. */
export const deliveryWeeks = (
	c: Pick<CompanyDetails, "deliveryWeeksMin" | "deliveryWeeksMax">,
) =>
	c.deliveryWeeksMin === c.deliveryWeeksMax
		? String(c.deliveryWeeksMin)
		: `${c.deliveryWeeksMin}-${c.deliveryWeeksMax}`;

/** "Legal name (SSM), address" — the name is not repeated when the address starts with it. */
export function sellerLine(
	c: Pick<CompanyDetails, "legalName" | "ssmNumber" | "address">,
): string {
	if (c.address.startsWith(c.legalName))
		return c.ssmNumber
			? `${c.legalName} (${c.ssmNumber})${c.address.slice(c.legalName.length)}`
			: c.address;
	const name = c.ssmNumber ? `${c.legalName} (${c.ssmNumber})` : c.legalName;
	return `${name}, ${c.address}`;
}

/** Where couriers collect from changed: what open deliveries must be re-pointed at. */
export function workshopMoved(prev: CompanyDetails, next: CompanyDetails) {
	return (
		prev.address.trim() !== next.address.trim() ||
		prev.lat !== next.lat ||
		prev.lng !== next.lng ||
		prev.postcode !== next.postcode ||
		prev.city !== next.city ||
		prev.state !== next.state
	);
}

/** Where customers pay changed: worth a loud confirmation. */
export function bankChanged(prev: CompanyDetails, next: CompanyDetails) {
	return (
		prev.bankName !== next.bankName ||
		prev.bankAccountName !== next.bankAccountName ||
		prev.bankAccountNumber !== next.bankAccountNumber
	);
}

/** Enough of an account number to recognise it in a log, never all of it. */
export const lastFour = (accountNumber: string) =>
	accountNumber.replace(/\D/g, "").slice(-4);

export const mapsLink = (lat: number, lng: number) =>
	`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
