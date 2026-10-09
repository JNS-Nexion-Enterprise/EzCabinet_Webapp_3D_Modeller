import { describe, expect, it } from "vitest";
import {
	customerNameSchema,
	owesName,
	parseCustomerName,
} from "@/lib/auth/customerName";

describe("parseCustomerName", () => {
	it.each([
		["a plain name", "Aiman bin Ali", "Aiman bin Ali"],
		["surrounding spaces", "  Aiman bin Ali \n", "Aiman bin Ali"],
		["a two-letter name", "Li", "Li"],
		["Chinese", "李明", "李明"],
		["Jawi", "أيمن بن علي", "أيمن بن علي"],
		["Tamil", "அருண் குமார்", "அருண் குமார்"],
		["an emoji", "Aiman 🙂", "Aiman 🙂"],
		// Built with a zero-width joiner, which is why that one is allowed.
		["a joined emoji", "Mei 👩‍👧", "Mei 👩‍👧"],
		["an apostrophe and a slash", "Siti a/p D'Cruz", "Siti a/p D'Cruz"],
		["exactly 80 characters", "a".repeat(80), "a".repeat(80)],
		["a name that only contains admin", "Badminton Lee", "Badminton Lee"],
		["a name that only contains support", "Lee Supporter", "Lee Supporter"],
	])("accepts %s, stored as typed and trimmed", (_label, typed, stored) => {
		expect(parseCustomerName(typed)).toEqual({ name: stored });
	});

	it.each([
		["nothing", ""],
		["only spaces", "   "],
		["one letter", "A"],
		["one letter and spaces", "  A  "],
		["no value", undefined],
		["null", null],
		["a number", 42],
		["an object", { name: "Aiman" }],
	])("asks for a name when given %s", (_label, typed) => {
		expect(parseCustomerName(typed)).toEqual({ error: "name_required" });
	});

	it.each([
		["81 characters", "a".repeat(81)],
		["a line break inside", "Aiman\nAli"],
		["a tab inside", "Aiman\tAli"],
		["a NUL", "Aiman\u0000Ali"],
		["a right-to-left override", "Aiman‮ilA"],
		["a left-to-right embedding", "‪Aiman"],
		["a directional isolate", "Aiman⁦Ali⁩"],
		["the business", "EzCabinet"],
		["the business, spaced", "Ez Cabinet Sdn Bhd"],
		["the business, dotted", "ez.cabinet"],
		["the business, full-width", "ＥｚＣａｂｉｎｅｔ"],
		["the business inside a name", "Aiman from EZCABINET"],
		["admin", "admin"],
		["Admin with more", "Administrator Aiman"],
		["support", "Support"],
		["support with more", "support team"],
	])("refuses %s", (_label, typed) => {
		expect(parseCustomerName(typed)).toEqual({ error: "name_refused" });
	});

	it("is the schema's own verdict", () => {
		expect(customerNameSchema.safeParse(" Aiman ").data).toBe("Aiman");
		expect(customerNameSchema.safeParse("A").success).toBe(false);
	});
});

describe("owesName", () => {
	it.each([
		["a code customer with no name yet", "CUSTOMER", "", true],
		["a customer whose name is only spaces", "CUSTOMER", "   ", true],
		["a customer with a null name", "CUSTOMER", null, true],
		["a customer with a name", "CUSTOMER", "Aiman", false],
		// Staff are named by the invite; a blank one must not lock them out.
		["an admin with no name", "ADMIN", "", false],
		["a superadmin with no name", "SUPERADMIN", "", false],
	] as const)("%s", (_label, role, name, expected) => {
		expect(owesName({ role, name })).toBe(expected);
	});
});
