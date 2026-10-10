# Email templates: one look, every mail written

## Why

The app sends two emails and they do not match. The staff invite is a designed
HTML mail with its layout inlined in `src/lib/auth/inviteMail.ts`. The password
reset in `src/lib/auth/passwordReset.ts` is plain text, although Claude Design
already holds `emails/reset-password.html` for it. A third, the customer
sign-in code, is specced in `2026-10-08-customer-email-signin-design.md` as
"text and a plain HTML version".

Order updates go by WhatsApp only, and only to customers who ticked the box at
checkout. A customer who did not tick it gets nothing in writing, not even a
receipt.

After this, every mail shares one layout, has final wording in three
languages, and every customer gets a written record of their money.

## Decisions already made

| Question | Answer |
| --- | --- |
| Which mails? | The 3 account mails, plus the 8 order events WhatsApp already reports |
| A customer has WhatsApp updates on. What does email do? | Order placed, payment confirmed and refunded always go by email. Production stage and the four delivery mails go by email unless WhatsApp carries them: the customer opted in and WhatsApp is configured to send. Until WhatsApp is live, everyone gets them by email |
| Language | Customer mails follow `Order.locale` (en / ms / zh); the sign-in code follows the page's language. Staff mails are English |
| Brand name | `EzCabinet`, the dictionary's `common.brand`. The Claude Design files say "Infinite Cabinet"; the mails follow the code |
| Dependencies | None added. No React Email. No Resend hosted templates: the wording would leave the repo and its review |

## The shell

`src/lib/email/layout.ts`, one pure function. The look is the invite mail's,
unchanged: 600 px card on `#f4f3f1`, logo row, 24 px heading, green `#1f5138`
pill button with an Outlook VML twin, a paste-this-link fallback, a rule, small
print, and the dark-mode block.

```ts
renderEmail({
  locale,
  preheader,
  heading,
  blocks,      // Block[]
  footnote,    // the grey line under the rule
}): { html: string; text: string }
```

| Block | What it draws | Used by |
| --- | --- | --- |
| `paragraph` | body text | all |
| `box` | label, value and an optional note on the grey panel | role, order number, current step, tracking number |
| `code` | six digits, large and letter-spaced | sign-in code |
| `rows` | label and amount lines, then a bold total | order placed, payment confirmed |
| `button` | one call to action and the paste-this-link fallback | all but the sign-in code |

Rules:

- `text` is built from the same blocks as `html`, so the two cannot drift.
- `renderEmail` escapes every value it is given. Callers pass raw strings. The
  invite's "every value arrives already escaped" contract goes away.
- A mail has at most one button.
- The footer is `WORKSHOP_ADDRESS` and one line saying this is a service email
  and cannot be unsubscribed from. Customer mails add "Questions? Reply to
  this email or call {phone}", with `WORKSHOP_PHONE`.
- `<html lang>` is the mail's locale.

## One file per mail

`src/lib/email/templates/`, each `(input) => { subject, html, text }`, no I/O.
The three account mails have a file each; the eight order mails are one file,
`order.ts`, switching on the kind. Customer wording lives in
`src/lib/email/copy.ts`, kept out of the site dictionary because that
dictionary ships to the browser; the two staff mails keep their English inline.

| Template | Sent by | When |
| --- | --- | --- |
| `staffInvite` | `sendStaffInvite` (`lib/auth/inviteMail.ts`) | a superadmin invites or promotes |
| `staffReset` | `sendStaffReset` (`lib/auth/passwordReset.ts`) | staff asks for a reset and `canEmailReset` allows it |
| `signInCode` | `emailCodeMail.ts`, from the sign-in spec | a customer asks for a code |
| `orderPlaced` | outbox | `ORDER_PLACED` |
| `paymentConfirmed` | outbox | `PAYMENT_CONFIRMED` |
| `orderRefunded` | outbox | `ORDER_REFUNDED` |
| `productionStage` | outbox | `STAGE` |
| `deliveryBooked` | outbox | `DELIVERY_BOOKED` |
| `deliveryPickedUp` | outbox | `PICKED_UP` |
| `deliveryDelivered` | outbox | `DELIVERED` |
| `deliveryFailed` | outbox | `DELIVERY_FAILED` |

