"use client";

import { useRef, useState } from "react";
import { renderSVG } from "uqr";
import { useAdminBrand } from "@/app/admin/AdminUserContext";
import { Field, focusFirstInvalid, INVALID } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { NETWORK_ERROR } from "@/components/useAction";
import { authClient } from "@/lib/auth/client";
import { secretOf } from "./totpSecret";

type Step = "password" | "scan" | "codes";

/** The border colour is the caller's, so the invalid look is never beaten by CSS order. */
const field = (invalid: boolean | undefined) =>
	`rounded-[9px] border px-3.5 py-2.5 text-sm ${
		invalid ? INVALID : "border-neutral-300"
	}`;
const PRIMARY =
	"rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60";

/**
 * Three steps, one direction: prove the password, bind the authenticator,
 * keep the backup codes. The codes arrive with the QR but are only shown
 * after a code has verified — until then the account is not enrolled, and
 * codes for an enrolment that never completed would be a false comfort.
 */
export function SetupTwoFactor() {
	const brand = useAdminBrand();
	const [step, setStep] = useState<Step>("password");
	const [password, setPassword] = useState("");
	const [totpURI, setTotpURI] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[]>([]);
	const [code, setCode] = useState("");
	const [saved, setSaved] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	/** Say what went wrong on the step's one input. */
	function fail(message: string) {
		setError(message);
		focusFirstInvalid(formRef.current);
	}

	async function start() {
		setBusy(true);
		setError(null);
		let result: Awaited<ReturnType<typeof authClient.twoFactor.enable>>;
		try {
			result = await authClient.twoFactor.enable({
				password,
				issuer: `${brand} Admin`,
			});
		} catch {
			// better-fetch rejects when the request gets no answer at all.
			setBusy(false);
			fail(NETWORK_ERROR);
			return;
		}
		const { data, error: failure } = result;
		setBusy(false);
		// The result is a union ({ method: "otp" } is the emailed-code flavour),
		// so checking the discriminant is what makes totpURI readable.
		if (failure || data?.method !== "totp") {
			fail(
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
		let result: Awaited<ReturnType<typeof authClient.twoFactor.verifyTotp>>;
		try {
			result = await authClient.twoFactor.verifyTotp({ code: code.trim() });
		} catch {
			setBusy(false);
			fail(NETWORK_ERROR);
			return;
		}
		const { error: failure } = result;
		setBusy(false);
		if (failure) {
			fail(
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
				ref={formRef}
				onSubmit={(e) => {
					e.preventDefault();
					start();
				}}
				className="mt-5 flex flex-col gap-4"
			>
				<Field
					label="Confirm your password"
					error={error ?? undefined}
					className="gap-1.5"
					labelClassName="font-medium text-neutral-700 text-xs"
				>
					{(c) => (
						<input
							{...c}
							type="password"
							value={password}
							onChange={(e) => {
								setPassword(e.target.value);
								setError(null);
							}}
							autoComplete="current-password"
							className={field(c["aria-invalid"])}
						/>
					)}
				</Field>
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
				ref={formRef}
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
				<Field
					label="6-digit code"
					error={error ?? undefined}
					className="gap-1.5"
					labelClassName="font-medium text-neutral-700 text-xs"
				>
					{(c) => (
						<input
							{...c}
							inputMode="numeric"
							autoComplete="one-time-code"
							value={code}
							onChange={(e) => {
								// A pasted "123 456" must work: digits only, six of them.
								setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
								setError(null);
							}}
							className={field(c["aria-invalid"])}
						/>
					)}
				</Field>
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
