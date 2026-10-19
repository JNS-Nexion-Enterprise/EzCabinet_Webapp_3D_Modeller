import { Karla } from "next/font/google";
import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { Suspense } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import HeroBuild from "@/components/landing/HeroBuild";
import LandingMenu from "@/components/landing/LandingMenu";
import RevealOnEnter from "@/components/scroll/RevealOnEnter";
import { prisma } from "@/lib/catalogue/db";
import {
	finishSlot,
	HERO_SLOT,
	HOW_SLOT,
	roomSlot,
	siteImageSrc,
} from "@/lib/catalogue/siteImages";
import { getPublishedPlannerCatalogue } from "@/lib/catalogue/store";
import { getDictionary } from "@/lib/copy/dictionary";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";
import { BUNDLED_FINISH_TEXTURES } from "@/lib/finishPhotos";
import type { RoomTypeId } from "@/lib/planner/catalogue";
import { SWATCH_ZOOM } from "@/lib/planner/finishTextures";
import { BUILD_QUERY } from "@/lib/scroll/beats";

/**
 * The page's body face. Latin only: Han falls through to the system CJK fonts
 * named after it in `FONT_STACK`, as it does everywhere else in the app.
 */
const karla = Karla({
	variable: "--font-karla",
	weight: ["400", "500", "600", "700"],
	subsets: ["latin"],
	display: "swap",
});
const FONT_STACK = `var(--font-karla), "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

/**
 * Design tokens for this page, stated once, from the "EzCabinet Webpage
 * Design" Landing file: warm paper, walnut ink, and the brand green as the one
 * accent — buttons, step numbers, links and the build's progress bar, nothing
 * else. Set as custom properties so the classes below can reach them.
 */
const TOKENS = {
	"--paper": "#fbf8f4",
	"--ink": "#221a13",
	"--body": "#4a3a2a",
	"--muted": "#5c4d3c",
	"--soft": "#6b5a45",
	"--rule": "#e6dccc",
	"--eyebrow": "#7a5a3a",
	"--accent": "#1f5138",
	"--accent-hover": "#17402c",
	"--accent-active": "#123322",
	"--stage": "#e6e3de",
	"--walnut": "#2c2015",
	"--oat": "#f2ece1",
	"--night": "#1c140c",
} as React.CSSProperties;

/** A 1×1 gif: what a desktop that runs the build loads in place of the hero photo. */
const BLANK =
	"data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const rm = (amount: number) =>
	amount.toLocaleString("en-MY", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});

/**
 * The tone a room row carries before anyone uploads a photo of it. Kept
 * inside the page's own warm band so four unphotographed rows still read as
 * one set rather than four placeholders.
 */
const ROOM_TONE: Record<RoomTypeId, string> = {
	kitchen: "#d9cdb9",
	living: "#cfc8bb",
	bedroom: "#ddd2c3",
	foyer: "#cbc4b8",
};

const howItWorks = (t: Dictionary) => [
	{ title: t.landing.how.step1Title, detail: t.landing.how.step1Detail },
	{ title: t.landing.how.step2Title, detail: t.landing.how.step2Detail },
	{ title: t.landing.how.step3Title, detail: t.landing.how.step3Detail },
];

const faqs = (t: Dictionary) => [
	{ q: t.landing.faq.q1, a: t.landing.faq.a1 },
	{ q: t.landing.faq.q2, a: t.landing.faq.a2 },
	{ q: t.landing.faq.q3, a: t.landing.faq.a3 },
	{ q: t.landing.faq.q4, a: t.landing.faq.a4 },
	{ q: t.landing.faq.q5, a: t.landing.faq.a5 },
];

/**
 * A homepage photo, or what stands in until someone drops one on
 * `/admin/site-content`. Every slot is optional, so the page has to look
 * deliberate with no photography at all.
 */
function Photo({
	url,
	alt,
	className = "",
	fallbackStyle,
}: {
	url: string | null;
	alt: string;
	className?: string;
	fallbackStyle?: React.CSSProperties;
}) {
	if (!url)
		return <div className={className} style={fallbackStyle} aria-hidden />;
	// Plain <img>: the photos live on a Blob host next/image isn't configured
	// for, and adding a remote pattern for a bucket whose domain varies per
	// deploy is more moving parts than the optimisation is worth here.
	// biome-ignore lint/performance/noImgElement: see above
	return <img src={url} alt={alt} className={`object-cover ${className}`} />;
}

const eyebrow =
	"mb-3 font-bold text-(--eyebrow) text-[12px] uppercase tracking-[0.14em]";
/** One list item's place in its section's staggered arrival (`globals.css`). */
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;
const primary =
	"inline-flex min-h-12 items-center whitespace-nowrap rounded-[9px] bg-(--accent) px-7 font-semibold text-[14px] text-white transition-[background-color,transform] duration-300 ease-spring hover:bg-(--accent-hover) active:translate-y-px active:bg-(--accent-active)";
const navLink =
	"inline-flex min-h-9 items-center rounded-lg px-2.5 text-(--body) text-[13px] transition-colors hover:bg-(--oat) hover:text-(--ink)";
const footerLink =
	"text-[#d9cdb9] text-[13px] transition-colors hover:text-white";

export default async function Home({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();

	// Read the live catalogue so the board tiles, the room rows and the price
	// can't drift from what the planner actually offers after a publish.
	const [{ data: catalogue }, siteImages, t] = await Promise.all([
		getPublishedPlannerCatalogue(),
		prisma.siteImage.findMany(),
		getDictionary(lang),
	]);
	const photo = new Map(
		siteImages.map((i) => [i.key, siteImageSrc(i.key, i.updatedAt)]),
	);

	// The cheapest cabinet a customer can place: the one figure true for every
	// visitor whatever they go on to build. The design's "full kitchens from"
	// would be a number nobody has priced. Infinity when nothing is live.
	const fromRm = Math.min(
		...catalogue.families.flatMap((family) =>
			family.sizes.map((size) => size.priceRm),
		),
	);
	const price = Number.isFinite(fromRm) ? (
		<>
			{t.landing.hero.fromLabel}{" "}
			<strong className="text-(--ink)">RM {rm(fromRm)}</strong>
		</>
	) : null;

	// The supplier's board scan if there is one, otherwise the flat catalogue
	// colour. Never a generated grain: these tiles are a promise about what the
	// client will cut, and a finish nobody has photographed is a colour.
	const boardStyle = (finish: { id: string; hex: string }) => {
		const board =
			photo.get(finishSlot(finish.id)) ?? BUNDLED_FINISH_TEXTURES[finish.id];
		return {
			backgroundColor: finish.hex,
			// Zoomed to one door's width of board, the scale the planner draws
			// it at, so the page and the cabinet look like the same material.
			...(board && {
				backgroundImage: `url(${board})`,
				backgroundSize: SWATCH_ZOOM,
			}),
		};
	};

	const sections: [string, string][] = [
		[t.landing.nav.material, "#materials"],
		[t.landing.nav.howItWorks, "#how"],
		[t.landing.nav.gallery, "#gallery"],
		[t.landing.nav.finishes, "#finishes"],
		[t.landing.nav.faq, "#faq"],
	];
	const captions = [
		t.landing.build.step1,
		t.landing.build.step2,
		t.landing.build.step3,
		t.landing.build.step4,
	];
	const heroPhoto = photo.get(HERO_SLOT) ?? null;

	return (
		<div
			data-landing
			className={`${karla.variable} flex min-h-screen flex-col bg-(--paper) text-(--ink) antialiased`}
			style={{ ...TOKENS, fontFamily: FONT_STACK }}
		>
			{/* Nav */}
			<header className="sticky top-0 z-20 border-(--rule) border-b bg-[rgba(251,248,244,.88)] backdrop-blur-[8px]">
				<div className="mx-auto flex h-[68px] max-w-[1220px] items-center justify-between gap-5 px-4 sm:px-8">
					<span className="shrink-0 font-serif text-[18px] tracking-[-0.01em]">
						{t.common.brand}
					</span>
					<nav className="hidden items-center gap-1.5 lg:flex">
						{sections.map(([label, href]) => (
							<a key={href} href={href} className={navLink}>
								{label}
							</a>
						))}
						<Link href={`/${lang}/tutorials`} className={navLink}>
							{t.landing.nav.tutorials}
						</Link>
					</nav>
					<div className="flex shrink-0 items-center gap-2 sm:gap-4">
						<div className="hidden lg:block">
							<Suspense fallback={null}>
								<LanguageSwitcher
									current={lang}
									label={t.common.language}
									inline
								/>
							</Suspense>
						</div>
						{/* Below sm the row cannot fit it beside the CTA (Malay overflows
						    360px), so the disclosure carries a My orders link instead. */}
						<div className="hidden sm:block">
							<AccountMenu
								lang={lang}
								labels={{
									signIn: t.account.signIn,
									signOut: t.account.signOut,
									myOrders: t.account.myOrders,
									admin: t.account.admin,
									menu: t.account.menuLabel,
								}}
							/>
						</div>
						<Link
							href={`/${lang}/planner`}
							className="inline-flex min-h-11 items-center whitespace-nowrap rounded-[9px] bg-(--accent) px-3.5 font-semibold text-[13px] sm:px-4.5 lg:min-h-9 text-white transition-[background-color,transform] duration-300 ease-spring hover:bg-(--accent-hover) active:translate-y-px active:bg-(--accent-active)"
						>
							{t.landing.nav.startPlanning}
						</Link>
						<div className="flex lg:hidden">
							<LandingMenu
								openLabel={t.landing.nav.menu}
								closeLabel={t.common.close}
							>
								{sections.map(([label, href]) => (
									<a
										key={href}
										href={href}
										className="flex min-h-12 items-center border-[#eee6d9] border-b text-(--ink) text-[15px] active:bg-(--oat)"
									>
										{label}
									</a>
								))}
								<Link
									href={`/${lang}/tutorials`}
									className="flex min-h-12 items-center border-[#eee6d9] border-b text-(--ink) text-[15px] active:bg-(--oat)"
								>
									{t.landing.nav.tutorials}
								</Link>
								{/* Below sm the account menu is not in the bar, so My orders
								    is here instead; signed out, it bounces through sign-in. */}
								<Link
									href={`/${lang}/orders`}
									className="flex min-h-12 items-center border-[#eee6d9] border-b text-(--ink) text-[15px] active:bg-(--oat) sm:hidden"
								>
									{t.account.myOrders}
								</Link>
								<div className="pt-3">
									<Suspense fallback={null}>
										<LanguageSwitcher
											current={lang}
											label={t.common.language}
											inline
										/>
									</Suspense>
								</div>
							</LandingMenu>
						</div>
					</div>
				</div>
			</header>

			{/* Hero A — the scroll build, wherever motion is allowed. An empty
			    room fills with a kitchen over five viewports of scroll, with a
			    caption per stage and an example kitchen's total counting up. The
			    intro copy is server-rendered and readable before three arrives;
			    every other overlay starts hidden and only `HeroBuild` shows it.
			    If WebGL fails, the island swaps this for the photo hero (see
			    `[data-build-failed]` in `globals.css`). It starts under the
			    translucent header, as the design's does, which is what the
			    overlays' top padding is for. Under 760px the copy and captions
			    move to the top and the total to the bottom, so the room shows
			    between them. */}
			<div
				data-build-track
				className="relative -mt-[68px] hidden h-[500vh] bg-(--stage) motion-safe:block"
			>
				<div className="sticky top-0 h-svh min-h-[480px] overflow-hidden bg-(--stage)">
					<HeroBuild labelFont={karla.style.fontFamily} />
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 hidden bg-[linear-gradient(90deg,rgba(234,230,224,.94)_0%,rgba(234,230,224,.72)_26%,rgba(234,230,224,0)_50%)] min-[760px]:block"
					/>
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(234,230,224,.96)_0%,rgba(234,230,224,.8)_34%,rgba(234,230,224,0)_56%)] min-[760px]:hidden"
					/>

					<div
						data-ov="intro"
						className="pointer-events-none absolute inset-0 flex items-start min-[760px]:items-center"
					>
						<div className="mx-auto w-full max-w-[1220px] px-5 pt-24 min-[760px]:px-8 min-[760px]:pt-[68px]">
							<div className="pointer-events-auto max-w-[520px]">
								<p className={eyebrow}>{t.landing.hero.tagline}</p>
								<h1 className="mb-5 text-balance font-serif text-[clamp(34px,9vw,52px)] leading-[1.08]">
									{t.landing.hero.title}
								</h1>
								<p className="mb-7 max-w-[440px] text-(--body) text-[16px] leading-[26px]">
									{t.landing.hero.subtitle}
								</p>
								<div className="flex flex-wrap items-center gap-5">
									<Link href={`/${lang}/planner`} className={primary}>
										{t.landing.hero.cta}
									</Link>
									{price && (
										<span className="text-(--body) text-[13px]">{price}</span>
									)}
								</div>
							</div>
						</div>
					</div>

					<div className="pointer-events-none absolute inset-x-0 top-[88px] min-[760px]:top-auto min-[760px]:bottom-16">
						<div className="mx-auto max-w-[1220px] px-5 min-[760px]:px-8">
							<div className="relative h-24">
								{captions.map((caption, i) => (
									<div
										key={caption}
										data-ov={`s${i + 1}`}
										className="invisible absolute bottom-0 left-0 flex flex-col gap-2 opacity-0"
									>
										<span className="font-bold text-(--eyebrow) text-[12px] tracking-[0.14em]">
											{String(i + 1).padStart(2, "0")} /{" "}
											{String(captions.length).padStart(2, "0")}
										</span>
										<span className="font-serif text-[clamp(22px,6vw,30px)] leading-[1.15]">
											{caption}
										</span>
									</div>
								))}
							</div>
						</div>
					</div>

					<div
						data-ov="final"
						className="pointer-events-none invisible absolute inset-0 flex items-start opacity-0 min-[760px]:items-center"
					>
						<div className="mx-auto w-full max-w-[1220px] px-5 pt-24 min-[760px]:px-8 min-[760px]:pt-[68px]">
							<div className="pointer-events-auto max-w-[440px]">
								<h2 className="mb-4 text-balance font-serif text-[clamp(30px,8vw,44px)] leading-[1.1]">
									{t.landing.build.finalTitle}
								</h2>
								<p className="mb-7 text-(--body) text-[16px] leading-[26px]">
									{t.landing.build.finalSubtitle}
								</p>
								<div className="flex flex-wrap items-center gap-3">
									<Link href={`/${lang}/planner`} className={primary}>
										{t.landing.hero.cta}
									</Link>
									{/* Ghost, not a second solid button: the choice we want
									    is the planner. */}
									<a
										href="#how"
										className="inline-flex min-h-12 items-center whitespace-nowrap rounded-[9px] border border-[#cdbfa8] bg-[rgba(251,248,244,.7)] px-5 font-semibold text-[14px] transition-[background-color,border-color,transform] duration-300 ease-spring hover:border-[#a8977f] hover:bg-(--paper) active:translate-y-px active:bg-(--oat)"
									>
										{t.landing.hero.howItWorks}
									</a>
								</div>
								{price && (
									<p className="mt-5 text-(--body) text-[13px]">{price}</p>
								)}
							</div>
						</div>
					</div>

					{/* An example kitchen's total, counting up as each part lands.
					    The scene is not built from catalogue cabinets, so the figures
					    are illustrative, and the card says so. */}
					<div className="pointer-events-none absolute inset-x-0 bottom-5 min-[760px]:top-[92px] min-[760px]:bottom-auto">
						<div className="mx-auto flex max-w-[1220px] justify-center px-5 min-[760px]:justify-end min-[760px]:px-8">
							<div
								data-ov="price"
								className="invisible flex min-w-[190px] flex-col gap-1 rounded-xl border border-(--rule) bg-[rgba(251,248,244,.92)] px-5 py-3.5 opacity-0 backdrop-blur-[6px]"
							>
								<span className="font-bold text-(--eyebrow) text-[11px] uppercase tracking-[0.14em]">
									{t.landing.build.totalLabel}
								</span>
								<span
									data-price
									className="whitespace-nowrap font-serif text-[30px] tabular-nums leading-[1.1]"
								>
									RM 0
								</span>
								<span className="text-(--soft) text-[11px]">
									{t.landing.build.totalNote}
								</span>
							</div>
						</div>
					</div>

					<div
						data-ov="hint"
						aria-hidden
						className="pointer-events-none absolute right-0 bottom-[22px] left-0 flex flex-col items-center gap-2"
					>
						<span className="font-bold text-(--muted) text-[12px] uppercase tracking-[0.12em]">
							{t.landing.build.hint}
						</span>
						<span className="size-[9px] rotate-45 border-(--muted) border-r-[1.5px] border-b-[1.5px]" />
					</div>

					<div
						aria-hidden
						className="absolute right-0 bottom-0 left-0 h-[3px] bg-[rgba(34,26,19,.08)]"
					>
						<div
							data-ov="bar"
							className="h-full w-full origin-left scale-x-0 bg-(--accent)"
						/>
					</div>
				</div>
			</div>

			{/* Hero B — the photo, wherever the build does not run: reduced
			    motion, and a device whose WebGL fails. The admin's hero photo when
			    there is one, walnut when there is not; the copy reads on either.
			    The `<source>` hands a browser that runs the build a 1×1 instead,
			    so it never downloads a photo it will not show. */}
			<section
				data-photo-hero
				className="relative flex min-h-[92svh] items-center overflow-hidden bg-(--walnut) motion-safe:hidden"
			>
				{heroPhoto && (
					<picture>
						<source media={BUILD_QUERY} srcSet={BLANK} />
						<img
							src={heroPhoto}
							alt={t.landing.hero.alt}
							fetchPriority="high"
							className="absolute inset-0 h-full w-full object-cover"
						/>
					</picture>
				)}
				<div
					aria-hidden
					className="absolute inset-0 bg-[linear-gradient(100deg,rgba(23,16,10,.72)_0%,rgba(23,16,10,.42)_45%,rgba(23,16,10,.12)_75%)]"
				/>
				<div className="relative mx-auto w-full max-w-[1220px] px-4 py-20 sm:px-8">
					<div className="max-w-[560px]">
						<p className="mb-4 font-bold text-[#e6cfa8] text-[12px] uppercase tracking-[0.14em]">
							{t.landing.hero.tagline}
						</p>
						<h1 className="mb-5 text-balance font-serif text-[clamp(36px,9vw,52px)] text-white leading-[1.08]">
							{t.landing.hero.title}
						</h1>
						<p className="mb-8 max-w-[440px] text-[#e8e0d4] text-[16px] leading-[26px]">
							{t.landing.hero.subtitle}
						</p>
						<div className="flex flex-wrap items-center gap-5">
							<Link href={`/${lang}/planner`} className={primary}>
								{t.landing.hero.cta}
							</Link>
							{Number.isFinite(fromRm) && (
								<span className="text-[#e8e0d4] text-[13px]">
									{t.landing.hero.fromLabel}{" "}
									<strong className="text-white">RM {rm(fromRm)}</strong>
								</span>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* Materials — the walnut band. The live catalogue's own boards, at the
			    scale a door shows them, not stock close-ups of timber the client
			    may not cut. */}
			{catalogue.finishes.length > 0 && (
				<section
					id="materials"
					data-reveal="stagger"
					className="bg-(--walnut) px-4 pt-[88px] pb-14 sm:px-8"
				>
					<div className="mx-auto max-w-[1220px]">
						<div className="mx-auto mb-12 max-w-[640px] text-center">
							<p className="mb-3 font-bold text-[#c99f6b] text-[12px] uppercase tracking-[0.14em]">
								{t.landing.materials.eyebrow}
							</p>
							<h2 className="text-balance font-serif text-(--paper) text-[32px]">
								{t.landing.materials.heading}
							</h2>
						</div>
						<div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1">
							{catalogue.finishes.slice(0, 4).map((finish, i) => (
								<div key={finish.id} data-stagger style={stagger(i)}>
									<div
										className="h-[200px] bg-center"
										style={boardStyle(finish)}
										aria-hidden
									/>
									<p className="mt-2.5 text-[#c9bda8] text-[13px]">
										{finish.label}
									</p>
								</div>
							))}
						</div>
					</div>
				</section>
			)}

			{/* How it works — a sticky photo beside the steps on wide screens, above them on phones. */}
			<section id="how" data-reveal="stagger" className="px-4 py-24 sm:px-8">
				<div className="mx-auto grid max-w-[1220px] grid-cols-1 items-start gap-10 lg:gap-16 lg:grid-cols-[minmax(260px,360px)_1fr]">
					<div className="flex flex-col gap-4 lg:sticky lg:top-24">
						<Photo
							url={photo.get(HOW_SLOT) ?? null}
							alt=""
							className="h-[clamp(260px,60vw,560px)] w-full rounded-[14px]"
							fallbackStyle={{ backgroundColor: "#e2d7c5" }}
						/>
						<p className="max-w-[320px] text-(--soft) text-[13px] leading-5">
							{t.landing.how.railCaption}
						</p>
					</div>
					<div className="flex flex-col">
						<h2 className="sr-only">{t.landing.how.heading}</h2>
						{howItWorks(t).map((step, i, all) => (
							<div
								key={step.title}
								data-stagger
								style={stagger(i)}
								className={`border-(--rule) py-14 ${i === 0 ? "pt-8" : ""} ${i < all.length - 1 ? "border-b" : "pb-8"}`}
							>
								<div className="mb-5 flex size-10 items-center justify-center rounded-full bg-(--accent) font-serif text-[16px] text-white">
									{i + 1}
								</div>
								<h3 className="mb-2.5 font-serif text-[22px]">{step.title}</h3>
								<p className="max-w-[460px] text-(--muted) text-[15px] leading-6">
									{step.detail}
								</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Gallery — one editorial row per room, the photo alternating sides. */}
			<section
				id="gallery"
				data-reveal="stagger"
				className="border-(--rule) border-t bg-white px-4 pt-20 pb-16 sm:px-8"
			>
				<div className="mx-auto mb-14 max-w-[900px] text-center">
					<p className={eyebrow}>{t.landing.gallery.eyebrow}</p>
					<h2 className="text-balance font-serif text-[32px]">
						{t.landing.gallery.heading}
					</h2>
				</div>
				<div className="mx-auto flex max-w-[1220px] flex-col gap-14">
					{catalogue.roomTypes.map((room, i) => (
						<div
							key={room.id}
							data-stagger
							style={stagger(i)}
							className="grid grid-cols-1 items-center md:grid-cols-2"
						>
							<Photo
								url={photo.get(roomSlot(room.id)) ?? null}
								alt={fill(t.landing.gallery.roomAlt, { room: room.label })}
								className={`h-[240px] w-full md:h-[360px] ${i % 2 ? "md:order-2" : ""}`}
								fallbackStyle={{ backgroundColor: ROOM_TONE[room.id] }}
							/>
							<div className="pt-6 md:p-10">
								<h3 className="mb-2.5 font-serif text-[24px]">{room.label}</h3>
								<p className="mb-5 max-w-[360px] text-(--muted) text-[14px] leading-[22px]">
									{t.landing.gallery.roomDetail[room.id]}
								</p>
								{room.familyIds.length === 0 ? (
									<span className="font-semibold text-(--soft) text-[13px]">
										{t.common.comingSoon}
									</span>
								) : (
									<Link
										href={`/${lang}/planner?room=${room.id}`}
										className="inline-flex min-h-9 items-center font-semibold text-(--accent) text-[13px] underline decoration-1 underline-offset-4 transition-colors hover:text-(--accent-hover)"
									>
										{t.landing.gallery.planLink[room.id]}
									</Link>
								)}
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Finishes — every finish in the live catalogue, as the swatch the
			    planner offers. */}
			<section
				id="finishes"
				data-reveal="stagger"
				className="border-(--rule) border-y bg-(--oat) px-4 py-[88px] sm:px-8"
			>
				<div className="mx-auto max-w-[1220px]">
					<div className="mx-auto mb-12 max-w-[640px] text-center">
						<p className={eyebrow}>{t.landing.finishes.eyebrow}</p>
						<h2 className="text-balance font-serif text-[32px]">
							{t.landing.finishes.heading}
						</h2>
					</div>
					<div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-6">
						{catalogue.finishes.map((finish, i) => (
							<div
								key={finish.id}
								data-stagger
								style={stagger(i)}
								className="text-center"
							>
								<div
									className="mb-2.5 h-[88px] rounded-[10px] border border-(--rule) bg-center"
									style={boardStyle(finish)}
									aria-hidden
								/>
								<p className="text-(--muted) text-[13px]">{finish.label}</p>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* FAQ */}
			<section
				id="faq"
				data-reveal="stagger"
				className="mx-auto w-full max-w-[760px] px-4 py-[88px] sm:px-8"
			>
				<h2 className="mb-10 text-center font-serif text-[32px]">
					{t.landing.faq.heading}
				</h2>
				<div className="flex flex-col gap-3">
					{faqs(t).map((item, i) => (
						<details
							key={item.q}
							data-stagger
							style={stagger(i)}
							className="group rounded-[10px] border border-(--rule) bg-white px-5 py-[18px] transition-colors hover:border-[#cdbfa8] [&_summary::-webkit-details-marker]:hidden [&_summary]:list-none"
						>
							<summary className="flex min-h-6 cursor-pointer items-center justify-between gap-4 font-semibold text-[14px]">
								{item.q}
								{/* CSS chevron: a rotated corner of a box. */}
								<span
									aria-hidden
									className="mt-[-3px] size-2 shrink-0 rotate-45 border-(--accent) border-r-2 border-b-2 transition-transform duration-200 group-open:mt-[3px] group-open:-rotate-135"
								/>
							</summary>
							<p className="mt-2.5 text-(--muted) text-[13px] leading-5">
								{item.a}
							</p>
						</details>
					))}
				</div>
			</section>

			{/* Footer */}
			<footer className="mt-auto bg-(--night) text-(--rule)">
				<div className="mx-auto grid max-w-[1220px] grid-cols-1 gap-8 px-4 py-14 sm:grid-cols-3 sm:px-8">
					<div>
						<p className="mb-2 font-serif text-[17px] text-white">
							{t.common.brand}
						</p>
						<p className="max-w-[280px] text-[#a8977f] text-[13px] leading-5">
							{t.landing.footer.tagline}
						</p>
					</div>
					<div>
						<p className="mb-3 font-bold text-[#a8977f] text-[12px] uppercase tracking-[0.08em]">
							{t.landing.footer.productHeading}
						</p>
						<div className="flex flex-col gap-2">
							<Link href={`/${lang}/planner`} className={footerLink}>
								{t.landing.footer.startPlanning}
							</Link>
							<a href="#gallery" className={footerLink}>
								{t.landing.footer.gallery}
							</a>
							<a href="#faq" className={footerLink}>
								{t.landing.footer.faq}
							</a>
							<Link href={`/${lang}/tutorials`} className={footerLink}>
								{t.landing.footer.tutorials}
							</Link>
						</div>
					</div>
					<div>
						<p className="mb-3 font-bold text-[#a8977f] text-[12px] uppercase tracking-[0.08em]">
							{t.landing.footer.contactHeading}
						</p>
						<div className="flex flex-col gap-2">
							<a
								href={`mailto:${t.landing.footer.email}`}
								className={footerLink}
							>
								{t.landing.footer.email}
							</a>
							<Link href={`/${lang}/privacy`} className={footerLink}>
								{t.landing.footer.privacy}
							</Link>
							<Link href={`/${lang}/terms`} className={footerLink}>
								{t.landing.footer.terms}
							</Link>
							<Link href={`/${lang}/refunds`} className={footerLink}>
								{t.landing.footer.refunds}
							</Link>
						</div>
					</div>
				</div>
				<div className="border-[#322418] border-t px-4 py-[18px] text-center sm:px-8">
					<p className="text-[#a8977f] text-[12px]">
						{fill(t.landing.footer.copyright, { brand: t.common.brand })}
					</p>
				</div>
			</footer>
			<RevealOnEnter />
		</div>
	);
}