`sendStaffInvite` and `sendStaffReset` keep every rule they have today and
only change what they hand to `sendEmail`. The sign-in spec's line "Text and a
plain HTML version" is replaced by `signInCode`; nothing else in that spec
changes.

## Order mails ride the existing outbox

`Notification` already queues in the state change's transaction, dedupes,
retries from the cron and expires after 48 hours. It gains one column:
`channel`, `WHATSAPP` (default, so existing rows are right) or `EMAIL`.

- `draftFor(event)` in `lib/whatsapp/templates.ts` becomes `draftsFor(event)`
  and returns zero, one or two drafts. Its seven call sites already pass an
  array to `enqueue`, so each one spreads the result.
- The WhatsApp draft is unchanged: it exists when `whatsappOptIn` is true.
- The email draft exists when the kind is `ORDER_PLACED`, `PAYMENT_CONFIRMED`
  or `ORDER_REFUNDED`, or when `whatsappOptIn` is false. Its `dedupeKey` is the
  WhatsApp key with `:email` appended. Its `to` is `order.customerEmail`, else
  the owning account's email; `NOTIFY_ORDER_SELECT` gains both.
- `flush` branches per row. WhatsApp rows go out as today. An email row loads
  its order (and delivery), renders the template and calls `sendEmail`.
- The mail is rendered when it is sent, from the order row, not from stored
  `vars`: a receipt needs `Order.breakdown`, which is already stored as
  charged. An email row's `vars` is `{}`.
- "Is this channel configured" is asked per row. A missing `WHATSAPP_TOKEN` no
  longer stops mail; a missing `RESEND_API_KEY` leaves email rows pending, as
  WhatsApp rows are without a token. Preview deployments get neither.
- A mail Resend refuses is retried up to five times through the existing
  `nextState`, then marked failed and shown on the order's Messages card for a
  staff resend. A bad key, a rate limit, a 5xx or a timeout uses up no try and
  holds the rest of the channel's rows for the next run.
- `flush` reads and sends each channel on its own, so a backlog on one never
  takes the other's place in the queue.
- Order mail links are built from `BETTER_AUTH_URL`; without it mail waits.
- `PATCH /api/orders/[token]` already re-points `PENDING` WhatsApp rows when
  the phone changes. It does the same for `EMAIL` rows when the email changes.
- A customer who turns WhatsApp off after ordering gets stage and delivery
  mail from the next event on; nothing is sent for events already past.

Delivery booked keeps its existing exception: it is queued after the booking
commits, for both channels.

## The mails

`{ref}` is `orderRef(number, createdAt)`, for example `IC-20261008-001`.
Amounts are `RM 1,234.00`. Buttons open `/{locale}/order/{token}` or
`/{locale}/track/{token}`.

### A. Staff invite (English only)

Wording unchanged from `inviteMail.ts`. It moves onto the shell: heading,
greeting, intro paragraph, a `box` with the role, a **Sign in** button.

### B. Staff password reset (English only)

Subject: **Reset your EzCabinet admin password**
Preheader: Use this link to choose a new password. It works once, for one hour.

> **Reset your password**
>
> Hi {name},
>
> Someone asked to reset the password on your EzCabinet admin account. Choose
> a new one with the button below.
>
> [ Choose a new password ]
>
> *This link works once, for one hour. You will still need your authenticator
> code to sign in. If this wasn't you, ignore this email. Nothing has changed.*

### C. Customer sign-in code

No button and no link: a link would open in the mail app's own browser, where
passkeys do not work.

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | {code} is your EzCabinet sign-in code | {code} ialah kod log masuk EzCabinet anda | {code} 是您的 EzCabinet 登录验证码 |
| Heading | Your sign-in code | Kod log masuk anda | 您的登录验证码 |
| Body | Type this code into the page where you asked for it: | Taip kod ini pada halaman tempat anda memintanya: | 请在您申请验证码的页面输入： |
| After the code | It works once, for 10 minutes. | Kod ini sah untuk satu kali guna, selama 10 minit. | 验证码仅可使用一次，10 分钟内有效。 |
| Footnote | If you didn't ask for this, ignore this email. Nobody can sign in without the code, and we will never ask you for it by phone or WhatsApp. | Jika anda tidak memintanya, abaikan e-mel ini. Tiada sesiapa boleh log masuk tanpa kod ini, dan kami tidak akan sekali-kali memintanya melalui telefon atau WhatsApp. | 如果不是您本人申请，请忽略此邮件。没有验证码，任何人都无法登录；我们绝不会通过电话或 WhatsApp 向您索取验证码。 |

