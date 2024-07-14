import fs from 'fs';
import { join } from 'path';
import puppeteer, { Browser } from 'puppeteer';
import { generatePDF, generateSlug } from './index';

jest.mock('puppeteer');

beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => { });
});
afterAll(() => {
    (console.log as jest.Mock).mockRestore();
});

describe('generatePDF', () => {
    it('should generate a PDF for a valid URL', async () => {
        const mockBrowser = {
            newPage: jest.fn().mockResolvedValue({
                evaluate: jest.fn().mockResolvedValue(['https://example.com/page1', 'https://example.com/page2', 'https://example.com/page3']),
                pdf: jest.fn().mockResolvedValue(Buffer.from(fs.readFileSync(join(__dirname, 'fixture.pdf')))),
                goto: jest.fn(),
                close: jest.fn(),
            }),
            close: jest.fn(),
        };
        (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

        const url = 'https://example.com';
        const urlPattern = new RegExp(`^${url}`);
        const pdfBuffer = await generatePDF(mockBrowser as unknown as Browser, url, urlPattern);

        expect(pdfBuffer).toBeInstanceOf(Buffer);
    });
});

describe('testGenerateSlug', () => {
    it('should generate correct slug for various URLs', () => {
        const testCases = [
            { input: 'https://example.com', expected: 'example-com' },
            { input: 'http://example.com/path/to/page', expected: 'example-com-path-to-page' },
            { input: 'https://example.com?query=param', expected: 'example-com-query-param' },
            { input: 'https://example.com#anchor', expected: 'example-com-anchor' },
            { input: 'https://example.com/path with spaces/', expected: 'example-com-path-with-spaces' },
        ];

        testCases.forEach(({ input, expected }) => {
            const result = generateSlug(input);
            expect(result).toBe(expected);
        });
    });
});