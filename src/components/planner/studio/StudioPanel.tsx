"use client";

import { useCopy } from "../CopyContext";
import { chip, listBtn } from "./chrome";
import type { StudioTool } from "./ToolRail";

/** The five tools that open a panel. `select` and `measure` open nothing. */
export type PanelKind = Exclude<StudioTool, "select" | "measure">;

/**
 * The card that floats over the top-left of the canvas.
 *
 * It sits *over* the scene rather than beside it because everything in it is
 * a decision you make and then stop thinking about — what room you are in,
 * what to add, how to look at the run, whether there is a kick board. Keeping
 * five panels' worth of controls permanently on screen is what made the old
 * left rail a column of toggles you had to read past to reach the two you
 * wanted.
 *
 * A card, not a column. It used to be `inset-y-0`, stretched floor to ceiling
 * whatever it held — and none of these panels hold a screenful. Doors is three
 * options and Room is three sliders, so on a 900px laptop two thirds of a
 * full-height column was white space taken from the one thing on this page
 * worth looking at. Height now fits the content and is capped at the canvas,
 * so the scene shows through underneath.
 *
 * Below `lg` it is a bottom sheet instead, over the sidebar rather than the
 * canvas: at 300px on a 360px phone the card hid the room its own controls
 * were resizing, and the cabinet a tap had just added.
 */
export function StudioPanel({
	kind,
	onCloseAction,
	children,
}: {
	kind: PanelKind;
	onCloseAction: () => void;
	children: React.ReactNode;
}) {
	const t = useCopy();
	// Room reuses `planner.room`: the panel header now says what the column
	// heading used to, so a second copy of the same two strings would only be
	// somewhere for them to drift apart.
	const title = {
		room: t.planner.room.heading,
		add: t.planner.panel.addTitle,
		view: t.planner.panel.viewTitle,
		doors: t.planner.panel.doorsTitle,
		defaults: t.planner.panel.defaultsTitle,
	}[kind];
	const hint = {
		room: t.planner.room.subtitle,
		add: t.planner.panel.addHint,
		view: t.planner.panel.viewHint,
		doors: t.planner.panel.doorsHint,
		defaults: t.planner.panel.defaultsHint,
	}[kind];

	return (
		<div className="z-10 flex flex-col overflow-hidden border border-neutral-200 bg-white shadow-[0_8px_28px_rgba(0,0,0,.10)] max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[45dvh] max-lg:rounded-t-xl max-lg:pb-[env(safe-area-inset-bottom)] lg:absolute lg:top-3 lg:left-3 lg:max-h-[calc(100%-1.5rem)] lg:w-[300px] lg:rounded-xl">
			<div className="flex items-start justify-between gap-2.5 border-[#eeece8] border-b px-4 pt-3.5 pb-3">
				<div>
					<p className="font-semibold text-[14px]">{title}</p>
					<p className="mt-0.5 text-[12px] text-neutral-500 leading-[17px]">
						{hint}
					</p>
				</div>
				<button
					type="button"
					onClick={onCloseAction}
					aria-label={t.planner.panel.close}
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-[14px] text-neutral-600 hover:bg-[#f4f3f1] hover:text-neutral-900"
				>
					✕
				</button>
			</div>
			<div className="min-h-0 overflow-y-auto p-4">{children}</div>
		</div>
	);
}

/** One stacked option — label over hint. The View and Doors bodies' unit. */
export function PanelOption({
	label,
	hint,
	pressed,
	onPressAction,
}: {
	label: string;
	hint: string;
	/** Omitted for a plain action — "reset view" is a button, not a state, and
	 * announcing it as an unpressed toggle would be a lie to a screen reader. */
	pressed?: boolean;
	onPressAction: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onPressAction}
			aria-pressed={pressed}
			className={listBtn(pressed ?? false)}
		>
			<span className="font-semibold text-[13px]">{label}</span>
			<span className="text-[11px] text-neutral-500 leading-[15px]">
				{hint}
			</span>
		</button>
	);
}

/** A labelled pair of chips with a note under it — the Defaults body's unit. */
export function PanelToggle<T extends string | number | boolean>({
	label,
	hint,
	value,
	options,
	onPickAction,
}: {
	label: string;
	hint: string;
	value: T;
	options: { value: T; label: string }[];
	onPickAction: (value: T) => void;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<p className="font-medium text-[12px] text-neutral-700">{label}</p>
			<div className="flex flex-wrap gap-1">
				{options.map((option) => (
					<button
						key={String(option.value)}
						type="button"
						onClick={() => onPickAction(option.value)}
						aria-pressed={option.value === value}
						className={chip(option.value === value)}
					>
						{option.label}
					</button>
				))}
			</div>
			<p className="text-[11px] text-[#8a857c] leading-[15px]">{hint}</p>
		</div>
	);
}
