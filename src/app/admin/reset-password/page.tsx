"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Field, focusFirstInvalid, INVALID } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import { NETWORK_ERROR } from "@/components/useAction";
import { authClient } from "@/lib/auth/client";
import {
	checkNewPassword,
	DEAD_LINK,
	type PasswordErrors,
	type PasswordField,
	resetPasswordFailure,
} from "../passwordFields";

/** The valid border only when valid, so the invalid look is never beaten by CSS order. */
const inputClass = (invalid: boolean | undefined) =>
	`rounded-[9px] border px-3.5 py-2.5 text-sm ${
		invalid ? INVALID : "border-neutral-300"
	}`;

export default function ResetPasswordPage() {
	const [newPassword, setNewPassword] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [errors, setErrors] = useState<PasswordErrors>({});
	const formRef = useRef<HTMLFormElement>(null);
	const [done, setDone] = useState(false);
	const [busy, setBusy] = useState(false);
	const [deadLink, setDeadLink] = useState(false);

	// Better Auth sends a bad link here as ?error=…, and a hand-typed address
	// has no token: say so now instead of after the form is filled in.
	useEffect(() => {
		const query = new URLSearchParams(window.location.search);
		if (query.has("error") || !query.get("token")) setDeadLink(true);
	}, []);

	/** Type into one input and clear its mark, since what was wrong is gone. */
	function edit(field: PasswordField, set: (v: string) => void, value: string) {
		set(value);
		setErrors(({ [field]: _gone, ...rest }) => rest);
	}

	async function submit() {
		setError(null);
		const marks = checkNewPassword(newPassword, confirm);
		setErrors(marks);
		if (Object.keys(marks).length > 0) {
			focusFirstInvalid(formRef.current);
			return;
		}
		// Better Auth's link lands here as ?token=…, or ?error=INVALID_TOKEN.
		const token = new URLSearchParams(window.location.search).get("token");
		if (!token) {
			setError(DEAD_LINK);
			return;
		}
		setBusy(true);
		let failure: { code?: string } | null;
		try {
			({ error: failure } = await authClient.resetPassword({
				newPassword,
				token,
			}));
		} catch {
			// better-fetch rejects when the request gets no answer at all.
			setBusy(false);
			setError(NETWORK_ERROR);
			return;
		}
		setBusy(false);
		if (failure) {
			const outcome = resetPasswordFailure(failure.code);
			setErrors(outcome.errors);
			setError(outcome.banner);
			focusFirstInvalid(formRef.current);
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
						ref={formRef}
						onSubmit={(e) => {
							e.preventDefault();
							submit();
						}}
						className="mt-5 flex flex-col gap-4"
					>
						<Field
							label="New password"
							error={errors.newPassword}
							className="gap-1.5"
							labelClassName="font-medium text-neutral-700 text-xs"
						>
							{(c) => (
								<input
									{...c}
									type="password"
									value={newPassword}
									onChange={(e) =>
										edit("newPassword", setNewPassword, e.target.value)
									}
									autoComplete="new-password"
									className={inputClass(c["aria-invalid"])}
								/>
							)}
						</Field>
						<Field
							label="Confirm new password"
							error={errors.confirm}
							className="gap-1.5"
							labelClassName="font-medium text-neutral-700 text-xs"
						>
							{(c) => (
								<input
									{...c}
									type="password"
									value={confirm}
									onChange={(e) => edit("confirm", setConfirm, e.target.value)}
									autoComplete="new-password"
									className={inputClass(c["aria-invalid"])}
								/>
							)}
						</Field>
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
