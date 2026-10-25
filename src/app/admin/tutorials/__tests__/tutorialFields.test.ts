import { describe, expect, it } from "vitest";
import { tutorialFailure } from "../tutorialFields";

describe("tutorialFailure", () => {
	it("maps issues onto title and description", () => {
		const out = tutorialFailure({
			error: "invalid tutorial",
			issues: [{ path: ["description"] }, { path: ["title"] }],
		});
		expect(Object.keys(out.errors)).toEqual(["description", "title"]);
		expect(out.errors.title).toBe("Enter a title of 200 characters or fewer.");
		expect(out.banner).toBeNull();
	});

	it("says in plain words what no field carries", () => {
		const out = tutorialFailure({
			issues: [{ path: ["title"] }, { path: ["muxUploadId"] }],
		});
		expect(Object.keys(out.errors)).toEqual(["title"]);
		expect(out.banner).toBe(
			"Some details were not accepted. Reload the page and try again.",
		);
	});

	it("never shows a raw code, and ignores prototype keys", () => {
		expect(tutorialFailure({ error: "invalid tutorial" }).banner).toBe(
			"Could not publish this tutorial.",
		);
		expect(
			tutorialFailure({ issues: [{ path: ["toString"] }] }).errors,
		).toEqual({});
		expect(tutorialFailure(null).banner).toBe(
			"Could not publish this tutorial.",
		);
	});
});
