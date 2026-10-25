"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { passkeysSupported } from "@/app/[lang]/verify/passkeySupport";
import { Field, focusFirstInvalid, INVALID } from "@/components/Field";
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

const FIELD = "min-h-10 rounded-[9px] border px-3 py-2.5 text-sm";
// The neutral border only on a valid field: beside `INVALID` the CSS order, not the class order, would pick the border.
const fieldClass = (invalid: boolean | undefined) =>
	`${FIELD} ${invalid ? INVALID : "border-neutral-300"}`;
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
	// Which button the spinner goes on: a resend is asked from the code step.
	const [resending, setResending] = useState(false);
	const [message, setMessage] = useState<FormMessage | null>(null);
	// Epoch milliseconds: when "Send a new code" comes back, and the clock as
	// last read. The wait is derived from the two, never counted down.
	const [resendAt, setResendAt] = useState(0);
	const [now, setNow] = useState(0);
	const sends = useRef<SendCounts>(new Map());
	const codeInput = useRef<HTMLInputElement>(null);
	const formRef = useRef<HTMLFormElement>(null);
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

	// Show a message and, when it is about an input, put focus on that input.
	// A send limit or a failed request is not about the input: it keeps the banner.
	function show(next: FormMessage) {
		setMessage(next);
		focusFirstInvalid(formRef.current);
	}

	const address = normaliseEmail(email);
	const wait = secondsLeft(resendAt, now);

	async function requestCode() {
		if (inFlight.current) return;
		if (!looksLikeEmail(address)) {
			show("emailInvalid");
			return;
		}
		if (!maySendTo(sends.current, address)) {
			setMessage("tooMany");
			return;
		}
		inFlight.current = true;
		setBusy(true);
		setResending(step === "code");
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
		setResending(false);
		if (failure) {
			show(sendFailure(failure.status));
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
			show("wrongCode");
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
			show(verifyFailure(failure));
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

	// The input a message is about. A resend asked from the code step can still
	// be refused for the address, but that field is not on screen: banner then.
	const onEmail = message === "emailInvalid" && step === "address";
	const onCode =
		(message === "wrongCode" || message === "codeExpired") && step === "code";
	const banner = message && !onEmail && !onCode ? message : null;

	const start = canStart(supported);
	if (start === "blocked") {
		return (
			<p role="alert" className="text-[14px] text-neutral-700 leading-5">
				{unsupported}
			</p>
		);
	}

	return (
		<form
			ref={formRef}
			onSubmit={submit}
			className="flex flex-col gap-3"
			noValidate
		>
			{step === "address" ? (
				<Field
					label={copy.emailLabel}
					labelClassName="text-[13px]"
					className="text-[13px]"
					error={onEmail && message ? copy[message] : undefined}
				>
					{(control) => (
						<input
							{...control}
							type="email"
							name="email"
							autoComplete="email"
							inputMode="email"
							autoCapitalize="none"
							spellCheck={false}
							required
							value={email}
							onChange={(e) => {
								setEmail(e.target.value);
								if (onEmail) setMessage(null);
							}}
							className={fieldClass(control["aria-invalid"])}
						/>
					)}
				</Field>
			) : (
				<>
					<p
						role="status"
						className="text-[13px] text-neutral-700 leading-[18px]"
					>
						{fill(copy.codeSent, { email: address })}
					</p>
					<Field
						label={copy.codeLabel}
						labelClassName="text-[13px]"
						className="text-[13px]"
						error={onCode && message ? copy[message] : undefined}
					>
						{(control) => (
							<input
								{...control}
								ref={codeInput}
								type="text"
								name="code"
								autoComplete="one-time-code"
								inputMode="numeric"
								required
								value={code}
								onChange={(e) => {
									setCode(e.target.value);
									if (onCode) setMessage(null);
								}}
								className={`${fieldClass(control["aria-invalid"])} tracking-[0.3em]`}
							/>
						)}
					</Field>
				</>
			)}

			{banner && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[13px] text-red-700"
				>
					{copy[banner]}
				</p>
			)}

			<button
				type="submit"
				disabled={busy || start === "wait"}
				className={PRIMARY}
			>
				{busy && !resending && <Spinner />}
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
						{resending && <Spinner />}
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
