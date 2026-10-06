# Legal Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a customer the terms of sale, refund policy and a complete privacy notice before they pay, and record on each order which wording they agreed to.

**Architecture:** Three locale-prefixed public pages rendered by one presentational `LegalPage` component from `lib/copy` dictionaries, exactly as the privacy notice works today. Checkout gains one required checkbox that follows the existing `remeasureAccepted` pattern: validated by zod on `POST /api/orders`, stamped onto the order with a server-side version constant.

**Tech Stack:** Next.js 16 App Router (server components), Prisma 7 + Postgres, zod, Vitest 4, Biome, pnpm. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-07-legal-pages-design.md`

## Global Constraints

- Every legal page shows the amber draft banner (`t.privacy.draft`). None of this wording is approved by EzCabinet's counsel.
- Copy lives in `src/lib/copy/{en,ms,zh}.ts`. `ms` and `zh` must have exactly English's keys and no value left in English — `src/lib/copy/__tests__/dictionary.test.ts` fails otherwise.
- UI copy is sentence case. Prices in RM.
- `TERMS_VERSION` is written by the server, never read from the request.
- No in-app refund or cancel flow. No new dependency.
- Refund windows are **7 days** to report damage and **14 working days** to pay a refund. Delivery estimate is **4 to 6 weeks** from re-measure. All three are our defaults, flagged for EzCabinet.
- The law in force is the **Consumer Protection (Electronic Trade Transactions) Regulations 2024** (from 25 December 2024, replacing the 2012 ones): disclosures must be in Bahasa Malaysia, so `ms` is the page of record and may never lag `en`.
- Migrations are hand-written (CLAUDE.md Known issue 12) and verified with `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`.
- Match the surrounding code: tabs, Biome formatting, comments that explain why.
- Stage only the files a task names — the working tree holds unrelated uncommitted work.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A customer opens the terms from checkout** — the typed form and the design must still be there when they come back. Links open in a new tab. Pinned in Task 4, Step 6 (manual check).
2. **A tab left open across the deploy submits the old payload** (no `termsAccepted`) — the API must refuse with 400, not create an order with no acceptance. Pinned in Task 3 (route test).
3. **A request that sends its own `termsVersion`** — must be ignored; the stored value is the server's constant. Pinned in Task 3 (the schema has no such key, and the create call reads only `TERMS_VERSION`; Step 6 greps for it).
4. **An order placed before this change** has null `termsVersion` and `termsAcceptedAt` — nothing may assume they are set. Pinned in Task 3: both columns are nullable and no reader is added.
5. **`/ms/terms` and `/zh/refunds`** — a missing or untranslated key must fail CI, not render English on a Malay page. Pinned in Tasks 2 and 4 by the existing dictionary parity test.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/components/LegalPage.tsx` (create) | Title, draft banner, intro, heading/paragraph sections. Presentational only. |
| `src/app/[lang]/privacy/page.tsx` (modify) | Builds privacy sections, renders `LegalPage`. |
| `src/app/[lang]/terms/page.tsx` (create) | Builds terms sections. |
| `src/app/[lang]/refunds/page.tsx` (create) | Builds refund sections. |
| `src/lib/copy/{en,ms,zh}.ts` (modify) | `terms`, `refunds`, new `privacy` keys, footer/sign-in/quote keys. |
| `src/lib/orders/terms.ts` (create) | `TERMS_VERSION`. |
| `src/app/api/orders/route.ts` (modify) | `termsAccepted: z.literal(true)`; stamps the order. |
| `prisma/schema.prisma`, `prisma/migrations/20261007000000_order_terms_acceptance/` | Two nullable columns. |
| `src/components/planner/QuoteScreen.tsx` (modify) | Checkbox, links, seller line. |
| `src/app/[lang]/page.tsx`, `src/app/[lang]/sign-in/page.tsx` (modify) | Links. |

---

### Task 1: `LegalPage` component, privacy page moved onto it

No behaviour change. The privacy page's markup becomes a component the next task reuses.

**Files:**
- Create: `src/components/LegalPage.tsx`
- Modify: `src/app/[lang]/privacy/page.tsx`

**Interfaces:**
- Produces: `LegalPage({ lang, back, title, draft, intro, sections })` where `sections: readonly (readonly [heading: string, body: string])[]`.

- [ ] **Step 1: Create the component**

`src/components/LegalPage.tsx`:

```tsx
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
	);
}
```

- [ ] **Step 2: Render the privacy page through it**

In `src/app/[lang]/privacy/page.tsx`, remove the `Link` import, add `import { LegalPage } from "@/components/LegalPage";`, keep the `sections` array as it is, and replace the whole `return ( <main …> … </main> );` with:

```tsx
	return (
		<LegalPage
			lang={lang}
			back={p.back}
			title={p.title}
			draft={p.draft}
			intro={p.intro}
			sections={sections}
		/>
	);
```

- [ ] **Step 3: Verify**

Run: `pnpm typecheck && pnpm biome check src/components/LegalPage.tsx "src/app/[lang]/privacy"`
Expected: no errors.

Run `pnpm dev`, open `http://localhost:3000/en/privacy`.
Expected: identical to before — back link, title, amber banner, seven sections.

- [ ] **Step 4: Commit**

```bash
git add src/components/LegalPage.tsx "src/app/[lang]/privacy/page.tsx"
git commit -m "refactor(legal): one LegalPage layout, privacy notice on it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Terms of sale and refund policy pages, privacy additions, links

**Files:**
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/ms.ts`, `src/lib/copy/zh.ts`
- Create: `src/app/[lang]/terms/page.tsx`, `src/app/[lang]/refunds/page.tsx`
- Modify: `src/app/[lang]/privacy/page.tsx`, `src/app/[lang]/page.tsx`, `src/app/[lang]/sign-in/page.tsx`
- Test: `src/lib/copy/__tests__/dictionary.test.ts` (existing, unchanged)

