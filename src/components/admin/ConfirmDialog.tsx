"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";

export type Confirm = {
	title: string;
	body: ReactNode;
	confirmLabel: string;
	/** Irreversible: the confirm button is red. */
	danger?: boolean;
	/** The route is step-up guarded, so say a passkey prompt may follow. */
	stepUp?: boolean;
	/** Does the thing. An error message to show, or null when it worked. */
	run: () => Promise<string | null>;
};

/**
 * The admin's one "are you sure". A native `<dialog>`: the browser supplies
 * the focus trap, Escape and the inert page behind it.
 *
 * Cancel takes focus, so a stray Enter backs out rather than confirming.
 */
export function ConfirmDialog({
	confirm,
	onClose,
	children,
	blocked,
}: {
	confirm: Confirm | null;
	onClose: () => void;
	/** Extra fields the action needs, e.g. a reason. */
	children?: ReactNode;
	/** Those fields are not filled in yet. */
	blocked?: boolean;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// On open/close only: a caller may rebuild `confirm` on every render.
	const open = confirm !== null;
	useEffect(() => {
		const dialog = ref.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			setError(null);
			dialog.showModal();
		}
		if (!open && dialog.open) dialog.close();
	}, [open]);

	async function run() {
		if (!confirm) return;
		setBusy(true);
		setError(null);
		let message: string | null;
		try {
			message = await confirm.run();
		} catch {
			message = "Something went wrong. Nothing was changed.";
		}
		setBusy(false);
		if (message) setError(message);
		else onClose();
	}

	return (
		<dialog
			ref={ref}
			// Escape and the backdrop both end here; never mid-request.
			onCancel={(e) => {
				e.preventDefault();
				if (!busy) onClose();
			}}
			className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[14px] border border-neutral-200 bg-white p-6 text-neutral-900 backdrop:bg-neutral-900/40"
		>
			{confirm && (
				<div className="flex flex-col gap-3">
					<h2 className="font-semibold text-[16px]">{confirm.title}</h2>
					<div className="text-[13px] text-neutral-600 leading-5">
						{confirm.body}
					</div>
					{children}
					{confirm.stepUp && (
						<p className="text-[12px] text-neutral-500">
							You may be asked for your passkey.{" "}
							<Link href="/admin/security" className="underline">
								Set one up
							</Link>{" "}
							if you have none.
						</p>
					)}
					{error && (
						<p
							role="alert"
							className="rounded-[10px] bg-[#fbf1ee] px-3 py-2.5 text-[#7a2c1c] text-[13px]"
						>
							{error}
						</p>
					)}
					<div className="mt-1 flex justify-end gap-2">
						<button
							type="button"
							// biome-ignore lint/a11y/noAutofocus: the safe choice takes focus in a destructive confirm
							autoFocus
							disabled={busy}
							onClick={onClose}
							className="min-h-10 rounded-lg border border-neutral-300 px-4 text-[13px] text-neutral-700 hover:bg-[#f4f3f1] disabled:opacity-50"
						>
							Back
						</button>
						<button
							type="button"
							disabled={busy || blocked}
							onClick={run}
							className={`flex min-h-10 items-center gap-2 rounded-lg px-4 font-medium text-[13px] text-white disabled:opacity-50 ${
								confirm.danger
									? "bg-[#9f1d1d] hover:bg-[#7f1d1d]"
									: "bg-[#1f5138] hover:bg-[#17402c]"
							}`}
						>
							{busy && <Spinner />}
							{confirm.confirmLabel}
						</button>
					</div>
				</div>
			)}
		</dialog>
	);
}
