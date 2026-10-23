import { describe, expect, it } from "vitest";
import { testCompany } from "@/lib/company/__tests__/company.fixture";
import { sellerLine } from "@/lib/company/details";
import { type EmailContent, renderEmail } from "../layout";

const company = testCompany({
	brand: "Kabinet Baru",
	ssmNumber: "202301012345",
});

const base: EmailContent = {
	company,
	locale: "en",
	about: "order",
	preheader: "Pre",
	heading: "Heading",
	blocks: [],
};

describe("renderEmail", () => {
	it("escapes values in the HTML and leaves them alone in the text", () => {
		const { html, text } = renderEmail({
			...base,
			heading: `<script>alert("x")</script>`,
			blocks: [
				{ type: "paragraph", text: "Tom & <b>Jerry</b>" },
				{ type: "box", label: "L<", value: "V'", note: 'N"' },
			],
			footnote: "<i>foot</i>",
		});
		expect(html).not.toContain("<script>");
		expect(html).not.toContain("<b>Jerry</b>");
		expect(html).not.toContain("<i>foot</i>");
		expect(html).toContain("Tom &amp; &lt;b&gt;Jerry&lt;/b&gt;");
		expect(text).toContain("Tom & <b>Jerry</b>");
	});

	it("puts the same link in the HTML and the text", () => {
		const href = "https://x.test/en/order/tok?a=1&b=2";
		const { html, text } = renderEmail({
			...base,
			blocks: [{ type: "button", label: "View your order", href }],
		});
		expect(html).toContain('href="https://x.test/en/order/tok?a=1&amp;b=2"');
		expect(text).toContain(href);
		expect(html).toContain("If the button doesn&#39;t work");
	});

	it("renders no link fallback when there is no button", () => {
		const { html, text } = renderEmail({
			...base,
			blocks: [{ type: "code", code: "482916" }],
		});
		expect(html).not.toContain("paste this link");
		expect(html).toContain("482916");
		expect(text).toContain("482916");
	});

	it("renders receipt rows and the total in both parts", () => {
		const { html, text } = renderEmail({
			...base,
			blocks: [
				{
					type: "rows",
					rows: [{ label: "Delivery", amount: "RM 85.00" }],
					total: { label: "Total", amount: "RM 1,085.00" },
				},
			],
		});
		for (const part of [html, text]) {
			expect(part).toContain("Delivery");
			expect(part).toContain("RM 85.00");
			expect(part).toContain("RM 1,085.00");
		}
	});

	it("adds the questions line to an order mail only", () => {
		expect(renderEmail(base).text).toContain("Questions?");
		expect(renderEmail({ ...base, about: "account" }).text).not.toContain(
			"Questions?",
		);
	});

	it("wears the company's name, seller line and phone", () => {
		const { html, text } = renderEmail(base);
		expect(html).toContain(">Kabinet Baru<");
		expect(html).toContain(">K<");
		for (const part of [html, text]) {
			expect(part).toContain(sellerLine(company));
			expect(part).toContain(company.phone);
		}
	});

	it("sets the document language", () => {
		expect(renderEmail({ ...base, locale: "ms" }).html).toContain(
			'<html lang="ms">',
		);
	});
});
