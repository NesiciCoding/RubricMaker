import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { buildSebConfigXml, downloadSebConfig } from './sebConfig';

describe('buildSebConfigXml', () => {
    it('embeds the start URL and origin+path-based quit/filter URLs', () => {
        const xml = buildSebConfigXml('https://example.com/#/essay/abc123');
        const base = `${window.location.origin}${window.location.pathname}`;

        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<string>https://example.com/#/essay/abc123</string>');
        expect(xml).toContain(`<string>${base}#/seb-done</string>`);
        expect(xml).toContain(`<string>${base}.*</string>`);
        expect(xml).toContain('<key>allowQuit</key>\n\t<false/>');
    });

    it('XML-escapes special characters in the start URL', () => {
        const xml = buildSebConfigXml('https://example.com/?a=1&b="x"<y>');

        expect(xml).toContain('<string>https://example.com/?a=1&amp;b=&quot;x&quot;&lt;y&gt;</string>');
        expect(xml).not.toContain('&b="x"<y>');
    });
});

describe('downloadSebConfig', () => {
    beforeEach(() => {
        vi.mocked(saveAs).mockClear();
    });

    it('saves a .seb file with a slugified, lowercased file name', () => {
        downloadSebConfig('https://example.com/#/essay/abc123', 'Essay For Alice');

        expect(saveAs).toHaveBeenCalledOnce();
        const [blob, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('essay-for-alice.seb');
        expect(blob).toBeInstanceOf(Blob);
        expect((blob as Blob).type).toBe('application/xml');
    });

    it('strips diacritics and punctuation from the file name', () => {
        downloadSebConfig('https://example.com/#/essay/abc123', "Café — Élève's Essay!");

        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('cafe-eleve-s-essay.seb');
    });

    it('falls back to "essay" when the name has no usable characters', () => {
        downloadSebConfig('https://example.com/#/essay/abc123', '!!!');

        const [, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('essay.seb');
    });
});
