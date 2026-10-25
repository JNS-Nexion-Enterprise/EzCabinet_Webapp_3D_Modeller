"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Field, focusFirstInvalid, INVALID } from "@/components/Field";
import { Done, Spinner } from "@/components/Spinner";
import { fieldsFromIssues } from "@/lib/fieldIssues";
import {
	type ContactField,
	type ContactReason,
	contactErrors,
} from "@/lib/orders/contactErrors";

const LABEL = "font-medium text-[#404040] text-[12px]";
// 16px below `sm`: iOS Safari zooms the page on focusing anything smaller.
const FIELD =
	"min-h-[42px] rounded-lg border px-3 py-2.5 text-base text-[#171717] sm:text-[14px] disabled:bg-neutral-50";
// The valid colours ride only on a valid field: beside `INVALID` the CSS order, not the class order, would pick the border.
const fieldClass = (invalid: boolean | undefined) =>
	`${FIELD} ${invalid ? INVALID : "border-[#d4d4d4] bg-white"}`;

type FieldErrors = Partial<Record<ContactField, string>>;
const isContactField = (key: unknown): key is ContactField =>
	key === "name" || key === "phone" || key === "email" || key === "siteAddress";

export type OrderDetails = {
	name: string;
	phone: string;
	email: string | null;
	siteAddress: string;
	addressNotes: string | null;
	whatsappOptIn: boolean;
};

/**
 * The order's contact and delivery details, corrected in place by the
 * customer who placed it. The server decides whether the order is still
 * open to it (`lib/orders/editDetails.ts`); this only renders when it was.
 */
