import { describe, expect, it } from 'vitest';
import { normalizeLinkUrl, safeHref, safeAudioDataUrl } from './safeUrl';

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
        ['mailto:a@example.com?subject=Hi', 'mailto:a@example.com?subject=Hi'],
        ['localhost:5173/x', 'https://localhost:5173/x'],
    ])('normalises %s', (input, expected) => {
        expect(normalizeLinkUrl(input)).toBe(expected);
    });

    it.each([
        'javascript:alert(1)',
        'not a url',
        'news',
        'https://intranet',
        'ftp://example.com',
        'data:text/html,x',
        'mailto:hello',
        'mailto:a@localhost',
        'https:example.com/x',
        'http:/example.com',
    ])('rejects %s', (value) => {
        expect(normalizeLinkUrl(value)).toBeUndefined();
    });

    it('treats empty input as no link', () => {
        expect(normalizeLinkUrl('  ')).toBeUndefined();
        expect(normalizeLinkUrl(null)).toBeUndefined();
    });
});

describe('safeAudioDataUrl', () => {
    it('keeps a recorded audio data URL', () => {
        const url = 'data:audio/webm;codecs=opus;base64,GkXfo0==';
        expect(safeAudioDataUrl(url)).toBe(url);
        expect(safeAudioDataUrl('data:audio/mp4;base64,AAAA')).toBe('data:audio/mp4;base64,AAAA');
    });

    it('rejects other schemes and non-audio data URLs', () => {
        expect(safeAudioDataUrl('javascript:alert(1)')).toBeUndefined();
        expect(safeAudioDataUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeUndefined();
        expect(safeAudioDataUrl('https://evil.example/a.mp3')).toBeUndefined();
        expect(safeAudioDataUrl(undefined)).toBeUndefined();
        expect(safeAudioDataUrl('')).toBeUndefined();
    });
});
