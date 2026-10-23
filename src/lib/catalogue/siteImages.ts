/**
 * Homepage photo slots.
 *
 * A slot key is a stable string the `SiteImage` table is keyed by. The room
 * and finish slots are derived from the live catalogue rather than
 * hardcoded, so adding a finish in `/admin/catalogue` adds its photo slot
 * here too — the design mocks six fixed finish slots, but this app's
 * finishes are catalogue data, and two lists that must be kept in step by
 * hand will drift.
 */

/** The photo hero: phones, and anyone who has asked for reduced motion. */
export const HERO_SLOT = "hero";
/** The tall photo beside the how-it-works steps. */
export const HOW_SLOT = "how";

export const roomSlot = (roomId: string) => `room:${roomId}`;
export const finishSlot = (finishId: string) => `finish:${finishId}`;

/** Only these shapes are accepted — the upload token route and the write
 * endpoint both check against it, so a client can't invent a slot and park
 * arbitrary files in the bucket under an admin session. */
export const SLOT_KEY = /^(hero|how|room:[a-z-]+|finish:[a-z0-9-]+)$/;

/** `site/<slot with : swapped for _>/<filename>`. Blob pathnames can contain
 * a colon, but it survives round-tripping through URLs and CLIs badly. */
export function siteImagePathname(slotKey: string, filename: string): string {
	const safeSlot = slotKey.replace(/:/g, "_");
	const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
	return `site/${safeSlot}/${safeName}`;
}

export const SITE_IMAGE_PATHNAME =
	/^site\/(hero|how|room_[a-z-]+|finish_[a-z0-9-]+)\/[^/]+$/;

/** What the browser is allowed to upload here. Unlike a design export (which browsers
 * sniff to junk MIME types) these are ordinary web images, so the content
 * type is worth pinning. */
export const SITE_IMAGE_CONTENT_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
];

export const SITE_IMAGE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Where the browser fetches a slot's photo from.
 *
 * Not the Blob URL directly: this project's Blob store is configured
 * private-access-only (a public `put` fails outright with "Cannot use public
 * access on a private store"), which is deliberate — design files carry
 * the client's module standard and must never get a public URL. Rather than
 * open the whole store up, marketing photos are streamed back out through
 * `/api/site-images/[key]`, which is the one thing in there allowed to be
 * public.
 *
 * `v` is the row's `updatedAt`, so replacing a photo busts any cached copy
 * without needing the pathname itself to change.
 */
export function siteImageSrc(key: string, updatedAt: Date | string): string {
	const v = new Date(updatedAt).getTime();
	return `/api/site-images/${encodeURIComponent(key)}?v=${v}`;
}