**Interfaces:**
- Consumes: `LegalPage` from Task 1; `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE` from `@/lib/logistics/carriers`; `fill` from `@/lib/copy/fill`.
- Produces: dictionary groups `terms`, `refunds`; keys `landing.footer.terms`, `landing.footer.refunds`, `signIn.privacyNote`; routes `/[lang]/terms`, `/[lang]/refunds`.

- [ ] **Step 1: Add the English copy**

In `src/lib/copy/en.ts`:

In `landing.footer`, after `privacy: "Privacy",` add:

```ts
			terms: "Terms of sale",
			refunds: "Refund policy",
```

In `privacy`, after the `whatsapp:` entry and before `choiceHeading`, add:

```ts
		accountHeading: "Your account",
		account:
			"When you sign in with Google we receive your name, email address and profile photo, and keep them as your account.",
		ordersHeading: "Your orders",
		orders:
			"When you place an order we keep your name, phone number, email, delivery address, the design you ordered and the price, as the record of the sale.",
		recipientsHeading: "Who else receives your data",
		recipients:
			"Our payment processor receives your card and billing details — these never reach our servers. The courier that delivers your order receives your name, phone number and address. Google handles sign-in. Mux streams our tutorial videos and so sees a viewer's IP address. Some of these companies process data outside Malaysia.",
		obligatoryHeading: "What you must give us",
		obligatory:
			"All of this comes from you directly, or from Google when you sign in. Browsing and planning need none of it. To place an order you must give your name, phone number and delivery address — without them we cannot deliver it. Email and WhatsApp updates are optional.",
		retentionHeading: "How long we keep it",
		retention:
			"Order records are kept for as long as tax and accounting law requires. An account with no orders is kept until you ask us to delete it.",
		rightsHeading: "Your rights",
		rights:
			"You may ask to see the personal data we hold about you, correct it, receive a copy in a portable form, withdraw your consent, or tell us to stop using it for direct marketing. Write to the contact address below.",
		otherLawsHeading: "Other laws",
		otherLaws:
			"This notice is given under Malaysia's Personal Data Protection Act 2010. Our analytics provider processes usage data in the European Union under its own data processing agreement; EzCabinet sells in Malaysia only.",
```

After the whole `privacy: { … },` group, add two groups:

```ts
	/** Draft wording — EzCabinet's counsel approves it before production. */
	terms: {
		title: "Terms of sale",
		intro:
			"These terms apply when you order cabinets through the EzCabinet planner. Please read them with the refund policy before you pay.",
		sellerHeading: "Who you are buying from",
		seller: "{address}. Email {email}, phone {phone}.",
		goodsHeading: "What you are buying",
		goods:
			"Cabinets made to order from the design you submit. The 3D view is an illustration; final dimensions are confirmed when we re-measure your site.",
		priceHeading: "Price",
		price:
			"Prices are in Ringgit Malaysia (RM) and are shown in full at checkout, including the delivery fee and any applicable taxes. The price you are charged is the one our system calculates when the order is placed.",
		paymentHeading: "Payment",
		payment:
			"You can pay by card through our payment provider, or by bank transfer where offered. Your order is confirmed once we have received payment in full.",
		remeasureHeading: "Re-measure",
		remeasure:
			"A designer measures your site before production. If the design has to change, we quote the change and agree it with you before production starts.",
		deliveryHeading: "Delivery",
		delivery:
			"We deliver to the address you give at checkout, normally within 4 to 6 weeks of the re-measure, and tell you when the delivery is booked. Please make sure someone can receive it.",
		changesHeading: "Correcting your order",
		changes:
			"You can change your design and your details at any time before you pay. If you notice a mistake afterwards, write to {email} straight away; we can correct it until production starts.",
		rightsHeading: "Your rights as a consumer",
		rights:
			"Nothing in these terms or the refund policy limits the rights you have under the Consumer Protection Act 1999, including the guarantees that goods are of acceptable quality and match their description.",
		complaintsHeading: "Complaints",
		complaints:
			"Write to {email} with your order reference and we will respond. If we cannot resolve it, you may bring the matter to the Tribunal for Consumer Claims Malaysia.",
		lawHeading: "Governing law",
		law: "These terms are governed by the laws of Malaysia.",
	},
	/** Draft wording — the windows are our defaults, not EzCabinet's. */
	refunds: {
		title: "Refund policy",
		intro:
			"Our cabinets are made to order, so whether an order can be refunded depends on whether production has started.",
		beforeHeading: "Cancelling before production starts",
		before:
			"You may cancel for a full refund at any time before production starts. Your order page shows when it has.",
		afterHeading: "Cancelling after production starts",
		after:
			"Once production has started the order cannot be cancelled or refunded, because the cabinets are being made to your design.",
		damagedHeading: "Damaged or defective on delivery",
		damaged:
			"Tell us within 7 days of delivery, with photos. We will repair or replace the affected cabinet at no cost to you, re-delivery included.",
		remeasureHeading: "If the design changes at re-measure",
		remeasure:
			"We re-quote the changed design. Any difference is refunded to you or charged before production starts.",
		howPaidHeading: "How refunds are paid",
		howPaid:
			"Refunds go back to the payment method you used, within 14 working days of our agreeing the refund.",
		howToAskHeading: "How to ask",
		howToAsk:
			"Write to {email} with your order reference, which looks like IC-20261007-001.",
	},
```

In `signIn`, after `back: "Back to home",` add:

```ts
		privacyNote: "By continuing you agree to our",
```

- [ ] **Step 2: Add the Malay copy**

In `src/lib/copy/ms.ts`, at the matching positions:

`landing.footer`:

```ts
			terms: "Terma jualan",
			refunds: "Polisi bayaran balik",
```

`privacy` (after `whatsapp`, before `choiceHeading`):

