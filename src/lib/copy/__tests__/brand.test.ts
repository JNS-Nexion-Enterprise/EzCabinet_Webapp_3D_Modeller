import { describe, expect, it } from "vitest";
import { tenantFor } from "@/lib/tenant";
import { en } from "../en";
import { ms } from "../ms";
import { zh } from "../zh";

const strings = (node: unknown): string[] =>
	typeof node === "string"
		? [node]
		: node && typeof node === "object"
			? Object.values(node).flatMap(strings)
			: [];

const named = (node: unknown) =>
	strings(node).filter((s) => /ezcabinet/i.test(s));

describe("the company's name", () => {
	// `common.brand` and the contact address are overwritten from the tenant
	// in `getDictionary`; every other string must say `{brand}`.
	it.each([
		["en", en],
		["ms", ms],
		["zh", zh],
	])("%s names the company only as {brand}", (_locale, dictionary) => {
		const { common, landing, ...rest } = dictionary;
		const { footer, ...landingRest } = landing;
		expect(
			named([
				rest,
				landingRest,
				{ ...common, brand: "" },
				{ ...footer, email: "" },
			]),
		).toEqual([]);
	});

	it("the demo tenant carries nothing of EzCabinet's", () => {
		const demo = tenantFor("demo");
		expect(named(demo)).toEqual([]);
		expect(demo.heroFrames).toBe(false);
		expect(tenantFor(undefined).brand).toBe("EzCabinet");
	});
});
