import { describe, it, expect } from 'vitest';
import { googleFontsLinkFor, styleTemplateCss } from './pdfExport';

describe('googleFontsLinkFor', () => {
    it('returns empty string when fontFamily is undefined', () => {
        expect(googleFontsLinkFor(undefined)).toBe('');
    });

    it('returns empty string when fontFamily is empty', () => {
        expect(googleFontsLinkFor('')).toBe('');
    });

    it('returns empty string for standard system fonts (Inter)', () => {
        expect(googleFontsLinkFor('Inter, system-ui, sans-serif')).toBe('');
    });

    it('returns empty string for standard fonts (Georgia)', () => {
        expect(googleFontsLinkFor('Georgia, serif')).toBe('');
    });

    it('returns empty string for standard fonts (Courier New)', () => {
        expect(googleFontsLinkFor('"Courier New", Courier, monospace')).toBe('');
    });

    it('returns a Google Fonts link tag for Playfair Display', () => {
        const link = googleFontsLinkFor("'Playfair Display', Georgia, serif");
        expect(link).toContain('<link rel="stylesheet"');
        expect(link).toContain('https://fonts.googleapis.com/css2?');
        expect(link).toContain('family=Playfair+Display:wght@400;700');
        expect(link).toContain('display=swap');
    });

    it('returns a Google Fonts link tag for Oswald', () => {
        const link = googleFontsLinkFor('Oswald, sans-serif');
        expect(link).toContain('family=Oswald:wght@400;500;700');
    });

    it('returns a Google Fonts link tag for Bebas Neue', () => {
        const link = googleFontsLinkFor('Bebas Neue, cursive');
        expect(link).toContain('family=Bebas+Neue');
    });

    it('returns a Google Fonts link tag for Special Elite', () => {
        const link = googleFontsLinkFor('Special Elite, monospace');
        expect(link).toContain('family=Special+Elite');
    });

    it('returns a Google Fonts link tag for Courier Prime', () => {
        const link = googleFontsLinkFor('Courier Prime, monospace');
        expect(link).toContain('family=Courier+Prime:wght@400;700');
    });

    it('picks up a decorative font passed only via a style-template override argument', () => {
        const link = googleFontsLinkFor('Inter, sans-serif', undefined, 'Oswald, sans-serif');
        expect(link).toContain('family=Oswald:wght@400;500;700');
        expect(link).not.toContain('Inter');
    });

    it('dedupes and combines families across multiple arguments', () => {
        const link = googleFontsLinkFor('Playfair Display, serif', 'Oswald, sans-serif');
        expect(link).toContain('family=Playfair+Display:wght@400;700');
        expect(link).toContain('family=Oswald:wght@400;500;700');
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