```ts
		accountHeading: "Akaun anda",
		account:
			"Apabila anda log masuk dengan Google, kami menerima nama, alamat e-mel dan foto profil anda, dan menyimpannya sebagai akaun anda.",
		ordersHeading: "Pesanan anda",
		orders:
			"Apabila anda membuat pesanan, kami menyimpan nama, nombor telefon, e-mel, alamat penghantaran, reka bentuk yang dipesan dan harganya sebagai rekod jualan.",
		recipientsHeading: "Siapa lagi yang menerima data anda",
		recipients:
			"Pemproses pembayaran kami menerima butiran kad dan bil anda — butiran ini tidak sampai ke pelayan kami. Syarikat kurier yang menghantar pesanan anda menerima nama, nombor telefon dan alamat anda. Google mengendalikan log masuk. Mux menstrim video tutorial kami dan oleh itu melihat alamat IP penonton. Sebahagian syarikat ini memproses data di luar Malaysia.",
		obligatoryHeading: "Apa yang anda mesti berikan",
		obligatory:
			"Semua ini datang terus daripada anda, atau daripada Google apabila anda log masuk. Melayari dan merancang tidak memerlukan apa-apa data. Untuk membuat pesanan, anda mesti memberikan nama, nombor telefon dan alamat penghantaran — tanpanya kami tidak dapat menghantar pesanan. E-mel dan kemas kini WhatsApp adalah pilihan.",
		retentionHeading: "Tempoh simpanan",
		retention:
			"Rekod pesanan disimpan selama yang dikehendaki oleh undang-undang cukai dan perakaunan. Akaun tanpa pesanan disimpan sehingga anda meminta kami memadamnya.",
		rightsHeading: "Hak anda",
		rights:
			"Anda boleh meminta untuk melihat data peribadi yang kami simpan tentang anda, membetulkannya, menerima salinan dalam bentuk mudah alih, menarik balik persetujuan, atau meminta kami berhenti menggunakannya untuk pemasaran langsung. Tulis kepada alamat hubungan di bawah.",
		otherLawsHeading: "Undang-undang lain",
		otherLaws:
			"Notis ini diberikan di bawah Akta Perlindungan Data Peribadi 2010 Malaysia. Penyedia analitik kami memproses data penggunaan di Kesatuan Eropah di bawah perjanjian pemprosesan datanya sendiri; EzCabinet menjual di Malaysia sahaja.",
```

After the `privacy` group:

```ts
	terms: {
		title: "Terma jualan",
		intro:
			"Terma ini terpakai apabila anda memesan kabinet melalui perancang EzCabinet. Sila baca bersama polisi bayaran balik sebelum membayar.",
		sellerHeading: "Penjual",
		seller: "{address}. E-mel {email}, telefon {phone}.",
		goodsHeading: "Apa yang anda beli",
		goods:
			"Kabinet yang dibuat mengikut tempahan berdasarkan reka bentuk yang anda hantar. Paparan 3D ialah ilustrasi; ukuran akhir disahkan apabila kami mengukur semula tapak anda.",
		priceHeading: "Harga",
		price:
			"Harga adalah dalam Ringgit Malaysia (RM) dan dipaparkan sepenuhnya semasa pembayaran, termasuk caj penghantaran dan sebarang cukai yang dikenakan. Harga yang dikenakan ialah harga yang dikira oleh sistem kami semasa pesanan dibuat.",
		paymentHeading: "Pembayaran",
		payment:
			"Anda boleh membayar dengan kad melalui penyedia pembayaran kami, atau melalui pindahan bank jika ditawarkan. Pesanan anda disahkan setelah kami menerima bayaran penuh.",
		remeasureHeading: "Ukur semula",
		remeasure:
			"Pereka akan mengukur tapak anda sebelum pengeluaran. Jika reka bentuk perlu diubah, kami akan memberi sebut harga perubahan itu dan mendapatkan persetujuan anda sebelum pengeluaran bermula.",
		deliveryHeading: "Penghantaran",
		delivery:
			"Kami menghantar ke alamat yang anda berikan semasa pembayaran, biasanya dalam masa 4 hingga 6 minggu selepas ukur semula, dan memaklumkan anda apabila penghantaran ditempah. Sila pastikan ada orang untuk menerimanya.",
		changesHeading: "Membetulkan pesanan anda",
		changes:
			"Anda boleh mengubah reka bentuk dan butiran anda pada bila-bila masa sebelum membayar. Jika anda menyedari kesilapan selepas itu, tulis kepada {email} dengan segera; kami boleh membetulkannya sehingga pengeluaran bermula.",
		rightsHeading: "Hak anda sebagai pengguna",
		rights:
			"Tiada apa-apa dalam terma ini atau polisi bayaran balik yang mengehadkan hak anda di bawah Akta Perlindungan Pengguna 1999, termasuk jaminan bahawa barangan berkualiti boleh terima dan menepati perihalannya.",
		complaintsHeading: "Aduan",
		complaints:
			"Tulis kepada {email} dengan rujukan pesanan anda dan kami akan membalas. Jika kami tidak dapat menyelesaikannya, anda boleh membawa perkara itu ke Tribunal Tuntutan Pengguna Malaysia.",
		lawHeading: "Undang-undang yang mentadbir",
		law: "Terma ini ditadbir oleh undang-undang Malaysia.",
	},
	refunds: {
		title: "Polisi bayaran balik",
		intro:
			"Kabinet kami dibuat mengikut tempahan, jadi sama ada pesanan boleh dibayar balik bergantung pada sama ada pengeluaran telah bermula.",
		beforeHeading: "Membatalkan sebelum pengeluaran bermula",
		before:
			"Anda boleh membatalkan dengan bayaran balik penuh pada bila-bila masa sebelum pengeluaran bermula. Halaman pesanan anda menunjukkan bila ia bermula.",
		afterHeading: "Membatalkan selepas pengeluaran bermula",
		after:
			"Setelah pengeluaran bermula, pesanan tidak boleh dibatalkan atau dibayar balik kerana kabinet sedang dibuat mengikut reka bentuk anda.",
		damagedHeading: "Rosak atau cacat semasa penghantaran",
		damaged:
			"Maklumkan kami dalam masa 7 hari selepas penghantaran, bersama gambar. Kami akan membaiki atau menggantikan kabinet yang terjejas tanpa kos kepada anda, termasuk penghantaran semula.",
		remeasureHeading: "Jika reka bentuk berubah semasa ukur semula",
		remeasure:
			"Kami memberi sebut harga baharu untuk reka bentuk yang diubah. Sebarang perbezaan dibayar balik kepada anda atau dicaj sebelum pengeluaran bermula.",
		howPaidHeading: "Cara bayaran balik dibuat",
		howPaid:
			"Bayaran balik dikembalikan ke kaedah pembayaran yang anda gunakan, dalam masa 14 hari bekerja selepas kami bersetuju dengan bayaran balik itu.",
		howToAskHeading: "Cara memohon",
		howToAsk:
			"Tulis kepada {email} dengan rujukan pesanan anda, contohnya IC-20261007-001.",
	},
```

