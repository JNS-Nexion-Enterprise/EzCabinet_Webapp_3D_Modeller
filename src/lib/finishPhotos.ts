import { DEFAULT_FINISH_TEXTURES } from "@/lib/planner/finishTextures";
import { tenant } from "@/lib/tenant";

/**
 * The decor scans this deployment may show without an admin upload. The
 * bundled ones are EzCabinet's, used with a board supplier's leave, so
 * another company's site gets none and its finishes draw as flat colour
 * until it uploads its own.
 */
export const BUNDLED_FINISH_TEXTURES: Record<string, string> =
	tenant.finishPhotos ? DEFAULT_FINISH_TEXTURES : {};
