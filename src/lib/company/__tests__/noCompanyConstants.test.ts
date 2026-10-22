import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");

function sources(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const p = join(dir, e.name);
		if (e.isDirectory()) {
			return e.name === "__tests__" || p.endsWith(join("src", "generated"))
				? []
				: sources(p);
		}
		return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
	});
}

const files = sources(join(ROOT, "src")).map((p) => ({
	path: relative(ROOT, p).split("\\").join("/"),
	text: readFileSync(p, "utf8"),
}));

describe("company facts live in the database, not in code", () => {
	it("only the seed and two switches read the tenant file", () => {
		const readers = files
			.filter((f) => f.text.includes("@/lib/tenant"))
			.map((f) => f.path)
			.sort();
		expect(
			readers,
			"a company fact read from code is one EzCabinet cannot change; read getCompany() instead",
		).toEqual([
			"src/app/admin/login/page.tsx",
			"src/lib/company/details.ts",
			"src/lib/finishPhotos.ts",
		]);
	});

	it("no WORKSHOP_* or BANK_TRANSFER constant remains, even in a comment", () => {
		const offenders = files
			.filter((f) => /WORKSHOP_[A-Z]+|BANK_TRANSFER/.test(f.text))
			.map((f) => f.path);
		expect(
			offenders,
			"a company fact read from code is one EzCabinet cannot change; read getCompany() instead",
		).toEqual([]);
	});
});
