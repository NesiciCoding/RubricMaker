import { describe, it, expect, vi } from 'vitest';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { buildSebConfigXml, downloadSebConfig } from './sebConfig';

describe('buildSebConfigXml', () => {
    it('embeds the start URL and origin-based quit/filter URLs', () => {
        const xml = buildSebConfigXml('https://example.com/#/essay/abc123');

        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('<string>https://example.com/#/essay/abc123</string>');
        expect(xml).toContain(`<string>${window.location.origin}/#/seb-done</string>`);
        expect(xml).toContain(`<string>${window.location.origin}.*</string>`);
        expect(xml).toContain('<key>allowQuit</key>\n\t<false/>');
    });
});

describe('downloadSebConfig', () => {
    it('saves a .seb file with a slugified, lowercased file name', () => {
        downloadSebConfig('https://example.com/#/essay/abc123', 'Essay For Alice');

        expect(saveAs).toHaveBeenCalledOnce();
        const [blob, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('essay-for-alice.seb');
        expect(blob).toBeInstanceOf(Blob);
        expect((blob as Blob).type).toBe('application/xml');
    });
});
