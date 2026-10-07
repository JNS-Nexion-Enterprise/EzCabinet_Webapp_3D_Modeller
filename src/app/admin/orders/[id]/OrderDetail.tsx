"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { fetchGuarded, PASSKEY_FAILED } from "@/components/admin/stepUp";
import { fieldClass } from "@/components/admin/styles";
import { Spinner } from "@/components/Spinner";
import type {
	NotificationKind,
	NotificationStatus,
	ProductionStage,
} from "@/generated/prisma/enums";
import { en } from "@/lib/copy/en";
import type { DeliveryStatusName } from "@/lib/logistics/types";
import type { RefundState } from "@/lib/orders/refund";
import { nextStage } from "@/lib/orders/stage";
import type { SummaryLine } from "@/lib/orders/summary";
import { shortTime } from "../../logistics/time";
import { STATUS_LABEL } from "../../logistics/tracking";
import {
	ORDER_STATUS_LABEL,
	ORDER_STATUS_TONE,
	type OrderStatusName,
	rm,
} from "../status";

export type OrderView = {
	id: string;
	ref: string;
	publicToken: string;
	status: OrderStatusName;
	createdAt: string;
	customerName: string;
	customerPhone: string;
	customerEmail: string | null;
	siteAddress: string;
	addressNotes: string | null;
	roomLabel: string;
	finishLabel: string;
	lines: SummaryLine[];
	cabinetsRm: number;
	deliveryRm: number;
	totalRm: number;
	paymentProvider: string;
	paymentRef: string | null;
	paidAt: string | null;
	paidByName: string | null;
	cancelledAt: string | null;
	cancelledByName: string | null;
	cancelReason: string | null;
	refundedAt: string | null;
	refundedByName: string | null;
	refundRef: string | null;
	refundRequestedAt: string | null;
	refundError: string | null;
	/** `refundState` (`lib/orders/refund.ts`), derived on the server. */
	refundState: RefundState;
	/** The unanswered gateway refund is old enough to repeat. */
	canAskAgain: boolean;
	deliveries: { id: string; number: number; status: DeliveryStatusName }[];
	productionStage: ProductionStage | null;
	whatsappOptIn: boolean;
	notifications: {
		id: string;
		kind: NotificationKind;
		stage: ProductionStage | null;
		status: NotificationStatus;
		lastError: string | null;
		createdAt: string;
	}[];
};

const FOCUS =
	"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-900";
const CARD =
	"flex flex-col gap-3 rounded-[14px] border border-neutral-200 bg-white px-5 py-[18px]";
const EYEBROW =
	"font-semibold text-[12px] text-neutral-600 uppercase tracking-[.06em]";
