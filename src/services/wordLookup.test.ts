import { describe, it, expect, vi, beforeEach } from 'vitest';

const lookupFree = vi.fn();
const lookupWn = vi.fn();
vi.mock('./freeDictionaryApi', () => ({ lookupWord: (w: string) => lookupFree(w) }));
vi.mock('./wordnetPack', () => ({ lookupWordnet: (w: string) => lookupWn(w) }));

import { lookupManyWordDetails, lookupWordDetails, translateWord, translationTarget } from './wordLookup';

const FREE = { level: null, definition: 'online def', phonetic: '/x/', partOfSpeech: 'noun', example: null };

function translation(text: string, status: number | string = 200) {
    return {
        ok: true,
        json: () => Promise.resolve({ responseStatus: status, responseData: { translatedText: text } }),
    };
}

describe('wordLookup', () => {
    beforeEach(() => {
        lookupFree.mockReset();
        lookupWn.mockReset();
        vi.stubGlobal('fetch', vi.fn());
    });

    it('derives a translation target and skips English', () => {
        expect(translationTarget('nl-NL')).toBe('nl');
        expect(translationTarget('en')).toBeNull();
        expect(translationTarget('')).toBeNull();
    });

    it('translates via MyMemory and caches the result', async () => {
        vi.mocked(fetch).mockResolvedValue(translation('Hond') as unknown as Response);
        expect(await translateWord('dog', 'nl')).toBe('hond');
        expect(await translateWord('dog', 'nl')).toBe('hond');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('langpair=en|nl');
        expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain('de=admin%40rubricmaker.nl');
    });

    it('rejects failed, unchanged and errored translations', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(translation('bird', 429) as unknown as Response);
        expect(await translateWord('bird', 'fr')).toBeNull();
        vi.mocked(fetch).mockResolvedValueOnce(translation('Piano') as unknown as Response);
        expect(await translateWord('piano', 'fr')).toBeNull();
        vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
        expect(await translateWord('tree', 'fr')).toBeNull();
    });

    it('prefers the online dictionary and adds the translation', async () => {
        lookupFree.mockResolvedValue(FREE);
        vi.mocked(fetch).mockResolvedValue(translation('kat') as unknown as Response);
        const d = await lookupWordDetails('cat', 'nl');
        expect(d).toMatchObject({ definition: 'online def', phonetic: '/x/', translation: 'kat' });
        expect(lookupWn).not.toHaveBeenCalled();
    });

    it('falls back to WordNet when the online lookup fails', async () => {
        lookupFree.mockResolvedValue(null);
        lookupWn.mockResolvedValue({ definition: 'wn def', partOfSpeech: 'noun', example: 'ex' });
        const d = await lookupWordDetails('cat', null);
        expect(d).toEqual({
            definition: 'wn def',
            phonetic: null,
            partOfSpeech: 'noun',
            example: 'ex',
            translation: null,
        });
    });

    it('returns blanks when nothing is found, and keeps input order across a batch', async () => {
        lookupFree.mockImplementation(async (w: string) => (w === 'b' ? { ...FREE, definition: 'B' } : null));
        lookupWn.mockResolvedValue(null);
        const progress = vi.fn();
        const out = await lookupManyWordDetails(['a', 'b', 'c'], null, progress);
        expect(out.map((d) => d.definition)).toEqual([null, 'B', null]);
        expect(progress).toHaveBeenLastCalledWith(3, 3);
    });
});
