"use client";

import { useState } from "react";

/**
 * The one interactive thing on the page: the order number, copyable.
 *
 * A customer chasing a delivery is about to paste this into WhatsApp, and
 * selecting eleven characters of small monospace on a phone is the kind of
 * friction that ends in a phone call to the office instead.
 */
export function CopyOrderId({
	value,
	label,
	copiedLabel,
}: {
	value: string;
	/** `aria-label` for the button, in the reader's own language. */
	label: string;
	copiedLabel: string;
}) {
	const [copied, setCopied] = useState(false);

	return (
		<button
			type="button"
			aria-label={copied ? copiedLabel : label}
			// The disc stays 30px; the pseudo-element grows what a thumb can hit
			// to 44.
			className="relative flex h-[30px] w-[30px] shrink-0 after:absolute after:-inset-[7px] after:content-[''] items-center justify-center rounded-full bg-[#f4f3f1] text-[11px] text-neutral-700 hover:bg-[#ecebe7]"
			onClick={() => {
				// No catch: a clipboard the browser refuses leaves the icon
				// unchanged, which is the honest signal that nothing was copied.
				navigator.clipboard.writeText(value).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
		>
			{copied ? "✓" : "⧉"}
		</button>
	);
}
