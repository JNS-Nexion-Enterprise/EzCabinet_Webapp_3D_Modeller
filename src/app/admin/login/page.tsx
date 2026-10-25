"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useAdminBrand } from "@/app/admin/AdminUserContext";
import { safeNext } from "@/app/admin/login/safeNext";
import {
	isWrongCode,
	twoFactorMessage,
} from "@/app/admin/login/twoFactorMessage";
import { FieldMessage, focusFirstInvalid, INVALID } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { NETWORK_ERROR } from "@/components/useAction";
import { authClient } from "@/lib/auth/client";
import { HERO_EXPLODED_FRAME, heroFrameSrc } from "@/lib/scroll/sequence";
import { tenant } from "@/lib/tenant";

/** The banners on this screen add their own full stop. */
const NO_ANSWER = NETWORK_ERROR.replace(/\.$/, "");

/** The look of a text input, border colour aside: that is the caller's, so the invalid look is never beaten by CSS order. */
const FIELD = "rounded-[9px] border px-3.5 py-2.5 text-sm";

export default function AdminLoginPage() {
	const router = useRouter();
	const brand = useAdminBrand();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	// Wrong email or password is one flag, not two messages: it marks both
	// inputs and says nothing about which one was wrong.
	const [wrongLogin, setWrongLogin] = useState(false);
	const [codeError, setCodeError] = useState<string | null>(null);
	const formRef = useRef<HTMLFormElement>(null);
	const loginErrorId = useId();
	const codeErrorId = useId();
	const [busy, setBusy] = useState(false);
	const [step, setStep] = useState<"password" | "code">("password");
	const [code, setCode] = useState("");
	const [useBackup, setUseBackup] = useState(false);
	const [trustDevice, setTrustDevice] = useState(false);

	function enter() {
		// `next` comes from the query string, so it is attacker-controllable — see
		// safeNext's own comment for why a prefix check isn't enough.
		const next = new URLSearchParams(window.location.search).get("next");
		router.push(safeNext(next, window.location.origin));
	}

	async function login() {
		setBusy(true);
		setError(null);
		setWrongLogin(false);
		let result: Awaited<ReturnType<typeof authClient.signIn.email>>;
		try {
			result = await authClient.signIn.email({ email, password });
		} catch {
			// better-fetch rejects when the request gets no answer at all.
			setBusy(false);
			setError(NO_ANSWER);
			return;
		}
		const { data, error: failure } = result;
		if (failure) {
			setBusy(false);
			// Deliberately one message for a wrong email and a wrong password:
			// telling them apart tells an attacker which staff emails are real.
			setWrongLogin(true);
			focusFirstInvalid(formRef.current);
			return;
		}
		// The password was right but no session exists yet: the plugin holds
		// the sign-in in a short-lived cookie until a code verifies.
		if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) {
			setBusy(false);
			setPassword("");
			setStep("code");
			return;
		}
		// Busy stays set: the route is changing, and the button must not look
		// ready again before the page does.
		enter();
	}

	async function verifyCode() {
		setBusy(true);
		setError(null);
		setCodeError(null);
		// Backup codes look like `abcde-12345`: strip spaces, keep the hyphen.
		const body = { code: code.replace(/\s+/g, ""), trustDevice };
		let result: Awaited<ReturnType<typeof authClient.twoFactor.verifyTotp>>;
		try {
			result = useBackup
				? await authClient.twoFactor.verifyBackupCode(body)
				: await authClient.twoFactor.verifyTotp(body);
		} catch {
			setBusy(false);
			setError(NO_ANSWER);
			return;
		}
		const { error: failure } = result;
		if (failure) {
			setBusy(false);
			const message = twoFactorMessage(failure.code, failure.status);
			if (isWrongCode(failure.code, failure.status)) {
				setCodeError(`${message}.`);
				focusFirstInvalid(formRef.current);
			} else {
				setError(message);
			}
			// The challenge cookie is spent or gone: another code cannot work, so
			// go back to the password. The error paragraph renders on that step
			// too, so the reason stays visible.
			if (
				failure.code === "INVALID_TWO_FACTOR_COOKIE" ||
				failure.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE"
			) {
				setCode("");
				setStep("password");
			}
			return;
		}
		// Busy stays set while the route changes.
		enter();
	}

	async function continueWithGoogle() {
		setBusy(true);
		setError(null);
		try {
			const { error: failure } = await authClient.signIn.social({
				provider: "google",
				// Better Auth validates callbackURL against trustedOrigins
				// (origin-check middleware), so an attacker-controlled `next`
				// cannot redirect off-origin here the way a raw router.push would.
				callbackURL:
					new URLSearchParams(window.location.search).get("next") ??
					"/admin/cabinet-designs",
			});
			if (failure) {
				setError("Could not open Google sign-in. Try again");
				setBusy(false);
			}
			// On success the browser is mid-redirect; leave `busy` set so the
			// button stays disabled rather than flashing back to normal.
		} catch {
			setError("Could not open Google sign-in. Try again");
			setBusy(false);
		}
	}

	return (
		<main className="flex min-h-screen bg-[#f4f3f1] text-neutral-900">
			<div className="flex flex-1 items-center justify-center p-10">
				<form
					ref={formRef}
					onSubmit={(e) => {
						e.preventDefault();
						if (step === "code") verifyCode();
						else login();
					}}
					className="flex w-full max-w-[340px] flex-col gap-5"
				>
					<div className="mb-1 flex flex-col gap-1.5">
						<span className="flex h-[34px] w-[34px] items-center justify-center rounded-lg bg-neutral-900">
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="none"
								aria-hidden="true"
							>
								<path
									d="M2 6 8 2l6 4v8H2V6Z"
									stroke="#fff"
									strokeWidth="1.3"
									strokeLinejoin="round"
								/>
								<path d="M6 14V9h4v5" stroke="#fff" strokeWidth="1.3" />
							</svg>
						</span>
						<h1 className="mt-2 font-semibold text-[19px]">{brand} · Admin</h1>
						<p className="text-neutral-500 text-sm">
							Staff sign-in. Accounts are created by a superadmin.
						</p>
					</div>

					{step === "password" && (
						<>
							<button
								type="button"
								onClick={continueWithGoogle}
								disabled={busy}
								className="flex items-center justify-center gap-2 rounded-[9px] border border-neutral-300 bg-white py-2.5 font-medium text-sm disabled:opacity-60"
							>
								{busy && <Spinner />}
								Continue with Google
							</button>

							<div className="flex items-center gap-3 text-neutral-400 text-xs">
								<span className="h-px flex-1 bg-neutral-200" />
								or
								<span className="h-px flex-1 bg-neutral-200" />
							</div>

							<label className="flex flex-col gap-1.5">
								<span className="font-medium text-neutral-700 text-xs">
									Email
								</span>
								<input
									type="email"
									value={email}
									onChange={(e) => {
										setEmail(e.target.value);
										setWrongLogin(false);
									}}
									placeholder="you@company.com"
									autoComplete="username"
									aria-invalid={wrongLogin || undefined}
									aria-describedby={wrongLogin ? loginErrorId : undefined}
									className={`${FIELD} ${wrongLogin ? INVALID : "border-neutral-300"}`}
								/>
							</label>

							<div className="flex flex-col gap-1.5">
								<label className="flex flex-col gap-1.5">
									<span className="font-medium text-neutral-700 text-xs">
										Password
									</span>
									<input
										type="password"
										value={password}
										onChange={(e) => {
											setPassword(e.target.value);
											setWrongLogin(false);
										}}
										placeholder="Your password"
										autoComplete="current-password"
										aria-invalid={wrongLogin || undefined}
										aria-describedby={wrongLogin ? loginErrorId : undefined}
										className={`${FIELD} ${wrongLogin ? INVALID : "border-neutral-300"}`}
									/>
								</label>
								{wrongLogin && (
									// Deliberately one message for a wrong email and a wrong
									// password: telling them apart tells an attacker which
									// staff emails are real.
									<FieldMessage id={loginErrorId}>
										Wrong email or password.
									</FieldMessage>
								)}
							</div>

							{error && (
								<p
									role="alert"
									className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
								>
									{error}.
								</p>
							)}

							<button
								type="submit"
								disabled={busy || !email || !password}
								className="rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
							>
								{busy && <Spinner />}
								{busy ? "Checking…" : "Sign in"}
							</button>
							<Link
								href="/admin/forgot-password"
								className="text-center text-neutral-500 text-xs hover:text-neutral-900"
							>
								Forgot password?
							</Link>
						</>
					)}
					{step === "code" && (
						<>
							<div className="flex flex-col gap-1.5">
								<label className="flex flex-col gap-1.5">
									<span className="font-medium text-neutral-700 text-xs">
										{useBackup ? "Backup code" : "6-digit code"}
									</span>
									<input
										// Remounted on the switch so the keyboard and autofill
										// hints follow the kind of code being asked for.
										key={useBackup ? "backup" : "totp"}
										inputMode={useBackup ? "text" : "numeric"}
										autoComplete="one-time-code"
										// biome-ignore lint/a11y/noAutofocus: the only field on this step
										autoFocus
										value={code}
										onChange={(e) => {
											// A pasted "123 456" must work: digits only, six of them.
											setCode(
												useBackup
													? e.target.value
													: e.target.value.replace(/\D/g, "").slice(0, 6),
											);
											setCodeError(null);
										}}
										aria-invalid={codeError ? true : undefined}
										aria-describedby={codeError ? codeErrorId : undefined}
										placeholder={
											useBackup
												? "One of your saved codes"
												: "From your authenticator app"
										}
										className={`${FIELD} ${codeError ? INVALID : "border-neutral-300"}`}
									/>
								</label>
								{codeError && (
									<FieldMessage id={codeErrorId}>{codeError}</FieldMessage>
								)}
							</div>

							<label className="flex items-center gap-2 text-neutral-700 text-xs">
								<input
									type="checkbox"
									checked={trustDevice}
									onChange={(e) => setTrustDevice(e.target.checked)}
								/>
								Trust this device for 30 days
							</label>

							{error && (
								<p
									role="alert"
									className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
								>
									{error}.
								</p>
							)}

							<button
								type="submit"
								disabled={busy || !code.trim()}
								className="rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
							>
								{busy && <Spinner />}
								{busy ? "Checking…" : "Verify"}
							</button>

							<button
								type="button"
								onClick={() => {
									setUseBackup(!useBackup);
									setCode("");
									setError(null);
									setCodeError(null);
								}}
								className="text-center text-neutral-500 text-xs hover:text-neutral-900"
							>
								{useBackup ? "Use your authenticator app" : "Use a backup code"}
							</button>

							<button
								type="button"
								onClick={() => {
									setStep("password");
									setCode("");
									setUseBackup(false);
									setTrustDevice(false);
									setError(null);
									setCodeError(null);
								}}
								className="text-center text-neutral-500 text-xs hover:text-neutral-900"
							>
								← Sign in as someone else
							</button>
						</>
					)}

					<Link
						href="/"
						className="text-center text-neutral-500 text-xs hover:text-neutral-900"
					>
						← Back to site
					</Link>

					<p className="text-center text-neutral-400 text-xs">
						Internal tool · {brand} staff only
					</p>
				</form>
			</div>

			{/* The panel was an empty grey half-screen. It now carries the same
			    render the homepage scrubs through, stopped on its last frame — the
			    cabinet fully apart. That is the honest picture of what is behind
			    this password: not a kitchen, a catalogue of parts.

			    Static, and one file. There is no sequence here — nothing scrolls
			    on a sign-in screen, and the other seventy-one frames would be
			    1.7 MB spent on a page three people ever see. */}
			<div
				data-cabinet-ground="panel"
				className="relative hidden flex-1 items-center justify-center overflow-hidden md:flex"
			>
				{tenant.heroFrames && (
					<div
						data-cabinet-stage
						className="-translate-x-1/2 -translate-y-1/2 pointer-events-none absolute top-1/2 left-1/2 aspect-[16/9] w-[128%] max-w-none"
					>
						{/* biome-ignore lint/performance/noImgElement: ships in the repo,
						    and next/image would only re-encode a JPEG that is already
						    sized for exactly this box */}
						<img
							src={heroFrameSrc(HERO_EXPLODED_FRAME)}
							alt=""
							className="h-full w-full object-contain"
						/>
					</div>
				)}

				<div className="absolute bottom-8 left-8 max-w-[320px] rounded-[10px] bg-white/90 px-4 py-3.5">
					<p className="font-semibold text-sm">One catalogue, every planner</p>
					<p className="mt-1 text-[12px] text-neutral-600 leading-[17px]">
						Designs published here appear immediately in the customer planner.
						Archive a design to pull it from view without deleting it.
					</p>
				</div>
			</div>
		</main>
	);
}
