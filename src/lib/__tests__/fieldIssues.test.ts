import { describe, expect, it } from "vitest";
import { fieldsFromIssues } from "../fieldIssues";

const issue = (...path: PropertyKey[]) => ({ path, message: "x" });
const dropDetails = (path: readonly PropertyKey[]) =>
	path[0] === "details" && typeof path[1] === "string" ? path[1] : null;

describe("fieldsFromIssues", () => {
	it("names the field behind a prefixed path", () =>
		expect(fieldsFromIssues([issue("details", "phone")], dropDetails)).toEqual([
			"phone",
		]));

	it("reads through an array index", () =>
		expect(
			fieldsFromIssues([issue("items", 0, "lengthMm")], (p) =>
				p[0] === "items" ? `${String(p[1])}.${String(p[2])}` : null,
			),
		).toEqual(["0.lengthMm"]));

	it("keeps the first failing field first and names each once", () =>
		expect(
			fieldsFromIssues(
				[
					issue("details", "city"),
					issue("details", "brand"),
					issue("details", "city"),
				],
				dropDetails,
			),
		).toEqual(["city", "brand"]));

	it("drops a path toField does not recognise", () =>
		expect(
			fieldsFromIssues(
				[issue("other", "x"), issue("details", "brand")],
				dropDetails,
			),
		).toEqual(["brand"]));

	it.each([undefined, {}, [{}], "x", null, [null, { path: "details" }]])(
		"returns nothing for garbage %j",
		(garbage) => expect(fieldsFromIssues(garbage, dropDetails)).toEqual([]),
	);
});
