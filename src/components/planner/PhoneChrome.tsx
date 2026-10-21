import Link from "next/link";

/**
 * The phone layout's shared chrome: the sticky header, the fixed bottom bar and
 * the segmented control (spec: planner-phone-layout, "Shared chrome").
 *
 * No hooks, so Start can server-render it and switch layouts with CSS alone.
 */

/**
 * The fixed bottom bar. Every class carries `max-[760px]:` so a caller can put
 * it on an element that also has desktop classes (Start's CTA wrapper, the
 * quote submit) and it only applies on a phone.
 *
 * Its height is `--phone-bar-h` (globals.css) plus the safe area: one 52px
 * row, so its contents must never wrap. RoomPanel's sticky "Next" button
 * reads the same variable to sit above it.
 */
export const phoneBar =
	"max-[760px]:fixed max-[760px]:inset-x-0 max-[760px]:bottom-0 max-[760px]:z-10 max-[760px]:h-[calc(var(--phone-bar-h)+env(safe-area-inset-bottom))] max-[760px]:border-[#ececec] max-[760px]:border-t max-[760px]:bg-white/95 max-[760px]:px-4 max-[760px]:pt-3 max-[760px]:pb-[calc(12px+env(safe-area-inset-bottom))] max-[760px]:backdrop-blur-[8px]";

/**
 * The bar's green 52 px button. Carries no width: callers add
 * `max-[760px]:w-full` (one button) or `max-[760px]:px-[22px]` (beside a total).
 */
export const phonePrimary =
	"max-[760px]:flex max-[760px]:min-h-[52px] max-[760px]:items-center max-[760px]:justify-center max-[760px]:rounded-xl max-[760px]:bg-[#1f5138] max-[760px]:font-semibold max-[760px]:text-[16px] max-[760px]:text-white max-[760px]:hover:bg-[#17402c] max-[760px]:active:bg-[#123322] max-[760px]:disabled:opacity-40";

export function PhoneBar({ children }: { children: React.ReactNode }) {
	return <div className={phoneBar}>{children}</div>;
}

type Back =
	| { label: string; href: string }
	| { label: string; onClick: () => void };

const backPill =
	"inline-flex min-h-11 items-center gap-2 rounded-full border border-[#e0e0e0] bg-white pr-3.5 pl-3 font-medium text-[14px] text-neutral-900 hover:border-[#cfcfcf] hover:bg-[#f5f5f5] active:bg-[#ececec]";

/** A 8 × 8 box with two borders, turned 45° into a left chevron. */
const chevron = (
	<span
		aria-hidden="true"
		className="size-2 rotate-45 border-[#171717] border-b-[1.6px] border-l-[1.6px]"
	/>
);

/** Back pill left, title centred, optional control right. */
export function PhoneHeader({
	back,
	title,
	subtitle,
	right,
	className = "",
}: {
	back: Back;
	title: string;
	subtitle?: string;
	right?: React.ReactNode;
	className?: string;
}) {
	return (
		<header
			className={`sticky top-0 z-10 grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 border-[#ececec] border-b bg-white/95 px-4 backdrop-blur-[8px] ${className}`}
		>
			<div className="flex justify-start">
				{"href" in back ? (
					<Link href={back.href} className={backPill}>
						{chevron}
						{back.label}
					</Link>
				) : (
					<button type="button" onClick={back.onClick} className={backPill}>
						{chevron}
						{back.label}
					</button>
				)}
			</div>
			<div className="text-center">
				<p className="font-semibold text-[16px] leading-5">{title}</p>
				{subtitle ? (
					<p className="text-[#666] text-[12px] leading-4">{subtitle}</p>
				) : null}
			</div>
			<div className="flex justify-end">{right}</div>
		</header>
	);
}

/** View toggle and studio tabs: one white pill on a grey track. */
export function Segmented<T extends string>({
	label,
	options,
	value,
	onPickAction,
}: {
	label: string;
	options: { id: T; label: string }[];
	value: T;
	onPickAction: (id: T) => void;
}) {
	return (
		// biome-ignore lint/a11y/useSemanticElements: a fieldset brings its own border, padding and min-width quirks
		<div
			role="group"
			aria-label={label}
			className="flex gap-0.5 rounded-xl bg-[#f2f2f2] p-1"
		>
			{options.map((o) => {
				const on = o.id === value;
				return (
					<button
						key={o.id}
						type="button"
						aria-pressed={on}
						onClick={() => onPickAction(o.id)}
						className={`min-h-10 flex-1 rounded-[9px] text-[14px] ${
							on
								? "bg-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,.1)]"
								: "font-medium text-[#525252] hover:bg-white/60"
						}`}
					>
						{o.label}
					</button>
				);
			})}
		</div>
	);
}
