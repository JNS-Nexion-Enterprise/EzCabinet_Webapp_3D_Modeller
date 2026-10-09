"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/lib/copy/locales";

/**
 * Inline rather than from the dictionary, for `error.tsx`'s reason: this takes
 * no props, and three dictionaries is the wrong trade for four strings.
 *
 * The body names the likeliest cause. An order or tracking link opened under
 * a different account is deliberately the same 404 as a made-up one,
 * so this is the only place a customer can be told to check the account.
 */
const COPY: Record<
	Locale,
	{ title: string; body: string; orders: string; home: string }
> = {
	en: {
		title: "We can't find that page",
		body: "If this is an order or tracking link, check you're signed in to the account that placed the order.",
		orders: "My orders",
		home: "Back to home",
	},
	zh: {
		title: "找不到该页面",
		body: "如果这是订单或物流追踪链接，请确认您登录的是下单时使用的账户。",
		orders: "我的订单",
		home: "返回首页",
	},
	ms: {
		title: "Halaman itu tidak ditemui",
		body: "Jika ini pautan pesanan atau penjejakan, pastikan anda log masuk ke akaun yang membuat pesanan itu.",
		orders: "Pesanan saya",
		home: "Kembali ke laman utama",
	},
};

export default function NotFound() {
	const { lang } = useParams<{ lang: string }>();
	const locale: Locale = isLocale(lang) ? lang : "en";
	const t = COPY[locale];

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#e9e7e3] p-8 text-center text-neutral-900">
			<h1 className="font-semibold text-[20px]">{t.title}</h1>
			<p className="max-w-[44ch] text-[14px] text-neutral-600">{t.body}</p>
			<div className="flex gap-2">
				<Link
					href={`/${locale}/orders`}
					className="rounded-lg bg-neutral-900 px-4 py-2.5 font-medium text-[13px] text-white"
				>
					{t.orders}
				</Link>
				<Link
					href={`/${locale}`}
					className="rounded-lg border border-neutral-300 px-4 py-2.5 text-[13px]"
				>
					{t.home}
				</Link>
			</div>
		</main>
	);
}
