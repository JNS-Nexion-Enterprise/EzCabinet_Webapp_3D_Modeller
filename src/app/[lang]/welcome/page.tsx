import { notFound, redirect } from "next/navigation";
import { safeWelcomeNext } from "@/lib/auth/safeCustomerNext";
import { currentUser } from "@/lib/auth/session";
import { getDictionary } from "@/lib/copy/dictionary";
import { isLocale } from "@/lib/copy/locales";
import { WelcomeForm } from "./WelcomeForm";

/** Never indexed: it exists only between a first sign-in and the page asked for. */
export const metadata = { robots: { index: false, follow: false } };

/**
 * The name step. A code sign-in asks for the address only, so a new account
 * has no name; it is asked for here, once, before the passkey step — whose
 * prompt would otherwise label the account with a random id.
 *
 * Every code sign-in comes through this page, because only the server knows
 * whether the account owes a name: one that does not is passed straight on.
 * Reads `currentUser()` directly rather than `viewerOf`, which redirects a
 * nameless customer straight back here.
 */
export default async function WelcomePage({
	params,
	searchParams,
}: {
	params: Promise<{ lang: string }>;
	searchParams: Promise<{ next?: string | string[] }>;
}) {
	const [{ lang }, { next }] = await Promise.all([params, searchParams]);
	if (!isLocale(lang)) notFound();
	const target = safeWelcomeNext(next, lang);

	const signIn = `/${lang}/sign-in?next=${encodeURIComponent(target)}`;

	const user = await currentUser();
	// Straight to the target: signing in by code leads back through here
	// anyway, and signing in with a provider needs no name.
	if (!user) redirect(signIn);
	if (!user.mustSetName) redirect(target);

	const t = await getDictionary(lang);
	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] px-6 text-neutral-900">
			<div className="flex w-full max-w-[380px] flex-col gap-5 rounded-[14px] border border-neutral-200 bg-white px-7 py-8">
				<div>
					<h1 className="font-semibold text-[22px]">{t.welcome.heading}</h1>
					<p className="mt-1.5 text-[14px] text-neutral-500 leading-5">
						{t.welcome.body}
					</p>
				</div>
				<WelcomeForm next={target} signIn={signIn} copy={t.welcome} />
			</div>
		</main>
	);
}
