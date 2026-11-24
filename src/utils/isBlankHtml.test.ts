import { describe, expect, it } from 'vitest';
import { isBlankHtml } from './isBlankHtml';

describe('isBlankHtml', () => {
    it('treats empty editor output as blank', () => {
        expect(isBlankHtml('')).toBe(true);
        expect(isBlankHtml('<p></p>')).toBe(true);
        expect(isBlankHtml('<p> </p><p><br></p>')).toBe(true);
    });

    it('keeps text and image-only content', () => {
        expect(isBlankHtml('<p>Read this</p>')).toBe(false);
        expect(isBlankHtml('<p><img src="https://example.com/a.png"></p>')).toBe(false);
    });

    it('judges what is rendered, not the raw markup', () => {
        expect(isBlankHtml('<scr<script>ipt></script>')).toBe(false);
        expect(isBlankHtml('<p><strong></strong></p>')).toBe(true);
    });
});
