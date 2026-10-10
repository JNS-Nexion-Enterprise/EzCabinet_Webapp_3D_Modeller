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
		// Real names whose first letters spell the word across a space.
		["initials that spell admin", "Ad Minh", "Ad Minh"],
		["dotted initials that spell admin", "A.D. Minhas", "A.D. Minhas"],
		["two words that spell support", "Sup Port", "Sup Port"],
		["two Chinese characters", "李伟", "李伟"],
		["Arabic", "عائشة", "عائشة"],
		// U+FE0F, the variation selector that makes the heart an emoji.
		[
			"an emoji with a variation selector",
			"Aiman \u2764\ufe0f",
			"Aiman \u2764\ufe0f",
		],
	])("accepts %s, stored as typed and trimmed", (_label, typed, stored) => {
		expect(parseCustomerName(typed)).toEqual({ name: stored });
	});

	// Invisible characters ride along on a paste from a chat app or a contact
	// card. The customer cannot see them, so they are removed, not refused.
	it.each([
		["a trailing left-to-right mark", "Aiman\u200e", "Aiman"],
		["a zero-width space inside", "Aiman\u200bAli", "AimanAli"],
		["a byte-order mark inside", "Aiman\ufeffAli", "AimanAli"],
		["a right-to-left override", "Aiman\u202eilA", "AimanilA"],
		["a left-to-right embedding", "\u202aAiman", "Aiman"],
		["a directional isolate", "Aiman \u2066Ali\u2069", "Aiman Ali"],
		["a soft hyphen", "Ai\u00adman", "Aiman"],
	])("removes %s and accepts the rest", (_label, typed, stored) => {
		expect(parseCustomerName(typed)).toEqual({ name: stored });
	});

	// The zero-width non-joiner spells words in Persian and several Indian
	// scripts, so it stays, as the joiner does.
	it("keeps a zero-width non-joiner", () => {
		expect(
			parseCustomerName("\u0639\u0644\u06cc\u200c\u0631\u0636\u0627"),
		).toEqual({
			name: "\u0639\u0644\u06cc\u200c\u0631\u0636\u0627",
		});
	});

	it("counts the length after removing them", () => {
		expect(parseCustomerName("A\u200b")).toEqual({ error: "name_required" });
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
		// Long enough, and a blank label on a staff screen all the same.
		["only zero-width spaces", "\u200b\u200b"],
		["only dots", ".."],
		["only dashes", "--"],
		["only emoji", "🙂🙂"],
		["only digits", "42"],
		// Hangul fillers are letters to Unicode and draw nothing.
		["only Hangul fillers", "\u3164\u3164"],
		["only Hangul choseong fillers", "\u115f\u115f"],
		["only Hangul jungseong fillers", "\u1160\u1160"],
		["only half-width Hangul fillers", "\uffa0\uffa0"],
		["a filler and a dot", "\u3164."],
	])("asks for a name when given %s", (_label, typed) => {
		expect(parseCustomerName(typed)).toEqual({ error: "name_required" });
	});

	it.each([
		["81 characters", "a".repeat(81)],
		["a line break inside", "Aiman\nAli"],
		["a tab inside", "Aiman\tAli"],
		["a NUL", "Aiman\u0000Ali"],
		["a line separator inside", "Aiman\u2028Ali"],
		["a paragraph separator inside", "Aiman\u2029Ali"],
		["a Hangul filler inside", "Kim\u3164Lee"],
		["the business", "EzCabinet"],
		["the business, spaced", "Ez Cabinet Sdn Bhd"],
		["the business, dotted", "ez.cabinet"],
		["the business, full-width", "ＥｚＣａｂｉｎｅｔ"],
		["the business inside a name", "Aiman from EZCABINET"],
		["admin", "admin"],
		["Admin with more", "Administrator Aiman"],
		["support", "Support"],
		["support with more", "support team"],
		// Dressed up so that a plain prefix test misses it.
		["admin behind a zero-width space", "\u200badmin"],
		["admin split by a zero-width space", "ad\u200bmin"],
		["the business split by a zero-width space", "Ez\u200bcabinet"],
		["admin behind an underscore", "_admin"],
		["support in brackets", "(support)"],
		["admin split by a soft hyphen", "ad\u00admin"],
		["admin with a surname", "Admin Lee"],
		["admin split by a zero-width space, with more", "ad\u200bmin x"],
		["support with a team", "Support Team"],
		["the business as two words", "Ez Cabinet"],
		["the business as dotted initials", "E.Z. Cabinet Lee"],
		// A first word that is nothing once folded must not hide the next.
		["admin behind a zero-width space and a space", "\u200b admin"],
		["admin behind a dash and a space", "- Admin"],
		["support in spaced brackets", "( Support )"],
		// A hair space is all but invisible: it does not end the word.
		["admin split by a hair space", "ad\u200amin"],
		["admin split by a zero-width non-joiner", "ad\u200cmin"],
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
