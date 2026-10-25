"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { fetchGuarded } from "@/components/admin/stepUp";
import {
	type Control,
	Field,
	focusFirstInvalid,
	INVALID,
} from "@/components/Field";
import { Done, Spinner } from "@/components/Spinner";
import { DONE_MS, NETWORK_ERROR } from "@/components/useAction";
import {
	type CompanyDetails,
	companyDetailsSchema,
	mapsLink,
} from "@/lib/company/details";
import type { MoveJob, MovePlan } from "@/lib/company/save";
import type { GeocodeResult } from "@/lib/logistics/geocode";
import { MALAYSIAN_STATES } from "@/lib/logistics/malaysia";
import {
	addressNeedsPin,
	fieldErrors,
	gdexNotice,
	oneLine,
	pinStatus,
	placeFields,
	readPin,
	tidyAddress,
} from "./form";

const INPUT = "min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 py-[10px]";
const MAP_DOWN =
	"Could not reach Google Maps. Try again, or set the pin by hand below.";
const MAP_MISS =
	"Google Maps could not find that address. Check it for typos, or set the pin by hand below.";

type Errors = ReturnType<typeof fieldErrors>;

/** Every field's wrapper: two to a row on a wide screen, `WIDE_BOX` takes the row. */
const FIELD_BOX = "min-w-[220px] flex-1 text-[13px]";
const WIDE_BOX = `${FIELD_BOX} basis-full`;

/** The input look, marked when the field's `Field` says it failed. */
const inputClass = (c: Control, extra = "") =>
	`${INPUT} ${c["aria-invalid"] ? INVALID : ""} ${extra}`;

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

