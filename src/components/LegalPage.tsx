import Link from "next/link";

/**
 * The one layout the privacy notice, the terms of sale and the refund policy
 * share: a title, the draft banner, an intro and heading-plus-paragraph
 * sections. The wording is EzCabinet's to approve, so every page that uses
 * this says it is a draft.
 */
export function LegalPage({
	lang,
	back,
	title,
	draft,
	intro,
	sections,
}: {
	lang: string;
	back: string;
	title: string;
	draft: string;
	intro: string;
	sections: readonly (readonly [heading: string, body: string])[];
}) {
	return (
		// Paints its own ground: `body` goes near-black under a dark OS theme
		// (globals.css) and this text is dark, so without it the page is unreadable.
		<div className="flex-1 bg-white">
			<main className="mx-auto flex w-full max-w-[680px] flex-col gap-6 px-6 py-14 text-neutral-900">
				<div>
					<Link
						href={`/${lang}`}
						className="text-[13px] text-neutral-500 underline"
					>
						{back}
					</Link>
					<h1 className="mt-4 font-semibold text-[28px]">{title}</h1>
					<p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
						{draft}
					</p>
					<p className="mt-4 text-[15px] text-neutral-600 leading-6">{intro}</p>
				</div>
				{sections.map(([heading, body]) => (
					<section key={heading}>
						<h2 className="font-semibold text-[16px]">{heading}</h2>
						<p className="mt-1.5 text-[14px] text-neutral-600 leading-6">
							{body}
						</p>
					</section>
				))}
			</main>
		</div>
	);
}
