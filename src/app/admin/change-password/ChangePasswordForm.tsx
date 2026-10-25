"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Field, focusFirstInvalid, INVALID } from "@/components/Field";
import { Spinner } from "@/components/Spinner";
import {
	changePasswordFailure,
	checkNewPassword,
	MIN_LENGTH,
	type PasswordErrors,
	type PasswordField,
} from "../passwordFields";
import { changeOwnPassword } from "./actions";

/** The valid border only when valid, so the invalid look is never beaten by CSS order. */
const inputClass = (invalid: boolean | undefined) =>
	`min-h-10 rounded-[9px] border px-3.5 py-2.5 text-sm ${
		invalid ? INVALID : "border-[#d4d4d4]"
	}`;

export function ChangePasswordForm() {
	const router = useRouter();
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [errors, setErrors] = useState<PasswordErrors>({});
	const [busy, setBusy] = useState(false);
	const formRef = useRef<HTMLFormElement>(null);

	/** Type into one input and clear its mark, since what was wrong is gone. */
	function edit(field: PasswordField, set: (v: string) => void, value: string) {
		set(value);
		setErrors(({ [field]: _gone, ...rest }) => rest);
	}

	function fail(marks: PasswordErrors, banner: string | null) {
		setErrors(marks);
		setError(banner);
		focusFirstInvalid(formRef.current);
	}

	async function submit() {
		setError(null);

		const marks = checkNewPassword(newPassword, confirmPassword);
		if (Object.keys(marks).length > 0) {
			fail(marks, null);
			return;
		}
		setErrors({});

		setBusy(true);
		try {
			const result = await changeOwnPassword(currentPassword, newPassword);
			if (!result.ok) {
				const failure = changePasswordFailure(result.error);
				fail(failure.errors, failure.banner);
				setBusy(false);
				return;
			}
			router.push("/admin/cabinet-designs");
		} catch {
			setError("Could not change password. Try again.");
			setBusy(false);
		}
	}

	return (
		<form
			ref={formRef}
			onSubmit={(e) => {
				e.preventDefault();
				submit();
			}}
			className="mt-6 flex flex-col gap-4"
		>
			<Field
				label="Current password"
				error={errors.current}
				className="gap-1.5"
				labelClassName="font-medium text-neutral-700 text-xs"
			>
				{(c) => (
					<input
						{...c}
						type="password"
						value={currentPassword}
						onChange={(e) =>
							edit("current", setCurrentPassword, e.target.value)
						}
						placeholder="The password you were given"
						autoComplete="current-password"
						className={inputClass(c["aria-invalid"])}
					/>
				)}
			</Field>

			<Field
				label="New password"
				error={errors.newPassword}
				hint={`At least ${MIN_LENGTH} characters.`}
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
						value={confirmPassword}
						onChange={(e) =>
							edit("confirm", setConfirmPassword, e.target.value)
						}
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
				disabled={busy}
				className="min-h-10 rounded-[9px] bg-neutral-900 font-medium text-sm text-white disabled:opacity-60"
			>
				{busy && <Spinner />}
				{busy ? "Changing…" : "Change password"}
			</button>
		</form>
	);
}
