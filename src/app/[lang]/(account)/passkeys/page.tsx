import { notFound } from "next/navigation";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { viewerOf } from "@/lib/orders/access";
import { PasskeyList } from "./PasskeyList";

/** The devices that can pass this account's second step. */
export default async function PasskeysPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	// Redirects through sign-in and the passkey step, so whoever reaches the
	// list has already proved one of the devices on it.
	const viewer = await viewerOf(lang, `/${lang}/passkeys`);
	const [t, passkeys] = await Promise.all([
		getDictionary(lang),
		prisma.passkey.findMany({
			where: { userId: viewer.id },
			select: { id: true, name: true, createdAt: true },
			orderBy: { createdAt: "asc" },
		}),
	]);

	return (
		<section className="rounded-[14px] border border-[#e5e5e5] bg-white p-6">
			<h1 className="font-semibold text-[20px]">{t.passkey.listHeading}</h1>
			<p className="mt-1 text-[#5c574e] text-[13px]">{t.passkey.listBody}</p>
			<PasskeyList
				lang={lang}
				copy={t.passkey}
				initial={passkeys.map((p) => ({
					id: p.id,
					name: p.name,
					createdAt: p.createdAt?.toISOString() ?? null,
				}))}
			/>
		</section>
	);
}
