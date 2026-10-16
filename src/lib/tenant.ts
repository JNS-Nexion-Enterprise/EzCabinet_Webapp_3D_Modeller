import demo from "../../tenants/demo.json";

/**
 * The company this deployment belongs to: everything non-secret that differs
 * between one company's site and the next. Isomorphic — the quote screen is a
 * client component and prints the seller, so `next.config.ts` inlines `TENANT`.
 *
 * EzCabinet's values are the defaults, so a deployment with no `TENANT` is
 * EzCabinet's, exactly as before this file existed.
 *
 * ponytail: one extra tenant by static import, which also puts its file in
 * every bundle. Before a second paying company: a zod `tenantSchema`, a
 * `tenants/ezcabinet.json`, and only the selected file loaded. See
 * `docs/superpowers/plans/2026-10-11-multi-company-rollout.md`, Phase 2.
 */
const ezcabinet = {
	brand: "EzCabinet",
	legalName: "EzCabinet Sdn Bhd",
	contactEmail: "hello@ezcabinet.com",
	workshopAddress: "EzCabinet Sdn Bhd, Klang Valley, Selangor",
	workshopPhone: "03-1234 5678",
	/** The landing hero's frames are a render of EzCabinet's own cabinet. */
	heroFrames: true,
	/** Bundled decor scans (`public/finishes`), used with a supplier's leave. */
	finishPhotos: true,
	/** Starts every order and delivery number: `IC-20260826-014`, `IC-00042`. */
	orderPrefix: "IC",
	/** Where couriers collect from. Taken off the client's own Maps link. */
	workshopPin: { lat: 2.9848868, lng: 101.861807 },
	workshopPostcode: "43800",
	workshopCity: "Dengkil",
	/** ISO 3166-2:MY — `MY-10` is Selangor. */
	workshopState: "MY-10",
};

export type Tenant = typeof ezcabinet;

export const tenantFor = (slug: string | undefined): Tenant =>
	slug === "demo" ? { ...ezcabinet, ...demo } : ezcabinet;

export const tenant = tenantFor(process.env.TENANT);
