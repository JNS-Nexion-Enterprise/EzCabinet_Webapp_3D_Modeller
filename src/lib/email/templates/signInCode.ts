import { fill } from "@/lib/copy/fill";
import type { Locale } from "@/lib/copy/locales";
import { EMAIL_COPY } from "../copy";
import { renderEmail } from "../layout";

/**
 * A code and no link: a link opens in the mail app's own browser, where
 * passkeys do not work.
 */
export function signInCode(input: {
	locale: Locale;
	code: string;
	minutes: number;
}) {
	const t = EMAIL_COPY[input.locale].signInCode;
	const subject = fill(t.subject, { code: input.code });
	return {
		subject,
		...renderEmail({
			locale: input.locale,
			about: "account",
			preheader: subject,
			heading: t.heading,
			blocks: [
				{ type: "paragraph", text: t.body },
				{ type: "code", code: input.code },
				{ type: "paragraph", text: fill(t.after, { minutes: input.minutes }) },
			],
			footnote: t.footnote,
		}),
	};
}
