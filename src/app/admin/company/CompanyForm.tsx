"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { fetchGuarded } from "@/components/admin/stepUp";
import {
	type CompanyDetails,
	companyDetailsSchema,
	mapsLink,
} from "@/lib/company/details";
import type { MoveJob, MovePlan } from "@/lib/company/save";
import type { GeocodeResult } from "@/lib/logistics/geocode";
import { MALAYSIAN_STATES } from "@/lib/logistics/malaysia";
import { fieldErrors, gdexNotice, readPin } from "./form";

const INPUT = "min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 py-[10px]";
const MAP_MISS =
	"Google could not place that address. Type the pin, or paste a Google Maps link.";

type Errors = ReturnType<typeof fieldErrors>;

function Field({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		// biome-ignore lint/a11y/noLabelWithoutControl: `children` is always the field's control
		<label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
			<span className="font-medium">{label}</span>
			{children}
			{hint && <span className="text-[#5c574e] text-[12px]">{hint}</span>}
			{error && (
				<span role="alert" className="text-[#b3261e] text-[12px]">
					{error}
				</span>
			)}
		</label>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="rounded-[14px] border border-[#e5e5e5] bg-white p-5">
			<p className="mb-3 font-semibold text-[#525252] text-[12px] uppercase tracking-[.06em]">
				{title}
			</p>
			<div className="flex flex-wrap gap-3">{children}</div>
		</section>
	);
}

const jobRows = (jobs: MoveJob[]) => (
	<ul className="mt-1 mb-2 list-disc pl-5">
		{jobs.map((j) => (
			<li key={j.id}>
				#{j.number} {j.customerName}
			</li>
		))}
	</ul>
);

