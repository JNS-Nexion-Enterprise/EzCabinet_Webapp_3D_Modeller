"use client";

import { type FormEvent, useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import type { Dictionary } from "@/lib/copy/en";

type Message = "nameRequired" | "nameRefused" | "failed";

/**
 * The server's answer as a key of `welcome` in the dictionary — or `signIn`
 * for a session that lapsed while the form was open, which is not an error
 * the customer can act on here.
 */
export function nameMessage(
	status: number,
	error: unknown,
): Message | "signIn" | null {
	if (status === 200) return null;
	if (status === 401) return "signIn";
	if (error === "name_required") return "nameRequired";
	if (error === "name_refused") return "nameRefused";
	return "failed";
}

/**
 * One required field. The server decides what is a name
 * (`lib/auth/customerName.ts`); this only shows its answer, so the two cannot
 * drift. On success a full navigation, so the next page — usually the passkey
 * step — renders against the account as it now is.
 */
export function WelcomeForm({
	next,
	signIn,
	copy,
}: {
	/** Already checked by `safeWelcomeNext`. */
	next: string;
	/** The sign-in page, with `next` carried, for a session that lapsed. */
	signIn: string;
	copy: Dictionary["welcome"];
}) {
	const [name, setName] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<Message | null>(null);
	// `busy` is state, so two submits in one tick would both read it false.
	const inFlight = useRef(false);

	async function submit(e: FormEvent) {
		e.preventDefault();
		if (inFlight.current) return;
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: Message | "signIn" | null = "failed";
		try {
			const res = await fetch("/api/account/name", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name }),
			});
			const body = await res.json().catch(() => null);
			// 409: the name was set in another tab. Nothing is owed; carry on.
			failure =
				res.status === 409 ? null : nameMessage(res.status, body?.error);
		} catch {
			// The request never left the phone.
		}
		if (failure === "signIn") {
			// The code form leads back through this page, so nothing is skipped.
			window.location.assign(signIn);
			return;
		}
		if (failure) {
			inFlight.current = false;
			setBusy(false);
			setMessage(failure);
			return;
		}
		// `busy` stays set: the browser is leaving.
		window.location.assign(next);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
			<label className="flex flex-col gap-1 text-[13px]">
				{copy.nameLabel}
				<input
					type="text"
					name="name"
					autoComplete="name"
					required
					maxLength={80}
					value={name}
					onChange={(e) => setName(e.target.value)}
					className="min-h-10 rounded-[9px] border border-neutral-300 px-3 py-2.5 text-sm"
				/>
			</label>
			{message && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700"
				>
					{copy[message]}
				</p>
			)}
			<button
				type="submit"
				disabled={busy}
				className="flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
			>
				{busy && <Spinner />}
				{copy.submit}
			</button>
		</form>
	);
}
