import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gunzipSync } from 'node:zlib';

vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { saveAs } from 'file-saver';
import { buildSebQuitUrl, downloadSebConfig, downloadSebConfigForAssignment } from './sebConfig';
import {
    normalizeAppBase,
    renderSebConfigBytes,
    renderSebConfigXml,
    sebQuitUrl,
    sebStartUrl,
} from '../../supabase/functions/_shared/sebConfig.ts';

async function savedBytes(): Promise<Uint8Array> {
    const [blob] = vi.mocked(saveAs).mock.calls[0];
    return new Uint8Array(await (blob as Blob).arrayBuffer());
}

describe('shared SEB config renderer (used by the client and get-seb-config)', () => {
    const base = 'https://school.example/rubricmaker';

    it('normalises an app URL to origin + path, dropping index.html and trailing slashes', () => {
        expect(normalizeAppBase('https://school.example/rubricmaker/index.html#/test/x')).toBe(base);
        expect(normalizeAppBase('https://school.example/')).toBe('https://school.example');
        expect(normalizeAppBase('https://school.example')).toBe('https://school.example');
        expect(normalizeAppBase('ftp://school.example')).toBeNull();
        expect(normalizeAppBase('not a url')).toBeNull();
        expect(normalizeAppBase(null)).toBeNull();
    });

    it('builds the student start link and a query-based quit URL per assignment kind', () => {
        expect(sebStartUrl(base, 'test', 'abc123')).toBe(`${base}/#/test/abc123`);
        expect(sebStartUrl(base, 'essay', 'abc123')).toBe(`${base}/#/essay/abc123`);
        expect(sebQuitUrl(base)).toBe(`${base}/?seb-done=1`);
    });

    it('is a real navigation (query, not hash) so SEB can detect the quit', () => {
        expect(sebQuitUrl(base)).not.toContain('#');
    });

    it('embeds the start URL, a quit URL and a main-frame filter for the app base', () => {
        const xml = renderSebConfigXml({ startUrl: `${base}/#/essay/abc123`, appBase: base });

        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain(`<string>${base}/#/essay/abc123</string>`);
        expect(xml).toContain(`<string>${base}/?seb-done=1</string>`);
        expect(xml).toContain(`<string>${base}/*</string>`);
        expect(xml).toContain('<key>allowQuit</key>\n\t<false/>');
        // Content requests must stay unfiltered or Supabase auth/data calls fail inside SEB.
        expect(xml).toContain('<key>URLFilterEnableContentFilter</key>\n\t<false/>');
    });

    it('XML-escapes special characters in the start URL', () => {
        const xml = renderSebConfigXml({ startUrl: 'https://example.com/?a=1&b="x"<y>', appBase: base });

        expect(xml).toContain('<string>https://example.com/?a=1&amp;b=&quot;x&quot;&lt;y&gt;</string>');
        expect(xml).not.toContain('&b="x"<y>');
    });

    it('is deterministic and produces an outer gzip wrapping a plnd block with the gzipped plist', () => {
        const startUrl = `${base}/#/test/abc123`;
        const first = renderSebConfigBytes({ startUrl, appBase: base });
        const second = renderSebConfigBytes({ startUrl, appBase: base });

        expect(Array.from(first)).toEqual(Array.from(second));
        expect([first[0], first[1]]).toEqual([0x1f, 0x8b]);

        const block = gunzipSync(first);
        expect(new TextDecoder().decode(block.subarray(0, 4))).toBe('plnd');

        const xml = new TextDecoder().decode(gunzipSync(block.subarray(4)));
        expect(xml).toContain('<key>startURL</key>');
        expect(xml).toContain(`<string>${startUrl}</string>`);
    });
});

describe('buildSebQuitUrl', () => {
    it('maps the current location to a root-relative quit URL on the app base', () => {
        const base = `${window.location.origin}${window.location.pathname}`;

        expect(buildSebQuitUrl()).toBe(`${base}?seb-done=1`);
    });
});

describe('downloadSebConfig', () => {
    beforeEach(() => {
        vi.mocked(saveAs).mockClear();
    });

    it('saves a .seb file with a slugified, lowercased file name', async () => {
        downloadSebConfig('https://example.com/#/essay/abc123', 'Essay For Alice');

        expect(saveAs).toHaveBeenCalledOnce();
        const [blob, filename] = vi.mocked(saveAs).mock.calls[0];
        expect(filename).toBe('essay-for-alice.seb');
        expect(blob).toBeInstanceOf(Blob);
        expect((blob as Blob).type).toBe('application/octet-stream');

        const block = gunzipSync(await savedBytes());
        const xml = new TextDecoder().decode(gunzipSync(block.subarray(4)));
        expect(xml).toContain('<string>https://example.com/#/essay/abc123</string>');
        expect(xml).toContain(`<string>${window.location.origin}${window.location.pathname}?seb-done=1</string>`);
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

describe('downloadSebConfigForAssignment', () => {
    beforeEach(() => {
        vi.mocked(saveAs).mockClear();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('fetches the server-built .seb for the assignment code and saves it', async () => {
        const blob = new Blob(['seb']);
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob });
        vi.stubGlobal('fetch', fetchMock);

        await downloadSebConfigForAssignment({
            endpoint: { supabaseUrl: 'https://sb.example/', code: 'abc123xyzQ', apikey: 'anon-key' },
            startUrl: 'https://app/#/test/abc',
            fileName: 'Unit 3 — Test',
        });

        expect(fetchMock).toHaveBeenCalledWith('https://sb.example/functions/v1/get-seb-config?code=abc123xyzQ', {
            headers: { apikey: 'anon-key', Authorization: 'Bearer anon-key' },
        });
        expect(saveAs).toHaveBeenCalledWith(blob, 'unit-3-test.seb');
    });

    it('falls back to the local config when the server refuses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, blob: async () => new Blob([]) }));

        await downloadSebConfigForAssignment({
            endpoint: { supabaseUrl: 'https://sb.example', code: 'abc123xyzQ' },
            startUrl: 'https://app/#/test/abc',
            fileName: 'Unit 3',
        });

        expect(saveAs).toHaveBeenCalledOnce();
        expect(vi.mocked(saveAs).mock.calls[0][1]).toBe('unit-3.seb');
        const block = gunzipSync(await savedBytes());
        expect(new TextDecoder().decode(block.subarray(0, 4))).toBe('plnd');
    });

    it('falls back to the local config on a network failure', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

        await expect(
            downloadSebConfigForAssignment({
                endpoint: { supabaseUrl: 'https://sb.example', code: 'abc123xyzQ' },
                startUrl: 'https://app/#/test/abc',
                fileName: 'Unit 3',
            })
        ).resolves.toBeUndefined();
        expect(saveAs).toHaveBeenCalledOnce();
    });

    it('generates locally without a request when there is no endpoint', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await downloadSebConfigForAssignment({ startUrl: 'https://app/#/test/abc', fileName: 'Unit 3' });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(saveAs).toHaveBeenCalledOnce();
    });
});
