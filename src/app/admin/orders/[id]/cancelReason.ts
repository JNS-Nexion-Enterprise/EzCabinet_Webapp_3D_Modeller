/** Said on the reason input, and for the server's `reason_required`, which asks the same thing. */
export const REASON_REQUIRED = "Enter a reason for cancelling.";

/** A paid order is owed back money, so cancelling it must say why (`cancelBlock`, `lib/orders/cancel.ts`); an unpaid one needs none. */
export function cancelReasonError(paid: boolean, reason: string) {
	return paid && reason.trim() === "" ? REASON_REQUIRED : null;
}
