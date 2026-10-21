"use client";

import Link from "next/link";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import { useCopy } from "./CopyContext";
import { PhoneBar, PhoneHeader, Segmented } from "./PhoneChrome";
import type { PlannerView } from "./PlannerScene";
import { type DoorView, PHONE_TABS, type PhoneTab } from "./studio/phoneStudio";

/** Labels for the view toggle, in the order a fitter reads them. The desktop
 *  View panel reads them too. */
export const views = (t: Dictionary): { id: PlannerView; label: string }[] => [
	{ id: "3d", label: t.planner.view.threeD },
	{ id: "elevation", label: t.planner.view.elevation },
	{ id: "plan", label: t.planner.view.plan },
];

/** White, round, 44 px: the canvas card's three buttons. */
const canvasButton =
	"pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full text-[18px] shadow-[0_1px_3px_rgba(0,0,0,.08)] disabled:opacity-40";
const canvasButtonOff = "bg-white/94 text-neutral-800";

/**
 * The studio below 760px (spec: planner-phone-layout, "Studio"): a scrolling
 * page of header, view toggle, a 300px canvas card, four tabs and a total bar.
 *
 * A layout and nothing else. `StudioScreen` owns every piece of state and
 * builds each body once, so the desktop studio and this one show the same
 * controls and a resize across 760px loses nothing.
 */
export function PhoneStudio({
	roomLabel,
	wallMetres,
	onBackAction,
	view,
	onViewAction,
	scene,
	chip,
	footnote,
	doors,
	measuring,
	onMeasureAction,
	onResetViewAction,
	tab,
	onTabAction,
	body,
	bar,
}: {
	roomLabel: string;
	/** The targeted wall's length, already formatted ("4.20"). */
	wallMetres: string;
	/** To the room picker. */
	onBackAction: () => void;
	view: PlannerView;
	onViewAction: (view: PlannerView) => void;
	/** The one `PlannerScene` element. */
	scene: React.ReactNode;
	/** "{run} of {wall} m · N units". */
	chip: React.ReactNode;
	/** The measure readout, the tap hint, or null. */
	footnote: React.ReactNode;
	doors: { view: DoorView; onCycleAction: () => void; disabled: boolean };
	measuring: boolean;
	onMeasureAction: () => void;
	onResetViewAction: () => void;
	tab: PhoneTab;
	onTabAction: (tab: PhoneTab) => void;
	/** The active tab's body. */
	body: React.ReactNode;
	/** `<PriceFooter variant="bar" />`. */
	bar: React.ReactNode;
}) {
	const t = useCopy();
	const doorsLabel: Record<DoorView, string> = {
		closed: t.planner.room.doorsClosed,
		open: t.planner.room.doorsOpen,
		hidden: t.planner.room.doorsHidden,
	};

	return (
		<main className="min-h-dvh bg-white text-neutral-900">
			<PhoneHeader
				back={{ label: t.planner.phone.backRooms, onClick: onBackAction }}
				title={roomLabel}
				subtitle={fill(t.planner.phone.wallSubtitle, { m: wallMetres })}
				right={
					<Link
						href="/tutorials"
						target="_blank"
						aria-label={t.planner.diyTutorials}
						className="flex size-11 items-center justify-center rounded-full text-neutral-900 hover:bg-[#f5f5f5]"
					>
						{/* The desktop header's hand-drawn play triangle. */}
						<svg
							viewBox="0 0 24 24"
							aria-hidden
							className="size-4 fill-none stroke-current stroke-[1.8]"
						>
							<path d="M6 4l14 8-14 8V4z" />
						</svg>
					</Link>
				}
			/>

			<div className="px-4 pt-3">
				<Segmented
					label={t.planner.panel.viewTitle}
					options={views(t)}
					value={view}
					onPickAction={onViewAction}
				/>
			</div>

			{/* The canvas keeps `touch-action: none`, which is how orbiting
			    works: a swipe that starts here turns the room, one anywhere else
			    scrolls the page. */}
			<div className="relative mx-4 mt-3 h-[300px] overflow-hidden rounded-2xl bg-[#f4f2ee]">
				{scene}

				{/* One row, so the chip wraps before it can run under the
				    buttons. Clicks fall through the gaps to the canvas. */}
				<div className="pointer-events-none absolute inset-x-2.5 top-2.5 z-[6] flex items-start justify-between gap-2">
					<span className="min-w-0 rounded-[9px] bg-white/94 px-2.5 py-[7px] text-[#404040] text-[13px] leading-4 shadow-[0_1px_3px_rgba(0,0,0,.08)]">
						{chip}
					</span>
					<div className="flex shrink-0 flex-col items-end gap-2">
						<div className="flex items-center gap-2">
							<span
								aria-hidden
								className="rounded-md bg-white/94 px-2 py-1 text-[#404040] text-[12px] leading-4 shadow-[0_1px_3px_rgba(0,0,0,.08)]"
							>
								{doorsLabel[doors.view]}
							</span>
							<button
								type="button"
								onClick={doors.onCycleAction}
								disabled={doors.disabled}
								aria-label={fill(t.planner.phone.doorsAria, {
									mode: doorsLabel[doors.view],
								})}
								className={`${canvasButton} ${canvasButtonOff}`}
							>
								◫
							</button>
						</div>
						<button
							type="button"
							onClick={onMeasureAction}
							aria-pressed={measuring}
							aria-label={t.planner.measure.measure}
							title={t.planner.measure.measure}
							className={`${canvasButton} ${
								measuring ? "bg-neutral-900 text-white" : canvasButtonOff
							}`}
						>
							⟺
						</button>
						<button
							type="button"
							onClick={onResetViewAction}
							aria-label={t.planner.panel.resetView}
							title={t.planner.panel.resetView}
							className={`${canvasButton} ${canvasButtonOff}`}
						>
							⤾
						</button>
					</div>
				</div>

				{footnote && (
					<div className="pointer-events-none absolute inset-x-2.5 bottom-3 z-[6] flex justify-center text-center text-[#5c5c5c] text-[13px]">
						{footnote}
					</div>
				)}
			</div>

			<div className="px-4 pt-4">
				<Segmented
					label={t.planner.phone.tabsLabel}
					options={PHONE_TABS.map((id) => ({
						id,
						label: t.planner.phone.tabs[id],
					}))}
					value={tab}
					onPickAction={onTabAction}
				/>
			</div>

			{/* 140px at the foot so the fixed bar never covers the last control. */}
			<div className="px-4 pt-4 pb-[140px]">{body}</div>

			<PhoneBar>{bar}</PhoneBar>
		</main>
	);
}
