/**
 * Writes every email the app sends, in every language, to a folder, so the
 * wording and layout can be read in a browser before anything is mailed.
 *
 *   pnpm email:preview <dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { NotificationKind } from "../src/generated/prisma/enums";
import { en } from "../src/lib/copy/en";
import { LOCALES } from "../src/lib/copy/locales";
import { ms } from "../src/lib/copy/ms";
import { zh } from "../src/lib/copy/zh";
import {
	type OrderMailInput,
	orderEmail,
} from "../src/lib/email/templates/order";
import { passkeyChange } from "../src/lib/email/templates/passkeyChange";
import { signInCode } from "../src/lib/email/templates/signInCode";
import { staffInvite } from "../src/lib/email/templates/staffInvite";
import { staffReset } from "../src/lib/email/templates/staffReset";

const dir = process.argv[2];
if (!dir) {
	console.error("usage: pnpm email:preview <dir>");
	process.exit(1);
}
mkdirSync(dir, { recursive: true });

const dictionaries = { en, ms, zh };
const base = "https://example.test";
const order: OrderMailInput["order"] = {
	number: 14,
	createdAt: new Date("2026-10-08T04:00:00Z"),
	publicToken: "tok_order",
	customerName: "Aisyah binti Rahman",
	siteAddress: "12 Jalan Meranti 4, Taman Meranti Jaya, 47120 Puchong",
	paymentProvider: "manual",
	paidAt: new Date("2026-10-08T06:00:00Z"),
	breakdown: {
		cabinets: [
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 620 },
			{ label: "BC 800mm", doorLabel: "Shaker", amountRm: 620 },
			{ label: "WC 600mm", doorLabel: "Shaker", amountRm: 410 },
		],
		categories: [
			{ id: "worktop", detail: { key: "x" }, amountRm: 540 },
			{ id: "endPanels", detail: { key: "x" }, amountRm: 180 },
		],
	},
	cabinetsRm: 2370,
	deliveryRm: 85,
	totalRm: 2455,
};

const KINDS: NotificationKind[] = [
	"ORDER_PLACED",
	"PAYMENT_CONFIRMED",
	"ORDER_REFUNDED",
	"STAGE",
	"DELIVERY_BOOKED",
	"PICKED_UP",
	"DELIVERED",
	"DELIVERY_FAILED",
];

const mails: Record<string, { subject: string; html: string; text: string }> = {
	"staff-invite": staffInvite({
		name: "Ali",
		inviterName: "Jack Ooi",
		role: "Admin",
		roleDescription:
			"Manage cabinet designs and prices, orders, deliveries, site content and tutorials.",
		link: `${base}/admin/login`,
		to: "ali@example.test",
		hasPassword: true,
	}),
	"staff-reset": staffReset({
		name: "Ali",
		link: `${base}/admin/reset-password?token=abc123`,
	}),
};
for (const change of ["added", "removed", "reset"] as const) {
	mails[`passkey-${change}`] = passkeyChange({
		change,
		name: "Aiman",
		when: "9 Oct 2026, 1:30 pm (Malaysia time)",
		contact: "call EzCabinet on 03-0000 0000",
	});
}
for (const locale of LOCALES) {
	mails[`sign-in-code.${locale}`] = signInCode({
		locale,
		code: "482916",
		minutes: 10,
	});
	for (const kind of KINDS) {
		mails[`${kind.toLowerCase().replaceAll("_", "-")}.${locale}`] = orderEmail({
			kind,
			locale,
			base,
			// Order placed is previewed unpaid, so the bank details show.
			order: kind === "ORDER_PLACED" ? { ...order, paidAt: null } : order,
			lineLabels: dictionaries[locale].planner.price.lines,
			stageLabel: dictionaries[locale].order.stages.CUTTING,
			delivery: {
				publicToken: "tok_delivery",
				carrierLabel: "Lalamove",
				tracking: "LM-20261008-7731",
			},
		});
	}
}

for (const [name, mail] of Object.entries(mails)) {
	writeFileSync(join(dir, `${name}.html`), mail.html);
	writeFileSync(join(dir, `${name}.txt`), `${mail.subject}\n\n${mail.text}`);
}
console.log(`${Object.keys(mails).length} mails written to ${dir}`);