`signIn`:

```ts
		privacyNote: "Dengan meneruskan, anda bersetuju dengan",
```

- [ ] **Step 3: Add the Chinese copy**

In `src/lib/copy/zh.ts`, at the matching positions:

`landing.footer`:

```ts
			terms: "销售条款",
			refunds: "退款政策",
```

`privacy` (after `whatsapp`, before `choiceHeading`):

```ts
		accountHeading: "您的账户",
		account:
			"当您使用 Google 登录时，我们会收到您的姓名、电子邮箱和头像，并将其保存为您的账户。",
		ordersHeading: "您的订单",
		orders:
			"当您下单时，我们会保存您的姓名、电话号码、电子邮箱、送货地址、所订购的设计及价格，作为销售记录。",
		recipientsHeading: "还有谁会收到您的数据",
		recipients:
			"我们的支付服务商会收到您的银行卡和账单信息——这些信息不会到达我们的服务器。负责配送的快递公司会收到您的姓名、电话号码和地址。Google 负责登录。Mux 负责播放我们的教程视频，因此会看到观看者的 IP 地址。其中部分公司在马来西亚境外处理数据。",
		obligatoryHeading: "您必须提供的资料",
		obligatory:
			"以上资料均由您直接提供，或在您登录时由 Google 提供。浏览和规划无需任何资料。下单时您必须提供姓名、电话号码和送货地址——否则我们无法送货。电子邮箱和 WhatsApp 通知为可选项。",
		retentionHeading: "保存期限",
		retention:
			"订单记录将按税务及会计法律要求的期限保存。没有订单的账户会一直保留，直到您要求我们删除。",
		rightsHeading: "您的权利",
		rights:
			"您可以要求查看我们持有的您的个人数据、更正数据、以可携带的形式获取副本、撤回同意，或要求我们停止将其用于直接营销。请写信至下方的联系地址。",
		otherLawsHeading: "其他法律",
		otherLaws:
			"本声明依据马来西亚《2010 年个人数据保护法》发出。我们的分析服务商依据其自身的数据处理协议在欧盟处理使用数据；EzCabinet 仅在马来西亚销售。",
```

After the `privacy` group:

```ts
	terms: {
		title: "销售条款",
		intro:
			"当您通过 EzCabinet 规划器订购橱柜时，适用以下条款。付款前请连同退款政策一并阅读。",
		sellerHeading: "卖方",
		seller: "{address}。电子邮箱 {email}，电话 {phone}。",
		goodsHeading: "您购买的商品",
		goods:
			"根据您提交的设计定制的橱柜。3D 视图仅为示意；最终尺寸以我们上门复尺为准。",
		priceHeading: "价格",
		price:
			"价格以马来西亚令吉（RM）计，结账时完整显示，已含送货费及任何适用税项。实际收取的价格为下单时由我们系统计算的价格。",
		paymentHeading: "付款",
		payment:
			"您可以通过我们的支付服务商刷卡付款，或在提供时使用银行转账。我们收到全额付款后，订单即告确认。",
		remeasureHeading: "上门复尺",
		remeasure:
			"生产前设计师会上门测量。如设计需要更改，我们会先报价并征得您的同意，然后才开始生产。",
		deliveryHeading: "送货",
		delivery:
			"我们会送货至您结账时填写的地址，通常在上门复尺后 4 至 6 周内送达，并在安排配送后通知您。请确保有人签收。",
		changesHeading: "更正订单",
		changes:
			"付款前，您可随时修改设计和个人资料。如付款后发现错误，请立即写信至 {email}；生产开始前我们均可更正。",
		rightsHeading: "您作为消费者的权利",
		rights:
			"本条款及退款政策中的任何内容，均不限制您依据《1999 年消费者保护法》享有的权利，包括商品质量合格并与描述相符的保障。",
		complaintsHeading: "投诉",
		complaints:
			"请写信至 {email} 并附上订单编号，我们会回复。如未能解决，您可向马来西亚消费者索偿仲裁庭提出申诉。",
		lawHeading: "适用法律",
		law: "本条款受马来西亚法律管辖。",
	},
	refunds: {
		title: "退款政策",
		intro: "我们的橱柜为定制产品，因此订单能否退款取决于是否已开始生产。",
		beforeHeading: "生产开始前取消",
		before:
			"在生产开始前，您可随时取消并获得全额退款。您的订单页面会显示生产是否已开始。",
		afterHeading: "生产开始后取消",
		after: "生产开始后，订单不可取消或退款，因为橱柜正按您的设计制作。",
		damagedHeading: "送达时损坏或有缺陷",
		damaged:
			"请在送达后 7 天内告知我们并附上照片。我们会免费维修或更换受影响的橱柜，并承担重新送货的费用。",
		remeasureHeading: "复尺后设计有变",
		remeasure:
			"我们会对更改后的设计重新报价。差额会在生产开始前退还给您或向您收取。",
		howPaidHeading: "退款方式",
		howPaid: "退款将在我们同意退款后 14 个工作日内，退回您原来使用的付款方式。",
		howToAskHeading: "如何申请",
		howToAsk: "请写信至 {email} 并附上订单编号，格式如 IC-20261007-001。",
	},
```

