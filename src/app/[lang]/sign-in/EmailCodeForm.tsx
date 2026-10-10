"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { passkeysSupported } from "@/app/[lang]/verify/passkeySupport";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import {
	canStart,
	cleanCode,
	type FormMessage,
	isFullCode,
	looksLikeEmail,
	maySendTo,
	normaliseEmail,
	RESEND_AFTER_S,
	recordSend,
	type SendCounts,
	secondsLeft,
	sendFailure,
	verifyFailure,
} from "./emailCode";

const FIELD =
	"min-h-10 rounded-[9px] border border-neutral-300 px-3 py-2.5 text-sm";
const PRIMARY =
	"flex items-center justify-center gap-2 rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60";
const QUIET =
	"text-left text-[12px] text-neutral-500 hover:text-neutral-900 disabled:hover:text-neutral-500";

/**
 * Sign-in for a customer with any email: the address, then the six-digit
 * code mailed to it, typed into this same tab. A code and not a link — a link
 * opens in the mail app's own browser, where the saved design is absent and
 * passkeys do not work.
 *
 * The server answers a code request the same way whoever the address belongs
 * to, so "code sent" is all this can say. What it can do for a customer who
 * mistyped is keep the address in front of them with a way back.
 */
export function EmailCodeForm({
	next,
	copy,
	unsupported,
}: {
	/** The name step, with a checked target: this form navigates by itself. */
	next: string;
	copy: Dictionary["signIn"];
	/** `passkey.unsupported`, for a browser that cannot finish the journey. */
	unsupported: string;
}) {
	// Unknown until mounted: the server cannot see the browser's capabilities.
	const [supported, setSupported] = useState<boolean | null>(null);
	const [step, setStep] = useState<"address" | "code">("address");
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState<FormMessage | null>(null);
	// Epoch milliseconds: when "Send a new code" comes back, and the clock as
	// last read. The wait is derived from the two, never counted down.
	const [resendAt, setResendAt] = useState(0);
	const [now, setNow] = useState(0);
	const sends = useRef<SendCounts>(new Map());
	const codeInput = useRef<HTMLInputElement>(null);
	// `busy` is state, so two submits in one tick (Enter, then autofill) would
	// both read it false. The second would spend the code the first is using.
	const inFlight = useRef(false);

	useEffect(() => {
		setSupported(passkeysSupported(window));
	}, []);

	useEffect(() => {
		if (resendAt <= Date.now()) return;
		const read = () => {
			const at = Date.now();
			setNow(at);
			if (at >= resendAt) clearInterval(timer);
		};
		const timer = setInterval(read, 1000);
		// A background tab's timers are slowed or stopped; read the clock the
		// moment the customer is back from their mail app.
		document.addEventListener("visibilitychange", read);
		return () => {
			clearInterval(timer);
			document.removeEventListener("visibilitychange", read);
		};
	}, [resendAt]);

	// The code box is new on screen, and it is where the customer types next.
	useEffect(() => {
		if (step === "code") codeInput.current?.focus();
	}, [step]);

	const address = normaliseEmail(email);
	const wait = secondsLeft(resendAt, now);

	async function requestCode() {
		if (inFlight.current) return;
		if (!looksLikeEmail(address)) {
			setMessage("emailInvalid");
			return;
		}
		if (!maySendTo(sends.current, address)) {
			setMessage("tooMany");
			return;
		}
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: { status?: number } | null = null;
		try {
			const { error } = await authClient.emailOtp.sendVerificationOtp({
				email: address,
				type: "sign-in",
			});
			failure = error ?? null;
		} catch {
			failure = {};
		}
		inFlight.current = false;
		setBusy(false);
		if (failure) {
			setMessage(sendFailure(failure.status));
			return;
		}
		recordSend(sends.current, address);
		setCode("");
		const at = Date.now();
		setNow(at);
		setResendAt(at + RESEND_AFTER_S * 1000);
		setStep("code");
	}

	async function submitCode() {
		if (inFlight.current) return;
		if (!isFullCode(code)) {
			setMessage("wrongCode");
			return;
		}
		inFlight.current = true;
		setBusy(true);
		setMessage(null);
		let failure: { status?: number; code?: string } | null = null;
		try {
			const { error } = await authClient.signIn.emailOtp({
				email: address,
				otp: cleanCode(code),
			});
			failure = error ?? null;
		} catch {
			failure = {};
		}
		if (failure) {
			inFlight.current = false;
			setBusy(false);
			setMessage(verifyFailure(failure));
			return;
		}
		// A full navigation, so the next page renders against the new session.
		// `busy` stays set: the browser is leaving.
		window.location.assign(next);
	}

	function submit(e: FormEvent) {
		e.preventDefault();
		if (step === "address") requestCode();
		else submitCode();
	}

	const start = canStart(supported);
	if (start === "blocked") {
		return (
			<p role="alert" className="text-[14px] text-neutral-700 leading-5">
				{unsupported}
			</p>
		);
	}

	return (
		<form onSubmit={submit} className="flex flex-col gap-3" noValidate>
			{step === "address" ? (
				<label className="flex flex-col gap-1 text-[13px]">
					{copy.emailLabel}
					<input
						type="email"
						name="email"
						autoComplete="email"
						inputMode="email"
						autoCapitalize="none"
						spellCheck={false}
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className={FIELD}
					/>
				</label>
			) : (
				<>
					<p
						role="status"
						className="text-[13px] text-neutral-700 leading-[18px]"
					>
						{fill(copy.codeSent, { email: address })}
					</p>
					<label className="flex flex-col gap-1 text-[13px]">
						{copy.codeLabel}
						<input
							ref={codeInput}
							type="text"
							name="code"
							autoComplete="one-time-code"
							inputMode="numeric"
							required
							value={code}
							onChange={(e) => setCode(e.target.value)}
							className={`${FIELD} tracking-[0.3em]`}
						/>
					</label>
				</>
			)}

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
				disabled={busy || start === "wait"}
				className={PRIMARY}
			>
				{busy && <Spinner />}
				{step === "address" ? copy.continueEmail : copy.submitCode}
			</button>

			{step === "code" && (
				<div className="flex flex-col gap-1.5">
					<p className="text-[12px] text-neutral-500 leading-4">
						{copy.codeHint}
					</p>
					<button
						type="button"
						onClick={requestCode}
						disabled={busy || wait > 0}
						className={QUIET}
					>
						{wait > 0 ? fill(copy.resendIn, { seconds: wait }) : copy.resend}
					</button>
					<button
						type="button"
						onClick={() => {
							setStep("address");
							setCode("");
							setMessage(null);
						}}
						disabled={busy}
						className={QUIET}
					>
						{copy.changeEmail}
					</button>
				</div>
			)}
		</form>
	);
}