"10" is filled from the sign-in spec's lifetime, not typed into the copy.

### D. Order placed (always)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | We've got your order {ref} | Kami telah menerima pesanan anda {ref} | 我们已收到您的订单 {ref} |
| Heading | Thank you, {name} | Terima kasih, {name} | 谢谢您，{name} |
| Body | We've received your order. Here is what you ordered. | Kami telah menerima pesanan anda. Berikut ialah butirannya. | 我们已收到您的订单，明细如下。 |
| Box label | Order number | Nombor pesanan | 订单编号 |
| Box note | Placed {date} | Dibuat pada {date} | 下单日期 {date} |
| Rows | Delivery / Total | Penghantaran / Jumlah | 送货费 / 总计 |
| Bank transfer | To confirm your order, transfer {total} to {bank}, {accountName}, account {accountNumber}. Use {ref} as the reference. | Untuk mengesahkan pesanan anda, pindahkan {total} ke {bank}, {accountName}, akaun {accountNumber}. Gunakan {ref} sebagai rujukan. | 请将 {total} 转账至 {bank}，{accountName}，账号 {accountNumber}，并以 {ref} 作为付款参考，以确认您的订单。 |
| Online payment | Your order is confirmed once your payment goes through. We'll email your receipt when it does. | Pesanan anda disahkan sebaik sahaja bayaran anda berjaya. Kami akan menghantar resit melalui e-mel selepas itu. | 付款成功后，您的订单即获确认，届时我们会通过电子邮件发送收据。 |
| Address line | Delivering to: {siteAddress} | Dihantar ke: {siteAddress} | 送货地址：{siteAddress} |
| Button | View your order | Lihat pesanan anda | 查看订单 |

The rows are `summaryLines` and `summaryExtras` of the stored breakdown — the
lines the order page shows — then delivery, then the total. Exactly one
of the two payment paragraphs appears: bank transfer when
`paymentProvider` is `manual`, else online. An order already paid when the
mail is rendered shows neither; the payment-confirmed mail says it.

### E. Payment confirmed (always). This is the receipt

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Payment received for order {ref} | Bayaran diterima untuk pesanan {ref} | 订单 {ref} 已收到付款 |
| Heading | Payment received | Bayaran diterima | 已收到付款 |
| Body | We've received {total} for order {ref}. Thank you. | Kami telah menerima {total} untuk pesanan {ref}. Terima kasih. | 我们已收到订单 {ref} 的款项 {total}，谢谢。 |
| Rows | Cabinets / Delivery / Paid | Kabinet / Penghantaran / Dibayar | 橱柜 / 送货费 / 已付 |
| Paid line | Paid on {date} | Dibayar pada {date} | 付款日期 {date} |
| Next | What happens next: we'll contact you to arrange a site re-measure, then start making your cabinets. Delivery is normally within 4 to 6 weeks of the re-measure. | Langkah seterusnya: kami akan menghubungi anda untuk mengatur ukur semula di tapak, kemudian mula membuat kabinet anda. Penghantaran biasanya dalam masa 4 hingga 6 minggu selepas ukur semula. | 接下来：我们会联系您安排到场重新测量，然后开始制作您的橱柜。一般在重新测量后 4 至 6 周内送货。 |
| Button | View your order | Lihat pesanan anda | 查看订单 |

