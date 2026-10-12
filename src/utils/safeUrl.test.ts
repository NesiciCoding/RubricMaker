import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl, safeHref } from './safeUrl';

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

describe('normalizeLinkUrl', () => {
    it.each([
        ['www.bbc.com/news', 'https://www.bbc.com/news'],
        ['bbc.co.uk', 'https://bbc.co.uk'],
        ['  example.com:8080/a?b=1 ', 'https://example.com:8080/a?b=1'],
        ['//example.com/x', 'https://example.com/x'],
        ['http://example.com', 'http://example.com'],
        ['HTTPS://Example.com/A', 'HTTPS://Example.com/A'],
        ['mailto:a@example.com', 'mailto:a@example.com'],
        ['localhost:5173/x', 'https://localhost:5173/x'],
    ])('normalises %s', (input, expected) => {
        expect(normalizeLinkUrl(input)).toBe(expected);
    });

    it.each(['javascript:alert(1)', 'not a url', 'news', 'https://intranet', 'ftp://example.com', 'data:text/html,x'])(
        'rejects %s',
        (value) => {
            expect(normalizeLinkUrl(value)).toBeUndefined();
        }
    );

    it('treats empty input as no link', () => {
        expect(normalizeLinkUrl('  ')).toBeUndefined();
        expect(normalizeLinkUrl(null)).toBeUndefined();
    });
});
