"use client";

import { useCopy } from "../CopyContext";

/**
 * What the right panel says when nothing is selected.
 *
 * The recap answers "what have I got" without making the customer read the
 * 3D view. The run under it is `RunList`, which is shown in every state
 * rather than only this one.
 */
export function DesignRecap({
	rows,
	onAddAction,
}: {
	/** Label/value pairs, already formatted by the caller. */
	rows: { label: string; value: string }[];
	onAddAction: () => void;
}) {
	const t = useCopy();

	return (
		<div className="p-4">
			<h2 className="font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
				{t.planner.design.heading}
			</h2>
			<p className="mt-1.5 mb-3 text-[13px] text-neutral-700 leading-[19px]">
				{t.planner.design.hint}
			</p>

			<dl className="m-0 flex flex-col">
				{rows.map((row) => (
					<div
						key={row.label}
						className="flex items-baseline justify-between gap-3 border-[#eeece8] border-t py-2.5"
					>
						<dt className="text-[13px] text-neutral-500">{row.label}</dt>
						<dd className="m-0 text-right font-semibold text-[14px] tabular-nums">
							{row.value}
						</dd>
					</div>
				))}
			</dl>

			<button
				type="button"
				onClick={onAddAction}
				className="mt-4 min-h-10 max-[760px]:min-h-11 w-full rounded-[9px] border border-neutral-900 bg-white px-3.5 py-2.5 font-semibold text-[13px] hover:bg-[#f4f3f1]"
			>
				{t.planner.design.addCabinet}
			</button>
		</div>
	);
}
