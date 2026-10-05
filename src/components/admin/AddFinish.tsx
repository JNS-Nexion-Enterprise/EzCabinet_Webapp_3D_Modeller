"use client";

import { useState } from "react";
import { Spinner } from "@/components/Spinner";
import type { PlannerCatalogue } from "@/lib/planner/catalogueSchema";

/**
 * Add a finish without leaving Site content.
 *
 * A finish is catalogue data, so it cannot be written the way a photo is —
 * it needs a version. This does the same two calls the catalogue editor
 * makes (create DRAFT, publish it) against the published catalogue plus one
 * more finish, so the admin gets the slot they came here for and the
 * catalogue history still records the change. Everything else about the
 * catalogue is left exactly as published.
 *
 * Colour and name only. The board photo is the slot this creates, dropped
 * the same way as every other slot on the page.
 */
export function AddFinish() {
	const [open, setOpen] = useState(false);
	const [label, setLabel] = useState("");
	const [hex, setHex] = useState("#cccccc");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function add() {
		const name = label.trim();
		if (!name) return;
		setBusy(true);
		setError(null);
		try {
			// The page's own copy of the catalogue is server-side; fetching it
			// here keeps tens of KB of families out of the page payload for a
			// button most visits never press.
			const res = await fetch(
				"/api/admin/catalogue/versions?product=PLANNER&include=data",
			);
			if (!res.ok) throw new Error("Could not read the catalogue");
			const body = await res.json();
			const published = (body.versions ?? []).find(
				(v: { status: string }) => v.status === "PUBLISHED",
			);
			if (!published) throw new Error("No published catalogue to add to");

			const data: PlannerCatalogue = published.data;
			const next = {
				...data,
				// Same id shape as the catalogue editor's own "+ Add finish" — an
				// id is never shown, and a timestamp cannot collide with a label
				// somebody reuses.
				finishes: [
					...data.finishes,
					{ id: `finish-${Date.now()}`, label: name, hex },
				],
			};

			const draft = await fetch("/api/admin/catalogue/versions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					product: "PLANNER",
					data: next,
					note: `Added the ${name} finish`,
				}),
			});
			if (!draft.ok) throw new Error("Could not save the finish");
			const { id } = await draft.json();

			const live = await fetch(`/api/admin/catalogue/versions/${id}/publish`, {
				method: "POST",
			});
			if (!live.ok) throw new Error("Saved, but could not publish it");

			// A hard reload, not `router.refresh()`: the page reads the
			// catalogue through a cached server function, and a refresh issued
			// this soon after the publish came back with the old finish list
			// still in it. Reloading after a publish is cheap and cannot be
			// stale.
			window.location.reload();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	if (!open) {
		return (
			<div>
				<button
					type="button"
					onClick={() => setOpen(true)}
					style={{ height: 74, borderRadius: 8 }}
					className="flex w-full items-center justify-center border-[1.5px] border-neutral-300 border-dashed bg-[#fafaf9] text-[12px] text-neutral-400 transition hover:border-neutral-400 hover:text-neutral-600"
				>
					+ Add material
				</button>
				<div className="mt-1.5 h-[18px]" />
			</div>
		);
	}

	return (
		<div className="col-span-3 sm:col-span-2">
			<div className="flex flex-col gap-2 rounded-lg border border-neutral-300 bg-white p-3">
				<input
					// biome-ignore lint/a11y/noAutofocus: the field the button opened
					autoFocus
					value={label}
					placeholder="Material name"
					onChange={(e) => setLabel(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") add();
						if (e.key === "Escape") setOpen(false);
					}}
					className="rounded border border-neutral-300 px-2 py-1.5 text-[13px] outline-none focus:border-neutral-500"
				/>
				<div className="flex items-center gap-2">
					<input
						type="color"
						aria-label="Material colour"
						value={hex}
						onChange={(e) => setHex(e.target.value)}
						className="h-8 w-12 cursor-pointer rounded border border-neutral-300"
					/>
					<button
						type="button"
						disabled={busy || !label.trim()}
						onClick={add}
						className="rounded-full bg-neutral-900 px-3 py-1.5 text-[12px] text-white disabled:opacity-40"
					>
						{busy && <Spinner />}
						{busy ? "Adding…" : "Add"}
					</button>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="text-[12px] text-neutral-500 hover:text-neutral-800"
					>
						Cancel
					</button>
				</div>
				<p className="text-[11px] text-neutral-500">
					Publishes the catalogue with this finish added, then drop the board
					scan on its new slot.
				</p>
				{error && <p className="text-[11px] text-red-600">{error}</p>}
			</div>
		</div>
	);
}
