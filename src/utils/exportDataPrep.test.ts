import { describe, expect, it } from 'vitest';
import { sanitizeFilename, formatPointsRange, stripHtmlTags, stripCommentHtml } from './exportDataPrep';

describe('sanitizeFilename', () => {
    it('keeps letters and digits, replacing everything else with underscores', () => {
        expect(sanitizeFilename('My Rubric! (final)')).toBe('My_Rubric___final_');
        expect(sanitizeFilename('A1')).toBe('A1');
        expect(sanitizeFilename('café & tea')).toBe('caf____tea');
    });
});

describe('formatPointsRange', () => {
    it('renders a min-max range', () => {
        expect(formatPointsRange(2, 5)).toBe('2-5');
    });

    it('collapses to a single number when min and max are equal', () => {
        expect(formatPointsRange(5, 5)).toBe('5');
    });
});

describe('stripHtmlTags', () => {
    it('passes plain text through unchanged', () => {
        expect(stripHtmlTags('Hello world')).toBe('Hello world');
    });

    it('strips tags and separates block elements with a space', () => {
        expect(stripHtmlTags('<p>First</p><p>Second</p>')).toBe('First Second');
    });

    it('decodes HTML entities', () => {
        expect(stripHtmlTags('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry');
    });

    it('skips comment nodes', () => {
        expect(stripHtmlTags('<p>a<!-- note -->b</p>')).toBe('ab');
    });

    it('collapses runs of whitespace and trims the result', () => {
        expect(stripHtmlTags('<p>  spaced   text  </p>')).toBe('spaced text');
    });

    it('keeps inline element content without adding a separator', () => {
        expect(stripHtmlTags('<p>Hello <strong>bold</strong></p>')).toBe('Hello bold');
    });

    it('returns an empty string for empty input', () => {
        expect(stripHtmlTags('')).toBe('');
    });

    it('is exported as stripCommentHtml', () => {
        expect(stripCommentHtml).toBe(stripHtmlTags);
        expect(stripCommentHtml('<p>Comment</p>')).toBe('Comment');
    });
});
