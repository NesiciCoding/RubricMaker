import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { gzipSync } from 'node:zlib';
import { downloadWordnetPack, isWordnetInstalled, lookupWordnet, removeWordnetPack } from './wordnetPack';

const PACK = {
    cat: [['n', 'feline mammal', 'a pet cat']],
    run: [['v', 'move fast']],
    constructor: [['n', 'a builder']],
};

function packResponse(bytes: Uint8Array): Response {
    return new Response(bytes as BodyInit, { headers: { 'Content-Length': String(bytes.length) } });
}

describe('wordnetPack', () => {
    beforeEach(async () => {
        await removeWordnetPack();
    });
    afterEach(() => vi.unstubAllGlobals());

    it('is not installed and returns null before download', async () => {
        expect(await isWordnetInstalled()).toBe(false);
        expect(await lookupWordnet('cat')).toBeNull();
    });

    it('downloads with progress, installs, and looks words up (prototype-safe)', async () => {
        const bytes = new Uint8Array(gzipSync(Buffer.from(JSON.stringify(PACK))));
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(packResponse(bytes)));
        const progress = vi.fn();

        await downloadWordnetPack(progress);

        expect(progress).toHaveBeenLastCalledWith(1);
        expect(await isWordnetInstalled()).toBe(true);
        expect(await lookupWordnet('Cat')).toEqual({
            definition: 'feline mammal',
            partOfSpeech: 'noun',
            example: 'a pet cat',
        });
        expect(await lookupWordnet('run')).toMatchObject({ partOfSpeech: 'verb', example: null });
        expect(await lookupWordnet('constructor')).toMatchObject({ definition: 'a builder' });
        expect(await lookupWordnet('toString')).toBeNull();
    });

    it('accepts plain JSON when the host already decoded the gzip', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(packResponse(new TextEncoder().encode(JSON.stringify(PACK)))));
        await downloadWordnetPack();
        expect((await lookupWordnet('cat'))?.definition).toBe('feline mammal');
    });

    it('throws on a failed download and stays uninstalled', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));
        await expect(downloadWordnetPack()).rejects.toThrow();
        expect(await isWordnetInstalled()).toBe(false);
    });

    it('removing the pack makes lookups return null again', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(packResponse(new TextEncoder().encode(JSON.stringify(PACK)))));
        await downloadWordnetPack();
        await removeWordnetPack();
        expect(await lookupWordnet('cat')).toBeNull();
    });
});
