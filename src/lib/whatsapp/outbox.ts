import "server-only";
import { after } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/catalogue/db";
import { getDictionary } from "@/lib/copy/dictionary";
import { fill } from "@/lib/copy/fill";
import { emailConfigured } from "@/lib/email";
import { sendOrderEmail } from "@/lib/email/orderMail";
import {
	nextState,
	type SendResult,
	sendMessage,
	whatsappConfigured,
} from "./send";
import {
	localeOf,
	type NotificationDraft,
	type TemplateVars,
	templatePayload,
	textPayload,
} from "./templates";

/**
 * The notification outbox: WhatsApp messages and order emails.
 *
 * A trigger calls `enqueue` inside the transaction that changes the state it
 * reports, so "the order is paid" and "the customer must be told" commit
 * together. `flushSoon` sends after the response; the tracking cron calls
 * `flush()` to retry whatever is still pending.
 */

const EXPIRE_MS = 48 * 60 * 60 * 1000;
const SETTLE_MS = 60 * 1000;
const MAX_PER_RUN = 50;
const AUTO_REPLY_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Meta refusing the template itself — wrong name, language or parameters.
 * Every order after this one fails the same way until the template or the code
 * is fixed, so it is alerted on its own `type`, not buried in send failures.
 */
const TEMPLATE_CODES = new Set([132000, 132001, 132012, 132018]);
/** `classify` writes errors as `<code>: <message>`. */
const errorCode = (error: string) => Number(error.split(":")[0]);

/** Insert the drafts that are not null; a repeated `dedupeKey` is skipped. */
export async function enqueue(
	tx: Prisma.TransactionClient,
	drafts: (NotificationDraft | null)[],
): Promise<string[]> {
	const data = drafts
		.filter((draft): draft is NotificationDraft => draft !== null)
		.map((draft) => ({ ...draft, vars: draft.vars as never }));
	if (data.length === 0) return [];
	const rows = await tx.notification.createManyAndReturn({
		data,
		skipDuplicates: true,
		select: { id: true },
	});
	return rows.map((row) => row.id);
}

/**
 * Send pending rows: the given ids, or — from the cron — everything pending
 * that nobody has touched for a minute.
 *
 * Each row is claimed by bumping `attempts` conditionally before it is sent,
 * so the post-response flush and a cron run cannot both send it. The cron's
 * one-minute settle keeps it off rows a request is still flushing.
 *
 * Each channel is read and sent on its own: a channel that is not configured
 * is not looked at — its rows wait, unclaimed and unexpired, until it is —
 * and one that stops answering mid-run holds its own rows without taking a
 * place in the other's queue. Local dev and preview have neither.
 */
