"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { chipClass, fieldClass } from "@/components/admin/styles";
import { Field, FieldMessage, focusFirstInvalid } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { NETWORK_ERROR, useAction } from "@/components/useAction";
import { LABEL } from "@/lib/logistics/carriers";
import { pinState } from "@/lib/logistics/coords";
import {
	suggestVehicle,
	totalVolumeM3,
	totalWeightKg,
} from "@/lib/logistics/measure";
import { BADGE_TONE } from "./DeliveryDetail";
import { messageFor } from "./errors";
import {
	checkDeliveryForm,
	type DeliveryErrors,
	deliveryErrors,
	ITEM_FIELDS,
	itemKey,
	itemRowMessage,
} from "./fieldErrors";
import type { DeliveryRow } from "./form";
import {
	blankForm,
	EDITABLE,
	emptyItem,
	type FormItem,
	type FormState,
	formFrom,
	toPayload,
} from "./form";
import { STATUS_LABEL } from "./tracking";

export type { DeliveryEventRow, DeliveryRow, QuoteRow } from "./form";

/**
 * The deliveries list and the job form. Each job opens on its own page —
 * `DeliveryDetail` — where partners are compared, one is booked, and the job is
 * then followed.
 */
export function LogisticsManager({
	initial,
	workshopAddress,
	geocodingConfigured,
	geocodingFault,
	easyparcel,
	prefill = null,
}: {
	initial: DeliveryRow[];
	workshopAddress: string;
	geocodingConfigured: boolean;
	/** Why the geocoder is not answering, in Google's own words. Null when it is. */
	geocodingFault: string | null;
	easyparcel: { appConfigured: boolean; connected: boolean };
	/** A paid order's job, built on the server — opens the form already filled. */
	prefill?: FormState | null;
}) {
	const router = useRouter();
	const [rows, setRows] = useState<DeliveryRow[]>(initial);
	const [form, setForm] = useState<FormState | null>(prefill);
	const [error, setError] = useState<string | null>(null);
	const [errors, setErrors] = useState<DeliveryErrors>({});
	const formRef = useRef<HTMLFormElement>(null);
	// Marks belong to the form that earned them: closing it or opening another
	// job starts clean.
	const formId = form === null ? null : (form.id ?? "new");
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset on form identity only
	useEffect(() => setErrors({}), [formId]);
	// Read after mount, not during render: both come from a redirect's query
	// string — the OAuth callback, or a job page's "Edit job" — and
	// `location.search` doesn't exist on the server.
	const [easyparcelResult, setEasyparcelResult] = useState<string | null>(null);
	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setEasyparcelResult(params.get("easyparcel"));
		const editing = initial.find((row) => row.id === params.get("edit"));
		if (editing && EDITABLE.has(editing.status)) setForm(formFrom(editing));
	}, [initial]);

	const load = useCallback(async () => {
		const res = await fetch("/api/admin/deliveries");
		if (res.status === 401) {
			router.push("/admin/login");
			return;
		}
		if (!res.ok) {
			setError("Could not load deliveries");
			return;
		}
		const body = await res.json();
		setRows(body.deliveries ?? []);
	}, [router]);

	const saving = useAction(async (state: FormState) => {
		setError(null);
		// The server's checks, made first: an empty size is `0` by now and would
		// only be refused there, with no way to tell which row.
		const found = checkDeliveryForm(state);
		if (Object.keys(found).length > 0) {
			setErrors(found);
			focusFirstInvalid(formRef.current);
			return false;
		}
		setErrors({});
		const res = await fetch(
			state.id === null
				? "/api/admin/deliveries"
				: `/api/admin/deliveries/${state.id}`,
			{
				method: state.id === null ? "POST" : "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(toPayload(state)),
			},
		);
		const body = await res.json().catch(() => null);
		if (!res.ok) {
			const marked = deliveryErrors(body?.issues, state);
			if (Object.keys(marked).length > 0) {
				setErrors(marked);
				focusFirstInvalid(formRef.current);
			} else {
				setError(messageFor(body?.error, "Could not save this delivery"));
			}
			return false;
		}
		setForm(null);
		// Straight to the job: comparing partners is the next thing anyone does
		// with a delivery they have just typed in or corrected.
		if (body?.delivery?.id) {
			router.push(`/admin/logistics/${body.delivery.id}`);
			return;
		}
		await load();
	});

	const [confirming, setConfirming] = useState<Confirm | null>(null);

	async function remove(row: DeliveryRow): Promise<string | null> {
		const res = await fetch(`/api/admin/deliveries/${row.id}`, {
			method: "DELETE",
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			return messageFor(body?.error, "Could not delete this delivery");
		}
		await load();
		return null;
	}

	return (
		<div className="flex flex-col gap-6">
			<ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />
			{(error || saving.failed) && (
				<p
					role="alert"
					className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700"
				>
					{error ?? NETWORK_ERROR}
				</p>
			)}

			{!geocodingConfigured && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					{/* Named rather than implied: a missing key and a key Google refuses
					    are fixed differently, and the admin cannot tell which they have
					    without being told. */}
					{geocodingFault ?? "Addresses are not looked up here."} Until that is
					fixed, no job can be quoted by anyone — the vehicle partners price by
					coordinate and the parcel partners by postcode, and both come from the
					lookup.
				</p>
			)}

			{!easyparcel.appConfigured && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					EasyParcel is not set up on this deployment.
				</p>
			)}

			{easyparcel.appConfigured && !easyparcel.connected && (
				<p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
					EasyParcel is not connected — parcel jobs cannot be quoted.{" "}
					<a
						href="/api/admin/logistics/easyparcel/connect"
						className="font-semibold underline"
					>
						Connect EasyParcel account
					</a>
				</p>
			)}

			{easyparcelResult === "connected" && (
				<p className="rounded-lg bg-[#e7f0ea] px-3 py-2 text-[13px] text-[#1f5138]">
					EasyParcel account connected.
				</p>
			)}

			{easyparcelResult === "failed" && (
				<p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
					Connecting the EasyParcel account failed — try again.
				</p>
			)}

			<div className="flex items-center justify-between">
				<p className="text-[13px] text-neutral-500">
					{rows.length} {rows.length === 1 ? "delivery" : "deliveries"}
				</p>
				<button
					type="button"
					className={chipClass(form !== null)}
					onClick={() =>
						setForm(form === null ? blankForm(workshopAddress) : null)
					}
				>
					{form === null ? "New delivery" : "Cancel"}
				</button>
			</div>

			{form !== null && (
				<DeliveryForm
					state={form}
					errors={errors}
					clearError={(key) =>
						setErrors((now) => {
							const { [key]: _gone, ...rest } = now;
							return key in now ? rest : now;
						})
					}
					formRef={formRef}
					onChange={setForm}
					// Success navigates away, so the spinner stays until the page changes.
					saving={saving.busy || saving.done}
					onSubmit={() => saving.run(form)}
				/>
			)}

			{rows.length === 0 ? (
				<p className="rounded-xl border border-neutral-200 bg-white px-4 py-8 text-center text-[13px] text-neutral-500">
					No deliveries yet. Create one to compare logistics partners.
				</p>
			) : (
				<ul className="flex flex-col gap-2">
					{rows.map((row) => (
						<li
							key={row.id}
							className="flex flex-wrap items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
						>
							<span className="font-medium text-[13px] text-neutral-400 tabular-nums">
								#{row.number}
							</span>
							<div className="min-w-[160px] flex-1">
								<p className="font-medium text-[14px]">{row.customerName}</p>
								<p className="truncate text-[12px] text-neutral-500">
									{row.siteAddress}
								</p>
							</div>
							{row.splitFromNumber !== null && (
								<span className="text-[12px] text-neutral-500">
									Split from #{row.splitFromNumber}
								</span>
							)}
							<span className="text-[12px] text-neutral-500">
								{row.carrierId ? LABEL[row.carrierId] : "No partner yet"}
							</span>
							<span
								className={`rounded-full px-2.5 py-1 font-medium text-[11px] ${BADGE_TONE[row.status]}`}
							>
								{STATUS_LABEL[row.status]}
							</span>
							{!row.carrierOrderId &&
								(pinState(row.siteLat, geocodingConfigured) !== "located" ||
									pinState(row.pickupLat, geocodingConfigured) !==
										"located") && (
									<span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-[11px] text-amber-800">
										No map pin
									</span>
								)}
							<Link
								href={`/admin/logistics/${row.id}`}
								className={chipClass(false)}
							>
								Open
							</Link>
							{EDITABLE.has(row.status) && (
								<button
									type="button"
									className="text-[12px] text-neutral-400 underline"
									onClick={() => {
										setForm(formFrom(row));
										window.scrollTo({ top: 0, behavior: "smooth" });
									}}
								>
									Edit
								</button>
							)}
							{!row.carrierOrderId && (
								<button
									type="button"
									className="text-[12px] text-neutral-400 underline"
									onClick={() =>
										setConfirming({
											title: `Delete delivery ${row.number}?`,
											body: `The delivery for ${row.customerName} is removed for good.`,
											confirmLabel: "Delete delivery",
											danger: true,
											run: () => remove(row),
										})
									}
								>
									Delete
								</button>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const LABEL_CLASS = "text-[12px] text-neutral-500";

function DeliveryForm({
	state,
	errors,
	clearError,
	formRef,
	onChange,
	onSubmit,
	saving,
}: {
	state: FormState;
	errors: DeliveryErrors;
	clearError: (key: string) => void;
	formRef: React.RefObject<HTMLFormElement | null>;
	onChange: (next: FormState) => void;
	onSubmit: () => void;
	saving: boolean;
}) {
	const items = state.items.filter((i) => i.label.trim() !== "");
	const suggestion = suggestVehicle(items);
	const weight = totalWeightKg(items);

	const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
		clearError(key);
		onChange({ ...state, [key]: value });
	};

	const setItem = (index: number, next: Partial<FormItem>) => {
		for (const field of Object.keys(next)) {
			clearError(itemKey(state.items[index].uid, field));
		}
		onChange({
			...state,
			items: state.items.map((item, i) =>
				i === index ? { ...item, ...next } : item,
			),
		});
	};

	return (
		<form
			ref={formRef}
			noValidate
			className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4"
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit();
			}}
		>
			{state.id !== null && (
				<p className="text-[13px] text-neutral-500">
					Editing <span className="text-neutral-900">{state.customerName}</span>
					. Saving re-checks the address, so a corrected line gets a fresh map
					pin.
				</p>
			)}
			{state.id === null && state.orderId !== null && (
				<p className="rounded-lg bg-[#f2f7f4] px-3 py-2 text-[#1f5138] text-[13px]">
					Filled in from a paid order: one row per cabinet at its designed size.
					Check the rows, add weights where they are blank, and add worktops or
					panels by hand.
				</p>
			)}
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<Field
					label="Customer"
					labelClassName={LABEL_CLASS}
					error={errors.customerName}
				>
					{(c) => (
						<input
							{...c}
							className={fieldClass(!!c["aria-invalid"])}
							value={state.customerName}
							onChange={(e) => set("customerName", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label="Phone"
					labelClassName={LABEL_CLASS}
					error={errors.customerPhone}
				>
					{(c) => (
						<input
							{...c}
							className={fieldClass(!!c["aria-invalid"])}
							value={state.customerPhone}
							onChange={(e) => set("customerPhone", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label="Site address"
					labelClassName={LABEL_CLASS}
					className="sm:col-span-2"
					error={errors.siteAddress}
				>
					{(c) => (
						<input
							{...c}
							className={fieldClass(!!c["aria-invalid"])}
							value={state.siteAddress}
							onChange={(e) => set("siteAddress", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label="Access notes — gate codes, unit number, who to call"
					labelClassName={LABEL_CLASS}
					className="sm:col-span-2"
					error={errors.addressNotes}
				>
					{(c) => (
						<input
							{...c}
							className={fieldClass(!!c["aria-invalid"])}
							value={state.addressNotes}
							onChange={(e) => set("addressNotes", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label="Pickup from"
					labelClassName={LABEL_CLASS}
					error={errors.pickupAddress}
				>
					{(c) => (
						<input
							{...c}
							className={fieldClass(!!c["aria-invalid"])}
							value={state.pickupAddress}
							onChange={(e) => set("pickupAddress", e.target.value)}
						/>
					)}
				</Field>
				<Field
					label="Scheduled"
					labelClassName={LABEL_CLASS}
					error={errors.scheduledAt}
				>
					{(c) => (
						<input
							{...c}
							type="datetime-local"
							className={fieldClass(!!c["aria-invalid"])}
							value={state.scheduledAt}
							onChange={(e) => set("scheduledAt", e.target.value)}
						/>
					)}
				</Field>
			</div>

			<div className="flex flex-col gap-2">
				<p className="font-medium text-[13px]">What is going on the lorry</p>
				{state.items.map((item, i) => {
					const rowMessage = itemRowMessage(errors, item.uid);
					const bad = (field: string) => !!errors[itemKey(item.uid, field)];
					// Props for one input of this row. The row is too narrow for a
					// message under each input, so one sentence under the row serves
					// them all.
					const mark = (field: string) => ({
						id: `${item.uid}-${field}`,
						"aria-invalid": bad(field) ? (true as const) : undefined,
						"aria-describedby": bad(field) ? `${item.uid}-error` : undefined,
					});
					return (
						<div key={item.uid} className="flex flex-col gap-1">
							<div className="flex flex-wrap items-end gap-2">
								<div className="flex min-w-[150px] flex-1 flex-col gap-1">
									<label
										htmlFor={`${item.uid}-label`}
										className="text-[11px] text-neutral-500"
									>
										Item
									</label>
									<input
										{...mark("label")}
										className={fieldClass(bad("label"))}
										value={item.label}
										onChange={(e) => setItem(i, { label: e.target.value })}
									/>
								</div>
								{(["qty", "widthMm", "heightMm", "depthMm"] as const).map(
									(field) => (
										<div key={field} className="flex w-[74px] flex-col gap-1">
											<label
												htmlFor={`${item.uid}-${field}`}
												className="text-[11px] text-neutral-500"
											>
												{ITEM_FIELDS[field].name === "Qty"
													? "Qty"
													: field.replace("Mm", " mm")}
											</label>
											<input
												{...mark(field)}
												type="number"
												className={fieldClass(bad(field))}
												value={item[field]}
												onChange={(e) =>
													setItem(i, { [field]: Number(e.target.value) })
												}
											/>
										</div>
									),
								)}
								<div className="flex w-[86px] flex-col gap-1">
									<label
										htmlFor={`${item.uid}-weightKg`}
										className="text-[11px] text-neutral-500"
									>
										Weight kg
									</label>
									<input
										{...mark("weightKg")}
										type="number"
										step="0.1"
										placeholder="—"
										className={fieldClass(bad("weightKg"))}
										value={item.weightKg ?? ""}
										onChange={(e) =>
											setItem(i, {
												weightKg:
													e.target.value === "" ? null : Number(e.target.value),
											})
										}
									/>
								</div>
								<button
									type="button"
									className="pb-2 text-[12px] text-neutral-400 underline"
									onClick={() =>
										onChange({
											...state,
											items: state.items.filter((_, j) => j !== i),
										})
									}
								>
									Remove
								</button>
							</div>
							{rowMessage && (
								<FieldMessage id={`${item.uid}-error`}>
									{rowMessage}
								</FieldMessage>
							)}
						</div>
					);
				})}
				<button
					type="button"
					className={`${chipClass(false)} self-start`}
					onClick={() =>
						onChange({ ...state, items: [...state.items, emptyItem()] })
					}
				>
					Add item
				</button>
			</div>

			<p className="text-[12px] text-neutral-500">
				{totalVolumeM3(items)} m³
				{weight === null ? ", weight not given" : `, ${weight} kg`} —{" "}
				<span className="text-neutral-900">{suggestion.label}</span>. The
				vehicle partners price by distance and do not need a weight. The parcel
				partners price by the kilogram and cannot quote without one.
			</p>

			<button
				type="submit"
				disabled={saving}
				className="self-start rounded-full bg-neutral-900 px-4 py-2 text-[13px] text-white disabled:opacity-60"
			>
				{saving && <Spinner />}
				{saving
					? "Saving…"
					: state.id === null
						? "Save delivery"
						: "Save changes"}
			</button>
		</form>
	);
}
