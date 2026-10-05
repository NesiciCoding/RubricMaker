import { describe, expect, it } from 'vitest';
import { safeHref } from './safeUrl';

describe('safeHref', () => {
    it('keeps http, https and mailto links', () => {
        expect(safeHref('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
        expect(safeHref(' http://example.com ')).toBe('http://example.com');
        expect(safeHref('mailto:a@example.com')).toBe('mailto:a@example.com');
    });

    it.each([
        'javascript:alert(1)',
        'JaVaScRiPt:alert(1)',
        'data:text/html,x',
        'vbscript:x',
        'not a url',
        '//example.com',
    ])('drops %s', (value) => {
        expect(safeHref(value)).toBeUndefined();
    });

    it('treats empty input as no link', () => {
        expect(safeHref('')).toBeUndefined();
        expect(safeHref(undefined)).toBeUndefined();
    });
});
