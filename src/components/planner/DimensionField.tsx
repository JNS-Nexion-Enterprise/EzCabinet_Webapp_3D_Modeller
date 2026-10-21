"use client";

import { useEffect, useState } from "react";
import { fill } from "@/lib/copy/fill";
import { useCopy } from "./CopyContext";

/**
 * One room dimension: a slider for feel, a number box for a figure someone
 * actually measured.
 *
 * The number box keeps its own draft string, which is the whole reason this is
 * a component and not two inputs inline. The setters in `layout.ts` clamp, so
 * committing on every keystroke makes the field impossible to type into — a
 * customer clearing "4200" to enter "1500" gets their first "1" clamped
 * straight up to the minimum, and the caret ends up behind a number they never
 * asked for. So keystrokes only commit while they parse to something in range;
 * anything else is held as text until blur, and blur always resyncs to whatever
 * the engine settled on.
 */
export function DimensionField({
	label,
	valueMm,
	minMm,
	maxMm,
	stepMm,
	onChangeAction,
}: {
	label: string;
	valueMm: number;
	minMm: number;
	maxMm: number;
	stepMm: number;
	onChangeAction: (mm: number) => void;
}) {
	const t = useCopy();
	const [draft, setDraft] = useState(String(valueMm));

	// Follow the layout when it moves for any other reason — the slider, a room
	// switch, or a reset.
	useEffect(() => {
		setDraft(String(valueMm));
	}, [valueMm]);

	const commit = () => {
		const parsed = Number(draft);
		if (draft.trim() === "" || Number.isNaN(parsed)) {
			setDraft(String(valueMm));
			return;
		}
		onChangeAction(parsed);
		// The engine clamps, so the field has to show what it decided, not what
		// was typed.
		setDraft(String(Math.min(maxMm, Math.max(minMm, Math.round(parsed)))));
	};

	return (
		<div>
			<div className="flex items-baseline justify-between gap-2">
				<span className="text-[12px] text-neutral-700">{label}</span>
				<span className="flex items-center gap-1">
					<input
						type="number"
						value={draft}
						min={minMm}
						max={maxMm}
						step={stepMm}
						aria-label={fill(t.planner.dimensionAriaSuffix, { label })}
						onChange={(e) => {
							const next = e.target.value;
							setDraft(next);
							const parsed = Number(next);
							if (next.trim() === "" || Number.isNaN(parsed)) return;
							if (parsed < minMm || parsed > maxMm) return;
							onChangeAction(parsed);
						}}
						onBlur={commit}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								e.preventDefault();
								commit();
							}
						}}
						// The spinner arrows are suppressed rather than styled: at this size
						// they eat the last digit of a 4-figure millimetre reading, and
						// the slider beside the box already does what they would.
						className="w-16 max-[760px]:min-h-10 max-[760px]:w-[84px] max-[760px]:text-[16px] rounded-md border border-neutral-200 px-1.5 py-0.5 text-right text-[12px] tabular-nums [appearance:textfield] focus:border-neutral-400 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
					<span className="text-[12px] text-neutral-500">mm</span>
				</span>
			</div>
			<input
				type="range"
				className="mt-1 w-full max-[760px]:h-8"
				aria-label={label}
				min={minMm}
				max={maxMm}
				step={stepMm}
				value={valueMm}
				onChange={(e) => onChangeAction(Number(e.target.value))}
			/>
		</div>
	);
}
