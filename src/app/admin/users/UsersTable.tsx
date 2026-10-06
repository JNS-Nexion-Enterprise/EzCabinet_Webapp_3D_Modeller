"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_LABELS, type Role, STAFF_ROLES } from "@/lib/auth/permissions";
import { shortTime } from "../logistics/time";

type UserRow = {
	id: string;
	email: string;
	name: string;
	role: Role;
	disabled: boolean;
	twoFactorEnabled: boolean | null;
	hasPassword: boolean;
	passkeyCount: number;
	recentOrders: { ref: string; phone: string }[];
	lastLoginAt: Date | string | null;
};

type StatusFilter = "all" | "active" | "suspended";
type ScopeFilter = "staff" | "customers";

const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
	all: "All",
	active: "Active",
	suspended: "Suspended",
};

const SCOPE_FILTER_LABEL: Record<ScopeFilter, string> = {
	staff: "Staff",
	customers: "Customers",
};

function initialsOf(name: string): string {
	return name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0])
		.join("")
		.toUpperCase();
}

/**
 * Staff by default, so the one colleague on screen isn't a needle in a
 * haystack of real customers — but the Staff/Customers pill switches the
 * `staff` query param the GET route already honours, because this screen
 * doubles as the superadmin's look at who has signed up at all.
 */
