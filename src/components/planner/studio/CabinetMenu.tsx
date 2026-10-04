"use client";

import { useEffect } from "react";

/**
 * The right-click menu on a cabinet.
 *
 * No scene work is needed for this: `hitTestRef` already answers "which
 * cabinet is under this screen point", which is the whole question a context
 * menu asks.
 */
export function CabinetMenu({
	x,
	y,
	items,
	onDismissAction,
}: {
	x: number;
	y: number;
	items: {
		key: string;
		label: string;
		danger?: boolean;
		disabled?: boolean;
		press: () => void;
	}[];
	onDismissAction: () => void;
}) {
	// Any click elsewhere closes it, including one that lands on the canvas —
	// which is a pointer event the scene also handles, so this listens on the
	// window rather than covering the page with a backdrop that would eat it.
	useEffect(() => {
		const close = () => onDismissAction();
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, [onDismissAction]);

	return (
		<div
			className="fixed z-30 flex min-w-[168px] flex-col rounded-[10px] border border-neutral-200 bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,.16)]"
			style={{ left: x, top: y }}
		>
			{items.map((item) => (
				<button
					key={item.key}
					type="button"
					onClick={item.press}
					disabled={item.disabled}
					className={`min-h-9 w-full rounded-md px-3.5 py-2 text-left text-[13px] hover:bg-[#f4f3f1] disabled:cursor-not-allowed disabled:text-neutral-300 disabled:hover:bg-transparent ${
						item.danger ? "text-[#8a2c1c]" : "text-neutral-900"
					}`}
				>
					{item.label}
				</button>
			))}
		</div>
	);
}
