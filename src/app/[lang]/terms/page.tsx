import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";

/**
 * The terms a customer agrees to at checkout (`termsAccepted` on
 * `POST /api/orders`).
 *
 * A draft, like the privacy notice: EzCabinet is the seller, so the wording
 * is theirs to approve. Change it and `TERMS_VERSION` in
 * `lib/orders/terms.ts` must change with it, or an order can no longer be
 * matched to the text its customer agreed to.
 *
 * The seller's name, address, email and phone come from the company's saved
 * details (`/admin/company`), filled into `s.seller` by `getDictionary`.
 */
export default async function TermsPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const s = t.terms;
	const email = t.landing.footer.email;

	return (
		<LegalPage
			lang={lang}
			back={t.privacy.back}
			title={s.title}
			draft={t.privacy.draft}
			intro={s.intro}
			sections={[
				[s.sellerHeading, s.seller],
				[s.goodsHeading, s.goods],
				[s.priceHeading, s.price],
				[s.paymentHeading, s.payment],
				[s.remeasureHeading, s.remeasure],
				[s.deliveryHeading, s.delivery],
				[s.changesHeading, fill(s.changes, { email })],
				[s.rightsHeading, s.rights],
				[s.complaintsHeading, fill(s.complaints, { email })],
				[s.lawHeading, s.law],
			]}
		/>
	);
}
