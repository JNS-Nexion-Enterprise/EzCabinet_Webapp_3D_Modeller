import { AdminHeader } from "@/components/admin/AdminHeader";
import { requirePage } from "@/lib/auth/page";
import { readCompany } from "@/lib/company/store";
import { gdexAdapter, gdexSenderPostcode } from "@/lib/logistics/adapters/gdex";
import { geocoderFault, refreshGeocoderHealth } from "@/lib/logistics/geocode";
import { CompanyForm } from "./CompanyForm";

const when = new Intl.DateTimeFormat("en-MY", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "Asia/Kuala_Lumpur",
});

export default async function CompanyPage() {
	await requirePage("company:manage");

	const { details, savedAt, savedByName } = await readCompany();
	const gdexConfigured = gdexAdapter.isConfigured();
	// Only asked when GDEX is set up: the call is a network round trip.
	const gdexPostcode = gdexConfigured ? await gdexSenderPostcode() : null;
	await refreshGeocoderHealth();

	return (
		<div className="flex min-h-screen flex-col bg-[#f4f3f1] text-neutral-900">
			<AdminHeader trail={[{ label: "Admin" }, { label: "Company" }]} />
			<main className="mx-auto flex w-full max-w-[960px] flex-col gap-5 px-7 pt-8 pb-16">
				<div>
					<h1 className="mb-1 font-semibold text-[22px]">Company details</h1>
					<p className="text-[13px] text-neutral-500">
						What customers, couriers and mail see. Changes show everywhere on
						the next page load.
					</p>
					<p className="mt-1 text-[12px] text-neutral-500">
						{savedAt
							? `Last changed by ${savedByName ?? "a superadmin"} on ${when.format(savedAt)}`
							: "Not saved yet. These are the starting values from setup — check each one and save."}
					</p>
				</div>
				<CompanyForm
					initial={details}
					gdexConfigured={gdexConfigured}
					gdexPostcode={gdexPostcode}
					geocoderFault={geocoderFault()}
				/>
			</main>
		</div>
	);
}
