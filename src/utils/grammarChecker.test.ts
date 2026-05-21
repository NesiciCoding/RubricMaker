import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkGrammar, LT_ATTRIBUTION_URL } from './grammarChecker';

describe('LT_ATTRIBUTION_URL', () => {
    it('is a non-empty string', () => {
        expect(typeof LT_ATTRIBUTION_URL).toBe('string');
        expect(LT_ATTRIBUTION_URL.length).toBeGreaterThan(0);
    });
});

describe('checkGrammar — LanguageTool path', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns languagetool errors when fetch succeeds', async () => {
        const mockResponse = {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
                matches: [
                    {
                        message: 'Use a comma here.',
                        offset: 5,
                        length: 3,
                        replacements: [{ value: 'fix' }],
                        rule: { id: 'COMMA_RULE' },
                    },
                ],
            }),
        };
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(mockResponse);

        const result = await checkGrammar('hello world test', 'en-US');
        expect(result.source).toBe('languagetool');
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].message).toBe('Use a comma here.');
        expect(result.errors[0].offset).toBe(5);
        expect(result.errors[0].length).toBe(3);
        expect(result.errors[0].suggestions).toEqual(['fix']);
        expect(result.errors[0].ruleId).toBe('COMMA_RULE');
    });

    it('reports textWasTruncated as false for short text', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ matches: [] }),
        });
        const result = await checkGrammar('short text');
        expect(result.textWasTruncated).toBe(false);
    });

    it('reports textWasTruncated as true and truncates text exceeding 20 KB', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({ matches: [] }),
        });
        // 25 000 ASCII chars = 25 000 bytes — well above the 20 480-byte limit
        const longText = 'a'.repeat(25_000);
        const result = await checkGrammar(longText);
        expect(result.textWasTruncated).toBe(true);
    });

    it('caps suggestions at 3', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
                matches: [{
                    message: 'test',
                    offset: 0,
                    length: 1,
                    replacements: [
                        { value: 'a' }, { value: 'b' }, { value: 'c' }, { value: 'd' },
                    ],
                }],
            }),
        });
        const result = await checkGrammar('x');
        expect(result.errors[0].suggestions).toHaveLength(3);
    });

    it('falls back to compromise when fetch returns 429', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status: 429,
            json: vi.fn(),
        });
        const result = await checkGrammar('The the cat sat on the mat.');
        expect(result.source).toBe('compromise');
    });

    it('falls back to compromise when fetch throws', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
        const result = await checkGrammar('Hello world.');
        expect(result.source).toBe('compromise');
    });

    it('falls back to compromise when fetch returns non-ok status', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
            ok: false,
            status: 500,
            json: vi.fn(),
        });
        const result = await checkGrammar('Hello world.');
        expect(result.source).toBe('compromise');
    });
});

describe('checkGrammar — compromise fallback', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('detects repeated consecutive words', async () => {
        const result = await checkGrammar('the the cat sat on the mat.');
        expect(result.source).toBe('compromise');
        const repeated = result.errors.find(e => e.ruleId === 'COMPROMISE_REPEATED_WORD');
        expect(repeated).toBeDefined();
        expect(repeated!.suggestions).toEqual(['the']);
    });

    it('returns empty errors array for clean text', async () => {
        const result = await checkGrammar('The cat sat on the mat.');
        expect(result.source).toBe('compromise');
        expect(result.errors.filter(e => e.ruleId === 'COMPROMISE_REPEATED_WORD')).toHaveLength(0);
    });

    it('returns errors array (may be empty) without throwing', async () => {
        const result = await checkGrammar('');
        expect(result.source).toBe('compromise');
        expect(Array.isArray(result.errors)).toBe(true);
    });
});
