import "server-only";
import Mux from "@mux/ts";

/**
 * The Mux client, provisioned by the `JNSMUX` Marketplace integration on the
 * `jnsnexion` Vercel team. `MUX_TOKEN_ID` / `MUX_TOKEN_SECRET` come from that
 * integration and exist on Production, Preview and Development.
 *
 * `server-only`: these are write credentials for the video account. They must
 * never be reachable from a bundle a customer downloads.
 *
 * One client per process, reused across hot reloads for the same reason
 * `db.ts` does it.
 */
const globalForMux = globalThis as unknown as { mux?: Mux };

export const mux =
	globalForMux.mux ??
	new Mux({
		tokenId: process.env.MUX_TOKEN_ID,
		tokenSecret: process.env.MUX_TOKEN_SECRET,
	});

if (process.env.NODE_ENV !== "production") {
	globalForMux.mux = mux;
}

/**
 * How every tutorial asset is created.
 *
 * `video_quality: "basic"` is the cheapest encoding tier and the right one for
 * screen-and-workbench footage — the higher tiers buy grain retention that a
 * DIY tutorial does not need.
 *
 * `max_resolution_tier: "1080p"` is the real cost control. Mux bills delivery
 * by the asset's tier, and 4K is $0.0032/min against 1080p's $0.001 — so one
 * admin dragging in phone 4K footage would triple the delivery bill for a
 * difference nobody sees on a phone. Note there is no 720p option; 1080p is
 * the floor the SDK allows.
 *
 * Public playback: these are marketing tutorials, deliberately ungated. If
 * they ever need gating, this becomes "signed" and the player needs a token.
 */
/** A factory, not a const: the SDK wants a mutable `playback_policies` array,
 * and a shared literal would hand every call the same one. */
export const tutorialAssetSettings = () => ({
	video_quality: "basic" as const,
	max_resolution_tier: "1080p" as const,
	playback_policies: ["public" as const],
});
