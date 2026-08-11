import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupWord } from './freeDictionaryApi';

function jsonResponse(data: unknown, ok = true) {
    return {
        ok,
        json: () => Promise.resolve(data),
    } as Response;
}

const EXAMPLE = [
    {
        word: 'example',
        phonetic: '/əɡˈzæmpl̩/',
        phonetics: [{ text: '' }, { text: '/ɪɡˈzɑːmpl̩/' }],
        meanings: [
            {
                partOfSpeech: 'noun',
                definitions: [{ definition: 'Something representative of a group.', example: 'a fine example' }],
            },
        ],
    },
];

describe('lookupWord (Free Dictionary)', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('extracts definition, phonetic, part of speech, and example; level is null', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(EXAMPLE));

        const result = await lookupWord('example');

        expect(result).toEqual({
            level: null,
            definition: 'Something representative of a group.',
            phonetic: '/əɡˈzæmpl̩/',
            partOfSpeech: 'noun',
            example: 'a fine example',
        });
    });

    it('falls back to the first non-empty phonetics[].text when phonetic is absent', async () => {
        const data = [{ ...EXAMPLE[0], phonetic: undefined }];
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(data));

        const result = await lookupWord('phon');

        expect(result?.phonetic).toBe('/ɪɡˈzɑːmpl̩/');
    });

    it('skips meanings with no usable definition', async () => {
        const data = [
            {
                meanings: [
                    { partOfSpeech: 'noun', definitions: [{ definition: '   ' }] },
                    { partOfSpeech: 'verb', definitions: [{ definition: 'To illustrate.' }] },
                ],
            },
        ];
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(data));

        const result = await lookupWord('skip');

        expect(result?.definition).toBe('To illustrate.');
        expect(result?.partOfSpeech).toBe('verb');
    });

    it('returns null for a non-OK response', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({}, false));
        expect(await lookupWord('missing')).toBeNull();
    });

    it('returns null when fetch rejects', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));
        expect(await lookupWord('boom')).toBeNull();
    });

    it('returns null and does not call fetch for an empty word', async () => {
        expect(await lookupWord('  ')).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('caches a successful lookup and does not refetch', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse(EXAMPLE));

        await lookupWord('CacheMe');
        await lookupWord('cacheme');

        expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('returns null when the response JSON is not an array', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonResponse({ title: 'No Definitions Found' }));
        expect(await lookupWord('notarray')).toBeNull();
    });

    it('returns null when the request times out (abort fires)', async () => {
        vi.useFakeTimers();
        (fetch as ReturnType<typeof vi.fn>).mockImplementation(
            (_url: string, opts: { signal: AbortSignal }) =>
                new Promise((_resolve, reject) => {
                    opts.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                })
        );

        const pending = lookupWord('slow');
        await vi.advanceTimersByTimeAsync(5000);

        expect(await pending).toBeNull();
        vi.useRealTimers();
    });
});
