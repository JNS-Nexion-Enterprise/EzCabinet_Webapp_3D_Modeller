"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth/client";
import { useCopy, useLocale } from "./CopyContext";

const DISMISSED = "ezcabinet.planner.nudgeDismissed";

/**
 * Appears once the customer has placed something worth keeping, and never
 * before: the planner opens with no account because the conversion decision in
 * CLAUDE.md says a customer trades a phone number *after* sinking time into a
 * design, not before seeing the 3D scene.
 *
 * It is a nudge, not a gate. The design is already safe on disk (plannerDraft);
 * this is about the customer knowing they can come back to it.
 *
 * It renders in the flow of the price footer, directly above the quote
 * button, never as a floating layer. It used to be `fixed` against the
 * viewport, which put it exactly on top of the estimated total — the one
 * number the customer is deciding on — and, at z-30, over the breakdown
 * modal too. Being about checkout, beside the checkout button is where it
 * belongs anyway.
 *
 * The action says "Sign in or create an account" and names no provider: it
 * leads to the sign-in page, which offers every way in. The account is
 * made on first use whichever way that is, so signing up and signing in are
 * the same click — and until they click, a visitor is anonymous and nothing
 * can tell a new one from a returning one.
 */
export function SignInNudge({ cabinetCount }: { cabinetCount: number }) {
	const t = useCopy();
	const locale = useLocale();
	const { data: session, isPending } = authClient.useSession();
	const [dismissed, setDismissed] = useState(true);

	useEffect(() => {
		try {
			setDismissed(localStorage.getItem(DISMISSED) === "1");
		} catch {
			setDismissed(false);
		}
	}, []);

	const visible =
		!isPending && !session?.user && !dismissed && cabinetCount > 0;

	// Fire "shown" once per appearance, not on every re-render (session poll,
	// parent update, ...) — a track call in the render body would fire dozens
	// of times per drag.
	useEffect(() => {
		if (visible) track("sign_in_nudge", { action: "shown" });
	}, [visible]);

	if (!visible) return null;

	return (
		<div className="flex flex-col gap-2 rounded-[10px] border border-neutral-200 bg-[#faf9f7] px-3 py-2.5">
			<p className="text-[12px] text-neutral-700 leading-4">{t.signIn.nudge}</p>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<button
					type="button"
					onClick={() => {
						// Fired beside a navigation, so it can be lost — known issue 8.
						track("sign_in_nudge", { action: "accepted" });
						// Read at the click: the planner's URL moves as the customer works.
						const here = `${window.location.pathname}${window.location.search}${window.location.hash}`;
						window.location.assign(
							`/${locale}/sign-in?next=${encodeURIComponent(here)}`,
						);
					}}
					className="whitespace-nowrap rounded-[8px] bg-neutral-900 px-3 py-1.5 font-medium text-[12px] text-white"
				>
					{t.signIn.signInOrCreate}
				</button>
				<button
					type="button"
					onClick={() => {
						track("sign_in_nudge", { action: "dismissed" });
						setDismissed(true);
						try {
							localStorage.setItem(DISMISSED, "1");
						} catch {}
					}}
					className="whitespace-nowrap text-[12px] text-neutral-500 hover:text-neutral-900"
				>
					{t.signIn.nudgeDismiss}
				</button>
			</div>
		</div>
	);
}
