/**
 * A way to reach a person, for the pages a customer lands on when something
 * needs one: a cancelled order, a transfer nobody acknowledged, a delivery on
 * hold. Opens WhatsApp on the sales number with the order reference already
 * typed.
 *
 * Server-only by use: it reads `WHATSAPP_SALES_NUMBER`, the same variable the
 * auto-reply quotes, and renders nothing until EzCabinet has set one.
 */
export function WhatsAppHelp({
	label,
	message,
}: {
	label: string;
	/** Prefilled text — the order reference, so sales knows which order. */
	message: string;
}) {
	const number = (process.env.WHATSAPP_SALES_NUMBER ?? "").replace(/\D/g, "");
	if (!number) return null;
	return (
		<a
			href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex min-h-11 items-center self-start rounded-full border border-[#d4d4d4] bg-white px-[22px] font-medium text-[#404040] text-[13px] hover:border-[#a3a3a3]"
		>
			{label}
		</a>
	);
}