`signIn`:

```ts
		privacyNote: "继续即表示您同意我们的",
```

- [ ] **Step 4: Run the parity test**

Run: `pnpm vitest run src/lib/copy/__tests__/dictionary.test.ts`
Expected: PASS. A failure lists the exact key path that is missing or still English — fix that key, do not add it to `SHARED`.

- [ ] **Step 5: Extend the privacy page's sections**

In `src/app/[lang]/privacy/page.tsx`, replace the `sections` array with:

```tsx
	const sections = [
		[p.purposeHeading, p.purpose],
		[p.collectHeading, p.collect],
		[p.notCollectHeading, p.notCollect],
		[p.accountHeading, p.account],
		[p.ordersHeading, p.orders],
		[p.whereHeading, p.where],
		[p.recipientsHeading, p.recipients],
		[p.whatsappHeading, p.whatsapp],
		[p.obligatoryHeading, p.obligatory],
		[p.retentionHeading, p.retention],
		[p.rightsHeading, p.rights],
		[p.choiceHeading, p.choice],
		[p.otherLawsHeading, p.otherLaws],
		[p.contactHeading, fill(p.contact, { email: t.landing.footer.email })],
	] as const;
```

- [ ] **Step 6: Create the terms page**

`src/app/[lang]/terms/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";
import { WORKSHOP_ADDRESS, WORKSHOP_PHONE } from "@/lib/logistics/carriers";

/**
 * The terms a customer agrees to at checkout (`termsAccepted` on
 * `POST /api/orders`).
 *
 * A draft, like the privacy notice: EzCabinet is the seller, so the wording
 * is theirs to approve. Change it and `TERMS_VERSION` in
 * `lib/orders/terms.ts` must change with it, or an order can no longer be
 * matched to the text its customer agreed to.
 *
 * The seller's address and phone are the same placeholders the logistics
 * adapters use — see Open questions in CLAUDE.md.
 */
export default async function TermsPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const s = t.terms;
	const email = t.landing.footer.email;

	return (
		<LegalPage
			lang={lang}
			back={t.privacy.back}
			title={s.title}
			draft={t.privacy.draft}
			intro={s.intro}
			sections={[
				[
					s.sellerHeading,
					fill(s.seller, {
						address: WORKSHOP_ADDRESS,
						email,
						phone: WORKSHOP_PHONE,
					}),
				],
				[s.goodsHeading, s.goods],
				[s.priceHeading, s.price],
				[s.paymentHeading, s.payment],
				[s.remeasureHeading, s.remeasure],
				[s.deliveryHeading, s.delivery],
				[s.changesHeading, fill(s.changes, { email })],
				[s.rightsHeading, s.rights],
				[s.complaintsHeading, fill(s.complaints, { email })],
				[s.lawHeading, s.law],
			]}
		/>
	);
}
```

- [ ] **Step 7: Create the refund policy page**

`src/app/[lang]/refunds/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/LegalPage";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { isLocale } from "@/lib/copy/locales";

/**
 * The refund policy a customer agrees to with the terms of sale.
 *
 * "Production starts" is the line the app already records:
 * `Order.productionStage` is null until an admin starts it
 * (`lib/orders/stage.ts`), and the order page shows it. Keep the wording on
 * that boundary so staff and customer read the same one. Bump
 * `TERMS_VERSION` when this text changes.
 */
export default async function RefundsPage({
	params,
}: {
	params: Promise<{ lang: string }>;
}) {
	const { lang } = await params;
	if (!isLocale(lang)) notFound();
	const t = await getDictionary(lang);
	const r = t.refunds;

	return (
		<LegalPage
			lang={lang}
			back={t.privacy.back}
			title={r.title}
			draft={t.privacy.draft}
			intro={r.intro}
			sections={[
				[r.beforeHeading, r.before],
				[r.afterHeading, r.after],
				[r.damagedHeading, r.damaged],
				[r.remeasureHeading, r.remeasure],
				[r.howPaidHeading, r.howPaid],
				[
					r.howToAskHeading,
					fill(r.howToAsk, { email: t.landing.footer.email }),
				],
			]}
		/>
	);
}
```

- [ ] **Step 8: Link them from the footer**

In `src/app/[lang]/page.tsx`, find the footer's privacy link:

```tsx
							<Link
								href={`/${lang}/privacy`}
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.privacy}
							</Link>
```

Add directly after it:

```tsx
							<Link
								href={`/${lang}/terms`}
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.terms}
							</Link>
							<Link
								href={`/${lang}/refunds`}
								className="text-[13px] text-neutral-300 transition-colors hover:text-white"
							>
								{t.landing.footer.refunds}
							</Link>
```

- [ ] **Step 9: Privacy line on the sign-in page**

In `src/app/[lang]/sign-in/page.tsx`, directly after the closing `/>` of `<GoogleSignInButton … />`, add:

```tsx
				<p className="text-center text-[12px] text-neutral-500 leading-[17px]">
					{s.privacyNote}{" "}
					<Link href={`/${lang}/privacy`} className="underline">
						{t.privacy.title}
					</Link>
				</p>
```

- [ ] **Step 10: Verify**

