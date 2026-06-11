import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lookupWord } from './cambridgeApi';

function xmlResponse(xml: string, ok = true) {
    return {
        ok,
        text: () => Promise.resolve(xml),
    } as Response;
}

describe('lookupWord', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns level and definition from valid XML', async () => {
        const xml = '<entry><lvl>B2</lvl><def>a thing of importance</def></entry>';
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse(xml));

        const result = await lookupWord('example', 'key123');

        expect(result).toEqual({ level: 'B2', definition: 'a thing of importance' });
    });

    it('returns level null when <lvl> is missing', async () => {
        const xml = '<entry><def>a thing of importance</def></entry>';
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse(xml));

        const result = await lookupWord('example', 'key123');

        expect(result).toEqual({ level: null, definition: 'a thing of importance' });
    });

    it('returns level null when <lvl> contains an invalid value', async () => {
        const xml = '<entry><lvl>NOT_A_LEVEL</lvl><def>some definition</def></entry>';
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse(xml));

        const result = await lookupWord('example', 'key123');

        expect(result).toEqual({ level: null, definition: 'some definition' });
    });

    it('returns null definition when <def> is missing', async () => {
        const xml = '<entry><lvl>A2</lvl></entry>';
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse(xml));

        const result = await lookupWord('example', 'key123');

        expect(result).toEqual({ level: 'A2', definition: null });
    });

    it('returns null for a non-OK response', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse('', false));

        const result = await lookupWord('example', 'key123');

        expect(result).toBeNull();
    });

    it('returns null when fetch rejects', async () => {
        (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

        const result = await lookupWord('example', 'key123');

        expect(result).toBeNull();
    });

    it('returns null and does not call fetch for an empty word', async () => {
        const result = await lookupWord('', 'key123');

        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('returns null and does not call fetch when apiKey is missing', async () => {
        const result = await lookupWord('example', '');

        expect(result).toBeNull();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('normalizes level case and surrounding whitespace', async () => {
        const xml = '<entry><lvl> b1 </lvl><def>  trimmed definition  </def></entry>';
        (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(xmlResponse(xml));

        const result = await lookupWord('example', 'key123');

        expect(result).toEqual({ level: 'B1', definition: 'trimmed definition' });
    });
});
