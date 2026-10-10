import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { SetupTwoFactor } from "./SetupTwoFactor";

/**
 * Deliberately does not call `requirePage`: that redirects a user who owes
 * 2FA setup straight back here. `currentUser()` is the same session read
 * without that check — the same arrangement as `/admin/change-password`.
 */
export default async function SetupTwoFactorPage() {
	const user = await currentUser();
	if (!user) redirect("/admin/login");
	if (user.mustChangePassword) redirect("/admin/change-password");
	if (!user.mustSetupTwoFactor) redirect("/admin/cabinet-designs");

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] p-6 text-neutral-900">
			<div className="w-full max-w-[420px] rounded-2xl border border-[#e4e2df] bg-white p-8">
				<h1 className="font-semibold text-[19px]">Set up two-step sign-in</h1>
				<p className="mt-1.5 text-neutral-500 text-sm">
					Staff accounts with a password need a code from an authenticator app
					(Google Authenticator, Microsoft Authenticator, 1Password) at every
					sign-in.
				</p>
				<SetupTwoFactor />
			</div>
		</main>
	);
}
