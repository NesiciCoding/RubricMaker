import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { fontStylesheetLinkFor, printHtml, styleTemplateCss } from './pdfExport';

/** Where the vendored stylesheet link points for the document under test. */
const FONTS_HREF = new URL('fonts/fonts.css', document.baseURI).href;

describe('fontStylesheetLinkFor', () => {
    it('returns empty string when fontFamily is undefined', () => {
        expect(fontStylesheetLinkFor(undefined)).toBe('');
    });

    it('returns empty string when fontFamily is empty', () => {
        expect(fontStylesheetLinkFor('')).toBe('');
    });

    it('returns empty string for system-only stacks', () => {
        expect(fontStylesheetLinkFor('Georgia, serif')).toBe('');
        expect(fontStylesheetLinkFor('"Courier New", Courier, monospace')).toBe('');
        expect(fontStylesheetLinkFor('system-ui, sans-serif')).toBe('');
    });

    it('links the self-hosted stylesheet for a decorative export font (#701)', () => {
        const link = fontStylesheetLinkFor("'Playfair Display', Georgia, serif");
        expect(link).toBe(`<link rel="stylesheet" href="${FONTS_HREF}">`);
        expect(link).not.toContain('googleapis');
    });

    it('links it for the UI font options too, which are vendored alongside the export fonts', () => {
        expect(fontStylesheetLinkFor('Inter, system-ui, sans-serif')).toContain('fonts/fonts.css');
        expect(fontStylesheetLinkFor('Nunito, sans-serif')).toContain('fonts/fonts.css');
    });

    it('picks up a decorative font passed only via a style-template override argument', () => {
        expect(fontStylesheetLinkFor('Georgia, serif', undefined, 'Oswald, sans-serif')).toContain('fonts/fonts.css');
        expect(fontStylesheetLinkFor('Georgia, serif', 'Oswald, sans-serif')).toContain('fonts/fonts.css');
    });

    it('resolves against the app base, so a print frame on a nested route still finds it', () => {
        const link = fontStylesheetLinkFor('Lato');
        expect(link).toContain(`href="${document.baseURI}`);
    });
});

describe('printHtml font wiring', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = '';
    });

    const headOfPrintFrame = () => document.querySelector('iframe')!.contentDocument!.head;

    it('links the vendored stylesheet into the print document', async () => {
        const promise = printHtml('<p>x</p>', 'portrait', "'Playfair Display', Georgia, serif");
        const link = headOfPrintFrame().querySelector('link[rel="stylesheet"]');
        expect(link?.getAttribute('href')).toBe(FONTS_HREF);
        await vi.advanceTimersByTimeAsync(1_000);
        await promise;
    });

    it('adds no stylesheet request when the print only uses system fonts', async () => {
        const promise = printHtml('<p>x</p>', 'portrait', 'Georgia, serif');
        expect(headOfPrintFrame().querySelector('link[rel="stylesheet"]')).toBeNull();
        await vi.advanceTimersByTimeAsync(1_000);
        await promise;
    });
});

describe('styleTemplateCss', () => {
    it('returns an empty string when no style template is given', () => {
        expect(styleTemplateCss(undefined)).toBe('');
    });

    it('emits a body font-family rule when bodyFont is set', () => {
        expect(styleTemplateCss({ bodyFont: 'Inter' })).toContain("body { font-family: 'Inter'; }");
    });

    it('emits a heading rule with font, size (converted from half-points to pt), and color', () => {
        const css = styleTemplateCss({ headingFont: 'Oswald', headingSize: 32, headingColor: '1e3a5f' });
        expect(css).toContain('h1, h2 {');
        expect(css).toContain("font-family: 'Oswald';");
        expect(css).toContain('font-size: 16pt;');
        expect(css).toContain('color: #1e3a5f;');
    });

    it('omits the heading rule entirely when no heading fields are set', () => {
        const css = styleTemplateCss({ bodyFont: 'Inter' });
        expect(css).not.toContain('h1, h2');
    });
});