export function EditDetails({
	token,
	details,
	labels,
}: {
	token: string;
	details: OrderDetails;
	labels: {
		edit: string;
		save: string;
		saving: string;
		cancel: string;
		name: string;
		phone: string;
		email: string;
		siteAddress: string;
		addressNotes: string;
		whatsappOptIn: string;
		errorNameRequired: string;
		errorPhone: string;
		errorPhoneRequired: string;
		errorEmailInvalid: string;
		errorAddressRequired: string;
		errorAddressShort: string;
		errorLocked: string;
		errorGeneric: string;
		networkError: string;
		saved: string;
	};
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
	// Stays until the editor is opened again: the form closing is the only
	// other sign the save landed.
	const [saved, setSaved] = useState(false);

	if (!open) {
		return (
			<div className="mt-3 flex flex-wrap items-center gap-3">
				<button
					type="button"
					onClick={() => {
						setSaved(false);
						setFieldErrors({});
						setOpen(true);
					}}
					className="inline-flex min-h-9 items-center rounded-lg border border-[#d4d4d4] bg-white px-3.5 font-medium text-[13px] hover:border-[#a3a3a3] hover:bg-[#faf9f7]"
				>
					{labels.edit}
				</button>
				{saved && (
					<p role="status" className="text-[#1f5138] text-[13px]">
						<Done />
						{labels.saved}
					</p>
				)}
			</div>
		);
	}

	// A field the server refused after our own checks passed gets the "invalid"
	// wording; the address and name have none, so their nearest one stands.
	const say = (key: ContactField, reason: ContactReason | undefined) => {
		if (key === "phone")
			return reason === "required"
				? labels.errorPhoneRequired
				: labels.errorPhone;
		if (key === "email") return labels.errorEmailInvalid;
		if (key === "name") return labels.errorNameRequired;
		return reason === "required"
			? labels.errorAddressRequired
			: labels.errorAddressShort;
	};

	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const element = event.currentTarget;
		const form = new FormData(element);
		const text = (name: string) => String(form.get(name) ?? "").trim();
		// Checked here rather than by the browser so every problem shows at once,
		// in our words, on its field. The server re-checks all of it.
		const found = contactErrors({
			name: text("name"),
			phone: text("phone"),
			email: text("email"),
			siteAddress: text("siteAddress"),
			emailRequired: false,
			emailValid: (element.elements.namedItem("email") as HTMLInputElement)
				.validity.valid,
		});
		const marks: FieldErrors = {};
		for (const key of Object.keys(found) as ContactField[]) {
			marks[key] = say(key, found[key]);
		}
		setFieldErrors(marks);
		if (Object.keys(marks).length > 0) {
			focusFirstInvalid(element);
			return;
		}
		setBusy(true);
		setError(null);
		let response: Response;
		try {
			response = await fetch(`/api/orders/${token}`, {
				method: "PATCH",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					name: text("name"),
					phone: text("phone"),
					email: text("email") || null,
					siteAddress: text("siteAddress"),
					addressNotes: text("addressNotes") || null,
					whatsappOptIn: form.get("whatsappOptIn") === "on",
				}),
			});
		} catch {
			setError(labels.networkError);
			return;
		} finally {
			setBusy(false);
		}
		if (response.ok) {
			setSaved(true);
			setOpen(false);
			router.refresh();
			return;
		}
		// The phone the server cannot read, or the fields its own checks refused.
		const reply = await response.json().catch(() => null);
		const refused =
			response.status === 422
				? (["phone"] as const)
				: response.status === 400
					? fieldsFromIssues(reply?.issues, (path) =>
							isContactField(path[0]) ? path[0] : null,
						)
					: [];
		if (refused.length > 0) {
			setFieldErrors(
				Object.fromEntries(refused.map((key) => [key, say(key, "invalid")])),
			);
			focusFirstInvalid(element);
			return;
		}
		setError(
			response.status === 409 ? labels.errorLocked : labels.errorGeneric,
		);
		// Locked means the page is stale: show what the order looks like now.
		if (response.status === 409) router.refresh();
	};

	return (
		<form
			noValidate
			onSubmit={save}
			onChange={(e) => {
				const key = (e.target as { name?: string }).name;
				if (isContactField(key))
					setFieldErrors((current) =>
						current[key] ? { ...current, [key]: undefined } : current,
					);
			}}
			className="mt-4 border-[#ecebe7] border-t pt-4"
		>
			<fieldset className="flex flex-col gap-3" disabled={busy}>
				<Field
					label={labels.name}
					labelClassName={LABEL}
					error={fieldErrors.name}
					className="gap-1.5"
				>
					{(control) => (
						<input
							{...control}
							name="name"
							autoComplete="name"
							required
							maxLength={200}
							defaultValue={details.name}
							className={fieldClass(control["aria-invalid"])}
						/>
					)}
				</Field>
				<Field
					label={labels.phone}
					labelClassName={LABEL}
					error={fieldErrors.phone}
					className="gap-1.5"
				>
					{(control) => (
						<input
							{...control}
							name="phone"
							type="tel"
							autoComplete="tel"
							required
							maxLength={40}
							defaultValue={details.phone}
							className={fieldClass(control["aria-invalid"])}
						/>
					)}
				</Field>
				<Field
					label={labels.email}
					labelClassName={LABEL}
					error={fieldErrors.email}
					className="gap-1.5"
				>
					{(control) => (
						<input
							{...control}
							name="email"
							type="email"
							autoComplete="email"
							maxLength={200}
							defaultValue={details.email ?? ""}
							className={fieldClass(control["aria-invalid"])}
						/>
					)}
				</Field>
				<Field
					label={labels.siteAddress}
					labelClassName={LABEL}
					error={fieldErrors.siteAddress}
					className="gap-1.5"
				>
					{(control) => (
						<textarea
							{...control}
							name="siteAddress"
							autoComplete="street-address"
							required
							minLength={5}
							maxLength={500}
							rows={2}
							defaultValue={details.siteAddress}
							className={`${fieldClass(control["aria-invalid"])} min-h-16 resize-y`}
						/>
					)}
				</Field>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.addressNotes}</span>
					<input
						name="addressNotes"
						maxLength={500}
						defaultValue={details.addressNotes ?? ""}
						className={fieldClass(false)}
					/>
				</label>
				<label className="flex min-h-9 cursor-pointer items-start gap-[9px]">
					<input
						name="whatsappOptIn"
						type="checkbox"
						defaultChecked={details.whatsappOptIn}
						className="mt-px h-4 w-4 shrink-0 accent-[#171717]"
					/>
					<span className="text-[#5c574e] text-[12px] leading-[17px]">
						{labels.whatsappOptIn}
					</span>
				</label>
				{error && (
					<p role="alert" className="text-[#b42318] text-[12px]">
						{error}
					</p>
				)}
				<div className="flex gap-2">
					<button
						type="submit"
						className="inline-flex min-h-10 items-center rounded-[9px] bg-[#1f5138] px-4 font-semibold text-[13px] text-white hover:bg-[#1a4430] disabled:opacity-60"
					>
						{busy && <Spinner />}
						{busy ? labels.saving : labels.save}
					</button>
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							setError(null);
						}}
						className="inline-flex min-h-10 items-center rounded-[9px] border border-[#d4d4d4] bg-white px-4 font-medium text-[13px] hover:border-[#a3a3a3]"
					>
						{labels.cancel}
					</button>
				</div>
			</fieldset>
		</form>
	);
}
