"use client";

import { fill } from "@/lib/copy/fill";
import type { Positioned } from "@/lib/planner/layout";
import { useCopy } from "../CopyContext";

/**
 * Every cabinet in the run, by name.
 *
 * Shown in every state of the right panel, not just the empty one. Its
 * checkboxes are how a multi-selection is built, so hiding it as soon as one
 * cabinet is selected made multi-select unreachable — you could only ever get
 * back to it by clearing what you had.
 */
export function RunList({
	placed,
	selectedIds,
	gapCount,
	priceLabels,
	onSelectAction,
	onCloseGapsAction,
	onResetAction,
}: {
	placed: Positioned[];
	selectedIds: ReadonlySet<string>;
	gapCount: number;
	/** Cabinet id → its line on the price, formatted by the caller. A map
	 * rather than a lookup function: a "use client" boundary only takes
	 * serialisable props. Formatted, not raw, because the caller owns the
	 * locale — and because a bare `1026` next to a bare `900` is two numbers
	 * in two different units with nothing on the row saying which is which. */
	priceLabels: Record<string, string>;
	onSelectAction: (id: string, additive: boolean) => void;
	onCloseGapsAction: () => void;
	onResetAction: () => void;
}) {
	const t = useCopy();

	return (
		<div className="border-[#eeece8] border-t px-4 py-4">
			<div className="mb-2 flex items-baseline justify-between gap-2">
				<p className="font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
					{fill(t.planner.run.heading, {
						count: placed.length,
						unit: placed.length === 1 ? t.planner.unit : t.planner.units,
					})}
				</p>
				<button
					type="button"
					onClick={onCloseGapsAction}
					disabled={gapCount === 0}
					className="text-[12px] text-neutral-500 hover:text-neutral-900 disabled:opacity-40"
				>
					{gapCount > 0
						? fill(t.planner.run.closeGapsCount, { n: gapCount })
						: t.planner.run.closeGaps}
				</button>
			</div>

			{placed.length === 0 ? (
				<p className="text-[13px] text-neutral-500">
					{t.planner.run.emptyHint}
				</p>
			) : (
				<div className="flex flex-col">
					{placed.map((position) => (
						<div
							key={position.placed.id}
							className={`flex items-center gap-2.5 border-[#eeece8] border-t py-2.5 max-[760px]:min-h-12 max-[760px]:text-[15px] ${
								selectedIds.has(position.placed.id) ? "bg-[#f2f7f4]" : ""
							}`}
						>
							<input
								type="checkbox"
								checked={selectedIds.has(position.placed.id)}
								aria-label={fill(t.planner.run.selectAria, {
									name: position.family.label,
								})}
								onChange={() => onSelectAction(position.placed.id, true)}
							/>
							<button
								type="button"
								onClick={(e) =>
									onSelectAction(
										position.placed.id,
										e.shiftKey || e.metaKey || e.ctrlKey,
									)
								}
								className="min-w-0 flex-1 truncate text-left text-[13px] max-[760px]:min-h-12 max-[760px]:text-[15px]"
							>
								{/* The row used to read "Base cabinet 900 shaker 1026" — a
								    width and a price side by side, neither labelled, in two
								    different units. Both wear their unit now.

								    One line, not two. Stacking the front onto its own line
								    read better per row and showed two and a half of seven
								    units before the finish section cut it off, which is
								    worse at the job this list actually does. */}
								<span className="font-medium text-neutral-900">
									{position.family.label} · {position.widthMm} mm
								</span>{" "}
								<span className="text-[12px] text-neutral-500">
									{position.placed.doorStyleId ?? t.planner.run.noDoorInline}
								</span>
							</button>
							<span className="shrink-0 text-right text-[13px] text-neutral-700 tabular-nums">
								{priceLabels[position.placed.id] ?? ""}
							</span>
						</div>
					))}
				</div>
			)}

			<button
				type="button"
				onClick={onResetAction}
				className="mt-3 text-[12px] text-neutral-500 underline hover:text-neutral-900"
			>
				{t.planner.run.reset}
			</button>
		</div>
	);
}
