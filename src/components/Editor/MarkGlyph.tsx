import React from 'react';
import { getMarkGlyph, isMirroredInRtl, MARK_GLYPH_VIEWBOX, type MarkGlyphId } from '../../data/markGlyphs';

export interface MarkGlyphProps {
    id: MarkGlyphId;
    /** Text direction of the document being marked; only reading-order glyphs flip. */
    dir?: 'ltr' | 'rtl';
    /** Rendered edge length in px. Below 14 the two hooked glyphs stop reading. */
    size?: number;
    className?: string;
}

const LETTER_FONT = 'Georgia, "Times New Roman", serif';

/**
 * Draws one proof mark. Decorative by design: the instruction is carried by the caller's label, so
 * the glyph is always hidden from assistive technology. Mirroring is per glyph — a mirrored comma
 * would be a different mark — which is why this never applies a blanket `scaleX(-1)`.
 */
export default function MarkGlyph({ id, dir = 'ltr', size = 14, className }: MarkGlyphProps) {
    const glyph = getMarkGlyph(id);
    const classes = className ? `mark-glyph ${className}` : 'mark-glyph';

    if (glyph.kind === 'letter') {
        return (
            <span
                aria-hidden="true"
                data-mark-glyph={id}
                className={classes}
                style={{
                    display: 'inline-grid',
                    placeItems: 'center',
                    width: size,
                    height: size,
                    fontFamily: LETTER_FONT,
                    fontSize: size * 0.8,
                    fontStyle: glyph.letterStyle === 'italic' ? 'italic' : undefined,
                    fontWeight: glyph.letterStyle === 'bold' ? 800 : undefined,
                    textDecoration: glyph.letterStyle === 'underline' ? 'underline' : undefined,
                    textUnderlineOffset: glyph.letterStyle === 'underline' ? 1 : undefined,
                    lineHeight: 1,
                }}
            >
                {glyph.text}
            </span>
        );
    }

    const mirrored = dir === 'rtl' && isMirroredInRtl(glyph);

    return (
        <svg
            aria-hidden="true"
            data-mark-glyph={id}
            className={classes}
            width={size}
            height={size}
            viewBox={`0 0 ${MARK_GLYPH_VIEWBOX} ${MARK_GLYPH_VIEWBOX}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <g transform={mirrored ? `scale(-1 1) translate(-${MARK_GLYPH_VIEWBOX} 0)` : undefined}>
                {glyph.paths.map((d) => (
                    <path key={d} d={d} />
                ))}
            </g>
        </svg>
    );
}