Run: `pnpm typecheck && pnpm biome check src/lib/copy "src/app/[lang]" && pnpm vitest run src/lib/copy`
Expected: no errors, all pass.

With `pnpm dev`, open each of `/en/terms`, `/ms/terms`, `/zh/terms`, `/en/refunds`, `/ms/refunds`, `/zh/refunds`, `/en/privacy`.
Expected: each renders with the amber draft banner; the terms page's first section shows the workshop address, email and phone with no `{braces}` left; the privacy page has fourteen sections. The landing footer shows three legal links; `/en/sign-in` shows the privacy line under the Google button.

- [ ] **Step 11: Commit**

```bash
git add src/lib/copy/en.ts src/lib/copy/ms.ts src/lib/copy/zh.ts "src/app/[lang]/terms" "src/app/[lang]/refunds" "src/app/[lang]/privacy/page.tsx" "src/app/[lang]/page.tsx" "src/app/[lang]/sign-in/page.tsx"
git commit -m "feat(legal): terms of sale, refund policy, fuller privacy notice

Draft wording in en/ms/zh, labelled as a draft on every page.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The order API requires and records acceptance

**Files:**
- Create: `src/lib/orders/terms.ts`
- Create: `prisma/migrations/20261007000000_order_terms_acceptance/migration.sql`
- Modify: `prisma/schema.prisma` (model `Order`)
- Modify: `src/app/api/orders/route.ts`
- Test: `src/app/api/orders/__tests__/route.test.ts`

**Interfaces:**
- Produces: `TERMS_VERSION: string` from `@/lib/orders/terms`; request body field `termsAccepted: true` (required); columns `Order.termsVersion String?`, `Order.termsAcceptedAt DateTime?`.

- [ ] **Step 1: Write the failing test**

Append to `src/app/api/orders/__tests__/route.test.ts`:

```ts
describe("POST /api/orders terms acceptance", () => {
	const postBody = (body: unknown) =>
		POST(
			new Request("http://localhost/api/orders", {
				method: "POST",
				body: JSON.stringify(body),
			}),
		);
	/** The zod issue paths in a 400, e.g. "termsAccepted", "customer". */
	const issuePaths = async (response: Response) =>
		((await response.json()).issues as { path: (string | number)[] }[]).map(
			(issue) => issue.path.join("."),
		);

	// Past the session check on the local demo-customer path, so the body is
	// what is being judged. The body is otherwise incomplete on purpose: the
	// refusal happens at the schema, before any catalogue or database work.
	beforeEach(() => vi.stubEnv("AUTH_ENABLED", "false"));

	it("refuses an order that has not accepted the terms", async () => {
		const response = await postBody({ remeasureAccepted: true });
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).toContain("termsAccepted");
	});

	it("refuses termsAccepted: false — it is a condition, not a preference", async () => {
		const response = await postBody({ termsAccepted: false });
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).toContain("termsAccepted");
	});

	it("has no complaint about the terms once they are accepted", async () => {
		const response = await postBody({ termsAccepted: true });
		// Still 400 — the rest of the body is missing — but not for the terms.
		expect(response.status).toBe(400);
		expect(await issuePaths(response)).not.toContain("termsAccepted");
	});
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm vitest run src/app/api/orders/__tests__/route.test.ts`
Expected: the first two new tests FAIL (`expected [ … ] to contain 'termsAccepted'`); the third passes already.

- [ ] **Step 3: Create the version constant**

`src/lib/orders/terms.ts`:

```ts
/**
 * Which wording of the terms of sale and refund policy an order was placed
 * under — stamped on every order beside the time it was accepted.
 *
 * Bump this, by hand, whenever the text of `terms` or `refunds` in
 * `lib/copy/en.ts` changes in meaning. It is what lets a disputed order be
 * matched to the text that customer agreed to; `git log -S` on the old value
 * finds that text. A date, because "which version" is really "as of when".
 *
 * Written by the server only. A request never supplies it.
 */
export const TERMS_VERSION = "2026-10-07";
```

- [ ] **Step 4: Add the columns to the schema**

In `prisma/schema.prisma`, model `Order`, directly after the `whatsappOptInAt    DateTime?` line, add:

```prisma
  /// `TERMS_VERSION` (`lib/orders/terms.ts`) as it stood when the customer
  /// ticked the terms box, and when. Null on orders placed before the terms
  /// existed.
  termsVersion       String?
  termsAcceptedAt    DateTime?
```

- [ ] **Step 5: Write the migration**

`prisma/migrations/20261007000000_order_terms_acceptance/migration.sql`:

```sql
-- Which terms of sale and refund policy an order was placed under
-- (docs/superpowers/specs/2026-10-07-legal-pages-design.md). Nullable:
-- existing orders predate the terms and agreed to nothing.

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "termsVersion" TEXT,
ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
```

- [ ] **Step 6: Require and stamp it in the route**

In `src/app/api/orders/route.ts`:

Add the import beside the other `@/lib/orders` imports:

```ts
import { TERMS_VERSION } from "@/lib/orders/terms";
```

In `orderInputSchema`, directly after the `remeasureAccepted: z.literal(true),` line, add:

```ts
	/** The terms of sale and refund policy, linked beside the box. Required the same way. */
	termsAccepted: z.literal(true),
```

In the `tx.order.create({ data: { … } })` call, directly after the `whatsappOptInAt: whatsappOptIn ? new Date() : null,` line, add:

```ts
				// The schema above already refused anything but `true`. The version
				// is ours — the body has no field for it.
				termsVersion: TERMS_VERSION,
				termsAcceptedAt: new Date(),
