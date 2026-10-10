"use client";

import Link from "next/link";
import { useState } from "react";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [sent, setSent] = useState(false);
	const [busy, setBusy] = useState(false);

	async function submit() {
		setBusy(true);
		// The result is deliberately ignored. Whether the address is staff, a
		// customer or nobody, the screen says the same thing — anything else
		// tells a stranger which emails are staff.
		await authClient
			.requestPasswordReset({ email, redirectTo: "/admin/reset-password" })
			.catch(() => {});
		setBusy(false);
		setSent(true);
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-[#f4f3f1] p-6 text-neutral-900">
			<div className="w-full max-w-[380px] rounded-2xl border border-[#e4e2df] bg-white p-8">
				<h1 className="font-semibold text-[19px]">Reset your password</h1>
				{sent ? (
					<p className="mt-3 text-neutral-700 text-sm">
						If that address has a staff account with two-step sign-in set up, we
						have sent it a link. It works once, for one hour. No email? Talk to
						a superadmin.
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
								Email
							</span>
							<input
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								autoComplete="username"
								className="rounded-[9px] border border-neutral-300 px-3.5 py-2.5 text-sm"
							/>
						</label>
						<button
							type="submit"
							disabled={busy || !email}
							className="rounded-[9px] bg-neutral-900 py-2.5 font-medium text-sm text-white disabled:opacity-60"
						>
							{busy && <Spinner />}
							Send reset link
						</button>
					</form>
				)}
				<Link
					href="/admin/login"
					className="mt-5 block text-center text-neutral-500 text-xs hover:text-neutral-900"
				>
					← Back to sign-in
				</Link>
			</div>
		</main>
	);
}
