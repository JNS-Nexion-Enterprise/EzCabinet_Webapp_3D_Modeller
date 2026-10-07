"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

const LABEL = "font-medium text-[#404040] text-[12px]";
// 16px below `sm`: iOS Safari zooms the page on focusing anything smaller.
const FIELD =
	"min-h-[42px] rounded-lg border border-[#d4d4d4] bg-white px-3 py-2.5 text-base text-[#171717] sm:text-[14px] disabled:bg-neutral-50";

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
		errorPhone: string;
		errorLocked: string;
		errorGeneric: string;
	};
}) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-[#d4d4d4] bg-white px-3.5 font-medium text-[13px] hover:border-[#a3a3a3] hover:bg-[#faf9f7]"
			>
				{labels.edit}
			</button>
		);
	}

	const save = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const text = (name: string) => String(form.get(name) ?? "").trim();
		setBusy(true);
		setError(null);
		const response = await fetch(`/api/orders/${token}`, {
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
		}).catch(() => null);
		setBusy(false);
		if (response?.ok) {
			setOpen(false);
			router.refresh();
			return;
		}
		setError(
			response?.status === 422
				? labels.errorPhone
				: response?.status === 409
					? labels.errorLocked
					: labels.errorGeneric,
		);
		// Locked means the page is stale: show what the order looks like now.
		if (response?.status === 409) router.refresh();
	};

	return (
		<form onSubmit={save} className="mt-4 border-[#ecebe7] border-t pt-4">
			<fieldset className="flex flex-col gap-3" disabled={busy}>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.name}</span>
					<input
						name="name"
						autoComplete="name"
						required
						maxLength={200}
						defaultValue={details.name}
						className={FIELD}
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.phone}</span>
					<input
						name="phone"
						type="tel"
						autoComplete="tel"
						required
						maxLength={40}
						defaultValue={details.phone}
						className={FIELD}
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.email}</span>
					<input
						name="email"
						type="email"
						autoComplete="email"
						maxLength={200}
						defaultValue={details.email ?? ""}
						className={FIELD}
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.siteAddress}</span>
					<textarea
						name="siteAddress"
						autoComplete="street-address"
						required
						minLength={5}
						maxLength={500}
						rows={2}
						defaultValue={details.siteAddress}
						className={`${FIELD} min-h-16 resize-y`}
					/>
				</label>
				<label className="flex flex-col gap-1.5">
					<span className={LABEL}>{labels.addressNotes}</span>
					<input
						name="addressNotes"
						maxLength={500}
						defaultValue={details.addressNotes ?? ""}
						className={FIELD}
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
