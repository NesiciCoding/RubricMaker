import { describe, it, expect } from 'vitest';
import { stripHtmlTags } from './docxExport';

describe('stripHtmlTags', () => {
    it('strips tags and collapses whitespace', () => {
        expect(stripHtmlTags('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
    });

    it('decodes HTML entities', () => {
        expect(stripHtmlTags('<p>Fish &amp; chips</p>')).toBe('Fish & chips');
    });

    it('does not mistake a literal comparison for a tag', () => {
        expect(stripHtmlTags('x < y > z')).toBe('x < y > z');
    });

    it('separates list items and paragraphs with whitespace, not concatenation', () => {
        expect(stripHtmlTags('<ul><li>One</li><li>Two</li></ul><p>Three</p>')).toBe('One Two Three');
    });

    it('returns empty string for empty input', () => {
        expect(stripHtmlTags('')).toBe('');
    });
});
