import { notFound } from "next/navigation";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { LegalPage } from "@/components/LegalPage";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";

/**
 * The privacy notice the consent banner links to.
 *
 * A draft, and labelled as one until approval is recorded at /admin/company:
 * the maker is the data controller under the PDPA, so the wording is theirs
 * to approve. What it must
 * keep saying is what the code does — see `src/lib/analytics.ts`.
 */
export default async function PrivacyPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const p = t.privacy;

	const sections = [
		[p.purposeHeading, p.purpose],
		[p.collectHeading, p.collect],
		[p.notCollectHeading, p.notCollect],
		[p.accountHeading, p.account],
		[p.ordersHeading, p.orders],
		[p.whereHeading, p.where],
		[p.recipientsHeading, p.recipients],
		[p.whatsappHeading, p.whatsapp],
		[p.emailHeading, p.email],
		[p.obligatoryHeading, p.obligatory],
		[p.retentionHeading, p.retention],
		[p.rightsHeading, p.rights],
		[p.dpoHeading, p.dpo],
		[p.cookiesHeading, p.cookies],
		[p.choiceHeading, p.choice],
		[p.otherLawsHeading, p.otherLaws],
		[p.contactHeading, fill(p.contact, { email: t.landing.footer.email })],
	] as const;

	return (
		<LegalPage
			lang={lang}
			back={p.back}
			title={p.title}
			draft={p.draft}
			intro={p.intro}
			sections={sections}
		>
			<CookieSettingsButton
				label={p.cookieSettings}
				className="self-start rounded-lg border border-neutral-300 px-3 py-2 text-[13px] text-neutral-800 hover:bg-neutral-50"
			/>
		</LegalPage>
	);
}
