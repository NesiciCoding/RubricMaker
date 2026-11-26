import { describe, expect, it } from 'vitest';
import { getMarkGlyph, isMirroredInRtl, MARK_GLYPH_VIEWBOX, MARK_GLYPHS, type MarkGlyphId } from './markGlyphs';

const IDS = Object.keys(MARK_GLYPHS) as MarkGlyphId[];

// Conservative grammar: a path starts with a moveto, uses only SVG path commands and numbers, and
// never contains two commands in a row. Enough to catch a hand-edited typo without a full parser.
const PATH_GRAMMAR = /^[Mm][\d\s.,+-]*(?:[ZzLlHhVvCcSsQqTtAa][\d\s.,+-]*)*$/;
const LETTER_IDS: MarkGlyphId[] = ['para', 'tr', 'sp', 'caps', 'lc', 'ital', 'bf', 'ul'];
const MIRRORED_IDS: MarkGlyphId[] = ['del', 'closeup'];

describe('markGlyphs', () => {
    it('defines the 19 seed symbols of the PM-02 registry', () => {
        expect(IDS).toHaveLength(19);
        expect(new Set(IDS).size).toBe(IDS.length);
    });

    it('draws every stroke path on the documented 20-unit grid', () => {
        expect(MARK_GLYPH_VIEWBOX).toBe(20);
        for (const id of IDS) {
            const glyph = MARK_GLYPHS[id];
            if (glyph.kind !== 'stroke') continue;
            expect(glyph.paths.length, id).toBeGreaterThan(0);
            for (const d of glyph.paths) {
                expect(d.startsWith('M'), `${id}: ${d}`).toBe(true);
                expect(PATH_GRAMMAR.test(d), `${id}: ${d}`).toBe(true);
            }
        }
    });

    it('keeps the type-style and text-operation marks as letterforms', () => {
        for (const id of LETTER_IDS) {
            expect(MARK_GLYPHS[id].kind, id).toBe('letter');
        }
        for (const id of LETTER_IDS) {
            const glyph = MARK_GLYPHS[id];
            if (glyph.kind !== 'letter') continue;
            expect(glyph.text.length, id).toBeGreaterThan(0);
            // Two letters at 14 px is the widest a 36 px chip holds.
            expect(glyph.text.length, id).toBeLessThanOrEqual(2);
        }
    });

    it('mirrors exactly the two glyphs whose shape encodes reading order', () => {
        const mirrored = IDS.filter((id) => isMirroredInRtl(MARK_GLYPHS[id]));
        expect(mirrored.sort()).toEqual([...MIRRORED_IDS].sort());

        for (const id of IDS) {
            const glyph = MARK_GLYPHS[id];
            if (glyph.kind === 'letter') expect(isMirroredInRtl(glyph), id).toBe(false);
        }
        // Punctuation and the alignment marks are physical, not directional.
        for (const id of ['comma', 'period', 'apostrophe', 'align-left', 'align-center', 'align-right'] as const) {
            expect(isMirroredInRtl(MARK_GLYPHS[id]), id).toBe(false);
        }
    });

    it('falls back to the query mark for an id that no longer exists', () => {
        const stale = 'dele' as MarkGlyphId;
        expect(getMarkGlyph(stale)).toBe(MARK_GLYPHS.query);
    });
});
