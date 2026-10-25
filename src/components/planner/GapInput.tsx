"use client";

import { type InputHTMLAttributes, useRef, useState } from "react";

/**
 * A millimetre figure that is typed, then committed — on Enter or blur, never
 * per keystroke. Every commit moves a cabinet and the engine clamps it, so
 * typing "1" on the way to "1500" would slam the cabinet into the wall and
 * leave it there.
 *
 * Its own file, not `PositionDimensions.tsx`: the side panel uses it too, and
 * importing it from there would drag drei out of the lazy 3D bundle.
 */
// Variants, not plain utilities: a caller's own border, ring and background
// would otherwise tie with these and the stylesheet order would pick.
const INVALID_WHILE_TYPING =
	"aria-invalid:border-danger aria-invalid:bg-danger/5 aria-invalid:ring-1 aria-invalid:ring-danger";

export function GapInput({
	valueMm,
	onCommit,
	onDone,
	className,
	...rest
}: {
	valueMm: number;
	onCommit: (mm: number) => void;
	/** After a commit or a cancel — the chip uses it to fold back to a label. */
	onDone?: () => void;
} & Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "value" | "onChange" | "onBlur" | "onKeyDown"
>) {
	const [draft, setDraft] = useState<string | null>(null);
	const cancelled = useRef(false);
	// Blur drops an unreadable draft, but until then it is marked. Out of
	// range is not an error here: the engine's real limit depends on the
	// cabinets, so a figure past it still snaps silently.
	const typed = Number(draft);
	const invalid =
		draft !== null &&
		(draft.trim() === "" ||
			Number.isNaN(typed) ||
			typed < Number(rest.min ?? 0));

	return (
		<input
			// Before `rest`, so a caller whose figure can be negative (a turn)
			// can lower it.
			min={0}
			{...rest}
			type="number"
			inputMode="numeric"
			value={draft ?? Math.round(valueMm)}
			aria-invalid={invalid || undefined}
			className={`${className ?? ""} ${INVALID_WHILE_TYPING}`}
			onChange={(e) => setDraft(e.target.value)}
			onKeyDown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
				if (e.key === "Escape") {
					cancelled.current = true;
					e.currentTarget.blur();
				}
			}}
			onBlur={() => {
				if (!cancelled.current && draft !== null && draft.trim() !== "") {
					onCommit(Number(draft));
				}
				cancelled.current = false;
				setDraft(null);
				onDone?.();
			}}
		/>
	);
}
