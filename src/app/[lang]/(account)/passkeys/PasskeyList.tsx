"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "@/components/Spinner";
import { authClient } from "@/lib/auth/client";
import type { Dictionary } from "@/lib/copy/en";
import { fill } from "@/lib/copy/fill";
import { passkeyDate } from "./passkeyDate";

type Row = { id: string; name: string | null; createdAt: string | null };

// Every client call resolves `{ data, error }`; `code` is on the runtime
// error but missing from the inferred type (Better Auth 1.7.5).
type Outcome =
	| { error?: { status?: number; code?: string } | null }
	| undefined
	| null;

/**
 * The server is the authority on every action here (`checkPasskeyRequest`):
 * the disabled Remove on a lone passkey is a courtesy, not the rule.
 */
export function PasskeyList({
	lang,
	copy,
	initial,
}: {
	lang: string;
	copy: Dictionary["passkey"];
	initial: Row[];
}) {
	const router = useRouter();
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [name, setName] = useState("");

	async function act(key: string, run: () => Promise<Outcome>) {
		setBusy(key);
		setError(null);
		let failure: { status?: number; code?: string } | null = null;
		try {
			let outcome = await run();
			// A staff session has not passed a passkey at sign-in the way a
			// customer's has, and every change here needs one: prompt, then
			// repeat the action once.
			if (outcome?.error?.code === "PASSKEY_VERIFICATION_REQUIRED") {
				const proved: Outcome = await authClient.signIn.passkey();
				outcome = proved?.error ? proved : await run();
			}
			failure = outcome?.error ?? null;
		} catch {
			failure = {};
		}
		setBusy(null);
		if (failure) {
			setError(
				failure.code === "PASSKEY_LAST_ONE" ? copy.removeLast : copy.failed,
			);
			return;
		}
		setEditing(null);
		router.refresh();
	}

	// Adding a device needs a session less than a day old (the plugin's
	// "fresh session" rule). An older one is renewed by one passkey prompt
	// on the device in hand, then the add is retried once.
	const add = () =>
		act("add", async () => {
			const first: Outcome = await authClient.passkey.addPasskey();
			if (first?.error?.code !== "SESSION_NOT_FRESH") return first;
			const again: Outcome = await authClient.signIn.passkey();
			if (again?.error) return again;
			return authClient.passkey.addPasskey();
		});

	const date = (iso: string | null) =>
		iso ? fill(copy.added, { date: passkeyDate(iso, lang) }) : "";

	return (
		<div className="mt-5 flex flex-col gap-3">
			{error && (
				<p
					role="alert"
					className="rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-red-900 text-sm"
				>
					{error}.
				</p>
			)}
			<ul className="divide-y divide-[#f1f0ec] rounded-[10px] border border-[#ecebe7]">
				{initial.map((p) => (
					<li
						key={p.id}
						className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
					>
						{editing === p.id ? (
							<form
								className="flex flex-1 items-center gap-2"
								onSubmit={(e) => {
									e.preventDefault();
									act(`rename:${p.id}`, () =>
										authClient.passkey.updatePasskey({
											id: p.id,
											name: name.trim(),
										}),
									);
								}}
							>
								<label className="sr-only" htmlFor={`name-${p.id}`}>
									{copy.nameLabel}
								</label>
								<input
									id={`name-${p.id}`}
									value={name}
									maxLength={60}
									onChange={(e) => setName(e.target.value)}
									className="min-h-[38px] flex-1 rounded-[9px] border border-[#d4d4d4] px-3 text-[13px]"
								/>
								<button
									type="submit"
									disabled={busy !== null || !name.trim()}
									className="font-medium text-[13px] disabled:opacity-60"
								>
									{copy.save}
								</button>
								<button
									type="button"
									onClick={() => setEditing(null)}
									className="text-[#5c574e] text-[13px]"
								>
									{copy.cancel}
								</button>
							</form>
						) : (
							<>
								<span className="min-w-0">
									<span className="block truncate font-medium text-[14px]">
										{p.name || copy.unnamed}
									</span>
									<span className="block text-[#5c574e] text-[12px]">
										{date(p.createdAt)}
									</span>
								</span>
								<span className="flex items-center gap-3 text-[13px]">
									<button
										type="button"
										disabled={busy !== null}
										onClick={() => {
											setName(p.name ?? "");
											setEditing(p.id);
										}}
										className="text-[#404040] hover:text-[#171717] disabled:opacity-60"
									>
										{copy.rename}
									</button>
									<button
										type="button"
										disabled={busy !== null || initial.length <= 1}
										title={initial.length <= 1 ? copy.removeLast : undefined}
										onClick={() =>
											act(`remove:${p.id}`, () =>
												authClient.passkey.deletePasskey({ id: p.id }),
											)
										}
										className="text-[#7f1d1d] disabled:opacity-40"
									>
										{copy.remove}
									</button>
								</span>
							</>
						)}
					</li>
				))}
			</ul>
			<button
				type="button"
				onClick={add}
				disabled={busy !== null}
				className="flex min-h-10 items-center justify-center gap-2 self-start rounded-[9px] border border-[#d4d4d4] bg-white px-4 font-medium text-[13px] disabled:opacity-60"
			>
				{busy === "add" && <Spinner />}
				{copy.add}
			</button>
		</div>
	);
}
