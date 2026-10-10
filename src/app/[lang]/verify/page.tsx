import { notFound, redirect } from "next/navigation";
import { safeCustomerNext } from "@/lib/auth/safeCustomerNext";
import { currentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { PasskeyGate } from "./PasskeyGate";

/** Never indexed: it exists only between sign-in and the page asked for. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The second step after sign-in. Reads `currentUser()` directly rather than
 * `viewerOf`, which redirects an unverified customer straight back here.
 */
export default async function VerifyPage({
	params,
	searchParams,
}: {
	params: Promise<{ lang: string }>;
	searchParams: Promise<{ next?: string | string[] }>;
}) {
	const [{ lang }, { next }] = await Promise.all([params, searchParams]);
	if (!isLocale(lang)) notFound();
	const target = safeCustomerNext(next, lang);

	const user = await currentUser();
	if (!user) {
		redirect(
			`/${lang}/sign-in?next=${encodeURIComponent(`/${lang}/verify?next=${encodeURIComponent(target)}`)}`,
		);
	}
	// The name first: it is what the device's passkey prompt will show.
	if (user.mustSetName) {
		redirect(`/${lang}/welcome?next=${encodeURIComponent(target)}`);
	}
	// Staff, and a customer who has already passed, have nothing to do here.
	if (!user.mustVerifyPasskey) redirect(target);

	const [t, enrolled] = await Promise.all([
		getDictionary(lang),
		prisma.passkey.count({ where: { userId: user.id } }),
	]);
	const sales = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] px-6 text-neutral-900">
			<div className="flex w-full max-w-[380px] flex-col gap-5 rounded-[14px] border border-neutral-200 bg-white px-7 py-8">
				<h1 className="font-semibold text-[22px]">{t.passkey.heading}</h1>
				<PasskeyGate
					mode={enrolled > 0 ? "prompt" : "enrol"}
					lang={lang}
					next={target}
					copy={t.passkey}
					helpHref={sales ? `https://wa.me/${sales}` : null}
				/>
			</div>
		</main>
	);
}
