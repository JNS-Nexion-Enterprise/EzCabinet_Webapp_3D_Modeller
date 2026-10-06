"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";

/** Matches `emailAndPassword.minPasswordLength`; the server enforces it. */
const MIN_LENGTH = 12;
const DEAD_LINK =
	"This link has expired or was already used. Request a new one.";

export default function ResetPasswordPage() {
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);
	const [deadLink, setDeadLink] = useState(false);

	// Better Auth sends a bad link here as ?error=…, and a hand-typed address
	// has no token: say so now instead of after the form is filled in.
	useEffect(() => {
		const query = new URLSearchParams(window.location.search);
		if (query.has("error") || !query.get("token")) setDeadLink(true);
	}, []);

	async function submit() {
		setError(null);
		if (newPassword.length < MIN_LENGTH) {
			setError(`New password must be at least ${MIN_LENGTH} characters.`);
			return;
		}
		if (newPassword !== confirm) {
			setError("Passwords don't match.");
			return;
		}
		// Better Auth's link lands here as ?token=…, or ?error=INVALID_TOKEN.
		const token = new URLSearchParams(window.location.search).get("token");
		if (!token) {
			setError(DEAD_LINK);
			return;
		}
		setBusy(true);
		const { error: failure } = await authClient.resetPassword({
			newPassword,
			token,
		});
		setBusy(false);
		if (failure) {
			setError(
				failure.code === "PASSWORD_TOO_SHORT"
					? `New password must be at least ${MIN_LENGTH} characters.`
					: DEAD_LINK,
			);
			return;
		}
		setDone(true);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] p-6 text-neutral-900">
			<div className="w-full max-w-[380px] rounded-2xl border border-[#e4e2df] bg-white p-8">
				<h1 className="font-semibold text-[19px]">Choose a new password</h1>
				{deadLink ? (
					<p role="alert" className="mt-3 text-neutral-700 text-sm">
						{DEAD_LINK}
					</p>
				) : done ? (
					<p className="mt-3 text-neutral-700 text-sm">
						Password changed. You have been signed out everywhere — sign in with
						the new password and your authenticator code.
					</p>
				) : (
					<form
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
						className="mt-5 flex flex-col gap-4"
					>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-neutral-700 text-xs">
								New password
							</span>
							<input
								type="password"
								value={newPassword}
								onChange={(e) => setNewPassword(e.target.value)}
								autoComplete="new-password"
								className="rounded-[9px] border border-neutral-300 px-3.5 py-2.5 text-sm"
							/>
						</label>
						<label className="flex flex-col gap-1.5">
							<span className="font-medium text-neutral-700 text-xs">
								Confirm new password
							</span>
							<input
								type="password"
								value={confirm}
								onChange={(e) => setConfirm(e.target.value)}
								autoComplete="new-password"
								className="rounded-[9px] border border-neutral-300 px-3.5 py-2.5 text-sm"
							/>
						</label>
						{error && (
							<p
								role="alert"
								className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
							>
								{error}
							</p>
						)}
						<button
							type="submit"
							disabled={busy || !newPassword || !confirm}
							className="rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
						>
							{busy && <Spinner />}
							Change password
						</button>
					</form>
				)}
				<Link
					href={done ? "/admin/login" : "/admin/forgot-password"}
					className="mt-5 block text-center text-neutral-500 text-xs hover:text-neutral-900"
				>
					{done ? "Sign in" : "Request a new link"}
				</Link>
			</div>
		</main>
	);
}