### F. Refunded (always)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Your refund for order {ref} | Bayaran balik untuk pesanan {ref} | 订单 {ref} 的退款 |
| Heading | Your order has been refunded | Bayaran pesanan anda telah dikembalikan | 您的订单已退款 |
| Body | Order {ref} has been cancelled and {total} has been sent back to you. It can take a few working days to show in your account. | Pesanan {ref} telah dibatalkan dan {total} telah dikembalikan kepada anda. Ia mungkin mengambil beberapa hari bekerja untuk dipaparkan dalam akaun anda. | 订单 {ref} 已取消，{total} 已退还给您。款项可能需要几个工作日才会显示在您的账户中。 |
| Button | View your order | Lihat pesanan anda | 查看订单 |

### G. Production stage (WhatsApp off)

`{stage}` is the dictionary's existing stage label for the order's locale.

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Order {ref}: {stage} | Pesanan {ref}: {stage} | 订单 {ref}：{stage} |
| Heading | An update on your cabinets | Kemas kini kabinet anda | 您的橱柜进度更新 |
| Body | Your order {ref} has moved to a new step. | Pesanan anda {ref} telah beralih ke langkah baharu. | 您的订单 {ref} 已进入新的步骤。 |
| Box label | Current step | Langkah semasa | 当前步骤 |
| Button | View progress | Lihat kemajuan | 查看进度 |

### H. Delivery booked (WhatsApp off)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Delivery booked for order {ref} | Penghantaran ditempah untuk pesanan {ref} | 订单 {ref} 已安排送货 |
| Heading | Your delivery is booked | Penghantaran anda telah ditempah | 您的送货已安排 |
| Body | Your order {ref} is ready and delivery is booked with {carrier}. | Pesanan anda {ref} telah siap dan penghantaran ditempah dengan {carrier}. | 您的订单 {ref} 已备妥，并已安排由 {carrier} 送货。 |
| Box label | Tracking number | Nombor penjejakan | 追踪号码 |
| Button | Track delivery | Jejak penghantaran | 追踪送货 |

A manual carrier has no tracking number, so the box is left out, where
WhatsApp repeats the order reference.

### I. Picked up (WhatsApp off)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Order {ref} is on its way | Pesanan {ref} dalam perjalanan | 订单 {ref} 正在运送途中 |
| Heading | On its way | Dalam perjalanan | 正在运送途中 |
| Body | Your order {ref} has been picked up and is on its way to {siteAddress}. | Pesanan anda {ref} telah diambil dan sedang dalam perjalanan ke {siteAddress}. | 您的订单 {ref} 已取货，正送往 {siteAddress}。 |
| Button | Track delivery | Jejak penghantaran | 追踪送货 |

### J. Delivered (WhatsApp off)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | Order {ref} has been delivered | Pesanan {ref} telah dihantar | 订单 {ref} 已送达 |
| Heading | Delivered | Telah dihantar | 已送达 |
| Body | Your order {ref} has been delivered. Thank you for choosing EzCabinet. | Pesanan anda {ref} telah dihantar. Terima kasih kerana memilih EzCabinet. | 您的订单 {ref} 已送达。感谢您选择 EzCabinet。 |
| Footnote | If anything arrived damaged, tell us within 7 days, with photos. | Jika ada yang rosak semasa tiba, maklumkan kami dalam masa 7 hari, bersama gambar. | 如有任何损坏，请在 7 天内附上照片告知我们。 |
| Button | View delivery | Lihat penghantaran | 查看送货详情 |

### K. Delivery failed (WhatsApp off)

| | en | ms | zh |
| --- | --- | --- | --- |
| Subject | We couldn't deliver order {ref} | Kami tidak dapat menghantar pesanan {ref} | 订单 {ref} 未能送达 |
| Heading | We couldn't complete your delivery | Kami tidak dapat menyelesaikan penghantaran anda | 我们未能完成送货 |
| Body | We weren't able to deliver order {ref}. Our team will contact you to arrange a new time. You don't need to do anything. | Kami tidak dapat menghantar pesanan {ref}. Pasukan kami akan menghubungi anda untuk mengatur masa baharu. Anda tidak perlu berbuat apa-apa. | 我们未能送达订单 {ref}。我们的团队会联系您另约时间，您无需采取任何行动。 |
| Button | View delivery | Lihat penghantaran | 查看送货详情 |

### Shared lines

