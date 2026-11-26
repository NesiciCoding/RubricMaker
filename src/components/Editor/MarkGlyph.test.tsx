import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import MarkGlyph from './MarkGlyph';
import { MARK_GLYPHS, type MarkGlyphId } from '../../data/markGlyphs';

const ALL_IDS = Object.keys(MARK_GLYPHS) as MarkGlyphId[];

const glyphRoot = (container: HTMLElement, id: string) =>
    container.querySelector(`[data-mark-glyph="${id}"]`) as HTMLElement | null;

describe('MarkGlyph', () => {
    it('renders every registry glyph without throwing', () => {
        for (const id of ALL_IDS) {
            const { container, unmount } = render(<MarkGlyph id={id} />);
            expect(glyphRoot(container, id), id).not.toBeNull();
            unmount();
        }
    });

    it('draws a stroke glyph as an inline SVG on the shared viewBox', () => {
        const { container } = render(<MarkGlyph id="del" />);
        const svg = glyphRoot(container, 'del') as unknown as SVGSVGElement;

        expect(svg.tagName.toLowerCase()).toBe('svg');
        expect(svg.getAttribute('viewBox')).toBe('0 0 20 20');
        expect(svg.getAttribute('stroke')).toBe('currentColor');
        expect(svg.getAttribute('stroke-width')).toBe('2');
        expect(svg.querySelectorAll('path')).toHaveLength(MARK_GLYPHS.del.kind === 'stroke' ? 2 : 0);
    });

    it('renders a letterform as text, not as a path', () => {
        const { container } = render(<MarkGlyph id="tr" />);
        const root = glyphRoot(container, 'tr') as HTMLElement;

        expect(root.tagName.toLowerCase()).toBe('span');
        expect(root.textContent).toBe('tr');
        expect(root.querySelector('path')).toBeNull();
        expect(root.style.fontStyle).toBe('italic');
        expect(root.style.fontFamily).toContain('Georgia');
    });

    it('applies the letter styles the registry asks for', () => {
        const bold = render(<MarkGlyph id="bf" />);
        expect((glyphRoot(bold.container, 'bf') as HTMLElement).style.fontWeight).toBe('800');
        bold.unmount();

        const underline = render(<MarkGlyph id="ul" />);
        const style = (glyphRoot(underline.container, 'ul') as HTMLElement).style;
        expect(style.textDecoration).toContain('underline');
        underline.unmount();

        const italic = render(<MarkGlyph id="ital" />);
        expect((glyphRoot(italic.container, 'ital') as HTMLElement).style.fontStyle).toBe('italic');
    });

    it('mirrors only the reading-order glyphs in RTL', () => {
        const del = render(<MarkGlyph id="del" dir="rtl" />);
        const delGroup = glyphRoot(del.container, 'del')?.querySelector('g');
        expect(delGroup?.getAttribute('transform')).toBe('scale(-1 1) translate(-20 0)');
        del.unmount();

        const closeup = render(<MarkGlyph id="closeup" dir="rtl" />);
        expect(glyphRoot(closeup.container, 'closeup')?.querySelector('g')?.getAttribute('transform')).toBe(
            'scale(-1 1) translate(-20 0)'
        );
        closeup.unmount();

        const align = render(<MarkGlyph id="align-left" dir="rtl" />);
        expect(glyphRoot(align.container, 'align-left')?.querySelector('g')?.getAttribute('transform')).toBeNull();
        align.unmount();

        const letter = render(<MarkGlyph id="sp" dir="rtl" />);
        expect((glyphRoot(letter.container, 'sp') as HTMLElement).style.transform).toBe('');
    });

    it('leaves LTR glyphs unmirrored and sizes from the size prop', () => {
        const { container } = render(<MarkGlyph id="closeup" size={20} />);
        const svg = glyphRoot(container, 'closeup') as unknown as SVGSVGElement;

        expect(svg.querySelector('g')?.getAttribute('transform')).toBeNull();
        expect(svg.getAttribute('width')).toBe('20');
        expect(svg.getAttribute('height')).toBe('20');
    });

    it('stays decorative: no accessible name, never an image role', () => {
        render(<MarkGlyph id="del" />);
        expect(glyphRoot(document.body, 'del')?.getAttribute('aria-hidden')).toBe('true');
        expect(screen.queryByRole('img')).toBeNull();
    });
});
