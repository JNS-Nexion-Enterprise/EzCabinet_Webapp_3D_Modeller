"use client";

import { useState } from "react";
import { renderSVG } from "uqr";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";
import { secretOf } from "./totpSecret";

type Step = "password" | "scan" | "codes";

const FIELD = "rounded-[9px] border border-neutral-300 px-3.5 py-2.5 text-sm";
const PRIMARY =
	"rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60";

/**
 * Three steps, one direction: prove the password, bind the authenticator,
 * keep the backup codes. The codes arrive with the QR but are only shown
 * after a code has verified — until then the account is not enrolled, and
 * codes for an enrolment that never completed would be a false comfort.
 */
export function SetupTwoFactor() {
	const [step, setStep] = useState<Step>("password");
	const [password, setPassword] = useState("");
	const [totpURI, setTotpURI] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function start() {
		setBusy(true);
		setError(null);
		const { data, error: failure } = await authClient.twoFactor.enable({
			password,
		});
		setBusy(false);
		// The result is a union ({ method: "otp" } is the emailed-code flavour),
		// so checking the discriminant is what makes totpURI readable.
		if (failure || data?.method !== "totp") {
			setError(
				failure?.code === "INVALID_PASSWORD"
					? "That password is incorrect."
					: "Could not start setup. Try again.",
			);
			return;
		}
		setTotpURI(data.totpURI);
		setBackupCodes(data.backupCodes);
		setPassword("");
		setStep("scan");
	}

	async function verify() {
		setBusy(true);
		setError(null);
		const { error: failure } = await authClient.twoFactor.verifyTotp({
			code: code.trim(),
		});
		setBusy(false);
		if (failure) {
			setError(
				failure.status === 429
					? "Too many attempts. Wait a few seconds and try again."
					: "That code didn't work. Check the app and try again.",
			);
			return;
		}
		setStep("codes");
	}

	if (step === "password") {
		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					start();
				}}
				className="mt-5 flex flex-col gap-4"
			>
				<label className="flex flex-col gap-1.5">
					<span className="font-medium text-neutral-700 text-xs">
						Confirm your password
					</span>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete="current-password"
						className={FIELD}
					/>
				</label>
				{error && <ErrorNote>{error}</ErrorNote>}
				<button type="submit" disabled={busy || !password} className={PRIMARY}>
					{busy && <Spinner />}
					Continue
				</button>
			</form>
		);
	}

	if (step === "scan") {
		return (
			<form
				onSubmit={(e) => {
					e.preventDefault();
					verify();
				}}
				className="mt-5 flex flex-col gap-4"
			>
				{/* Spelled out as steps because the reflex is to point the phone's
				    camera at any QR code — which opens nothing useful, or files the
				    account somewhere the person will not look for it. */}
				<ol className="list-decimal space-y-1 pl-5 text-neutral-700 text-sm">
					<li>
						Open your authenticator app (Google Authenticator, Microsoft
						Authenticator or 1Password). Install one first if you have none.
					</li>
					<li>
						In the app, tap <strong>+</strong> or <strong>Add account</strong>,
						then <strong>Scan a QR code</strong>.
					</li>
					<li>Scan the code below and enter the 6-digit code the app shows.</li>
				</ol>
				<p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 text-xs">
					Scan from inside the authenticator app, not with your phone's camera.
				</p>
				{/* SVG built by `uqr` from a URI our own server returned — no user
				    input reaches this markup. */}
				<div
					role="img"
					aria-label="QR code for your authenticator app"
					className="mx-auto h-[200px] w-[200px]"
					// biome-ignore lint/security/noDangerouslySetInnerHtml: see comment above
					dangerouslySetInnerHTML={{ __html: renderSVG(totpURI) }}
				/>
				<p className="text-neutral-500 text-xs">
					Can't scan? Enter this key by hand:{" "}
					<code className="break-all font-mono text-neutral-900">
						{secretOf(totpURI)}
					</code>
				</p>
				<label className="flex flex-col gap-1.5">
					<span className="font-medium text-neutral-700 text-xs">
						6-digit code
					</span>
					<input
						inputMode="numeric"
						autoComplete="one-time-code"
						value={code}
						onChange={(e) =>
							// A pasted "123 456" must work: digits only, six of them.
							setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
						}
						className={FIELD}
					/>
				</label>
				{error && <ErrorNote>{error}</ErrorNote>}
				<button
					type="submit"
					disabled={busy || code.trim().length !== 6}
					className={PRIMARY}
				>
					{busy && <Spinner />}
					Verify
				</button>
			</form>
		);
	}

	return (
		<div className="mt-5 flex flex-col gap-4">
			<p className="text-neutral-700 text-sm">
				Two-step sign-in is on. Save these backup codes somewhere safe — each
				works once if you lose your phone. They are not shown again.
			</p>
			<ul className="grid grid-cols-2 gap-1.5 rounded-lg bg-[#faf9f7] p-3 font-mono text-sm">
				{backupCodes.map((c) => (
					<li key={c}>{c}</li>
				))}
			</ul>
			<label className="flex items-center gap-2 text-neutral-700 text-sm">
				<input
					type="checkbox"
					checked={saved}
					onChange={(e) => setSaved(e.target.checked)}
				/>
				I have saved these codes
			</label>
			{/* A full navigation, not router.push: verifying rotated the session
			    cookie, and the next page must be rendered against the new one. */}
			{saved ? (
				<a href="/admin/cabinet-designs" className={`${PRIMARY} text-center`}>
					Continue
				</a>
			) : (
				// A real disabled button: an `<a>` with pointer-events off is still
				// activatable from the keyboard.
				<button type="button" disabled className={PRIMARY}>
					Continue
				</button>
			)}
		</div>
	);
}

function ErrorNote({ children }: { children: React.ReactNode }) {
	return (
		<p
			role="alert"
			className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
		>
			{children}
		</p>
	);
}
