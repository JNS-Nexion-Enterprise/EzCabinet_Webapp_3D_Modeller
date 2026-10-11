import { captureError } from "@/lib/analytics";
import { decodeRenderMesh, type MeshGroup } from "@/lib/mesh/renderMesh";

/**
 * The drafted meshes the browser has fetched, kept apart from the component
 * that draws them.
 *
 * This file must not import three or anything that does. `StudioScreen` reads
 * `peekDesignMesh` and is in the planner's first load; when the cache lived in
 * `DesignedCabinet.tsx` that one import put three and R3F on the room picker,
 * ahead of the lazy scene chunk that was meant to carry them.
 */

/**
 * One fetch per design, shared by every placement of it.
 *
 * A run of four identical base units is one request, and the promise is cached
 * rather than the result so four cabinets mounting in the same frame do not
 * each start their own. Same lazy-singleton shape as `grain.ts`, and for the
 * same reason: this module is imported by a client component that Next also
 * renders on the server, where there is no `fetch` worth starting.
 */
const meshes = new Map<string, Promise<MeshGroup[]>>();

/**
 * What has actually arrived, readable without awaiting.
 *
 * The measuring tool needs the drawn geometry from inside a click handler,
 * where it cannot await anything — see `peekDesignMesh`.
 */
const resolved = new Map<string, MeshGroup[]>();

export function loadDesignMesh(designId: string): Promise<MeshGroup[]> {
	let pending = meshes.get(designId);
	if (!pending) {
		pending = fetch(`/api/cabinet-mesh/${designId}`)
			.then(async (res) => {
				if (!res.ok) throw new Error(`mesh ${designId}: ${res.status}`);
				return decodeRenderMesh(new Uint8Array(await res.arrayBuffer()));
			})
			.then((mesh) => {
				resolved.set(designId, mesh.groups);
				return mesh.groups;
			})
			// The cabinet still renders — procedurally — so this failure is
			// invisible on screen. Reported here, once per design, rather than
			// in each placement's hook.
			.catch((error: unknown) => {
				captureError(error, { designId });
				throw error;
			});
		meshes.set(designId, pending);
	}
	return pending;
}

/**
 * The loaded mesh, or null if it has not arrived — never a promise.
 *
 * For the measuring tool, which snaps inside a pointer handler and cannot wait.
 * Null is not a race to paper over: if the bytes are not here the scene is
 * drawing procedural boxes, so `measure.ts` snapping to procedural boxes is the
 * *correct* answer at that instant. By the time a customer can see a cabinet
 * well enough to measure it, this returns.
 */
export function peekDesignMesh(
	designId: string | undefined,
): MeshGroup[] | null {
	return designId ? (resolved.get(designId) ?? null) : null;
}
