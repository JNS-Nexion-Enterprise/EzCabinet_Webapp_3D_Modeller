import { PasskeyList } from "@/app/[lang]/(account)/passkeys/PasskeyList";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requirePage } from "@/lib/auth/page";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";

export const metadata = { title: "Security" };

/**
 * A staff member's own passkeys. Staff sign in with a password and a code
 * (or Google); the passkey is what confirms an action that moves money or
 * changes who can get in — `lib/auth/stepUp.ts`.
 *
 * `catalogue:read` because every staff role holds it: this is each person's
 * own page, not a privilege.
 */
export default async function SecurityPage() {
	const user = await requirePage("catalogue:read");
	const [t, passkeys] = await Promise.all([
		getDictionary("en"),
		prisma.passkey.findMany({
			where: { userId: user.id },
			select: { id: true, name: true, createdAt: true },
			orderBy: { createdAt: "asc" },
		}),
	]);

	return (
		<>
			<AdminHeader trail={[{ label: "Security" }]} />
			<main className="mx-auto w-full max-w-[640px] px-7 pt-7 pb-16">
				<section className="rounded-[14px] border border-[#e5e5e5] bg-white p-6">
					<h1 className="font-semibold text-[20px]">Your passkeys</h1>
					<p className="mt-1 text-[#5c574e] text-[13px] leading-5">
						Cancelling or refunding an order, marking one paid by hand, and
						resetting or deleting an account all ask for your passkey:
						fingerprint, face or this device's PIN. Set one up on each device
						you work from.
					</p>
					<p className="mt-2 text-[#5c574e] text-[13px] leading-5">
						Adding your first one needs a sign-in from the last day. If it
						fails, sign out, sign in again and retry. Lost every device? A
						superadmin can reset your passkey under People.
					</p>
					<PasskeyList
						lang="en"
						copy={t.passkey}
						initial={passkeys.map((p) => ({
							id: p.id,
							name: p.name,
							createdAt: p.createdAt?.toISOString() ?? null,
						}))}
					/>
				</section>
			</main>
		</>
	);
}
