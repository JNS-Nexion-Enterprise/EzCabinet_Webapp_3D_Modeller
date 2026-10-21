import { describe, expect, it, vi } from "vitest";
import type { Delivery } from "@/generated/prisma/client";
import { testCompany } from "@/lib/company/__tests__/company.fixture";

vi.mock("@/lib/catalogue/db", () => ({ prisma: {} }));
vi.mock("@/lib/whatsapp/outbox", () => ({
	enqueue: vi.fn(),
	flushSoon: vi.fn(),
}));

import { toJob } from "../store";

const row = {
	id: "dlv_1",
	number: 7,
	refPrefix: "IC",
	customerName: "Siti",
	customerPhone: "012-345 6789",
	siteAddress: "Jalan PJU 5/20",
	addressNotes: null,
	pickupAddress: "Lot 1, Jalan Kilang",
	siteLat: null,
	siteLng: null,
	pickupLat: null,
	pickupLng: null,
	sitePostcode: null,
	siteCity: null,
	siteState: null,
	pickupPostcode: "43800",
	pickupCity: "Dengkil",
	pickupState: "MY-10",
	items: [],
	totalWeightKg: null,
	totalVolumeM3: null,
	scheduledAt: null,
} as unknown as Delivery;

describe("toJob", () => {
	it("carries the ref the delivery was made under and the live company's sender", () => {
		const job = toJob(row, testCompany({ phone: "03-5555 1234" }));
		expect(job.ref).toBe("IC-00007");
		expect(job.sender).toEqual({
			brand: "EzCabinet",
			legalName: "EzCabinet Sdn Bhd",
			phone: "03-5555 1234",
			closeTime: "18:00",
		});
	});
});
