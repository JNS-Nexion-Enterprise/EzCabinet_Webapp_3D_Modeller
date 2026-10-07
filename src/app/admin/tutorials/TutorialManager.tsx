"use client";

import * as UpChunk from "@mux/upchunk";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Confirm, ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Spinner } from "@/components/Spinner";
import {
	CATEGORIES,
	type CategoryId,
	durationLabel,
	LABEL,
	LEVELS,
	type LevelId,
	posterUrl,
} from "@/lib/tutorials";

/**
 * The admin's tutorial library.
 *
 * **Video first, metadata second.** Picking a file starts the upload
 * immediately and the form fills in while the bytes are still moving — which
 * is the point, because the upload is the slow part and Mux's ingest endpoint
 * is in US-East. The previous version gated the file picker behind the title
 * and threw that overlap away.
 *
 * The upload is driven by UpChunk rather than `<MuxUploader>` because this
 * screen owns its own dropzone, progress bar and remove control, and because
 * chunked uploads are what make a multi-gigabyte file survive a flaky
 * connection.
 */

const ACCENT = "#1f5138";

/** Mux accepts far more, but this is the sane ceiling for an admin dragging a
 * file over consumer broadband, and it is what the screen promises. */
const MAX_BYTES = 4 * 1024 * 1024 * 1024;

type Row = {
	id: string;
	title: string;
	description: string;
	category: string;
	level: string;
	sortOrder: number;
	muxUploadId: string;
	playbackId: string | null;
	durationSec: number | null;
	status: string;
};

const STATUS_LABEL: Record<string, string> = {
	PROCESSING: "Processing",
	READY: "Live",
	ERRORED: "Failed",
	ARCHIVED: "Hidden",
};

const BADGE_TONE: Record<string, string> = {
	PROCESSING: "bg-[#f2efe6] text-[#6b5f2e]",
	READY: "bg-[#e7f0ea] text-[#1f5138]",
	ERRORED: "bg-red-50 text-red-700",
	ARCHIVED: "bg-neutral-100 text-neutral-500",
};

/** How often to ask Mux whether a still-processing upload has finished. */
const POLL_MS = 4000;

type Upload =
	| { phase: "idle" }
	| { phase: "uploading"; name: string; percent: number; muxUploadId: string }
	| { phase: "done"; name: string; muxUploadId: string }
	| { phase: "failed"; name: string; message: string };