export function UsersTable({
	initial,
	selfId,
}: {
	initial: UserRow[];
	selfId: string;
}) {
	const router = useRouter();
	const [users, setUsers] = useState(initial);
	const [status, setStatus] = useState<StatusFilter>("all");
	const [scope, setScope] = useState<ScopeFilter>("staff");
	const [query, setQuery] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busyId, setBusyId] = useState<string | null>(null);
	// Two presses, not a browser confirm: the first arms the row's button.
	// Keyed `${action}:${id}` so arming one button disarms the other.
	const [armed, setArmed] = useState<string | null>(null);

	const reload = useCallback(async (q: string, s: ScopeFilter) => {
		const params = new URLSearchParams({ staff: s === "staff" ? "1" : "0" });
		if (q) params.set("q", q);
		const res = await fetch(`/api/admin/users?${params.toString()}`);
		if (!res.ok) return;
		const data = await res.json();
		setUsers(data.users);
	}, []);

	useEffect(() => {
		reload(query, scope);
	}, [query, scope, reload]);

	async function changeRole(id: string, role: Role) {
		setError(null);
		setBusyId(id);
		const res = await fetch(`/api/admin/users/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ role }),
		});
		setBusyId(null);
		if (!res.ok) {
			setError(
				res.status === 409
					? "That change isn't allowed — you can't change your own role, and the last superadmin can't be demoted."
					: "Could not change the role.",
			);
			return;
		}
		await reload(query, scope);
		router.refresh();
	}

	async function toggleDisabled(id: string, disabled: boolean) {
		setError(null);
		setBusyId(id);
		const res = await fetch(`/api/admin/users/${id}`, {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ disabled }),
		});
		setBusyId(null);
		if (!res.ok) {
			setError(
				res.status === 409
					? "You can't disable yourself."
					: "Could not update that account.",
			);
			return;
		}
		await reload(query, scope);
		router.refresh();
	}

	async function resetTwoFactor(id: string) {
		setError(null);
		setBusyId(id);
		const res = await fetch(`/api/admin/users/${id}/reset-2fa`, {
			method: "POST",
		});
		setBusyId(null);
		setArmed(null);
		if (!res.ok) {
			setError("Could not reset two-step sign-in.");
			return;
		}
		// Resetting your own signs you out; the refresh lands on the login page.
		await reload(query, scope);
		router.refresh();
	}

	async function resetPasskey(id: string) {
		setError(null);
		setBusyId(id);
		const res = await fetch(`/api/admin/users/${id}/reset-passkey`, {
			method: "POST",
		});
		setBusyId(null);
		setArmed(null);
		if (!res.ok) {
			setError("Could not reset the passkey.");
			return;
		}
		await reload(query, scope);
		router.refresh();
	}

	async function removePassword(id: string) {
		setError(null);
		setBusyId(id);
		const res = await fetch(`/api/admin/users/${id}/remove-password`, {
			method: "POST",
		});
		setBusyId(null);
		setArmed(null);
		if (!res.ok) {
			setError(
				res.status === 409
					? "This account has no other way to sign in. Link Google first."
					: "Could not remove the password.",
			);
			return;
		}
		await reload(query, scope);
		router.refresh();
	}

	// `staff=0` on the GET route means "no role filter", not "customers
	// only" — there is no server-side customer-only param. So the
	// Staff/Customers pill is a client-side split on top of that superset:
	// staff mode drops CUSTOMER rows, customers mode keeps only them.
	const inScope = useMemo(
		() =>
			users.filter((u) =>
				scope === "customers" ? u.role === "CUSTOMER" : u.role !== "CUSTOMER",
			),
		[users, scope],
	);

	const counts = useMemo(
		() => ({
			all: inScope.length,
			active: inScope.filter((u) => !u.disabled).length,
			suspended: inScope.filter((u) => u.disabled).length,
		}),
		[inScope],
	);

	const shown = useMemo(
		() =>
			inScope.filter((u) => {
				if (status === "active") return !u.disabled;
				if (status === "suspended") return u.disabled;
				return true;
			}),
		[inScope, status],
	);

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex flex-wrap gap-2">
					{(["staff", "customers"] as const).map((s) => (
						<button
							key={s}
							type="button"
							aria-pressed={scope === s}
							onClick={() => setScope(s)}
							className={`min-h-9 rounded-full border px-3.5 py-2 text-[12px] ${
								scope === s
									? "border-[#171717] bg-[#171717] font-semibold text-white"
									: "border-[#d4d4d4] bg-white text-[#404040] hover:bg-neutral-50"
							}`}
						>
							{SCOPE_FILTER_LABEL[s]}
						</button>
					))}
					<span
						aria-hidden="true"
						className="mx-1 w-px self-stretch bg-[#e5e5e5]"
					/>
					{(["all", "active", "suspended"] as const).map((f) => (
						<button
							key={f}
							type="button"
							aria-pressed={status === f}
							onClick={() => setStatus(f)}
							className={`min-h-9 rounded-full border px-3.5 py-2 text-[12px] ${
								status === f
									? "border-[#171717] bg-[#171717] font-semibold text-white"
									: "border-[#d4d4d4] bg-white text-[#404040] hover:bg-neutral-50"
							}`}
						>
							{STATUS_FILTER_LABEL[f]} ({counts[f]})
						</button>
					))}
				</div>
				<div className="min-w-[220px] flex-1 sm:max-w-[280px]">
					<label htmlFor="user-search" className="sr-only">
						Search by name or email
					</label>
					<input
						id="user-search"
						type="search"
						placeholder="Search by name or email"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className="min-h-[38px] w-full rounded-[9px] border border-[#d4d4d4] px-3 py-2 text-[13px]"
					/>
				</div>
			</div>

			{error && (
				<p
					role="alert"
					className="rounded-lg border border-[#fca5a5] bg-[#fef2f2] px-3 py-[9px] text-[#7f1d1d] text-[12px]"
				>
					{error}
				</p>
			)}

			<div className="overflow-hidden rounded-[14px] border border-[#e5e5e5] bg-white">
				<div className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_172px] items-center gap-3.5 border-[#ecebe7] border-b bg-[#faf9f7] px-[18px] py-[11px] font-semibold text-[#6b6b6b] text-[11px] uppercase tracking-[.05em]">
					<span>Member</span>
					<span>Role</span>
					<span>Last active</span>
					<span />
				</div>
				<ul>
					{shown.map((user) => {
						const isSelf = user.id === selfId;
						return (
							<li
								key={user.id}
								className="grid grid-cols-[minmax(0,2.1fr)_minmax(0,1.1fr)_minmax(0,1fr)_172px] items-center gap-3.5 border-[#f1f0ec] border-b px-[18px] py-3 last:border-b-0"
							>
								<div className="flex min-w-0 items-center gap-[11px]">
									<span
										aria-hidden="true"
										className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full font-semibold text-[12px] ${
											user.disabled
												? "bg-[#ecebe7] text-[#6b6b6b]"
												: "bg-[#171717] text-white"
										}`}
									>
										{initialsOf(user.name)}
									</span>
									<span className="min-w-0">
										<span className="flex flex-wrap items-center gap-[7px]">
											<span className="truncate font-semibold text-[13px] text-[#171717]">
												{user.name}
											</span>
											{isSelf && (
												<span className="shrink-0 rounded-full bg-[#f1f0ec] px-[7px] py-0.5 font-semibold text-[#525252] text-[10px]">
													you
												</span>
											)}
											{user.disabled && (
												<span className="shrink-0 rounded-full bg-[#fef2f2] px-2 py-0.5 font-semibold text-[#7f1d1d] text-[10px] tracking-[.04em]">
													Suspended
												</span>
											)}
											{user.role !== "CUSTOMER" &&
												user.hasPassword &&
												!user.twoFactorEnabled && (
													<span className="shrink-0 rounded-full bg-[#fffbeb] px-2 py-0.5 font-semibold text-[#92400e] text-[10px] tracking-[.04em]">
														2FA not set up
													</span>
												)}
										</span>
										<span className="block truncate text-[#737373] text-[12px]">
											{user.email}
										</span>
										{user.role === "CUSTOMER" &&
											user.recentOrders.length > 0 && (
												<span className="block truncate text-[#a3a3a3] text-[11px]">
													{user.recentOrders
														.map((o) => `${o.ref} · ${o.phone}`)
														.join(", ")}
												</span>
											)}
									</span>
								</div>
								{user.role === "CUSTOMER" ? (
									<span className="text-[#737373] text-[12px]">Customer</span>
								) : (
									<>
										<label className="sr-only" htmlFor={`role-${user.id}`}>
											Role for {user.name}
										</label>
										<select
											id={`role-${user.id}`}
											value={user.role}
											disabled={isSelf || busyId === user.id}
											title={
												isSelf ? "You can't change your own role" : undefined
											}
											onChange={(e) =>
												changeRole(user.id, e.target.value as Role)
											}
											className="select-chevron min-h-9 w-fit rounded-lg border border-[#d4d4d4] bg-white py-[7px] pl-2.5 text-[#404040] text-[12px] disabled:cursor-not-allowed disabled:opacity-50"
										>
											{STAFF_ROLES.map((role) => (
												<option key={role} value={role}>
													{ROLE_LABELS[role]}
												</option>
											))}
										</select>
									</>
								)}
								<span className="text-[#5c574e] text-[12px]">
									{user.lastLoginAt
										? `Last in ${shortTime(new Date(user.lastLoginAt).toISOString())}`
										: "Never signed in"}
								</span>
								<div className="flex w-[172px] flex-col items-end gap-1">
									{user.twoFactorEnabled && (
										<ArmedButton
											action="reset"
											id={user.id}
											armed={armed}
											setArmed={setArmed}
											disabled={busyId === user.id}
											label="Reset 2FA"
											confirmLabel="Confirm reset"
											onConfirm={() => resetTwoFactor(user.id)}
										/>
									)}
									{user.role === "CUSTOMER" && user.passkeyCount > 0 && (
										<ArmedButton
											action="passkey"
											id={user.id}
											armed={armed}
											setArmed={setArmed}
											disabled={busyId === user.id}
											label="Reset passkey"
											confirmLabel="Confirm reset"
											onConfirm={() => resetPasskey(user.id)}
										/>
									)}
									{user.role !== "CUSTOMER" && user.hasPassword && (
										<ArmedButton
											action="remove-password"
											id={user.id}
											armed={armed}
											setArmed={setArmed}
											disabled={busyId === user.id}
											label="Remove password"
											confirmLabel="Confirm remove"
											onConfirm={() => removePassword(user.id)}
										/>
									)}
									{user.role !== "CUSTOMER" && (
										<button
											type="button"
											aria-label={
												isSelf
													? "You can't suspend yourself"
													: user.disabled
														? `Restore ${user.name}`
														: `Suspend ${user.name}`
											}
											disabled={isSelf || busyId === user.id}
											title={isSelf ? "You can't disable yourself" : undefined}
											onClick={() => toggleDisabled(user.id, !user.disabled)}
											className="min-h-9 rounded-lg border border-[#d4d4d4] px-[11px] text-[#404040] text-[12px] hover:bg-[#f4f3f1] disabled:cursor-not-allowed disabled:opacity-50"
										>
											{user.disabled ? "Restore" : "Suspend"}
										</button>
									)}
								</div>
							</li>
						);
					})}
					{shown.length === 0 && (
						<li className="px-6 py-10 text-center text-[#5c574e] text-[13px]">
							No member matches that.
						</li>
					)}
				</ul>
				<div className="flex items-center justify-between gap-3 px-[18px] py-[11px] text-[#5c574e] text-[12px]">
					<span>
						Showing {shown.length} of {inScope.length} members
					</span>
				</div>
			</div>
		</div>
	);
}

function ArmedButton({
	action,
	id,
	armed,
	setArmed,
	disabled,
	label,
	confirmLabel,
	onConfirm,
}: {
	action: string;
	id: string;
	armed: string | null;
	setArmed: (key: string | null) => void;
	disabled: boolean;
	label: string;
	confirmLabel: string;
	onConfirm: () => void;
}) {
	const key = `${action}:${id}`;
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => (armed === key ? onConfirm() : setArmed(key))}
			onBlur={() => setArmed(null)}
			className="text-[#7f1d1d] text-[12px] underline-offset-2 hover:underline disabled:opacity-60"
		>
			{armed === key ? confirmLabel : label}
		</button>
	);
}
