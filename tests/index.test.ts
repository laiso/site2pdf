import fs from "node:fs";
import { join } from "node:path";
import type { Browser } from "puppeteer";
import { jest } from "@jest/globals";
import { buildURLPattern, generatePDF, generateSlug, normalizeURL } from "site2pdf/index";

const escapeForPattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

beforeAll(() => {
	jest.spyOn(console, "log").mockImplementation(() => {});
});

afterAll(() => {
	(console.log as jest.Mock).mockRestore();
});

describe("generatePDF", () => {
	it("should generate a PDF for a valid URL", async () => {
		let capturedPatternArgs: { patternSource: string; patternFlags: string } | undefined;
		const mockBrowser = {
			newPage: async () => ({
				evaluate: async (
					_fn: unknown,
					payload: { patternSource: string; patternFlags: string },
				) => {
					capturedPatternArgs = payload;
					return [
						"https://example.com/page1",
						"https://example.com/page2",
						"https://example.com/page3",
					];
				},
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
		const urlPattern = new RegExp(`^${url}`, "i");
		const pdfBuffer = await generatePDF(
			ctx,
			url,
			1,
			urlPattern,
		);

		expect(pdfBuffer).toBeInstanceOf(Buffer);
		expect(capturedPatternArgs).toEqual({
			patternSource: new RegExp(`^${url}`).source,
			patternFlags: "i",
		});
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

describe("buildURLPattern", () => {
	it("should escape URL characters when no pattern argument is provided", () => {
		const mainURL = "https://example.com/docs.v1/";
		const pattern = buildURLPattern(undefined, mainURL);
		const expectedSource = new RegExp(`^${escapeForPattern(mainURL)}`).source;
		expect(pattern.source).toBe(expectedSource);
		expect(pattern.flags).toBe("");
	});

	it("should parse literal style patterns with flags", () => {
		const pattern = buildURLPattern("/foo-bar/i", "https://example.com");
		expect(pattern.source).toBe("foo-bar");
		expect(pattern.flags).toBe("i");
	});
});