```

Then confirm the version has exactly one source:

Run: `grep -rn "termsVersion" src --include="*.ts" --include="*.tsx" | grep -v generated`
Expected: one line, in `src/app/api/orders/route.ts`, reading `TERMS_VERSION`.

- [ ] **Step 7: Regenerate, apply locally, and check the migration against the schema**

Run: `pnpm prisma generate`

Run: `pnpm prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
Expected: the two `ADD COLUMN` lines above, plus any migration not yet applied to the local database. If it prints anything else touching `termsVersion` or `termsAcceptedAt`, the hand-written SQL does not match the schema — fix the SQL.

Run: `pnpm prisma migrate deploy`
Expected: the migration applies. Then re-run the `migrate diff` command.
Expected: an empty script (`-- This is an empty migration.`).

- [ ] **Step 8: Run the tests**

Run: `pnpm vitest run src/app/api/orders && pnpm typecheck`
Expected: all PASS, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/orders/terms.ts prisma/schema.prisma prisma/migrations/20261007000000_order_terms_acceptance src/app/api/orders/route.ts src/app/api/orders/__tests__/route.test.ts
git commit -m "feat(orders): an order records which terms its customer accepted

POST /api/orders refuses a body without termsAccepted and stamps
TERMS_VERSION and the time on the order.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Checkout shows the seller and asks for agreement

Must ship in the same deploy as Task 3 — from that task on, the API refuses a checkout that does not send `termsAccepted`.

**Files:**
- Modify: `src/lib/copy/en.ts`, `src/lib/copy/ms.ts`, `src/lib/copy/zh.ts` (group `quote`)
- Modify: `src/components/planner/QuoteScreen.tsx`
- Test: `src/lib/copy/__tests__/dictionary.test.ts` (existing)

**Interfaces:**
- Consumes: request field `termsAccepted: true` from Task 3; routes `/[lang]/terms`, `/[lang]/refunds` from Task 2; `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE` from `@/lib/logistics/carriers`.
- Produces: `quote.termsAgree`, `quote.termsLink`, `quote.refundsLink`, `quote.errorTerms`, `quote.soldBy`.

- [ ] **Step 1: Add the copy**

In each file's `quote` group, directly after the `errorRemeasure` entry.

`en.ts`:

```ts
		termsAgree: "I agree to the terms of sale and the refund policy.",
		termsLink: "Terms of sale",
		refundsLink: "Refund policy",
		errorTerms: "Tick this to place your order.",
		soldBy: "Sold by {address}. Contact {email} or {phone}.",
```

`ms.ts`:

```ts
		termsAgree: "Saya bersetuju dengan terma jualan dan polisi bayaran balik.",
		termsLink: "Terma jualan",
		refundsLink: "Polisi bayaran balik",
		errorTerms: "Tandakan ini untuk membuat pesanan.",
		soldBy: "Dijual oleh {address}. Hubungi {email} atau {phone}.",
```

`zh.ts`:

```ts
		termsAgree: "我同意销售条款和退款政策。",
		termsLink: "销售条款",
		refundsLink: "退款政策",
		errorTerms: "请勾选此项以提交订单。",
		soldBy: "卖方：{address}。联系方式：{email} 或 {phone}。",
```

Run: `pnpm vitest run src/lib/copy/__tests__/dictionary.test.ts`
Expected: PASS.

- [ ] **Step 2: Add `terms` to the field-error type and the validation**

In `src/components/planner/QuoteScreen.tsx`:

The field-error record currently reads:

```ts
	Record<"name" | "phone" | "email" | "siteAddress" | "remeasure", string>
```

Change it to:

```ts
	Record<
		"name" | "phone" | "email" | "siteAddress" | "remeasure" | "terms",
		string
	>
```

Directly after the line

```ts
		if (field("remeasure") !== "on") errors.remeasure = t.quote.errorRemeasure;
```

add:

```ts
		if (field("terms") !== "on") errors.terms = t.quote.errorTerms;
```

- [ ] **Step 3: Send it**

In the `POST /api/orders` body in the same file, directly after `remeasureAccepted: true,` add:

```ts
					// Reached only past the validation above, like the line before it.
					termsAccepted: true,
```

- [ ] **Step 4: Import the seller constants**

Add to the imports at the top of `QuoteScreen.tsx`:

```ts
import { WORKSHOP_ADDRESS, WORKSHOP_PHONE } from "@/lib/logistics/carriers";
```

`carriers.ts` is isomorphic and holds no secrets (its own header says so), so a client component may import it.

- [ ] **Step 5: Render the checkbox and the seller line**

In `QuoteScreen.tsx`, find the end of the re-measure error block:

```tsx
								{fieldErrors.remeasure && (
									<p
										id="err-remeasure"
										role="alert"
										className="-mt-1.5 ml-[25px] text-[#b42318] text-[12px]"
									>
										{fieldErrors.remeasure}
									</p>
								)}
```

Directly after it, add:

```tsx
								<label className="flex min-h-9 cursor-pointer items-start gap-[9px]">
									<input
										name="terms"
										type="checkbox"
										required
										disabled={busy}
										aria-invalid={!!fieldErrors.terms}
										aria-describedby={describedBy("terms")}
										className="mt-px h-4 w-4 shrink-0 accent-[#171717]"
									/>
									{/* New tabs: the typed form and the design must still be
									    here when the customer comes back from reading. */}
									<span className="text-[#5c574e] text-[12px] leading-[17px]">
										{t.quote.termsAgree}{" "}
										<a
											href={`/${locale}/terms`}
											target="_blank"
											rel="noopener"
											className="underline"
										>
											{t.quote.termsLink}
										</a>
										{" · "}
										<a
											href={`/${locale}/refunds`}
											target="_blank"
											rel="noopener"
											className="underline"
										>
											{t.quote.refundsLink}
										</a>
									</span>
								</label>
								{fieldErrors.terms && (
									<p
										id="err-terms"
										role="alert"
										className="-mt-1.5 ml-[25px] text-[#b42318] text-[12px]"
									>
										{fieldErrors.terms}
									</p>
								)}
								{/* The seller's name, address and contact, before the button
								    rather than one click away — the Consumer Protection
								    (Electronic Trade Transactions) Regulations 2024 want them
								    disclosed before purchase. */}
								<p className="text-[#5c574e] text-[12px] leading-[17px]">
									{fill(t.quote.soldBy, {
										address: WORKSHOP_ADDRESS,
										email: t.landing.footer.email,
										phone: WORKSHOP_PHONE,
									})}
								</p>
```

