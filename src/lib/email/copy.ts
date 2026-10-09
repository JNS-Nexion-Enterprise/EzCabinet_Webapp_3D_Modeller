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
	signInCode: {
		subject: "{code} is your EzCabinet sign-in code",
		heading: "Your sign-in code",
		body: "Type this code into the page where you asked for it:",
		after: "It works once, for {minutes} minutes.",
		footnote:
			"If you didn't ask for this, ignore this email. Nobody can sign in without the code, and we will never ask you for it by phone or WhatsApp.",
	},
	orderPlaced: {
		subject: "We've got your order {ref}",
		heading: "Thank you, {name}",
		body: "We've received your order. Here is what you ordered.",
		boxLabel: "Order number",
		boxNote: "Placed {date}",
		delivery: "Delivery",
		total: "Total",
		bankTransfer:
			"To confirm your order, transfer {total} to {bank}, {accountName}, account {accountNumber}. Use {ref} as the reference.",
		online:
			"Your payment is being confirmed. We'll email you as soon as it is.",
		address: "Delivering to: {siteAddress}",
		button: "View your order",
	},
	paymentConfirmed: {
		subject: "Payment received for order {ref}",
		heading: "Payment received",
		body: "We've received {total} for order {ref}. Thank you.",
		cabinets: "Cabinets",
		delivery: "Delivery",
		paid: "Paid",
		paidOn: "Paid on {date}",
		next: "What happens next: we'll contact you to arrange a site re-measure, then start making your cabinets. Delivery is normally within 4 to 6 weeks of the re-measure.",
		button: "View your order",
	},
	orderRefunded: {
		subject: "Your refund for order {ref}",
		heading: "Your order has been refunded",
		body: "Order {ref} has been cancelled and {total} has been sent back to you. It can take a few working days to show in your account.",
		button: "View your order",
	},
	stage: {
		subject: "Order {ref}: {stage}",
		heading: "An update on your cabinets",
		body: "Your order {ref} has moved to a new step.",
		boxLabel: "Current step",
		button: "View progress",
	},
	deliveryBooked: {
		subject: "Delivery booked for order {ref}",
		heading: "Your delivery is booked",
		body: "Your order {ref} is ready and delivery is booked with {carrier}.",
		boxLabel: "Tracking number",
		button: "Track delivery",
	},
	pickedUp: {
		subject: "Order {ref} is on its way",
		heading: "On its way",
		body: "Your order {ref} has been picked up and is on its way to {siteAddress}.",
		button: "Track delivery",
	},
	delivered: {
		subject: "Order {ref} has been delivered",
		heading: "Delivered",
		body: "Your order {ref} has been delivered. Thank you for choosing EzCabinet.",
		footnote:
			"If anything arrived damaged, tell us within 7 days, with photos.",
		button: "View delivery",
	},
	deliveryFailed: {
		subject: "We couldn't deliver order {ref}",
		heading: "We couldn't complete your delivery",
		body: "We weren't able to deliver order {ref}. Our team will contact you to arrange a new time. You don't need to do anything.",
		button: "View delivery",
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
	signInCode: {
		subject: "{code} ialah kod log masuk EzCabinet anda",
		heading: "Kod log masuk anda",
		body: "Taip kod ini pada halaman tempat anda memintanya:",
		after: "Kod ini sah untuk satu kali guna, selama {minutes} minit.",
		footnote:
			"Jika anda tidak memintanya, abaikan e-mel ini. Tiada sesiapa boleh log masuk tanpa kod ini, dan kami tidak akan sekali-kali memintanya melalui telefon atau WhatsApp.",
	},
	orderPlaced: {
		subject: "Kami telah menerima pesanan anda {ref}",
		heading: "Terima kasih, {name}",
		body: "Kami telah menerima pesanan anda. Berikut ialah butirannya.",
		boxLabel: "Nombor pesanan",
		boxNote: "Dibuat pada {date}",
		delivery: "Penghantaran",
		total: "Jumlah",
		bankTransfer:
			"Untuk mengesahkan pesanan anda, pindahkan {total} ke {bank}, {accountName}, akaun {accountNumber}. Gunakan {ref} sebagai rujukan.",
		online:
			"Bayaran anda sedang disahkan. Kami akan menghantar e-mel sebaik sahaja ia selesai.",
		address: "Dihantar ke: {siteAddress}",
		button: "Lihat pesanan anda",
	},
	paymentConfirmed: {
		subject: "Bayaran diterima untuk pesanan {ref}",
		heading: "Bayaran diterima",
		body: "Kami telah menerima {total} untuk pesanan {ref}. Terima kasih.",
		cabinets: "Kabinet",
		delivery: "Penghantaran",
		paid: "Dibayar",
		paidOn: "Dibayar pada {date}",
		next: "Langkah seterusnya: kami akan menghubungi anda untuk mengatur ukur semula di tapak, kemudian mula membuat kabinet anda. Penghantaran biasanya dalam masa 4 hingga 6 minggu selepas ukur semula.",
		button: "Lihat pesanan anda",
	},
	orderRefunded: {
		subject: "Bayaran balik untuk pesanan {ref}",
		heading: "Bayaran pesanan anda telah dikembalikan",
		body: "Pesanan {ref} telah dibatalkan dan {total} telah dikembalikan kepada anda. Ia mungkin mengambil beberapa hari bekerja untuk dipaparkan dalam akaun anda.",
		button: "Lihat pesanan anda",
	},
	stage: {
		subject: "Pesanan {ref}: {stage}",
		heading: "Kemas kini kabinet anda",
		body: "Pesanan anda {ref} telah beralih ke langkah baharu.",
		boxLabel: "Langkah semasa",
		button: "Lihat kemajuan",
	},
	deliveryBooked: {
		subject: "Penghantaran ditempah untuk pesanan {ref}",
		heading: "Penghantaran anda telah ditempah",
		body: "Pesanan anda {ref} telah siap dan penghantaran ditempah dengan {carrier}.",
		boxLabel: "Nombor penjejakan",
		button: "Jejak penghantaran",
	},
	pickedUp: {
		subject: "Pesanan {ref} dalam perjalanan",
		heading: "Dalam perjalanan",
		body: "Pesanan anda {ref} telah diambil dan sedang dalam perjalanan ke {siteAddress}.",
		button: "Jejak penghantaran",
	},
	delivered: {
		subject: "Pesanan {ref} telah dihantar",
		heading: "Telah dihantar",
		body: "Pesanan anda {ref} telah dihantar. Terima kasih kerana memilih EzCabinet.",
		footnote:
			"Jika ada yang rosak semasa tiba, maklumkan kami dalam masa 7 hari, bersama gambar.",
		button: "Lihat penghantaran",
	},
	deliveryFailed: {
		subject: "Kami tidak dapat menghantar pesanan {ref}",
		heading: "Kami tidak dapat menyelesaikan penghantaran anda",
		body: "Kami tidak dapat menghantar pesanan {ref}. Pasukan kami akan menghubungi anda untuk mengatur masa baharu. Anda tidak perlu berbuat apa-apa.",
		button: "Lihat penghantaran",
	},
};