export function TutorialManager({ initial }: { initial: Row[] }) {
	const [rows, setRows] = useState<Row[]>(initial);
	const [upload, setUpload] = useState<Upload>({ phase: "idle" });
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [category, setCategory] = useState<CategoryId>("base");
	const [level, setLevel] = useState<LevelId>("beginner");
	const [justPublished, setJustPublished] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [dragging, setDragging] = useState(false);
	const chunkRef = useRef<UpChunk.UpChunk | null>(null);

	const startUpload = useCallback(async (file: File) => {
		setError(null);
		setJustPublished(false);

		if (!file.type.startsWith("video/")) {
			setError("That is not a video file.");
			return;
		}
		if (file.size > MAX_BYTES) {
			setError("That video is over 4 GB.");
			return;
		}

		try {
			const response = await fetch("/api/admin/tutorials/upload", {
				method: "POST",
			});
			if (!response.ok) throw new Error("could not start the upload");
			const { id, url } = (await response.json()) as {
				id: string;
				url: string;
			};

			setUpload({
				phase: "uploading",
				name: file.name,
				percent: 0,
				muxUploadId: id,
			});

			const chunked = UpChunk.createUpload({ endpoint: url, file });
			chunkRef.current = chunked;

			chunked.on("progress", (event) => {
				const percent = Math.round((event.detail as number) ?? 0);
				setUpload((prev) =>
					prev.phase === "uploading" ? { ...prev, percent } : prev,
				);
			});
			chunked.on("success", () => {
				chunkRef.current = null;
				setUpload({ phase: "done", name: file.name, muxUploadId: id });
			});
			chunked.on("error", (event) => {
				chunkRef.current = null;
				setUpload({
					phase: "failed",
					name: file.name,
					message:
						(event.detail as { message?: string })?.message ??
						"the upload failed",
				});
			});
		} catch (e) {
			setUpload({
				phase: "failed",
				name: file.name,
				message: (e as Error).message,
			});
		}
	}, []);

	/** Discard the video. Cancels at Mux too, so an abandoned upload does not
	 * quietly become an asset that bills every month. */
	async function clearUpload() {
		const current = upload;
		chunkRef.current?.abort();
		chunkRef.current = null;
		setUpload({ phase: "idle" });

		const id =
			current.phase === "uploading" || current.phase === "done"
				? current.muxUploadId
				: null;
		if (!id) return;
		await fetch(`/api/admin/tutorials/upload/${id}`, {
			method: "DELETE",
		}).catch(() => {});
	}

	const ready = upload.phase === "done" && title.trim() !== "";

	const missing: string[] = [];
	if (upload.phase !== "done") missing.push("a video");
	if (title.trim() === "") missing.push("a title");

	const hint = justPublished
		? "Added to library — processing. It goes live on the public page when Mux finishes."
		: upload.phase === "uploading"
			? "Uploading. You can fill in the details while it finishes."
			: missing.length > 0
				? `Still needed: ${missing.join(" and ")}. Description is optional.`
				: "Ready to publish. It appears on the public page once Mux finishes processing.";

	async function publish() {
		if (!ready || upload.phase !== "done") return;
		setBusy(true);
		setError(null);
		try {
			const response = await fetch("/api/admin/tutorials", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					muxUploadId: upload.muxUploadId,
					title: title.trim(),
					description: description.trim(),
					category,
					level,
					sortOrder: rows.length,
				}),
			});
			if (!response.ok) throw new Error((await response.json()).error);
			const { tutorial } = (await response.json()) as { tutorial: Row };
			setRows((prev) => [tutorial, ...prev]);
			setTitle("");
			setDescription("");
			setUpload({ phase: "idle" });
			setJustPublished(true);
		} catch (e) {
			setError((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	// Poll anything Mux has not finished with.
	const processingIds = rows
		.filter((r) => r.status === "PROCESSING")
		.map((r) => r.id)
		.join(",");

	useEffect(() => {
		if (processingIds === "") return;
		const ids = processingIds.split(",");
		const tick = async () => {
			const results = await Promise.all(
				ids.map(async (id) => {
					const response = await fetch(`/api/admin/tutorials/${id}/status`, {
						method: "POST",
					});
					if (!response.ok) return null;
					return (await response.json()).tutorial as Row;
				}),
			);
			const fresh = results.filter((r): r is Row => r !== null);
			if (fresh.length === 0) return;
			setRows((prev) =>
				prev.map((row) => fresh.find((f) => f.id === row.id) ?? row),
			);
		};
		const timer = setInterval(tick, POLL_MS);
		tick();
		return () => clearInterval(timer);
	}, [processingIds]);

	const [confirming, setConfirming] = useState<Confirm | null>(null);

	async function remove(id: string): Promise<string | null> {
		const response = await fetch(`/api/admin/tutorials/${id}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			return body?.error ?? "Could not remove this tutorial.";
		}
		setRows((prev) => prev.filter((r) => r.id !== id));
		return null;
	}

	const pill = (active: boolean) =>
		`min-h-[34px] rounded-full border px-3.5 py-2 text-[12px] transition ${
			active
				? "border-[#1f5138] bg-[#1f5138] font-semibold text-white"
				: "border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400"
		}`;

	return (
		<div className="flex flex-col gap-8">
			<ConfirmDialog confirm={confirming} onClose={() => setConfirming(null)} />
			<section className="rounded-[14px] border border-neutral-200 bg-white px-6 pt-[22px] pb-6">
				<p className="mb-4 font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
					Add a tutorial
				</p>

				<p className="mb-2 font-semibold text-[12px] text-neutral-700">
					Video file
				</p>

				{/* biome-ignore lint/a11y/noStaticElementInteractions: the drop zone is
				    a convenience over the labelled file input inside it, which is the
				    keyboard and screen-reader path. */}
				<div
					onDragOver={(e) => {
						e.preventDefault();
						setDragging(true);
					}}
					onDragLeave={() => setDragging(false)}
					onDrop={(e) => {
						e.preventDefault();
						setDragging(false);
						const file = e.dataTransfer.files?.[0];
						if (file) startUpload(file);
					}}
					className={`flex flex-col items-center gap-3 rounded-xl border border-dashed p-6 text-center transition ${
						dragging
							? "border-[#1f5138] bg-[#f1f6f3]"
							: "border-[#c4c0b8] bg-[#faf9f7]"
					}`}
				>
					<svg
						width="28"
						height="28"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"
							stroke={ACCENT}
							strokeWidth="1.6"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<path
							d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
							stroke={ACCENT}
							strokeWidth="1.6"
							strokeLinecap="round"
						/>
					</svg>
					<div>
						<p className="mb-0.5 font-semibold text-[14px]">
							Pick a video to upload
						</p>
						<p className="text-[12px] text-[#5c574e]">
							MP4 or MOV, up to 4 GB. Title and description can come after.
						</p>
					</div>
					<label className="relative inline-flex min-h-[38px] cursor-pointer items-center gap-2 rounded-full bg-[#1f5138] px-[18px] py-2.5 font-semibold text-[13px] text-white transition hover:bg-[#1a4430]">
						Choose a video
						<input
							type="file"
							accept="video/*"
							onChange={(e) => {
								const file = e.target.files?.[0];
								if (file) startUpload(file);
								// Let the same file be re-picked after a remove.
								e.target.value = "";
							}}
							className="absolute h-px w-px opacity-0"
						/>
					</label>
				</div>

				{upload.phase !== "idle" && (
					<div className="mt-3.5 flex items-center gap-3 rounded-[10px] border border-neutral-200 px-3.5 py-3">
						<span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-neutral-900">
							<svg
								viewBox="0 0 24 24"
								aria-hidden="true"
								className="ml-0.5 h-3.5 w-3.5 fill-white"
							>
								<path d="M6 4l14 8-14 8V4z" />
							</svg>
						</span>
						<div className="min-w-0 flex-1">
							<p className="mb-1 truncate font-medium text-[13px]">
								{upload.name}
							</p>
							{upload.phase === "failed" ? (
								<p className="text-[11px] text-red-700">{upload.message}</p>
							) : (
								<div className="h-[5px] overflow-hidden rounded-full bg-[#ecebe7]">
									<div
										className="h-full rounded-full bg-[#1f5138] transition-[width]"
										style={{
											width:
												upload.phase === "done" ? "100%" : `${upload.percent}%`,
										}}
									/>
								</div>
							)}
						</div>
						<span className="shrink-0 text-[11px] text-[#5c574e]">
							{upload.phase === "done"
								? "Uploaded"
								: upload.phase === "failed"
									? "Failed"
									: `${upload.percent}%`}
						</span>
						<button
							type="button"
							onClick={clearUpload}
							aria-label="Remove video"
							className="h-9 w-9 shrink-0 rounded-lg border border-neutral-300 bg-white text-[14px] text-neutral-700 transition hover:border-neutral-400 hover:bg-[#f4f3f1]"
						>
							✕
						</button>
					</div>
				)}

				<div className="mt-5 flex flex-col gap-3.5">
					<div>
						<label
							htmlFor="tut-title"
							className="mb-1.5 block font-semibold text-[12px] text-neutral-700"
						>
							Title
						</label>
						<input
							id="tut-title"
							type="text"
							value={title}
							onChange={(e) => {
								setTitle(e.target.value);
								setJustPublished(false);
							}}
							placeholder="Assembling a base cabinet carcass"
							className="min-h-10 w-full rounded-[9px] border border-neutral-300 px-3 py-2.5 text-[13px]"
						/>
					</div>
					<div>
						<label
							htmlFor="tut-desc"
							className="mb-1.5 block font-semibold text-[12px] text-neutral-700"
						>
							Description
						</label>
						<textarea
							id="tut-desc"
							rows={3}
							value={description}
							onChange={(e) => {
								setDescription(e.target.value);
								setJustPublished(false);
							}}
							placeholder="Panels, cams and dowels: building your first flat-pack base cabinet from the box."
							className="w-full resize-y rounded-[9px] border border-neutral-300 px-3 py-2.5 text-[13px] leading-5"
						/>
					</div>

					<div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
						<div>
							<p className="mb-1.5 font-semibold text-[12px] text-neutral-700">
								Category
							</p>
							<div className="flex flex-wrap gap-1.5">
								{CATEGORIES.map((c) => (
									<button
										key={c.id}
										type="button"
										onClick={() => setCategory(c.id)}
										aria-pressed={category === c.id}
										className={pill(category === c.id)}
									>
										{c.label}
									</button>
								))}
							</div>
						</div>
						<div>
							<p className="mb-1.5 font-semibold text-[12px] text-neutral-700">
								Level
							</p>
							<div className="flex flex-wrap gap-1.5">
								{LEVELS.map((l) => (
									<button
										key={l.id}
										type="button"
										onClick={() => setLevel(l.id)}
										aria-pressed={level === l.id}
										className={pill(level === l.id)}
									>
										{l.label}
									</button>
								))}
							</div>
						</div>
					</div>
				</div>

				<div className="mt-[22px] flex flex-wrap items-center justify-between gap-4 border-[#ecebe7] border-t pt-[18px]">
					<p className="text-[12px] text-[#5c574e]">{hint}</p>
					<button
						type="button"
						onClick={publish}
						disabled={!ready || busy}
						className={`min-h-10 rounded-full px-[22px] py-2.5 font-semibold text-[13px] transition ${
							ready && !busy
								? "bg-[#1f5138] text-white hover:bg-[#1a4430]"
								: "cursor-not-allowed bg-[#e4e2dd] text-[#8a857c]"
						}`}
					>
						{busy && <Spinner />}
						Publish tutorial
					</button>
				</div>

				{error && (
					<p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
						{error}
					</p>
				)}
			</section>

			<section>
				<p className="mb-3 font-semibold text-[12px] text-neutral-600 uppercase tracking-[0.06em]">
					Library · {rows.length}
				</p>
				{rows.length === 0 ? (
					<div className="rounded-xl border border-neutral-200 bg-white px-6 py-11 text-center text-[13px] text-[#5c574e]">
						No tutorials yet. The public page stays live and shows nothing until
						the first one finishes processing.
					</div>
				) : (
					<div className="flex flex-col gap-2.5">
						{rows.map((row) => {
							const duration = durationLabel(row.durationSec);
							return (
								<div
									key={row.id}
									className="flex items-center gap-3.5 rounded-xl border border-neutral-200 bg-white px-4 py-3.5"
								>
									<span className="flex h-10 w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-neutral-900">
										{row.playbackId ? (
											// Mux's image host is not configured for next/image, and
											// this is an admin list behind a login.
											// biome-ignore lint/performance/noImgElement: see above
											<img
												// The span is 60x40; ask Mux for it at 3x rather
												// than letting object-cover crop a portrait frame.
												src={posterUrl(row.playbackId, {
													width: 180,
													height: 120,
													durationSec: row.durationSec,
												})}
												alt=""
												className="h-full w-full object-cover"
											/>
										) : (
											<svg
												viewBox="0 0 24 24"
												aria-hidden="true"
												className="ml-0.5 h-3.5 w-3.5 fill-white"
											>
												<path d="M6 4l14 8-14 8V4z" />
											</svg>
										)}
									</span>
									<div className="min-w-0 flex-1">
										<p className="mb-0.5 truncate font-semibold text-[14px]">
											{row.title}
										</p>
										<p className="text-[12px] text-[#5c574e]">
											{[
												LABEL[row.category] ?? row.category,
												LABEL[row.level] ?? row.level,
												duration,
											]
												.filter(Boolean)
												.join(" · ")}
										</p>
									</div>
									<span
										className={`shrink-0 rounded-full px-2.5 py-1 font-semibold text-[10px] tracking-[0.04em] ${
											BADGE_TONE[row.status] ?? BADGE_TONE.ARCHIVED
										}`}
									>
										{STATUS_LABEL[row.status] ?? row.status}
									</span>
									<button
										type="button"
										onClick={() =>
											setConfirming({
												title: "Remove this tutorial?",
												body: "The video is deleted and disappears from the public tutorials page.",
												confirmLabel: "Remove tutorial",
												danger: true,
												run: () => remove(row.id),
											})
										}
										disabled={busy}
										className="min-h-9 shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-[12px] text-neutral-700 transition hover:border-neutral-400 hover:bg-[#f4f3f1] disabled:opacity-40"
									>
										Remove
									</button>
								</div>
							);
						})}
					</div>
				)}
			</section>
		</div>
	);
}
