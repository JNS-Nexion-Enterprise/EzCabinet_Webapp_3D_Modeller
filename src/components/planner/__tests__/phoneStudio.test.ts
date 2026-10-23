import { describe, expect, it } from "vitest";
import {
	initialPhoneTab,
	nextDoorView,
	PHONE_TABS,
	tabAfterSelection,
} from "../studio/phoneStudio";

describe("phone studio tabs", () => {
	it("lists the design's four tabs in its order", () => {
		expect(PHONE_TABS).toEqual(["selected", "add", "room", "run"]);
	});
	it("opens an empty room on Room, a furnished one on Selected", () => {
		expect(initialPhoneTab(0)).toBe("room");
		expect(initialPhoneTab(3)).toBe("selected");
	});
	it("jumps to Selected when something is selected, and stays put when not", () => {
		expect(tabAfterSelection("run", 1)).toBe("selected");
		expect(tabAfterSelection("add", 2)).toBe("selected");
		expect(tabAfterSelection("add", 0)).toBe("add");
		expect(tabAfterSelection("room", 0)).toBe("room");
	});
});

describe("doors button", () => {
	it("cycles closed → open → hidden → closed", () => {
		expect(nextDoorView("closed")).toBe("open");
		expect(nextDoorView("open")).toBe("hidden");
		expect(nextDoorView("hidden")).toBe("closed");
	});
});
