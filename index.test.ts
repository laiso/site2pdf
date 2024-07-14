import { generateSlug } from './index';

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