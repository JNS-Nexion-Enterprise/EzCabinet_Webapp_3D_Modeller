"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Spinner } from "@/components/Spinner";
import { NETWORK_ERROR } from "@/components/useAction";
import {
	SITE_IMAGE_CONTENT_TYPES,
	SITE_IMAGE_MAX_BYTES,
	siteImagePathname,
} from "@/lib/catalogue/siteImages";

/**
 * One drop target for a homepage photo.
 *
 * Uploads client-direct to Blob (Vercel Functions cap bodies at 4.5MB), then
 * records the result against the slot. There's no save button on purpose —
 * the design promises the photo is live as soon as it lands, so the write and
 * the cache purge both happen on drop.
 */

type State =
	| { status: "idle" }
	| { status: "uploading" }
	| { status: "removing" }
	| { status: "error"; message: string };

export function ImageSlot({
	slotKey,
	label,
	placeholder,
	url,
	height,
	radius = 10,
	onChangeAction,
}: {
	slotKey: string;
	label?: string;
	placeholder: string;
	/** Current photo, if the slot is filled. */
	url: string | null;
	height: number;
	radius?: number;
	/**
	 * Called after a write, for a caller holding its own copy of the slots.
	 *
	 * `router.refresh()` below is enough for a server component — `site-content`
	 * re-runs its query and the new URL arrives as a prop. The catalogue editor
	 * is a client component that fetched the slots itself, so a route refresh
	 * leaves its state untouched and the slot would look empty until a reload.
	 *
	 * Named with the `Action` suffix because this file is a client entry and
	 * Next 16 requires it of function props there.
	 */
	onChangeAction?: () => void;
}) {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [state, setState] = useState<State>({ status: "idle" });
	const [dragging, setDragging] = useState(false);

	const uploading = state.status === "uploading";
	const removing = state.status === "removing";

	async function send(file: File) {
		// A second photo mid-upload would race the first for the same slot.
		if (uploading || removing) return;
		if (!SITE_IMAGE_CONTENT_TYPES.includes(file.type)) {
			setState({ status: "error", message: "JPG, PNG, WebP or AVIF only" });
			return;
		}
		if (file.size > SITE_IMAGE_MAX_BYTES) {
			setState({ status: "error", message: "Too large — 8 MB max" });
			return;
		}

		setState({ status: "uploading" });
		try {
			const { upload } = await import("@vercel/blob/client");
			// Private, because the store only allows private — the photo is made
			// readable through `/api/site-images/[key]` instead. See
			// `siteImageSrc`.
			const blob = await upload(siteImagePathname(slotKey, file.name), file, {
				access: "private",
				handleUploadUrl: "/api/admin/site-images/upload-token",
			});

			const res = await fetch("/api/admin/site-images", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					key: slotKey,
					blobUrl: blob.url,
					blobPathname: blob.pathname,
					filename: file.name,
					sizeBytes: file.size,
				}),
			});
			if (!res.ok) {
				const body = await res.json();
				setState({ status: "error", message: body.error ?? "Could not save" });
				return;
			}
			setState({ status: "idle" });
			router.refresh();
			onChangeAction?.();
		} catch (e) {
			setState({
				status: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	async function clear() {
		if (uploading || removing) return;
		setState({ status: "removing" });
		try {
			const res = await fetch(
				`/api/admin/site-images?key=${encodeURIComponent(slotKey)}`,
				{ method: "DELETE" },
			);
			if (!res.ok) {
				const body = await res.json().catch(() => null);
				setState({
					status: "error",
					message: body?.error ?? "Could not remove",
				});
				return;
			}
			setState({ status: "idle" });
			router.refresh();
			onChangeAction?.();
		} catch {
			setState({ status: "error", message: NETWORK_ERROR });
		}
	}

	return (
		<div>
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragging(false);
					const file = e.dataTransfer.files[0];
					if (file) send(file);
				}}
				style={{ height, borderRadius: radius }}
				className={`relative flex w-full items-center justify-center overflow-hidden border-[1.5px] border-dashed text-center transition ${
					dragging
						? "border-neutral-900 bg-neutral-100"
						: "border-neutral-300 bg-[#fafaf9] hover:border-neutral-400"
				}`}
			>
				{url ? (
					// Plain <img>: these are arbitrary Blob URLs on a host next/image
					// isn't configured for, and the admin grid is not a place worth
					// paying for remote-image optimisation.
					// biome-ignore lint/performance/noImgElement: see above
					<img
						src={url}
						alt={placeholder}
						className="h-full w-full object-cover"
					/>
				) : (
					<span className="px-3 text-[12px] text-neutral-400">
						{uploading ? (
							<>
								<Spinner />
								Uploading…
							</>
						) : (
							placeholder
						)}
					</span>
				)}

				{url && uploading && (
					<span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-neutral-600">
						<Spinner />
						Uploading…
					</span>
				)}
			</button>

			<input
				ref={inputRef}
				type="file"
				accept={SITE_IMAGE_CONTENT_TYPES.join(",")}
				className="sr-only"
				disabled={uploading || removing}
				onChange={(e) => {
					const file = e.target.files?.[0];
					if (file) send(file);
					e.target.value = "";
				}}
			/>

			<div className="mt-1.5 flex items-center justify-center gap-2">
				{label && <span className="text-[12px] text-neutral-600">{label}</span>}
				{url && (
					<button
						type="button"
						onClick={clear}
						disabled={uploading || removing}
						className="text-[11px] text-neutral-400 hover:text-red-600 disabled:opacity-60"
					>
						{removing && <Spinner />}
						Remove
					</button>
				)}
			</div>

			{state.status === "error" && (
				<p className="mt-1 text-[11px] text-red-600">{state.message}</p>
			)}
		</div>
	);
}
