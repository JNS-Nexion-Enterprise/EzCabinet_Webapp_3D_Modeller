import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "../../..");

describe("every mail wears the shared layout", () => {
	it("no file writes its own mail HTML", () => {
		const own = readdirSync(SRC, { recursive: true, encoding: "utf8" })
			.filter((file) => /\.tsx?$/.test(file) && !file.includes("__tests__"))
			// A mail's `html` comes from `renderEmail`, never a literal.
			.filter((file) =>
				/\bhtml:\s*[`"']/.test(readFileSync(join(SRC, file), "utf8")),
			);
		expect(own).toEqual([]);
	});
});