`describedBy`, `fill`, `locale`, `busy` and `fieldErrors` already exist in this component. If `describedBy` is typed to a union of field names, add `"terms"` to that union.

- [ ] **Step 6: Verify in the browser**

Run: `pnpm typecheck && pnpm biome check src/components/planner/QuoteScreen.tsx src/lib/copy`
Expected: no errors.

With `pnpm dev` and `AUTH_ENABLED=false` in `.env.local`:

1. Open `/en`, pick a room, place a cabinet, continue to checkout.
2. Fill name, phone and address; tick re-measure; leave the terms box unticked; press the pay / place-order button.
   Expected: no order is created; "Tick this to place your order." appears under the terms box and the box takes focus.
3. Click **Terms of sale**.
   Expected: opens in a new tab. Back on the checkout tab, every typed field and the design are unchanged.
4. Tick the box and submit.
   Expected: the order is created and the browser lands on `/en/order/<token>`.
5. Check the row: `pnpm prisma studio`, table `Order`, newest row.
   Expected: `termsVersion` is `2026-10-07`, `termsAcceptedAt` is the time of step 4.
6. Read the line under the checkboxes.
   Expected: "Sold by EzCabinet Sdn Bhd, Klang Valley, Selangor. Contact hello@ezcabinet.com or 03-1234 5678." with no `{braces}`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/copy/en.ts src/lib/copy/ms.ts src/lib/copy/zh.ts src/components/planner/QuoteScreen.tsx
git commit -m "feat(checkout): agree to the terms before paying, and see who sells

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/translation-review.md`

- [ ] **Step 1: `CLAUDE.md` — UX flow**

In the "UX flow" section, directly after the paragraph beginning `**An order is priced on the server, never by the client.**`, add:

```markdown
**An order records the terms it was placed under.** Checkout requires a
ticked terms box; `POST /api/orders` refuses a body without
`termsAccepted: true` and stamps `Order.termsVersion` (`TERMS_VERSION`,
`lib/orders/terms.ts`) and `termsAcceptedAt`. Bump `TERMS_VERSION` by hand
whenever the wording of `/[lang]/terms` or `/[lang]/refunds` changes in
meaning. Both pages and the privacy notice are **drafts**, rendered by
`components/LegalPage.tsx` from `lib/copy`; the refund policy's boundary is
`Order.productionStage` being set. There is no refund or cancel flow in the
app.
```

- [ ] **Step 2: `CLAUDE.md` — Open questions**

Replace the bullet beginning `- **The privacy notice at \`/[lang]/privacy\` is a draft.**` with:

```markdown
- **The privacy notice, terms of sale and refund policy are drafts**
  (`/[lang]/privacy`, `/terms`, `/refunds`). EzCabinet is the seller and the
  PDPA data controller: their counsel approves the wording, and the PostHog
  DPA should be signed in their legal name. Ask too whether behavioural
  analytics counts as "systematic monitoring" under the DPO guideline, and
  whether their data volumes require appointing a DPO at all. The refund
  windows (7 days to report damage, 14 working days to pay) and the delivery
  estimate (4 to 6 weeks from re-measure) are our defaults; whether the price
  carries SST, and the company's SSM registration number for the seller
  block, are theirs to supply.
  The seller block on the terms page and at checkout reads
  `WORKSHOP_ADDRESS` and `WORKSHOP_PHONE`, both still placeholders — the
  Consumer Protection (Electronic Trade Transactions) Regulations 2024 want
  the registered address there, and the Malay page is the one the law reads. GDPR was checked and does not apply: an
  EU-hosted processor does not bring a Malaysian seller under it.
```

- [ ] **Step 3: `docs/translation-review.md`**

Append at the end of the file:

```markdown
## Legal pages (added 2026-10-07)

Three pages are now translated in full and need a native read **and** a legal
one — these are the words a customer agrees to before paying:

- **Terms of sale** — `/ms/terms`, `/zh/terms`
- **Refund policy** — `/ms/refunds`, `/zh/refunds`
- **Privacy notice** — `/ms/privacy`, `/zh/privacy` (seven new sections: your
  account, your orders, who else receives your data, what you must give us,
  how long we keep it, your rights, other laws)

The English is a draft pending your counsel's review, and the Malay and
Chinese were drafted from it by AI. Where the three disagree, tell us which
one says what you mean. Terms worth checking by name:

| English | Malay | Chinese |
| --- | --- | --- |
| Terms of sale | Terma jualan | 销售条款 |
| Refund policy | Polisi bayaran balik | 退款政策 |
| Re-measure | Ukur semula | 上门复尺 |
| Made to order | Dibuat mengikut tempahan | 定制 |
| Tribunal for Consumer Claims Malaysia | Tribunal Tuntutan Pengguna Malaysia | 马来西亚消费者索偿仲裁庭 |
| Personal Data Protection Act 2010 | Akta Perlindungan Data Peribadi 2010 | 《2010 年个人数据保护法》 |
```

- [ ] **Step 4: Full check**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all clean, all tests pass.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md docs/translation-review.md
git commit -m "docs: terms acceptance on orders, legal pages are drafts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Deploying

- Tasks 3 and 4 go out together. Task 3 alone breaks checkout for every customer.
- Apply the migration (`pnpm prisma migrate deploy`) before the new code serves traffic: the order create writes the two new columns.
- The earlier `20261006010000_order_paid_by_name` migration must be applied first if it has not been.
