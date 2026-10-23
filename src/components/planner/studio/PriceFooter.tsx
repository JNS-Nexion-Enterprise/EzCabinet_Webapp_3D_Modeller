"use client";

import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { fill } from "@/lib/copy/fill";
import { useCopy } from "../CopyContext";
import { phonePrimary } from "../PhoneChrome";

/**
 * The total, and what is behind it.
 *
 * The whole category list used to sit in the sidebar, which spent a third of
 * the panel on a number nobody reads line by line until they are ready to.
 * The footer carries the figure; the modal carries the arithmetic.
 *
 * It collects nothing — the quote button still goes to the quote screen,
 * which is where a lead is captured.
 */
export function PriceFooter({
	lines,
	coverNote,
	totalLabel,
	ctaDisabled,
	notice,
	onQuoteAction,
	variant = "panel",
}: {
	lines: { id: string; label: string; detail: string; amount: string }[];
	/** The "a trim strip and a skirting board are included above." sentence,
	 * or null when nothing extra was added for the customer. */
	coverNote: string | null;
	totalLabel: string;
	ctaDisabled: boolean;
	/** Something the customer should see before pressing the quote button —
	 * the sign-in nudge today. In the footer's own flow, so it can never cover
	 * the total the way a floating layer did. */
	notice?: ReactNode;
	onQuoteAction: () => void;
	/** `panel` is the sidebar footer. `bar` is the phone's one-row bottom bar,
	 * which has no room for `notice`: the phone shows it in the Run tab. */
	variant?: "panel" | "bar";
}) {
	const t = useCopy();
	const [open, setOpen] = useState(false);

	const dialog = open && (
		<div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(23,23,23,.42)] p-6">
			<div
				role="dialog"
				aria-modal="true"
				aria-label={fill(t.planner.price.breakdownTitle, {
					total: totalLabel,
				})}
				className="max-h-full w-full max-w-[720px] overflow-y-auto rounded-[14px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.24)]"
			>
				<div className="flex items-start justify-between gap-4 border-[#f0efec] border-b px-6 pt-5 pb-3.5">
					<div>
						<h2 className="font-semibold text-[18px]">
							{fill(t.planner.price.breakdownTitle, { total: totalLabel })}
						</h2>
						<p className="mt-1 text-[13px] text-neutral-500">
							{t.planner.price.placeholderNote}
						</p>
					</div>
					<button
						type="button"
						onClick={() => setOpen(false)}
						aria-label={t.common.close}
						className="flex h-9 w-9 max-[760px]:size-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-600 hover:bg-[#f4f3f1]"
					>
						✕
					</button>
				</div>

				<div className="px-6 py-4">
					{lines.map((line) => (
						<div
							key={line.id}
							className="flex items-baseline justify-between gap-3 border-[#f4f3f1] border-b py-2"
						>
							<span className="text-[13px]">
								{line.label}{" "}
								<span className="text-[#8a857c]">{line.detail}</span>
							</span>
							<span className="font-medium text-[13px] tabular-nums">
								{line.amount}
							</span>
						</div>
					))}

					{coverNote && (
						<p className="mt-3 text-[11px] text-neutral-500 leading-4">
							{coverNote}
						</p>
					)}

					<div className="flex items-baseline justify-between gap-3 pt-3">
						<span className="font-semibold text-[13px]">
							{t.planner.price.estimatedTotal}
						</span>
						<span className="font-semibold text-[20px] tabular-nums">
							{totalLabel}
						</span>
					</div>
				</div>
			</div>
		</div>
	);

	if (variant === "bar") {
		return (
			// One 52px row, always: the bar's height is fixed (`phoneBar`), so
			// neither the button nor the total wraps, and the label gives way.
			<div className="flex items-center justify-between gap-3">
				{/* The total is the way into the breakdown, as the panel's is.
				    The column never gets narrower than the total: the label's
				    `w-0` keeps it out of the column's minimum width, so it is
				    the label that truncates. */}
				<button
					type="button"
					onClick={() => setOpen(true)}
					aria-haspopup="dialog"
					className="flex min-h-11 flex-1 flex-col items-start text-left"
				>
					<span className="flex w-full items-center gap-1.5 text-[#5c5c5c] text-[12px] leading-4">
						<span className="w-0 flex-1 truncate">
							{t.planner.price.estimatedTotal}
						</span>
						<span className="shrink-0 rounded border border-[#b45309] px-1 font-semibold text-[#9a4a07] text-[10px] leading-[14px]">
							{t.planner.price.estimateBadge}
						</span>
					</span>
					<span className="whitespace-nowrap font-semibold text-[22px] tabular-nums leading-7">
						{totalLabel}
					</span>
				</button>
				<button
					type="button"
					onClick={onQuoteAction}
					disabled={ctaDisabled}
					className={`${phonePrimary} shrink-0 whitespace-nowrap max-[760px]:px-[22px] max-[360px]:px-3.5`}
				>
					{t.planner.phone.quoteCta}
				</button>
				{/* Out to <body>: the bar's backdrop blur makes it the containing
				    block for `fixed` children, which shut the modal inside the bar. */}
				{dialog && createPortal(dialog, document.body)}
			</div>
		);
	}

	return (
		<div className="flex shrink-0 flex-col gap-2.5 border-neutral-200 border-t px-4 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="flex w-full items-baseline justify-between gap-2.5 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-3 py-2.5 text-left hover:border-neutral-300 hover:bg-[#f4f3f1]"
			>
				<span className="text-[12px] text-neutral-600">
					{t.planner.price.estimatedTotal}
				</span>
				<span className="flex items-baseline gap-2">
					<span className="font-semibold text-[19px] tabular-nums">
						{totalLabel}
					</span>
					<span className="font-semibold text-[#1f5138] text-[11px]">
						{t.planner.price.breakdown}
					</span>
				</span>
			</button>

			<p className="flex items-center gap-1.5 text-[#b45309] text-[11px] leading-4 max-sm:hidden">
				<span className="rounded border border-[#b45309] px-1 py-0.5 font-semibold">
					{t.planner.price.estimateBadge}
				</span>{" "}
				{t.planner.price.placeholderNote}
			</p>

			{notice}

			<button
				type="button"
				onClick={onQuoteAction}
				disabled={ctaDisabled}
				className="min-h-11 rounded-[10px] bg-[#1f5138] px-3 py-2.5 font-semibold text-[14px] text-white transition hover:bg-[#17402c] disabled:cursor-not-allowed disabled:opacity-40"
			>
				{t.planner.price.cta}
			</button>

			{dialog}
		</div>
	);
}
