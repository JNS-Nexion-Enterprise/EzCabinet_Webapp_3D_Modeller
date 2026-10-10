import { describe, expect, it } from "vitest";
import { initialsOf } from "../initials";

describe("initialsOf", () => {
	it("takes the first and last word of the name", () => {
		expect(initialsOf("Nur Aisyah binti Kamal", "a@x.com")).toBe("NK");
	});
	it("takes one letter from a one-word name", () => {
		expect(initialsOf("aisyah", "a@x.com")).toBe("A");
	});
	it("falls back to the email when there is no name", () => {
		expect(initialsOf("", "zed@x.com")).toBe("Z");
		expect(initialsOf(null, "zed@x.com")).toBe("Z");
	});
	// An emoji is two UTF-16 units; half of one draws as a broken character.
	it.each([
		["Aiman bin Rahman 🙂", "AR"],
		["🙂 Mei", "M"],
		["李 伟", "李伟"],
		["🙂", "Z"],
		["🙂 👩‍👧", "Z"],
		["- Mei Ling -", "ML"],
		// A letter outside the basic plane is taken whole.
		["𠮷田 Taro", "𠮷T"],
		["7 Eleven", "7E"],
	])("%j", (name, expected) => {
		expect(initialsOf(name, "zed@x.com")).toBe(expected);
	});
});
