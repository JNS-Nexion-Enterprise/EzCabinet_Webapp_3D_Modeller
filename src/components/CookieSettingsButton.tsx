"use client";

import { OPEN_CONSENT_EVENT } from "@/lib/consentEvents";

/**
 * Reopens the analytics consent banner, so a visitor can change their mind
 * without clearing site data (PDPA s.38: consent can be withdrawn). The
 * banner itself (`Analytics.tsx`) listens; this only asks.
 */
export function CookieSettingsButton({
	label,
	className,
}: {
	label: string;
	className?: string;
}) {
	return (
		<button
			type="button"
			className={className}
			onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
		>
			{label}
		</button>
	);
}
