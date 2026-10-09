import { describe, expect, it } from "vitest";
import { EMAIL_COPY } from "../copy";

const paths = (value: unknown, prefix = ""): string[] =>
	typeof value === "object" && value !== null
		? Object.entries(value).flatMap(([key, child]) =>
				paths(child, prefix ? `${prefix}.${key}` : key),
			)
		: [prefix];

const at = (dict: unknown, path: string): string =>
	path.split(".").reduce<never>((v, k) => (v as never)[k], dict as never);

const placeholders = (value: string) =>
	[...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("email copy", () => {
	it("covers every mail", () => {
		expect(Object.keys(EMAIL_COPY.en).sort()).toEqual(
			[
				"delivered",
				"deliveryBooked",
				"deliveryFailed",
				"orderPlaced",
				"orderRefunded",
				"paymentConfirmed",
				"pickedUp",
				"shared",
				"signInCode",
				"stage",
			].sort(),
		);
	});

	it.each(["ms", "zh"] as const)("%s has English's keys", (locale) => {
		expect(paths(EMAIL_COPY[locale]).sort()).toEqual(
			paths(EMAIL_COPY.en).sort(),
		);
	});

	// A translation that drops `{ref}` sends a mail with no order number.
	it.each(["ms", "zh"] as const)(
		"%s keeps every placeholder English has",
		(locale) => {
			for (const path of paths(EMAIL_COPY.en)) {
				expect([path, placeholders(at(EMAIL_COPY[locale], path))]).toEqual([
					path,
					placeholders(at(EMAIL_COPY.en, path)),
				]);
			}
		},
	);

	it.each(["ms", "zh"] as const)("%s leaves nothing in English", (locale) => {
		const same = paths(EMAIL_COPY.en).filter(
			(p) => at(EMAIL_COPY[locale], p) === at(EMAIL_COPY.en, p),
		);
		expect(same).toEqual([]);
	});
});
