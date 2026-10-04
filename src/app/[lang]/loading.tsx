import { Spinner } from "@/components/Spinner";

/**
 * Shown the moment a link is tapped, while a database-backed page renders.
 * Without it the old page just sits there, which on mobile data reads as a
 * tap that missed.
 */
export default function Loading() {
	return (
		<div
			role="status"
			aria-busy="true"
			className="flex min-h-[60vh] items-center justify-center text-[22px] text-neutral-500"
		>
			<Spinner />
		</div>
	);
}
