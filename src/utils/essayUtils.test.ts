import { describe, it, expect } from 'vitest';
import { countWords } from './essayUtils';

describe('countWords', () => {
    it('returns 0 for empty string', () => {
        expect(countWords('')).toBe(0);
    });

    it('returns 0 for whitespace-only string', () => {
        expect(countWords('   ')).toBe(0);
    });

    it('returns 0 for tag-only HTML with no text', () => {
        expect(countWords('<p></p><br/>')).toBe(0);
    });

    it('counts plain text words', () => {
        expect(countWords('hello world foo')).toBe(3);
    });

    it('strips HTML tags before counting', () => {
        expect(countWords('<p>hello <strong>world</strong></p>')).toBe(2);
    });

    it('treats &nbsp; as whitespace, not a word', () => {
        // A paragraph of just non-breaking spaces must count as 0
        expect(countWords('<p>&nbsp;&nbsp;&nbsp;</p>')).toBe(0);
    });

    it('does not double-count words split by &nbsp;', () => {
        expect(countWords('hello&nbsp;world')).toBe(2);
    });

    it('handles multiple HTML entities without inflating count', () => {
        expect(countWords('&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;')).toBe(0);
    });

    it('counts words correctly in realistic essay paragraph', () => {
        const html = '<p>This is a <strong>short</strong> essay paragraph.</p>';
        expect(countWords(html)).toBe(6);
    });

    it('handles nested tags', () => {
        const html = '<div><p><em>one</em> <span>two</span></p></div>';
        expect(countWords(html)).toBe(2);
    });

    it('counts 100 words correctly', () => {
        const words = Array.from({ length: 100 }, (_, i) => `word${i}`).join(' ');
        expect(countWords(`<p>${words}</p>`)).toBe(100);
    });

    it('does not count empty tokens from multiple spaces', () => {
        expect(countWords('one   two   three')).toBe(3);
    });
});
