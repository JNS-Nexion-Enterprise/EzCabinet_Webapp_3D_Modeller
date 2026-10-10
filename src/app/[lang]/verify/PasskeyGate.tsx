"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { track } from "@/lib/analytics";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { failureReason } from "./failureReason";
import { passkeysSupported } from "./passkeySupport";

/**
 * One button, two ceremonies. `enrol` registers the account's first passkey
 * (which is itself the proof of possession); `prompt` asks for one that
 * already exists. Either way the server marks this session verified, and a
 * full navigation follows so the next page is rendered against it.
 *
 * A cancelled or timed-out browser prompt is not an error page: the customer
 * stays here with the button live again.
 */
export function PasskeyGate({
	mode,
	lang,
	next,
	copy,
	helpHref,
}: {
	mode: "enrol" | "prompt";
	lang: string;
	next: string;
	copy: Dictionary["passkey"];
	helpHref: string | null;
}) {
	// Unknown until mounted: the server cannot see the browser's capabilities.
	const [supported, setSupported] = useState<boolean | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [stale, setStale] = useState(false);

	useEffect(() => {
		setSupported(passkeysSupported(window));
	}, []);

	async function run() {
		setBusy(true);
		setError(null);
		if (mode === "enrol") track("passkey_enrol_started");
		// Both client calls resolve `{ data, error }` and report every failure,
		// cancelled prompt included, as a truthy `error` (Better Auth 1.7.5).
		// `code` is on the runtime error but missing from the inferred type.
		let failure: { code?: string; message?: string } | null = null;
		try {
			const result =
				mode === "enrol"
					? await authClient.passkey.addPasskey()
					: await authClient.signIn.passkey();
			failure = result?.error ?? null;
		} catch {
			// Defensive: a rejection is treated like the browser prompt failing.
			failure = {};
		}
		if (failure) {
			const reason = failureReason(failure.code);
			track(
				mode === "enrol" ? "passkey_enrol_failed" : "passkey_verify_failed",
				{ reason },
			);
			if (reason === "stale") {
				// Enrolling needs a session under a day old; signing in again, by
				// whichever route, makes one and lands back here.
				setStale(true);
				setBusy(false);
				return;
			}
			setError(
				failure.code === "PASSKEY_NOT_YOURS" ? copy.wrongAccount : copy.failed,
			);
			setBusy(false);
			return;
		}
		if (mode === "enrol") track("passkey_enrol_completed");
		window.location.assign(next);
	}

	if (stale) {
		const back = `/${lang}/verify?next=${encodeURIComponent(next)}`;
		return (
			<>
				<p role="alert" className="text-[14px] text-neutral-700 leading-5">
					{copy.sessionStale}
				</p>
				<a
					href={`/${lang}/sign-in?next=${encodeURIComponent(back)}`}
					className="flex items-center justify-center rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white"
				>
					{copy.signInAgain}
				</a>
			</>
		);
	}

	if (supported === false) {
		return (
			<p role="alert" className="text-[14px] text-neutral-700 leading-5">
				{copy.unsupported}
			</p>
		);
	}

	return (
		<>
			<p className="text-[14px] text-neutral-500 leading-5">
				{mode === "enrol" ? copy.enrolBody : copy.promptBody}
			</p>
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
				>
					{error}.
				</p>
			)}
			{error === copy.failed && (
				// Some in-app browsers expose WebAuthn and then fail the ceremony.
				<p className="text-[12px] text-neutral-500">{copy.failedHint}</p>
			)}
			<button
				type="button"
				onClick={run}
				disabled={busy || supported === null}
				className="flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
			>
				{busy && <Spinner />}
				{busy
					? copy.working
					: mode === "enrol"
						? copy.enrolButton
						: copy.promptButton}
			</button>
			{mode === "prompt" && (
				// A passkey made on a laptop does not help a customer on a phone.
				<p className="text-center text-[12px] text-neutral-500 leading-4">
					{copy.otherDevice}
				</p>
			)}
			{mode === "prompt" &&
				(helpHref ? (
					<a
						href={helpHref}
						className="text-center text-[12px] text-neutral-500 hover:text-neutral-900"
					>
						{copy.lostDevice}
					</a>
				) : (
					<p className="text-center text-[12px] text-neutral-500">
						{copy.lostDevice}
					</p>
				))}
		</>
	);
}
