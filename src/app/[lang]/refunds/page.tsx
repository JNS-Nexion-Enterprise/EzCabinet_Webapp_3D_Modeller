import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";

/**
 * The refund policy a customer agrees to with the terms of sale.
 *
 * "Production starts" is the line the app already records:
 * `Order.productionStage` is null until an admin starts it
 * (`lib/orders/stage.ts`), and the order page shows it. Keep the wording on
 * that boundary so staff and customer read the same one. Bump
 * `TERMS_VERSION` when this text changes.
 */
export default async function RefundsPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const r = t.refunds;

	return (
		<LegalPage
			lang={lang}
			back={t.privacy.back}
			title={r.title}
			draft={t.privacy.draft}
			intro={r.intro}
			sections={[
				[r.beforeHeading, r.before],
				[r.afterHeading, r.after],
				[r.damagedHeading, r.damaged],
				[r.remeasureHeading, r.remeasure],
				[r.howPaidHeading, r.howPaid],
				[
					r.howToAskHeading,
					fill(r.howToAsk, { email: t.landing.footer.email }),
				],
			]}
		/>
	);
}
