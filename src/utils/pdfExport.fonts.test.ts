import { describe, it, expect } from 'vitest';
import { googleFontsLinkFor } from './pdfExport';

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
});