const CHIP = `min-h-9 rounded-full border border-neutral-200 bg-white px-[15px] py-2 font-medium text-[12px] text-neutral-600 hover:bg-[#f8f7f4] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const PRIMARY = `inline-flex min-h-9 items-center self-start rounded-full bg-[#1f5138] px-[18px] py-2.5 font-semibold text-[12px] text-white hover:bg-[#17402c] disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

const STAGE_LABEL = en.order.stages;

const KIND_LABEL: Record<NotificationKind, string> = {
	ORDER_PLACED: "Order placed",
	PAYMENT_CONFIRMED: "Payment confirmed",
	STAGE: "Production step",
	DELIVERY_BOOKED: "Delivery booked",
	PICKED_UP: "Picked up",
	DELIVERED: "Delivered",
	DELIVERY_FAILED: "Delivery failed",
	ORDER_REFUNDED: "Order refunded",
};

/** What a route's refusal means to the person pressing the button. */
const ACTION_ERROR: Record<string, string> = {
	not_next_stage:
		"Someone else moved this order on. Reload to see where it is.",
	changed: "Someone else moved this order on. Reload to see where it is.",
	not_awaiting_payment:
		"This order is no longer awaiting payment. Reload to see where it is.",
	already_cancelled: "This order is already cancelled. Reload to see it.",
	in_production:
		"Production has started, so this order can no longer be cancelled.",
	has_delivery: "Cancel this order's delivery first.",
	reason_required: "Give a reason for cancelling a paid order.",
	not_refundable:
		"This order is no longer waiting on a refund. Reload to see where it is.",
	manual_order:
		"This order was paid by bank transfer. Send the money back, then mark it refunded.",
	not_configured:
		"This order's payment gateway is not connected, so it cannot be refunded from here.",
	gateway_refused:
		"The payment gateway refused the refund. Nothing was sent; the reason is on the order.",
	not_acknowledged:
		"The payment gateway did not answer, so the refund may or may not have gone through. Ask again in a few minutes: it repeats the same request and cannot refund twice.",
};

const MESSAGE_STATUS: Record<NotificationStatus, string> = {
	PENDING: "Queued",
	SENT: "Sent",
	DELIVERED: "Delivered",
	READ: "Read",
	FAILED: "Failed",
};

/**
 * One order: what was bought, who for, and its admin moves — mark it paid,
 * advance production, create its delivery.
 */
export function OrderDetail({
	order,
	canRefund,
}: {
	order: OrderView;
	/** `orders:refund` — a superadmin. The route checks it again. */
	canRefund: boolean;
}) {
	const router = useRouter();
	const [paymentRef, setPaymentRef] = useState("");
	const [cancelReason, setCancelReason] = useState("");
	const [refundRef, setRefundRef] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirming, setConfirming] = useState<Confirm | null>(null);
	const [cancelling, setCancelling] = useState(false);

	/** A step-up guarded action; the dialog shows whatever this returns. */
	async function guarded(
		action: "paid" | "cancel" | "refunded" | "refund",
		body: unknown,
	): Promise<string | null> {
		const res = await fetchGuarded(`/api/admin/orders/${order.id}/${action}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res) return PASSKEY_FAILED;
		// Even a refusal can have moved the order: a refused refund leaves its
		// reason on it.
		router.refresh();
		if (res.ok) return null;
		const payload = await res.json().catch(() => null);
		return ACTION_ERROR[payload?.error] ?? "Could not update this order.";
	}

	async function post(url: string, body: unknown, key: string) {
		setBusy(key);
		setError(null);
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		});
		setBusy(null);
		if (!res.ok) {
			const payload = await res.json().catch(() => null);
			setError(ACTION_ERROR[payload?.error] ?? "Could not update this order.");
			return;
		}
		router.refresh();
	}

	const upcoming = nextStage(order.productionStage);

	const awaiting = order.status === "AWAITING_PAYMENT";
	const paid = order.status === "PAID";
	const hasLiveDelivery = order.deliveries.some(
		(d) => d.status !== "CANCELLED" && d.status !== "FAILED",
	);
	// Mirrors `cancelBlock` (`lib/orders/cancel.ts`); the server decides.
	const canCancelPaid =
		paid && order.productionStage === null && !hasLiveDelivery;
	const refund = order.refundState;
	const refundDue =
		refund === "due" || refund === "unacknowledged" || refund === "pending";
	const provider = order.paymentProvider;
	const throughGateway = refund === "due" && provider !== "manual" && canRefund;
	const askAgain = refund === "unacknowledged" && canRefund;
	/** The request is the same either way; only the wording differs. */
	const confirmRefund = (again: boolean) =>
		setConfirming({
			title: again
				? `Ask ${provider} again?`
				: `Refund ${rm(order.totalRm)} through ${provider}?`,
			body: again
				? "The first request was never acknowledged. Asking again cannot refund twice: it repeats the same request."
				: `${rm(order.totalRm)} goes back to ${order.customerName}, to the method they paid with. This cannot be undone.`,
			confirmLabel: again ? "Ask again" : `Refund ${rm(order.totalRm)}`,
			danger: true,
			stepUp: true,
			run: () => guarded("refund", undefined),
		});

	return (
		<main className="mx-auto flex w-full max-w-[1080px] flex-col gap-[18px] px-7 pt-7 pb-16">
			<ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />
			<ConfirmDialog
				// Built on each render, not stored: `run` must read the reason as
				// typed after the dialog opened.
				confirm={
					cancelling
						? {
								title: `Cancel order ${order.ref}?`,
								body: paid
									? `${rm(order.totalRm)} will be owed back to ${order.customerName}. The order cannot be reopened; the customer would have to order again.`
									: `${order.customerName}'s order for ${rm(order.totalRm)} will be cancelled. It cannot be reopened; the customer would have to order again.`,
								confirmLabel: "Cancel order",
								danger: true,
								stepUp: true,
								run: () =>
									guarded("cancel", { reason: cancelReason.trim() || null }),
							}
						: null
				}
				onClose={() => setCancelling(false)}
				blocked={paid && cancelReason.trim() === ""}
			>
				{paid && (
					<label className="flex flex-col gap-1 text-[12px] text-neutral-500">
						Reason for cancelling (kept on the order)
						<input
							className={fieldClass(false, FOCUS)}
							maxLength={300}
							value={cancelReason}
							onChange={(e) => setCancelReason(e.target.value)}
						/>
					</label>
				)}
			</ConfirmDialog>
			{error && (
				<p
					role="alert"
					className="rounded-[10px] bg-[#fbf1ee] px-3.5 py-[11px] text-[#7a2c1c] text-[13px]"
				>
					{error}
				</p>
			)}

			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="mb-1 font-semibold text-[22px]">
						Order {order.ref} — {order.customerName}
					</h1>
					<p className="text-[13px] text-neutral-500">
						Placed {shortTime(order.createdAt)} · {order.roomLabel} ·{" "}
						{order.finishLabel}
					</p>
				</div>
				<span
					className={`rounded-full px-3 py-1.5 font-semibold text-[11px] ${ORDER_STATUS_TONE[order.status]}`}
				>
					{ORDER_STATUS_LABEL[order.status]}
				</span>
			</div>

			<div className="flex flex-wrap items-start gap-[18px]">
				<div className="flex min-w-0 flex-[3_1_440px] flex-col gap-[18px]">
					<section className={CARD}>
						<h2 className={EYEBROW}>What was ordered</h2>
						<ul className="flex flex-col">
							{order.lines.map((line) => (
								<li
									key={line.name}
									className="flex justify-between gap-3 border-[#f1f0ed] border-b py-2 text-[13px]"
								>
									<span>
										{line.name}{" "}
										<span className="text-[#8a857c]">× {line.qty}</span>
									</span>
									<span className="shrink-0 tabular-nums">
										{rm(line.amountRm)}
									</span>
								</li>
							))}
						</ul>
						<div className="flex flex-col gap-1 text-[13px]">
							<div className="flex justify-between text-neutral-500">
								<span>Cabinets</span>
								<span className="tabular-nums">{rm(order.cabinetsRm)}</span>
							</div>
							<div className="flex justify-between text-neutral-500">
								<span>Delivery</span>
								<span className="tabular-nums">{rm(order.deliveryRm)}</span>
							</div>
							<div className="flex justify-between border-[#ecebe7] border-t pt-2 font-semibold">
								<span>Total</span>
								<span className="tabular-nums">{rm(order.totalRm)}</span>
							</div>
						</div>
					</section>

					<section className={CARD}>
						<h2 className={EYEBROW}>Payment</h2>
						{awaiting && (
							<>
								{order.paymentProvider === "manual" ? (
									<p className="text-[13px] text-neutral-600">
										Waiting for a bank transfer of {rm(order.totalRm)} with{" "}
										<span className="font-medium">{order.ref}</span> as the
										reference. Mark it paid once it shows in the account.
									</p>
								) : (
									<p className="text-[13px] text-neutral-600">
										Waiting for {order.paymentProvider} to confirm{" "}
										{rm(order.totalRm)}
										{order.paymentRef ? ` (${order.paymentRef})` : ""}. It marks
										itself paid when the payment lands. Mark it paid by hand
										only after checking the payment in the gateway's dashboard.
									</p>
								)}
								<div className="flex flex-wrap gap-3">
									<label className="flex max-w-[260px] flex-1 flex-col gap-1 text-[12px] text-neutral-500">
										Bank reference (optional)
										<input
											className={fieldClass(false, FOCUS)}
											value={paymentRef}
											onChange={(e) => setPaymentRef(e.target.value)}
										/>
									</label>
								</div>
								<div className="flex flex-wrap gap-2">
									<button
										type="button"
										className={PRIMARY}
										disabled={busy !== null}
										onClick={() =>
											setConfirming({
												title: `Mark ${order.ref} as paid?`,
												body: `Only once ${rm(order.totalRm)} shows in the account. The customer is told their payment arrived, and this cannot be undone here.`,
												confirmLabel: "Mark paid",
												stepUp: true,
												run: () =>
													guarded("paid", {
														paymentRef: paymentRef.trim() || null,
													}),
											})
										}
									>
										Mark paid
									</button>
									<button
										type="button"
										className={CHIP}
										disabled={busy !== null}
										onClick={() => setCancelling(true)}
									>
										Cancel order
									</button>
								</div>
							</>
						)}
						{paid && (
							<p className="text-[13px] text-neutral-600">
								Paid {order.paidAt ? shortTime(order.paidAt) : ""}
								{order.paidByName ? ` · marked by ${order.paidByName}` : ""}
								{order.paymentRef ? ` · ref ${order.paymentRef}` : ""} ·{" "}
								{order.paymentProvider}
							</p>
						)}
						{canCancelPaid && (
							<button
								type="button"
								className={`${CHIP} self-start`}
								disabled={busy !== null}
								onClick={() => setCancelling(true)}
							>
								Cancel order and refund
							</button>
						)}
						{order.status === "CANCELLED" && (
							<p className="text-[13px] text-neutral-500">
								{order.paidAt
									? "Cancelled after payment"
									: "Cancelled before payment"}
								{order.cancelledAt ? ` · ${shortTime(order.cancelledAt)}` : ""}
								{order.cancelledByName ? ` · by ${order.cancelledByName}` : ""}
								{order.cancelReason ? ` · ${order.cancelReason}` : ""}
							</p>
						)}
						{order.refundError && (
							<p
								role="alert"
								className="rounded-[10px] bg-[#fbf1ee] px-3 py-2.5 text-[#7a2c1c] text-[13px]"
							>
								Last refund attempt: {order.refundError}
							</p>
						)}
						{refundDue && (
							<div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
								<p className="font-semibold text-[13px] text-amber-900">
									Refund due: {rm(order.totalRm)}
								</p>
								{refund === "due" && (
									<p className="text-[12px] text-amber-900">
										Paid by {provider}
										{order.paymentRef ? ` (${order.paymentRef})` : ""}.{" "}
										{throughGateway
											? `Send it back through ${provider}, or refund it by hand and record it here.`
											: provider === "manual"
												? "Refund it by bank transfer, then record it here."
												: `A superadmin can send it back through ${provider}. Otherwise refund it by bank transfer or in the gateway's dashboard, then record it here.`}
									</p>
								)}
								{refund === "unacknowledged" && (
									<p className="text-[12px] text-amber-900">
										{provider} has not acknowledged the refund requested
										{order.refundRequestedAt
											? ` ${shortTime(order.refundRequestedAt)}`
											: ""}
										{order.refundedByName ? ` by ${order.refundedByName}` : ""}.
										It may or may not have gone through: check the gateway's
										dashboard before refunding by hand.
										{askAgain && !order.canAskAgain
											? " You can ask again two minutes after the request; reload this page then."
											: ""}
									</p>
								)}
								{refund === "pending" && (
									<p className="text-[12px] text-amber-900">
										Waiting for {provider} to confirm ({order.refundRef}). FPX
										refunds take a few working days; this marks itself refunded.
									</p>
								)}
								{throughGateway && (
									<button
										type="button"
										className={PRIMARY}
										disabled={busy !== null}
										onClick={() => confirmRefund(false)}
									>
										Refund {rm(order.totalRm)} through {provider}
									</button>
								)}
								{askAgain && order.canAskAgain && (
									<button
										type="button"
										className={PRIMARY}
										disabled={busy !== null}
										onClick={() => confirmRefund(true)}
									>
										Ask again
									</button>
								)}
								{/* The manual way out. Not while the gateway is processing a
								    refund: that one records itself. */}
								{refund !== "pending" && (
									<>
										<label className="flex max-w-[260px] flex-col gap-1 text-[12px] text-amber-900">
											Refund reference (optional)
											<input
												className={fieldClass(false, FOCUS)}
												maxLength={120}
												value={refundRef}
												onChange={(e) => setRefundRef(e.target.value)}
											/>
										</label>
										<button
											type="button"
											className={
												throughGateway || askAgain
													? `${CHIP} self-start`
													: PRIMARY
											}
											disabled={busy !== null}
											onClick={() =>
												setConfirming({
													title: `Mark ${order.ref} as refunded?`,
													body: `Only once ${rm(order.totalRm)} has gone back to ${order.customerName} outside this app. The customer is told it was refunded, and this cannot be undone here.`,
													confirmLabel: "Mark refunded",
													stepUp: true,
													run: () =>
														guarded("refunded", {
															refundRef: refundRef.trim() || null,
														}),
												})
											}
										>
											Mark refunded
										</button>
									</>
								)}
							</div>
						)}
						{order.refundedAt && (
							<p className="text-[13px] text-neutral-600">
								Refunded {shortTime(order.refundedAt)}
								{order.refundedByName ? ` · by ${order.refundedByName}` : ""}
								{order.refundRef ? ` · ref ${order.refundRef}` : ""}
							</p>
						)}
					</section>

					{paid && (
						<section className={CARD}>
							<h2 className={EYEBROW}>Production</h2>
							<p className="text-[13px] text-neutral-600">
								{order.productionStage
									? `Now at: ${STAGE_LABEL[order.productionStage]}`
									: "Not started."}
								{order.whatsappOptIn
									? " Each step is sent to the customer on WhatsApp."
									: ""}
							</p>
							{upcoming && (
								<button
									type="button"
									className={PRIMARY}
									disabled={busy !== null}
									onClick={() =>
										post(
											`/api/admin/orders/${order.id}/stage`,
											{ stage: upcoming },
											"stage",
										)
									}
								>
									{busy === "stage" && <Spinner />}
									{busy === "stage"
										? "Saving…"
										: `Advance to: ${STAGE_LABEL[upcoming]}`}
								</button>
							)}
						</section>
					)}

					<section className={CARD}>
						<h2 className={EYEBROW}>Deliveries</h2>
						{order.deliveries.length === 0 ? (
							<p className="text-[13px] text-neutral-500">
								{paid
									? "No delivery yet. Create one — the customer, address and cabinets are filled in for you."
									: "A delivery can be created once the order is paid."}
							</p>
						) : (
							<ul className="flex flex-col gap-1.5">
								{order.deliveries.map((delivery) => (
									<li key={delivery.id}>
										<Link
											href={`/admin/logistics/${delivery.id}`}
											className={`text-[13px] underline ${FOCUS}`}
										>
											Delivery #{delivery.number} ·{" "}
											{STATUS_LABEL[delivery.status]}
										</Link>
									</li>
								))}
							</ul>
						)}
						{paid && (
							<Link
								href={`/admin/logistics?fromOrder=${order.id}`}
								className={PRIMARY}
							>
								Create delivery →
							</Link>
						)}
					</section>
				</div>

				<aside className="flex min-w-0 flex-[1_1_268px] flex-col gap-3.5 self-start">
					<section className={CARD}>
						<h2 className={EYEBROW}>Customer</h2>
						{[
							["Name", order.customerName],
							["Phone", order.customerPhone],
							["Email", order.customerEmail ?? "not given"],
							["Deliver to", order.siteAddress],
							["Access", order.addressNotes ?? "none given"],
						].map(([label, value]) => (
							<div key={label} className="flex flex-col gap-0.5">
								<span className="text-[#8a857c] text-[11px]">{label}</span>
								<span className="wrap-anywhere text-[12px] text-neutral-700 leading-[17px]">
									{value}
								</span>
							</div>
						))}
						<a
							href={`/en/order/${order.publicToken}`}
							target="_blank"
							rel="noreferrer"
							className={`text-[12px] underline ${FOCUS}`}
						>
							Customer's confirmation page
						</a>
					</section>

					<section className={CARD}>
						<h2 className={EYEBROW}>WhatsApp</h2>
						{!order.whatsappOptIn ? (
							<p className="text-[12px] text-neutral-500">
								Customer did not opt in to WhatsApp.
							</p>
						) : order.notifications.length === 0 ? (
							<p className="text-[12px] text-neutral-500">No messages yet.</p>
						) : (
							<ul className="flex flex-col gap-2">
								{order.notifications.map((n) => (
									<li key={n.id} className="flex flex-col gap-0.5 text-[12px]">
										<span className="text-neutral-700">
											{KIND_LABEL[n.kind]}
											{n.stage ? ` · ${STAGE_LABEL[n.stage]}` : ""}
										</span>
										<span
											className={
												n.status === "FAILED"
													? "text-[#7a2c1c]"
													: "text-[#8a857c]"
											}
										>
											{MESSAGE_STATUS[n.status]} · {shortTime(n.createdAt)}
											{n.lastError ? ` · ${n.lastError}` : ""}
										</span>
										{n.status === "FAILED" && (
											<button
												type="button"
												className={`${CHIP} self-start`}
												disabled={busy !== null}
												onClick={() =>
													post(
														`/api/admin/orders/${order.id}/notifications/${n.id}/resend`,
														{},
														n.id,
													)
												}
											>
												{busy === n.id && <Spinner />}
												{busy === n.id ? "Resending…" : "Resend"}
											</button>
										)}
									</li>
								))}
							</ul>
						)}
					</section>
				</aside>
			</div>
		</main>
	);
}