| | en | ms | zh |
| --- | --- | --- | --- |
| Link fallback | If the button doesn't work, paste this link into your browser: | Jika butang tidak berfungsi, tampal pautan ini ke dalam pelayar anda: | 如果按钮无法使用，请将此链接粘贴到浏览器： |
| Questions | Questions? Reply to this email or call {phone}. | Ada soalan? Balas e-mel ini atau hubungi {phone}. | 有疑问？请回复此邮件或致电 {phone}。 |
| Service line | This is a service email about your order, so it can't be unsubscribed from. | Ini ialah e-mel perkhidmatan tentang pesanan anda, jadi ia tidak boleh dihentikan langganannya. | 这是与您订单相关的服务邮件，因此无法退订。 |

## Components

| Unit | Does |
| --- | --- |
| `lib/email/layout.ts` | `renderEmail`: blocks to `{ html, text }`, escaping included |
| `lib/email/templates/*.ts` | Eleven pure functions, one per mail |
| `lib/email/copy.ts` | Mail wording in three languages |
| `lib/email/orderMail.ts` | Loads the order for an outbox row, renders and sends |
| `lib/whatsapp/templates.ts` | `draftsFor`: the overlap rule, one place |
| `lib/whatsapp/outbox.ts` | `flush` sends by channel |
| `prisma` | `Notification.channel`, a hand-written migration (known issue 12) |
| `scripts/preview-emails.ts` | Writes every mail in every language to a folder, from fixtures |

`lib/email.ts` gains `emailConfigured()`; `sendEmail` is unchanged.

## Before go-live

These are not built here, and each one is now printed in mail a customer keeps:

- `WORKSHOP_ADDRESS`, `WORKSHOP_PHONE` and `BANK_TRANSFER` are placeholders.
- "Reply to this email" needs `EMAIL_FROM` to be a mailbox someone reads, or a
  `reply_to` added to `sendEmail`.
- The ms and zh wording needs a native read, as the WhatsApp templates do.
- The privacy notice (`/[lang]/privacy`, a draft for counsel) gains a line:
  order emails go to every customer, and Resend processes them.
- SPF, DKIM and DMARC on the sending domain, as the sign-in spec already asks.
- The "4 to 6 weeks" and "7 days" lines repeat `/terms` and `/refunds`. No
  shared constant exists; whoever changes one changes the other.

## Limits, stated plainly

- At-least-once, like WhatsApp: a send that succeeds and then fails to record
  is sent again on the next flush. A duplicate receipt is accepted.
- A receipt is rendered from the order as it stands when the mail goes out. A
  customer who corrects their address in the minute before a retry sees the
  corrected one.
- Mail that Resend accepts and the mailbox rejects is not seen. No bounce
  webhook is built.
- Once WhatsApp is live, a customer with it on gets no stage or delivery mail,
  even if their own WhatsApp messages are failing.
- The order-placed mail goes out before an online payment is attempted, so its
  wording promises nothing about that payment.

## Testing

- `renderEmail`: a hostile value (`<script>`, quotes, `&`) is escaped in HTML
  and left alone in text; text and HTML carry the same link; a mail with no
  button renders no fallback line.
- Each template renders for en, ms and zh with no unfilled `{placeholder}`.
- `draftsFor` over every kind, with opt-in on and off, yields exactly the rows
  the overlap rule states, with distinct dedupe keys.
- `flush`: email rows go out with WhatsApp unconfigured; they stay pending
  with Resend unconfigured; a failed send is retried and a sent one is not.
- `PATCH /api/orders/[token]`: an email change re-points pending email rows
  and leaves WhatsApp rows alone.
- By hand: `pnpm tsx scripts/preview-emails.ts <dir>`, then open the files in
  light and dark at 375 px and 600 px. With `RESEND_API_KEY` set, one order
  with the WhatsApp box and one without, through paid, a stage, cancel and
  refund, read in Gmail, Outlook and iOS Mail.

## Out of scope

Marketing mail, unsubscribe and preferences, bounce handling, mail to staff
about new orders, attaching the design image (capture is not built), a PDF
receipt, and the "save & share" mail.
