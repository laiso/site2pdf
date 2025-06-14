import fs from "node:fs";
import { join } from "node:path";
import type { Browser } from "puppeteer";
import { jest } from "@jest/globals";
import { generatePDF, generateSlug, normalizeURL } from "site2pdf/index";

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
	(console.log as jest.Mock).mockRestore();
});

describe("generatePDF", () => {
	it("should generate a PDF for a valid URL", async () => {
		const mockBrowser = {
			newPage: async () => ({
				evaluate: async () => [
					"https://example.com/page1",
					"https://example.com/page2",
					"https://example.com/page3",
				],
				pdf: async () => {
					const fixturePath = join(
						process.cwd(),
						"tests",
						"fixtures",
						"sample.pdf",
					);
					return Buffer.from(fs.readFileSync(fixturePath));
				},
				goto: async () => {},
				close: async () => {},
			}),
			close: async () => {},
		} as unknown as Browser;
		const ctx = {
			browser: mockBrowser,
			page: await mockBrowser.newPage(),
		};

		const url = "https://example.com";
		const urlPattern = new RegExp(`^${url}`);
		const pdfBuffer = await generatePDF(
			ctx,
			url,
			1,
			urlPattern,
		);

		expect(pdfBuffer).toBeInstanceOf(Buffer);
	});
});

describe("testGenerateSlug", () => {
	it("should generate correct slug for various URLs", () => {
		const testCases = [
			{ input: "https://example.com", expected: "example-com" },
			{
				input: "http://example.com/path/to/page",
				expected: "example-com-path-to-page",
			},
			{
				input: "https://example.com?query=param",
				expected: "example-com-query-param",
			},
			{ input: "https://example.com#anchor", expected: "example-com-anchor" },
			{
				input: "https://example.com/path with spaces/",
				expected: "example-com-path-with-spaces",
			},
		];

		for (const { input, expected } of testCases) {
			const result = generateSlug(input);
			expect(result).toBe(expected);
		}
	});
});

describe("normalizeURL", () => {
	it("should normalize URLs correctly", () => {
		const testCases = [
			{
				input: "https://example.com/",
				expected: "https://example.com",
			},
			{
				input: "https://example.com/page/",
				expected: "https://example.com/page",
			},
			{
				input: "https://example.com/page#section",
				expected: "https://example.com/page",
			},
			{
				input: "https://example.com/page/#section",
				expected: "https://example.com/page",
			},
			{
				input: "https://example.com/page?query=param",
				expected: "https://example.com/page?query=param",
			},
		];

		for (const { input, expected } of testCases) {
			const normalized = normalizeURL(input);
			expect(normalized).toBe(expected);
		}
	});
});
