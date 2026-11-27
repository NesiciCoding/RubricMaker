/**
 * The drawing half of the proof mark registry. Kept out of `proofMarks.ts` so the registry stays
 * plain data (id → family → operation → label key) and this file stays the only place that knows
 * about geometry.
 *
 * Every stroke glyph is drawn on a 20×20 grid with a 2-unit stroke: at the 14 px chip size that is
 * a 1.4 px stroke, the floor at which the marks still read. See `spike/marks-visual.html` for the
 * specimen the paths were measured on.
 */
export type MarkGlyphId =
    | 'del'
    | 'ins'
    | 'space'
    | 'closeup'
    | 'para'
    | 'tr'
    | 'sp'
    | 'query'
    | 'caps'
    | 'lc'
    | 'ital'
    | 'bf'
    | 'ul'
    | 'comma'
    | 'period'
    | 'apostrophe'
    | 'align-left'
    | 'align-center'
    | 'align-right';

export type MarkGlyph =
    | {
          kind: 'stroke';
          paths: readonly string[];
          /** The glyph encodes reading order, so it flips with the text direction. */
          mirror?: 'rtl';
      }
    | {
          kind: 'letter';
          text: string;
          letterStyle?: 'italic' | 'bold' | 'underline';
      };

export const MARK_GLYPH_VIEWBOX = 20;

export const MARK_GLYPHS: Readonly<Record<MarkGlyphId, MarkGlyph>> = {
    // Delete: the strike plus the looped tail of the printed dele.
    del: {
        kind: 'stroke',
        paths: ['M1.5 8.5H12', 'M12 8.5c3.8 0 5 3 3 4.9-1.9 1.8-4.8.4-4.5-2'],
        mirror: 'rtl',
    },
    ins: { kind: 'stroke', paths: ['M4 14l6-6.5 6 6.5'] },
    space: { kind: 'stroke', paths: ['M7 4 5.5 16', 'M12.5 4 11 16', 'M4 8h12', 'M3.5 12.5h12'] },
    // Close up: two hooks bracketing the gap they delete.
    closeup: {
        kind: 'stroke',
        paths: ['M3 6h4.5c1.6 0 2.5 2.4 2.5 5', 'M17 14h-4.5c-1.6 0-2.5-2.4-2.5-5'],
        mirror: 'rtl',
    },
    para: { kind: 'letter', text: '¶' },
    tr: { kind: 'letter', text: 'tr', letterStyle: 'italic' },
    sp: { kind: 'letter', text: 'sp', letterStyle: 'italic' },
    query: { kind: 'stroke', paths: ['M6.5 7.5c0-3 7-3 7 .6 0 2.4-3.5 2.6-3.5 5.2', 'M10 16.5v.01'] },
    caps: { kind: 'letter', text: 'A' },
    lc: { kind: 'letter', text: 'a' },
    ital: { kind: 'letter', text: 'I', letterStyle: 'italic' },
    bf: { kind: 'letter', text: 'B', letterStyle: 'bold' },
    ul: { kind: 'letter', text: 'U', letterStyle: 'underline' },
    comma: {
        kind: 'stroke',
        paths: ['M3 16l7-6.5 7 6.5', 'M10 3.6c1.6 0 2.4.8 2.4 1.9 0 1.4-1.7 1.7-1.7 3.4'],
    },
    period: { kind: 'stroke', paths: ['M3 16l7-6.5 7 6.5', 'M10 6.6v.01'] },
    apostrophe: { kind: 'stroke', paths: ['M3 16l7-6.5 7 6.5', 'M10 3.4v3'] },
    'align-left': { kind: 'stroke', paths: ['M3 5h14', 'M3 10h8', 'M3 15h12'] },
    'align-center': { kind: 'stroke', paths: ['M3 5h14', 'M6 10h8', 'M4 15h12'] },
    'align-right': { kind: 'stroke', paths: ['M3 5h14', 'M9 10h8', 'M5 15h12'] },
};

/** Synced data can outlive a symbol rename; an unknown id reads as the query mark, never throws. */
export function getMarkGlyph(id: MarkGlyphId): MarkGlyph {
    return MARK_GLYPHS[id] ?? MARK_GLYPHS.query;
}

export function isMirroredInRtl(glyph: MarkGlyph): boolean {
    return glyph.kind === 'stroke' && glyph.mirror === 'rtl';
}
