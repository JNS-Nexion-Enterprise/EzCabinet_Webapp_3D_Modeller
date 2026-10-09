import type { Locale } from "@/lib/copy/locales";

/**
 * The wording of every customer email, in the three languages the site serves.
 *
 * Not in `lib/copy`: that dictionary is handed whole to the planner's client
 * tree, and nothing in a browser needs the text of a mail.
 */
export const BRAND = "EzCabinet";

const en = {
	shared: {
		linkFallback:
			"If the button doesn't work, paste this link into your browser:",
		questions: "Questions? Reply to this email or call {phone}.",
		serviceOrder:
			"This is a service email about your order, so it can't be unsubscribed from.",
		serviceAccount:
			"This is a service email about your account, so it can't be unsubscribed from.",
	},
};

type Leaves<T> = {
	readonly [K in keyof T]: T[K] extends string ? string : Leaves<T[K]>;
};
export type EmailCopy = Leaves<typeof en>;

const ms: EmailCopy = {
	shared: {
		linkFallback:
			"Jika butang tidak berfungsi, tampal pautan ini ke dalam pelayar anda:",
		questions: "Ada soalan? Balas e-mel ini atau hubungi {phone}.",
		serviceOrder:
			"Ini ialah e-mel perkhidmatan tentang pesanan anda, jadi ia tidak boleh dihentikan langganannya.",
		serviceAccount:
			"Ini ialah e-mel perkhidmatan tentang akaun anda, jadi ia tidak boleh dihentikan langganannya.",
	},
};

const zh: EmailCopy = {
	shared: {
		linkFallback: "如果按钮无法使用，请将此链接粘贴到浏览器：",
		questions: "有疑问？请回复此邮件或致电 {phone}。",
		serviceOrder: "这是与您订单相关的服务邮件，因此无法退订。",
		serviceAccount: "这是与您账户相关的服务邮件，因此无法退订。",
	},
};

export const EMAIL_COPY: Record<Locale, EmailCopy> = { en, ms, zh };