const zh: EmailCopy = {
	shared: {
		linkFallback: "如果按钮无法使用，请将此链接粘贴到浏览器：",
		questions: "有疑问？请回复此邮件或致电 {phone}。",
		serviceOrder: "这是与您订单相关的服务邮件，因此无法退订。",
		serviceAccount: "这是与您账户相关的服务邮件，因此无法退订。",
	},
	signInCode: {
		subject: "{code} 是您的 EzCabinet 登录验证码",
		heading: "您的登录验证码",
		body: "请在您申请验证码的页面输入：",
		after: "验证码仅可使用一次，{minutes} 分钟内有效。",
		footnote:
			"如果不是您本人申请，请忽略此邮件。没有验证码，任何人都无法登录；我们绝不会通过电话或 WhatsApp 向您索取验证码。",
	},
	orderPlaced: {
		subject: "我们已收到您的订单 {ref}",
		heading: "谢谢您，{name}",
		body: "我们已收到您的订单，明细如下。",
		boxLabel: "订单编号",
		boxNote: "下单日期 {date}",
		delivery: "送货费",
		total: "总计",
		bankTransfer:
			"请将 {total} 转账至 {bank}，{accountName}，账号 {accountNumber}，并以 {ref} 作为付款参考，以确认您的订单。",
		online: "您的付款正在确认中，确认后我们会立即发邮件通知您。",
		address: "送货地址：{siteAddress}",
		button: "查看订单",
	},
	paymentConfirmed: {
		subject: "订单 {ref} 已收到付款",
		heading: "已收到付款",
		body: "我们已收到订单 {ref} 的款项 {total}，谢谢。",
		cabinets: "橱柜",
		delivery: "送货费",
		paid: "已付",
		paidOn: "付款日期 {date}",
		next: "接下来：我们会联系您安排到场重新测量，然后开始制作您的橱柜。一般在重新测量后 4 至 6 周内送货。",
		button: "查看订单",
	},
	orderRefunded: {
		subject: "订单 {ref} 的退款",
		heading: "您的订单已退款",
		body: "订单 {ref} 已取消，{total} 已退还给您。款项可能需要几个工作日才会显示在您的账户中。",
		button: "查看订单",
	},
	stage: {
		subject: "订单 {ref}：{stage}",
		heading: "您的橱柜进度更新",
		body: "您的订单 {ref} 已进入新的步骤。",
		boxLabel: "当前步骤",
		button: "查看进度",
	},
	deliveryBooked: {
		subject: "订单 {ref} 已安排送货",
		heading: "您的送货已安排",
		body: "您的订单 {ref} 已备妥，并已安排由 {carrier} 送货。",
		boxLabel: "追踪号码",
		button: "追踪送货",
	},
	pickedUp: {
		subject: "订单 {ref} 正在运送途中",
		heading: "正在运送途中",
		body: "您的订单 {ref} 已取货，正送往 {siteAddress}。",
		button: "追踪送货",
	},
	delivered: {
		subject: "订单 {ref} 已送达",
		heading: "已送达",
		body: "您的订单 {ref} 已送达。感谢您选择 EzCabinet。",
		footnote: "如有任何损坏，请在 7 天内附上照片告知我们。",
		button: "查看送货详情",
	},
	deliveryFailed: {
		subject: "订单 {ref} 未能送达",
		heading: "我们未能完成送货",
		body: "我们未能送达订单 {ref}。我们的团队会联系您另约时间，您无需采取任何行动。",
		button: "查看送货详情",
	},
};

export const EMAIL_COPY: Record<Locale, EmailCopy> = { en, ms, zh };