const mapLink = (lat: number, lng: number) => (
	<a
		href={mapsLink(lat, lng)}
		target="_blank"
		rel="noreferrer"
		className="underline"
	>
		Open in Google Maps
	</a>
);

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
	loadedAt,
	gdexConfigured,
	gdexPostcode,
	geocoderFault,
}: {
	initial: CompanyDetails;
	/** `savedAt` of the row this page was opened on; null for the setup values. */
	loadedAt: string | null;
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
	// Pin and postcode start as the saved workshop's; a new address is not
	// saved on top of them until the pin is found or retyped.
	const [pinConfirmed, setPinConfirmed] = useState(true);
	const [pinNote, setPinNote] = useState<string | null>(null);
	const [errors, setErrors] = useState<Errors>({});
	const [finding, setFinding] = useState(false);
	const [mapNote, setMapNote] = useState<string | null>(null);
	// Google's answer for the address as typed; dropped on any edit.
	const [found, setFound] = useState<GeocodeResult | null>(null);
	// The pin box is for when Google cannot help, so it opens by itself then.
	const [pinByHand, setPinByHand] = useState(geocoderFault !== null);
	const [saving, setSaving] = useState(false);
	// The Save button's check mark: a save that wrote leaves nothing else on the
	// button to say so, and the status line is easy to miss below it.
	const [justSaved, setJustSaved] = useState(false);
	const [message, setMessage] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<Confirm | null>(null);
	// Moves on with each save, so this tab is never stale against itself.
	const [version, setVersion] = useState(loadedAt);

	const set = (k: keyof typeof v) => (e: { target: { value: string } }) => {
		setV((s) => ({ ...s, [k]: e.target.value }));
		setErrors((er) => ({ ...er, [k]: undefined }));
	};
	const clearPinErrors = () =>
		setErrors((er) => ({ ...er, lat: undefined, lng: undefined }));
	const pin = readPin(pinText);
	const status = pinStatus(
		found,
		addressNeedsPin(initial.address, v.address, pinConfirmed),
		pin,
	);
	const pinOpen = pinByHand || !pin.ok || !!(errors.lat ?? errors.lng);
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
			setFound(null);
			setPinByHand(true);
			setMapNote(data ? (data.fault ?? MAP_MISS) : MAP_DOWN);
			return;
		}
		const f = data.found;
		setFound(f);
		setV((s) => ({ ...s, ...placeFields(f) }));
		setPinText(`${f.lat}, ${f.lng}`);
		setPinConfirmed(true);
		setPinNote(null);
		setErrors((er) => ({
			...er,
			postcode: undefined,
			city: undefined,
			state: undefined,
			lat: undefined,
			lng: undefined,
		}));
	}

	/** Posts the details; the string is a message to show, null means saved. */
	async function post(
		details: CompanyDetails,
		confirmMove: boolean,
	): Promise<
		| { message: string }
		| { errors: Errors }
		| { move: MovePlan }
		| { repointed: number }
	> {
		const res = await fetchGuarded("/api/admin/company", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ details, confirmMove, loadedAt: version }),
		});
		if (typeof res === "string") return { message: res };
		const data = await res.json().catch(() => null);
		if (res.status === 409 && data?.error === "confirm_move") {
			return { move: data.move };
		}
		if (res.status === 409 && data?.error === "stale") {
			return {
				message:
					"Someone saved the company details after you opened this page. Nothing was changed — reload to see theirs, then make your change again.",
			};
		}
		// The server's own parse can disagree with ours; mark what it named, and
		// keep the generic line for a reply that names nothing we can show.
		const errors = fieldErrors(data?.issues, "details");
		if (res.status === 400 && Object.keys(errors).length > 0) {
			return { errors };
		}
		if (!res.ok) return { message: "Could not save. Nothing was changed." };
		setVersion(data?.savedAt ?? null);
		return { repointed: Number(data?.repointed ?? 0) };
	}

	function saved(details: CompanyDetails, repointed: number) {
		// Show what was stored: "po" reads "PO", an account number loses its spaces.
		setV({ ...details, ssmNumber: details.ssmNumber ?? "" });
		setPinConfirmed(true);
		setPinNote(null);
		setJustSaved(true);
		setTimeout(() => setJustSaved(false), DONE_MS);
		setMessage(
			repointed > 0
				? `Saved. ${repointed} ${repointed === 1 ? "delivery now leaves" : "deliveries now leave"} from the new address.`
				: "Saved.",
		);
		router.refresh();
	}

	async function save(e: React.FormEvent) {
		e.preventDefault();
		const form = e.currentTarget;
		setMessage(null);
		const parsed = companyDetailsSchema.safeParse({
			...v,
			address: tidyAddress(v.address),
			lat: pin.ok ? pin.lat : Number.NaN,
			lng: pin.ok ? pin.lng : Number.NaN,
		});
		if (!parsed.success) {
			setErrors(fieldErrors(parsed.error.issues));
			focusFirstInvalid(form);
			return;
		}
		if (addressNeedsPin(initial.address, parsed.data.address, pinConfirmed)) {
			setPinNote(
				"You changed the address. Press Check address, or retype the pin by hand to confirm it.",
			);
			focusFirstInvalid(form);
			return;
		}
		setErrors({});
		setPinNote(null);
		const details = parsed.data;

		setSaving(true);
		let out: Awaited<ReturnType<typeof post>>;
		try {
			out = await post(details, false);
		} catch {
			return setMessage(NETWORK_ERROR);
		} finally {
			setSaving(false);
		}
		if ("message" in out) return setMessage(out.message);
		if ("errors" in out) {
			setErrors(out.errors);
			return focusFirstInvalid(form);
		}
		if ("repointed" in out) return saved(details, out.repointed);

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
				if ("errors" in again) {
					setErrors(again.errors);
					return "Some details need fixing.";
				}
				if ("move" in again) return "The open deliveries changed. Try again.";
				saved(details, again.repointed);
				return null;
			},
		});
	}

	const text = (k: keyof typeof v, label: string, hint?: ReactNode) => (
		<Field label={label} hint={hint} error={errors[k]} className={FIELD_BOX}>
			{(c) => (
				<input
					{...c}
					value={v[k]}
					onChange={set(k)}
					className={inputClass(c)}
				/>
			)}
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
				<Field
					label="Address"
					error={errors.address ?? pinNote ?? undefined}
					className={WIDE_BOX}
				>
					{(c) => (
						<div className="flex items-start gap-2">
							<textarea
								{...c}
								rows={2}
								value={v.address}
								onChange={(e) => {
									set("address")({
										target: { value: oneLine(e.target.value) },
									});
									setPinConfirmed(false);
									setFound(null);
								}}
								className={inputClass(c, "min-w-0 flex-1 resize-none")}
							/>
							<button
								type="button"
								onClick={findOnMap}
								disabled={finding || v.address.trim() === ""}
								className="min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 text-[13px] hover:bg-neutral-50 disabled:opacity-50"
							>
								{finding && <Spinner />}
								{finding ? "Checking…" : "Check address"}
							</button>
						</div>
					)}
				</Field>
				<div className="flex basis-full flex-wrap items-baseline gap-x-3 gap-y-1 text-[#5c574e] text-[12px]">
					<p role="status">
						{status.kind === "found" && (
							<>
								Google Maps found: {status.formattedAddress}{" "}
								{mapLink(status.lat, status.lng)}
							</>
						)}
						{status.kind === "unchecked" &&
							"Press Check address so Google Maps can find the new address."}
						{status.kind === "pinned" && (
							<>The pin is set. {mapLink(status.lat, status.lng)}</>
						)}
					</p>
					{/* One button that stays mounted, so focus survives the press. */}
					{(!pinOpen ||
						(pinByHand && pin.ok && !(errors.lat ?? errors.lng))) && (
						<button
							type="button"
							aria-expanded={pinOpen}
							onClick={() => setPinByHand(!pinOpen)}
							className="underline"
						>
							{pinOpen ? "Hide the pin" : "Set the pin by hand"}
						</button>
					)}
				</div>
				{(mapNote ?? geocoderFault) && (
					<p role="status" className="basis-full text-[#5c574e] text-[12px]">
						{mapNote ?? geocoderFault}
					</p>
				)}
				{text("postcode", "Postcode")}
				{text("city", "City")}
				<Field label="State" error={errors.state} className={FIELD_BOX}>
					{(c) => (
						<select
							{...c}
							value={v.state}
							onChange={set("state")}
							className={inputClass(c, "select-chevron bg-white pl-3")}
						>
							<option value="">Choose a state</option>
							{MALAYSIAN_STATES.map((s) => (
								<option key={s.code} value={s.code}>
									{s.name}
								</option>
							))}
						</select>
					)}
				</Field>
				{pinOpen && (
					<Field
						label="Map pin"
						error={
							pin.ok ? (errors.lat ?? errors.lng ?? undefined) : pin.message
						}
						hint="Paste a Google Maps link, or type latitude, longitude."
						className={FIELD_BOX}
					>
						{(c) => (
							<input
								{...c}
								value={pinText}
								onChange={(e) => {
									setPinText(e.target.value);
									setPinConfirmed(true);
									setPinNote(null);
									setFound(null);
									clearPinErrors();
								}}
								className={inputClass(c)}
							/>
						)}
					</Field>
				)}
				<Field
					label="Courier close time"
					error={errors.closeTime}
					className={FIELD_BOX}
				>
					{(c) => (
						<input
							{...c}
							type="time"
							value={v.closeTime}
							onChange={set("closeTime")}
							className={inputClass(c)}
						/>
					)}
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
					{saving && <Spinner />}
					{justSaved && !saving && <Done />}
					{saving ? "Saving…" : justSaved ? "Saved" : "Save"}
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
