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
};

export type Tenant = typeof ezcabinet;

export const tenantFor = (slug: string | undefined): Tenant =>
	slug === "demo" ? { ...ezcabinet, ...demo } : ezcabinet;

export const tenant = tenantFor(process.env.TENANT);
