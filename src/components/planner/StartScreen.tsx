import { Suspense } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { fill } from "@/lib/copy/fill";
import type { RoomTypeId } from "@/lib/planner/catalogue";
import { useCatalogue } from "./CatalogueContext";
import { useCopy, useLocale } from "./CopyContext";
import { PhoneHeader, phoneBar, phonePrimary } from "./PhoneChrome";
import { PlannerHeader } from "./PlannerHeader";

const ROOM_ICON_PATHS: Record<RoomTypeId, React.ReactNode> = {
	kitchen: (
		<>
			<rect
				x={4}
				y={20}
				width={30}
				height={28}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={4}
				y={4}
				width={30}
				height={12}
				fill="currentColor"
				fillOpacity={0.25}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={40}
				y={10}
				width={56}
				height={38}
				fill="currentColor"
				fillOpacity={0.1}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	living: (
		<>
			<rect
				x={4}
				y={24}
				width={46}
				height={24}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={56}
				y={6}
				width={40}
				height={42}
				fill="currentColor"
				fillOpacity={0.1}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	bedroom: (
		<>
			<rect
				x={18}
				y={4}
				width={24}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={46}
				y={4}
				width={20}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={70}
				y={4}
				width={20}
				height={44}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
	foyer: (
		<>
			<rect
				x={10}
				y={4}
				width={26}
				height={34}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
			<rect
				x={42}
				y={26}
				width={34}
				height={12}
				fill="currentColor"
				fillOpacity={0.15}
				stroke="currentColor"
				strokeWidth={1}
			/>
		</>
	),
};

/**
 * Pick a room, then plan it on its empty wall.
 *
 * A room no design is filed under yet is shown but cannot be picked: listing
 * only the rooms that are ready would hide that the others are coming, and
 * letting one open would drop the customer on a wall with nothing to add.
 *
 * Server-rendered, so the phone layout (under 760px) is CSS only: both headers
 * are in the markup and the viewport picks one, with no flash of the desktop
 * layout on a phone.
 */
export function StartScreen({
	roomId,
	onPickRoom,
	onStart,
}: {
	roomId: RoomTypeId;
	onPickRoom: (id: RoomTypeId) => void;
	onStart: () => void;
}) {
	const t = useCopy();
	const locale = useLocale();
	const catalogue = useCatalogue();
	const plannable = (id: RoomTypeId) =>
		(catalogue.roomTypes.find((r) => r.id === id)?.familyIds.length ?? 0) > 0;
	const ROOM_SUBTITLE: Record<RoomTypeId, string> = {
		kitchen: t.planner.start.roomSubtitle.kitchen,
		living: t.planner.start.roomSubtitle.living,
		bedroom: t.planner.start.roomSubtitle.bedroom,
		foyer: t.planner.start.roomSubtitle.foyer,
	};

	return (
		<main className="flex h-[calc(100dvh-2.25rem)] flex-col bg-[#e9e7e3] text-neutral-900 max-[760px]:h-auto max-[760px]:min-h-dvh max-[760px]:bg-white">
			<PhoneHeader
				className="min-[760px]:hidden"
				back={{ label: t.planner.phone.backHome, href: `/${locale}` }}
				title={t.planner.crumbs.roomPlanner}
			/>
			<div className="contents max-[760px]:hidden">
				<PlannerHeader
					trail={[
						{ label: t.common.brand, href: `/${locale}` },
						{ label: t.planner.crumbs.roomPlanner },
					]}
				>
					<span className="hidden text-[13px] sm:inline text-neutral-500">
						{t.landing.hero.eyebrow}
					</span>
				</PlannerHeader>
			</div>

			<div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-10 max-[760px]:items-stretch max-[760px]:justify-start max-[760px]:gap-7 max-[760px]:overflow-visible max-[760px]:px-5 max-[760px]:pt-6 max-[760px]:pb-32">
				<div className="max-w-lg text-center max-[760px]:text-left">
					<h1 className="mb-2 font-semibold text-2xl max-[760px]:text-[26px] max-[760px]:leading-8 max-[760px]:tracking-[-0.01em]">
						{t.planner.start.heading}
					</h1>
					<p className="text-neutral-500 text-sm leading-5 max-[760px]:text-[15px] max-[760px]:leading-[22px] max-[760px]:text-[#5c5c5c]">
						{t.planner.start.subtitle}
					</p>
				</div>

				<div className="grid w-full max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4 max-[760px]:grid-cols-2 max-[760px]:gap-3">
					{catalogue.roomTypes.map((option) => {
						const active = option.id === roomId;
						const ready = option.familyIds.length > 0;
						return (
							<button
								key={option.id}
								type="button"
								disabled={!ready}
								onClick={() => onPickRoom(option.id)}
								className={`relative rounded-xl border-2 p-4 text-center transition disabled:cursor-not-allowed disabled:opacity-50 max-[760px]:flex max-[760px]:min-h-[136px] max-[760px]:flex-col max-[760px]:gap-[3px] max-[760px]:rounded-[14px] max-[760px]:border max-[760px]:p-3.5 max-[760px]:text-left ${
									active && ready
										? "border-neutral-900 max-[760px]:border-[#e5e5e5] max-[760px]:outline-2 max-[760px]:outline-[#171717] max-[760px]:-outline-offset-1"
										: "border-neutral-200 enabled:hover:border-neutral-400"
								}`}
							>
								<div className="flex h-[72px] items-center justify-center max-[760px]:h-10 max-[760px]:w-20 max-[760px]:justify-start">
									<svg
										viewBox="0 0 100 50"
										className={`h-14 w-full max-[760px]:h-10 max-[760px]:text-[#737373] ${active ? "text-neutral-600" : "text-neutral-400"}`}
										role="img"
										aria-label={fill(t.planner.start.roomIconAlt, {
											room: option.label,
										})}
									>
										<title>
											{fill(t.planner.start.roomIconAlt, {
												room: option.label,
											})}
										</title>
										{ROOM_ICON_PATHS[option.id]}
									</svg>
								</div>
								<p className="mt-2.5 font-semibold text-sm max-[760px]:text-[15px]">
									{option.label}
								</p>
								<p className="mt-0.5 text-neutral-500 text-xs max-[760px]:mt-0 max-[760px]:text-[13px] max-[760px]:leading-[17px] max-[760px]:text-[#666]">
									{ready ? ROOM_SUBTITLE[option.id] : t.common.comingSoon}
								</p>
								{active && ready ? (
									<span
										aria-hidden="true"
										className="absolute top-2.5 right-2.5 flex size-[22px] items-center justify-center rounded-full bg-black min-[760px]:hidden"
									>
										<svg
											viewBox="0 0 12 12"
											className="size-3 fill-none stroke-white stroke-[1.8]"
											aria-hidden="true"
										>
											<path d="M2.5 6.2l2.2 2.2 4.8-4.8" />
										</svg>
									</span>
								) : null}
							</button>
						);
					})}
				</div>

				<div className="min-[760px]:hidden w-full border-[#f0f0f0] border-t pt-2">
					<Suspense fallback={null}>
						<LanguageSwitcher
							current={locale}
							label={t.common.language}
							inline
							tall
						/>
					</Suspense>
				</div>

				<div className={`flex ${phoneBar}`}>
					<button
						type="button"
						onClick={onStart}
						disabled={!plannable(roomId)}
						className={`rounded-lg bg-neutral-900 px-7 py-3 font-medium text-sm text-white transition hover:bg-neutral-800 disabled:opacity-40 ${phonePrimary} max-[760px]:w-full`}
					>
						{t.planner.start.cta}
					</button>
				</div>
			</div>
		</main>
	);
}
