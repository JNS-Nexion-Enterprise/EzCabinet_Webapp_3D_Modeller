"use client";

import { type ReactNode, useEffect, useState } from "react";

/**
 * The landing page's small-screen menu: a full-width panel under the header,
 * one 48px row per link, from the design's phone layout.
 *
 * A client island rather than the `<details>` it replaced, because the panel
 * has to close when a link inside it is tapped — most of them jump within the
 * page, and a disclosure left open would sit over the section it scrolled to.
 * Esc closes it too. The panel positions against the sticky header.
 */
export default function LandingMenu({
	openLabel,
	closeLabel,
	children,
}: {
	openLabel: string;
	closeLabel: string;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		addEventListener("keydown", onKey);
		return () => removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			<button
				type="button"
				aria-label={open ? closeLabel : openLabel}
				aria-expanded={open}
				aria-controls="landing-menu"
				onClick={() => setOpen((o) => !o)}
				className="flex size-11 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-[10px] border border-[#d9ccb8] bg-[rgba(251,248,244,.6)] transition-colors hover:border-[#a8977f] hover:bg-(--oat) active:bg-[#e9e0d1]"
			>
				<span className="h-[1.5px] w-4 rounded-[1px] bg-(--ink)" />
				<span className="h-[1.5px] w-4 rounded-[1px] bg-(--ink)" />
				<span className="h-[1.5px] w-4 rounded-[1px] bg-(--ink)" />
			</button>
			{open && (
				// biome-ignore lint/a11y/noStaticElementInteractions: delegates link taps; the links are the controls
				// biome-ignore lint/a11y/useKeyWithClickEvents: Esc is handled above, Enter on a link fires click
				<div
					id="landing-menu"
					onClick={(event) => {
						if ((event.target as HTMLElement).closest("a")) setOpen(false);
					}}
					className="absolute inset-x-0 top-full flex flex-col border-(--rule) border-b bg-(--paper) px-5 pt-1.5 pb-4.5 shadow-[0_18px_30px_rgba(28,20,12,.12)]"
				>
					{children}
				</div>
			)}
		</>
	);
}
