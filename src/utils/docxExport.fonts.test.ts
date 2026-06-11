import { describe, it, expect } from 'vitest';
import { extractDocxFontName, buildDocxStyles } from './docxExport';

describe('extractDocxFontName', () => {
    it('extracts the first font name from a stack with a generic fallback', () => {
        expect(extractDocxFontName('Playfair Display, serif')).toBe('Playfair Display');
    });

    it('handles single-quoted font names', () => {
        expect(extractDocxFontName("'Playfair Display', Georgia, serif")).toBe('Playfair Display');
    });

    it('handles double-quoted font names', () => {
        expect(extractDocxFontName('"Courier New", Courier, monospace')).toBe('Courier New');
    });

    it('trims surrounding whitespace', () => {
        expect(extractDocxFontName('  Inter , system-ui, sans-serif')).toBe('Inter');
    });

    it('returns undefined for an empty string', () => {
        expect(extractDocxFontName('')).toBeUndefined();
    });

    it('returns undefined when undefined is passed', () => {
        expect(extractDocxFontName(undefined)).toBeUndefined();
    });

    it('returns a single font name unchanged', () => {
        expect(extractDocxFontName('Roboto')).toBe('Roboto');
    });
});

describe('buildDocxStyles', () => {
    it('returns undefined when fontFamily is empty', () => {
        expect(buildDocxStyles('')).toBeUndefined();
    });

    it('returns undefined when fontFamily is undefined', () => {
        expect(buildDocxStyles(undefined)).toBeUndefined();
    });

    it('builds default document and heading styles for the extracted font', () => {
        const styles = buildDocxStyles("'Playfair Display', Georgia, serif");
        expect(styles).toEqual({
            default: {
                document: { run: { font: 'Playfair Display' } },
                heading1: { run: { font: 'Playfair Display' } },
                heading2: { run: { font: 'Playfair Display' } },
            },
        });
    });

    it('uses the extracted font name for a simple stack', () => {
        const styles = buildDocxStyles('Inter, system-ui, sans-serif');
        expect(styles?.default.document.run.font).toBe('Inter');
        expect(styles?.default.heading1.run.font).toBe('Inter');
        expect(styles?.default.heading2.run.font).toBe('Inter');
    });
});
