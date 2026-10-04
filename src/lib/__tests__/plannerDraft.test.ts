import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PLANNER_CATALOGUE } from "@/lib/planner/catalogue";
import { emptyRoom, roomEngine } from "@/lib/planner/room";
import {
	clearDraft,
	loadDraft,
	type PlannerDraft,
	reconcileDraft,
	saveDraft,
} from "@/lib/plannerDraft";

function memoryStorage(): Storage {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		clear: () => map.clear(),
		getItem: (k) => map.get(k) ?? null,
		key: (i) => [...map.keys()][i] ?? null,
		removeItem: (k) => void map.delete(k),
		setItem: (k, v) => void map.set(k, v),
	} as Storage;
}

const draft: PlannerDraft = {
	version: 1,
	roomId: "kitchen",
	finishId: "oak",
	rooms: { kitchen: { runs: [] } },
};

beforeEach(() => {
	vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("plannerDraft", () => {
	it("round-trips a draft", () => {
		saveDraft(draft);
		expect(loadDraft()).toEqual(draft);
	});

	it("returns null when nothing is stored", () => {
		expect(loadDraft()).toBeNull();
	});

	it("returns null on corrupt JSON rather than throwing", () => {
		localStorage.setItem("ezcabinet.planner.draft", "{not json");
		expect(loadDraft()).toBeNull();
	});

	it("returns null on a draft written by a future version", () => {
		localStorage.setItem(
			"ezcabinet.planner.draft",
			JSON.stringify({ ...draft, version: 99 }),
		);
		expect(loadDraft()).toBeNull();
	});

	it("survives a storage that throws on write", () => {
		vi.stubGlobal("localStorage", {
			...memoryStorage(),
			setItem: () => {
				throw new DOMException("QuotaExceededError");
			},
		} as Storage);
		expect(() => saveDraft(draft)).not.toThrow();
	});

	it("survives a storage that throws on read", () => {
		vi.stubGlobal("localStorage", {
			...memoryStorage(),
			getItem: () => {
				throw new DOMException("SecurityError");
			},
		} as Storage);
		expect(loadDraft()).toBeNull();
	});

	it("clears", () => {
		saveDraft(draft);
		clearDraft();
		expect(loadDraft()).toBeNull();
	});

	it("returns null when rooms is not an object", () => {
		for (const rooms of ["kitchen", 42, null, true]) {
			localStorage.setItem(
				"ezcabinet.planner.draft",
				JSON.stringify({ ...draft, rooms }),
			);
			expect(loadDraft()).toBeNull();
		}
	});

	it("returns null when roomId or finishId is not a string", () => {
		localStorage.setItem(
			"ezcabinet.planner.draft",
			JSON.stringify({ ...draft, roomId: 7 }),
		);
		expect(loadDraft()).toBeNull();
		localStorage.setItem(
			"ezcabinet.planner.draft",
			JSON.stringify({ ...draft, finishId: null }),
		);
		expect(loadDraft()).toBeNull();
	});

	// Drafts saved before ids were random can hold two cabinets sharing one.
	it("gives a repeated cabinet id a fresh one, keeping the first", () => {
		const cab = (id: string, xMm: number) => ({ id, familyId: "bc", xMm });
		saveDraft({
			...draft,
			rooms: {
				kitchen: {
					runs: [
						{ floor: [cab("m1", 0), cab("m2", 600)], wall: [cab("m1", 0)] },
					],
					free: [cab("m2", 900)],
				},
			},
		});
		const kitchen = loadDraft()?.rooms.kitchen as {
			runs: { floor: { id: string }[]; wall: { id: string }[] }[];
			free: { id: string }[];
		};
		const ids = [
			...kitchen.runs[0].floor,
			...kitchen.runs[0].wall,
			...kitchen.free,
		].map((m) => m.id);
		expect(ids.slice(0, 2)).toEqual(["m1", "m2"]);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("reconcileDraft", () => {
	const engine = roomEngine(PLANNER_CATALOGUE);
	const room = PLANNER_CATALOGUE.roomTypes[0];
	const familyId = room.familyIds[0];
	const two = engine.addModule(
		engine.addModule(emptyRoom(4200), familyId, 0),
		familyId,
		2000,
	);

	it("keeps a draft the catalogue can still draw", () => {
		const out = reconcileDraft(
			{
				version: 1,
				roomId: room.id,
				finishId: PLANNER_CATALOGUE.finishes[0].id,
				rooms: { [room.id]: two },
			},
			PLANNER_CATALOGUE,
		);
		expect(out.roomId).toBe(room.id);
		expect(out.finishId).toBe(PLANNER_CATALOGUE.finishes[0].id);
		expect(engine.allPositions(out.rooms[room.id])).toHaveLength(2);
	});

	it("drops a cabinet whose design left the catalogue", () => {
		const stale = structuredClone(two);
		stale.runs[0].floor[0].familyId = "unpublished";
		const out = reconcileDraft(
			{
				version: 1,
				roomId: room.id,
				finishId: "x",
				rooms: { [room.id]: stale },
			},
			PLANNER_CATALOGUE,
		);
		const left = out.rooms[room.id].runs[0].floor;
		expect(left.map((m) => m.familyId)).toEqual([familyId]);
	});

	it("forgets a room, a finish and a layout the catalogue cannot read", () => {
		const out = reconcileDraft(
			{
				version: 1,
				roomId: "attic",
				finishId: "gone",
				rooms: { attic: two, [room.id]: { runs: [] } },
			},
			PLANNER_CATALOGUE,
		);
		expect(out).toEqual({ roomId: undefined, finishId: undefined, rooms: {} });
	});

	it("is empty for no draft", () => {
		expect(reconcileDraft(null, PLANNER_CATALOGUE)).toEqual({ rooms: {} });
	});
});