export function CompanyForm({
	initial,
	gdexConfigured,
	gdexPostcode,
	geocoderFault,
}: {
	initial: CompanyDetails;
	gdexConfigured: boolean;
	gdexPostcode: string | null;
	geocoderFault: string | null;
}) {
	const router = useRouter();
	const [v, setV] = useState({
		...initial,
		ssmNumber: initial.ssmNumber ?? "",
	});
	const [pinText, setPinText] = useState(`${initial.lat}, ${initial.lng}`);
	const [errors, setErrors] = useState<Errors>({});
	const [finding, setFinding] = useState(false);
	const [mapNote, setMapNote] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<Confirm | null>(null);

	const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
		setV((s) => ({ ...s, [k]: e.target.value }));
	const pin = readPin(pinText);
	const notice = gdexNotice(gdexConfigured, gdexPostcode, v.postcode.trim());

	async function findOnMap() {
		setFinding(true);
		setMapNote(null);
		const res = await fetch("/api/admin/company/geocode", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ address: v.address }),
		}).catch(() => null);
		const data: { found: GeocodeResult | null; fault: string | null } | null =
			res?.ok ? await res.json().catch(() => null) : null;
		setFinding(false);
		if (!data?.found) {
			setMapNote(data?.fault ?? MAP_MISS);
			return;
		}
		const f = data.found;
		setV((s) => ({
			...s,
			postcode: f.postcode ?? s.postcode,
			city: f.city ?? s.city,
			state: f.state ?? s.state,
		}));
		setPinText(`${f.lat}, ${f.lng}`);
	}

	/** Posts the details; the string is a message to show, null means saved. */
	async function post(
		details: CompanyDetails,
		confirmMove: boolean,
	): Promise<{ message: string } | { move: MovePlan } | { repointed: number }> {
		const res = await fetchGuarded("/api/admin/company", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ details, confirmMove }),
		});
		if (typeof res === "string") return { message: res };
		const data = await res.json().catch(() => null);
		if (res.status === 409 && data?.error === "confirm_move") {
			return { move: data.move };
		}
		if (!res.ok) return { message: "Could not save. Nothing was changed." };
		return { repointed: Number(data?.repointed ?? 0) };
	}

	function saved(repointed: number) {
		setMessage(
			repointed > 0
				? `Saved. ${repointed} deliveries now leave from the new address.`
				: "Saved.",
		);
		router.refresh();
	}

	async function save(e: React.FormEvent) {
		e.preventDefault();
		setMessage(null);
		const parsed = companyDetailsSchema.safeParse({
			...v,
			lat: pin.ok ? pin.lat : Number.NaN,
			lng: pin.ok ? pin.lng : Number.NaN,
		});
		if (!parsed.success) {
			setErrors(fieldErrors(parsed.error));
			return;
		}
		setErrors({});
		const details = parsed.data;

		setSaving(true);
		const out = await post(details, false);
		setSaving(false);
		if ("message" in out) return setMessage(out.message);
		if ("repointed" in out) return saved(out.repointed);

		const { repoint, booked } = out.move;
		setConfirming({
			title: "Move the workshop?",
			body: (
				<div className="text-[13px]">
					{repoint.length > 0 && (
						<>
							These deliveries are not booked yet and will be collected from the
							new address:
							{jobRows(repoint)}
						</>
					)}
					{booked.length > 0 && (
						<>
							Already booked — the courier still has the old address. Rebook or
							phone these in:
							{jobRows(booked)}
						</>
					)}
				</div>
			),
			confirmLabel: "Move and save",
			stepUp: true,
			run: async () => {
				const again = await post(details, true);
				if ("message" in again) return again.message;
				if ("move" in again) return "The open deliveries changed. Try again.";
				saved(again.repointed);
				return null;
			},
		});
	}

	const text = (k: keyof typeof v, label: string, hint?: ReactNode) => (
		<Field label={label} hint={hint} error={errors[k]}>
			<input value={v[k]} onChange={set(k)} className={INPUT} />
		</Field>
	);

	return (
		<form onSubmit={save} className="flex flex-col gap-5">
			<ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />

			<Section title="Company">
				{text("brand", "Brand")}
				{text("legalName", "Legal name")}
				{text(
					"ssmNumber",
					"SSM number",
					"Optional. Shown to customers when set.",
				)}
				{text("contactEmail", "Contact email")}
				{text(
					"phone",
					"Phone",
					"Couriers ring this from the loading bay, and mail says to call it.",
				)}
			</Section>

			<Section title="Workshop">
				<Field label="Address" error={errors.address}>
					<div className="flex gap-2">
						<input
							value={v.address}
							onChange={set("address")}
							className={`${INPUT} min-w-0 flex-1`}
						/>
						<button
							type="button"
							onClick={findOnMap}
							disabled={finding || v.address.trim() === ""}
							className="min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 text-[13px] hover:bg-neutral-50 disabled:opacity-50"
						>
							{finding ? "Finding…" : "Find on map"}
						</button>
					</div>
					{(mapNote ?? geocoderFault) && (
						<span className="text-[#5c574e] text-[12px]">
							{mapNote ?? geocoderFault}
						</span>
					)}
				</Field>
				{text("postcode", "Postcode")}
				{text("city", "City")}
				<Field label="State" error={errors.state}>
					<select
						value={v.state}
						onChange={set("state")}
						className={`select-chevron ${INPUT} bg-white pl-3`}
					>
						{MALAYSIAN_STATES.map((s) => (
							<option key={s.code} value={s.code}>
								{s.name}
							</option>
						))}
					</select>
				</Field>
				<Field
					label="Map pin"
					error={pin.ok ? (errors.lat ?? errors.lng) : pin.message}
					hint={
						pin.ok && (
							<a
								href={mapsLink(pin.lat, pin.lng)}
								target="_blank"
								rel="noreferrer"
								className="underline"
							>
								Open in Google Maps
							</a>
						)
					}
				>
					<input
						value={pinText}
						onChange={(e) => setPinText(e.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field label="Courier close time" error={errors.closeTime}>
					<input
						type="time"
						value={v.closeTime}
						onChange={set("closeTime")}
						className={INPUT}
					/>
				</Field>
				{notice && (
					<p
						role={notice.kind === "reminder" ? undefined : "status"}
						className="basis-full rounded-lg border border-[#e5e5e5] bg-[#faf9f7] px-3 py-[9px] text-[#5c574e] text-[12px]"
					>
						{notice.kind === "reminder" &&
							"GDEX collects from the address on your GDEX account. Change it there too."}
						{notice.kind === "mismatch" &&
							`GDEX's account says postcode ${notice.gdexPostcode}, but the workshop here is ${v.postcode.trim()}. GDEX will collect from its own — update the GDEX account.`}
						{notice.kind === "unchecked" &&
							"Could not reach GDEX to compare its pickup address. Check the GDEX account by hand."}
					</p>
				)}
			</Section>

			<Section title="Bank transfer">
				{text("bankName", "Bank name")}
				{text("bankAccountName", "Account name")}
				{text(
					"bankAccountNumber",
					"Account number",
					"Customers paying by transfer see this. Every superadmin is emailed when it changes.",
				)}
			</Section>

			<Section title="Orders">
				{text(
					"orderPrefix",
					"Order prefix",
					<>
						New orders only. Orders already placed keep their number. Example:{" "}
						{v.orderPrefix.trim().toUpperCase() || "—"}-20261022-001
					</>,
				)}
			</Section>

			<div className="flex items-center gap-3">
				<button
					type="submit"
					disabled={saving}
					className="min-h-10 rounded-full bg-[#1f5138] px-5 py-[11px] font-semibold text-[13px] text-white hover:bg-[#193f2c] disabled:opacity-50"
				>
					{saving ? "Saving…" : "Save"}
				</button>
				{message && (
					<p role="status" className="text-[13px]">
						{message}
					</p>
				)}
			</div>
		</form>
	);
}
