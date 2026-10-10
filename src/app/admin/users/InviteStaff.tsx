"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { fetchGuarded } from "@/components/admin/stepUp";
import { ROLE_LABELS, type Role, STAFF_ROLES } from "@/lib/auth/permissions";
import { inviteFailure } from "./inviteFailure";

function generatePassword(): string {
	return crypto.randomUUID().slice(0, 16);
}

/** One sentence per staff role, shown under the invite row as it changes. */
const ROLE_HINTS: Record<Role, string> = {
	SUPERADMIN: "Full access, including managing people.",
	ADMIN: "Everything except managing people.",
	CUSTOMER: "",
};

/**
 * Invite creates staff and only staff. Inviting an email that already has a
 * customer row promotes that row instead — the client's decision that an
 * employee who already used the planner with their own account must not be
 * locked out of it — so this shows a different success message. A promoted
 * row with a Google sign-in keeps it and the generated password is never
 * used or shown. One without (it signed in with an emailed code, which staff
 * cannot use) is given the password, and it is shown as for a fresh invite.
 *
 * Inline card, not a dialog: the invite-a-member form sits above the table
 * so a superadmin never leaves the page to add someone.
 */
export function InviteStaff() {
	const router = useRouter();
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>(STAFF_ROLES[STAFF_ROLES.length - 1]);
	const [password, setPassword] = useState(generatePassword());
	const [confirming, setConfirming] = useState<Confirm | null>(null);
	const [result, setResult] = useState<{
		promoted: boolean;
		passwordSet: boolean;
		emailed: boolean;
		password: string;
	} | null>(null);

	function reset() {
		setEmail("");
		setName("");
		setRole(STAFF_ROLES[STAFF_ROLES.length - 1]);
		setPassword(generatePassword());
		setResult(null);
	}

	/** Step-up guarded: the dialog shows whatever message this returns. */
	async function invite(): Promise<string | null> {
		const res = await fetchGuarded("/api/admin/users", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, name, role, password }),
		});
		if (typeof res === "string") return res;
		const data = await res.json().catch(() => null);
		if (!res.ok) return inviteFailure(data?.error);
		setResult({
			promoted: Boolean(data?.promoted),
			// A fresh invite always sets one; a promotion says whether it did.
			passwordSet: data?.promoted ? Boolean(data?.passwordSet) : true,
			emailed: Boolean(data?.emailed),
			password,
		});
		router.refresh();
		return null;
	}

	// An invite grants access, so it asks first. The form is inert behind the
	// modal, so what `invite` sends is what the dialog named.
	function submit(e: React.FormEvent) {
		e.preventDefault();
		setConfirming({
			title: `Invite ${name} as ${ROLE_LABELS[role]}?`,
			body: `${email} gets the ${ROLE_LABELS[role]} role. If that address already has a customer account, that account is given the role instead, with this password if it has no Google sign-in.`,
			confirmLabel: "Invite",
			stepUp: true,
			run: invite,
		});
	}

	return (
		<div className="rounded-[14px] border border-[#e5e5e5] bg-white p-5">
			<ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />
			<p className="mb-3 font-semibold text-[#525252] text-[12px] uppercase tracking-[.06em]">
				Invite a member
			</p>
			{result ? (
				<div className="flex flex-col gap-3">
					{result.promoted && !result.passwordSet ? (
						<p
							role="status"
							className="rounded-lg border border-[#c8d8ce] bg-[#f2f7f4] px-3 py-[9px] text-[#1f5138] text-[12px]"
						>
							Role granted. Existing account given the {ROLE_LABELS[role]} role.
							They keep signing in the way they already do.{" "}
							{result.emailed
								? "They have been emailed the sign-in link."
								: "No email was sent, so let them know."}
						</p>
					) : (
						<div className="flex flex-col gap-2">
							<p
								role="status"
								className="rounded-lg border border-[#c8d8ce] bg-[#f2f7f4] px-3 py-[9px] text-[#1f5138] text-[12px]"
							>
								{result.promoted
									? `Role granted. Existing account given the ${ROLE_LABELS[role]} role. It had no Google sign-in and staff cannot sign in with an emailed code, so it now has this password.`
									: "Staff account created."}{" "}
								{result.emailed
									? "They have been emailed the sign-in link, without the password."
									: "No email was sent, so send them the sign-in link yourself."}{" "}
								Give this password to them in person — it is not shown again.
							</p>
							<code className="block w-fit rounded-lg bg-neutral-100 px-3 py-2 text-[13px]">
								{result.password}
							</code>
						</div>
					)}
					<button
						type="button"
						onClick={reset}
						className="self-start rounded-full border border-[#e5e5e5] px-4 py-2 text-[13px] hover:bg-neutral-50"
					>
						Invite another
					</button>
				</div>
			) : (
				<form onSubmit={submit} className="flex flex-col gap-3">
					<div className="flex flex-wrap items-end gap-3">
						<label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
							Work email
							<input
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								className="min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 py-[10px]"
							/>
						</label>
						<label className="flex min-w-[160px] flex-col gap-1 text-[13px]">
							Name
							<input
								type="text"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								className="min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 py-[10px]"
							/>
						</label>
						<label className="flex flex-col gap-1 text-[13px]">
							Role
							<select
								value={role}
								onChange={(e) => setRole(e.target.value as Role)}
								className="select-chevron min-h-10 rounded-[9px] border border-[#d4d4d4] bg-white py-[10px] pl-3"
							>
								{STAFF_ROLES.map((r) => (
									<option key={r} value={r}>
										{ROLE_LABELS[r]}
									</option>
								))}
							</select>
						</label>
						<label className="flex flex-col gap-1 text-[13px]">
							Password
							<div className="flex gap-2">
								<input
									type="text"
									required
									minLength={12}
									value={password}
									onChange={(e) => setPassword(e.target.value)}
									className="min-h-10 w-[160px] rounded-[9px] border border-[#d4d4d4] px-3 py-[10px]"
								/>
								<button
									type="button"
									onClick={() => setPassword(generatePassword())}
									className="min-h-10 rounded-[9px] border border-[#d4d4d4] px-3 py-[10px] text-[13px] hover:bg-neutral-50"
								>
									Generate
								</button>
							</div>
						</label>
						<button
							type="submit"
							className="min-h-10 flex-none rounded-full bg-[#1f5138] px-5 py-[11px] font-semibold text-[13px] text-white hover:bg-[#193f2c]"
						>
							Invite
						</button>
					</div>
					<p className="text-[#5c574e] text-[12px]">{ROLE_HINTS[role]}</p>
				</form>
			)}
		</div>
	);
}