export async function flush(
	ids?: string[],
): Promise<{ sent: number; failed: number }> {
	// Order mail links back to the site; the cron has no request to read an
	// origin from, so without this there is nothing to link to.
	const base = process.env.BETTER_AUTH_URL;
	const channels = [
		...(whatsappConfigured() ? (["WHATSAPP"] as const) : []),
		...(emailConfigured() && base ? (["EMAIL"] as const) : []),
	];
	if (channels.length === 0) {
		// Never a throw — a missing token must not break checkout.
		if (ids?.length) console.warn("No channel configured; left pending");
		return { sent: 0, failed: 0 };
	}

	const now = Date.now();
	await prisma.notification.updateMany({
		where: {
			status: "PENDING",
			channel: { in: channels },
			queuedAt: { lt: new Date(now - EXPIRE_MS) },
		},
		data: { status: "FAILED", lastError: "expired" },
	});

	let sent = 0;
	let failed = 0;
	// ponytail: a send that succeeds and is then followed by a failed DB update
	// (the `notification.update` below) leaves the row PENDING with `attempts`
	// already bumped, so the next flush re-sends it — at-least-once, not
	// exactly-once. Fine for a template message or a receipt; upgrade to a
	// two-phase claim (mark SENDING before the API call, verify before
	// re-sending) if a duplicate ever matters.
	for (const channel of channels) {
		const rows = await prisma.notification.findMany({
			where: {
				channel,
				...(ids
					? { id: { in: ids }, status: "PENDING" }
					: {
							status: "PENDING",
							updatedAt: { lt: new Date(now - SETTLE_MS) },
						}),
			},
			orderBy: { queuedAt: "asc" },
			take: MAX_PER_RUN,
		});

		for (const row of rows) {
			const claimed = await prisma.notification.updateMany({
				where: { id: row.id, status: "PENDING", attempts: row.attempts },
				data: { attempts: { increment: 1 } },
			});
			if (claimed.count === 0) continue;

			const result =
				channel === "EMAIL"
					? await sendMail(row, base as string)
					: await sendMessage(
							templatePayload(
								row.to,
								row.template,
								localeOf(row.locale),
								row.vars as unknown as TemplateVars,
							),
						);
			await prisma.notification.update({
				where: { id: row.id },
				data: nextState(result, row.attempts + 1, new Date()),
			});
			if (result.ok) {
				sent++;
				continue;
			}
			failed++;
			if (result.blocked) {
				// Every row behind this one on the channel would be refused the
				// same way. They stay pending, their tries untouched, and go out
				// on the first run after the token or key is replaced.
				console.error(
					JSON.stringify({
						type:
							channel === "EMAIL"
								? "EMAIL_UNAVAILABLE"
								: "WHATSAPP_TOKEN_INVALID",
						message: result.error,
					}),
				);
				break;
			}
			console.error(
				JSON.stringify(
					channel === "EMAIL"
						? {
								type: "EMAIL_SEND_FAILED",
								notificationId: row.id,
								kind: row.kind,
								message: result.error,
							}
						: {
								type: TEMPLATE_CODES.has(errorCode(result.error))
									? "WHATSAPP_TEMPLATE_REJECTED"
									: "WHATSAPP_SEND_FAILED",
								notificationId: row.id,
								template: row.template,
								retryable: result.retryable,
								message: result.error,
							},
				),
			);
		}
	}
	return { sent, failed };
}

/**
 * One order mail, as the result `nextState` reads. Resend being unreachable
 * or refusing our key is `blocked`, like a dead WhatsApp token: the row keeps
 * its try. A mail has no provider id worth keeping, so `messageId` is null.
 */
async function sendMail(
	row: Parameters<typeof sendOrderEmail>[0],
	base: string,
): Promise<SendResult> {
	// `deliverEmail` never throws, but loading the order can.
	const outcome = await sendOrderEmail(row, base).catch(
		(cause: Error) => cause.message,
	);
	if (outcome === "sent") return { ok: true, messageId: null };
	if (outcome === "unavailable") {
		return {
			ok: false,
			retryable: true,
			blocked: true,
			error: "email service unavailable",
		};
	}
	return {
		ok: false,
		retryable: true,
		error: outcome === "refused" ? "email not sent" : outcome,
	};
}

/** Send these rows once the response is on its way. */
export function flushSoon(ids: string[]): void {
	if (ids.length === 0) return;
	after(() =>
		flush(ids).catch((error) =>
			console.error("WhatsApp flush failed", (error as Error).message),
		),
	);
}

/**
 * Answer someone who wrote to the updates number, at most once a day.
 *
 * Free-form text is allowed here because the customer just opened the 24 h
 * window. What they wrote is not stored — nothing reads it.
 *
 * ponytail: read-then-write throttle; two messages in the same instant can
 * both be answered. Harmless at this volume.
 */
export async function autoReply(phone: string): Promise<void> {
	const sales = process.env.WHATSAPP_SALES_NUMBER ?? "";
	if (!whatsappConfigured() || sales === "") return;

	const last = await prisma.whatsappAutoReply.findUnique({ where: { phone } });
	if (last && Date.now() - last.repliedAt.getTime() < AUTO_REPLY_EVERY_MS) {
		return;
	}
	const now = new Date();
	await prisma.whatsappAutoReply.upsert({
		where: { phone },
		create: { phone, repliedAt: now },
		update: { repliedAt: now },
	});

	const order = await prisma.order.findFirst({
		where: { customerPhone: phone },
		orderBy: { createdAt: "desc" },
		select: { locale: true },
	});
	const t = await getDictionary(localeOf(order?.locale ?? "en"));
	const result = await sendMessage(
		textPayload(
			phone,
			fill(t.whatsapp.autoReply, {
				number: `https://wa.me/${sales.replace(/\D/g, "")}`,
			}),
		),
	);
	if (!result.ok) {
		console.error(
			JSON.stringify({
				type: "WHATSAPP_AUTOREPLY_FAILED",
				message: result.error,
			}),
		);
	}
}
