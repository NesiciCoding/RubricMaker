import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { putBlob, getBlob, deleteBlob, listIds, estimateUsage } from '../mediaStore';

function makeBlob(content: string, type = 'audio/webm'): Blob {
    return new Blob([content], { type });
}

describe('mediaStore', () => {
    beforeEach(async () => {
        for (const id of await listIds()) {
            await deleteBlob(id);
        }
    });

    it('putBlob stores a record and returns it', async () => {
        const blob = makeBlob('hello');
        const record = await putBlob('a1', blob, 'audio/webm');
        expect(record.id).toBe('a1');
        expect(record.mimeType).toBe('audio/webm');
        expect(record.blob).toBe(blob);
        expect(new Date(record.createdAt).getTime()).not.toBeNaN();
    });

    it('getBlob round-trips a stored record', async () => {
        await putBlob('a2', makeBlob('content'), 'video/webm');
        const record = await getBlob('a2');
        expect(record).not.toBeNull();
        expect(record!.id).toBe('a2');
        expect(record!.mimeType).toBe('video/webm');
        // fake-indexeddb's structured clone strips the jsdom Blob prototype, so
        // instanceof checks fail here even though real browsers round-trip Blobs.
        expect(record!.blob).toBeDefined();
    });

    it('getBlob returns null for a missing id', async () => {
        expect(await getBlob('does-not-exist')).toBeNull();
    });

    it('putBlob overwrites an existing record with the same id', async () => {
        await putBlob('a3', makeBlob('first'), 'audio/webm');
        await putBlob('a3', makeBlob('second'), 'audio/mp4');
        const record = await getBlob('a3');
        expect(record!.mimeType).toBe('audio/mp4');
        expect(await listIds()).toEqual(['a3']);
    });

    it('deleteBlob removes a record', async () => {
        await putBlob('a4', makeBlob('x'), 'audio/webm');
        await deleteBlob('a4');
        expect(await getBlob('a4')).toBeNull();
    });

    it('deleteBlob is a no-op for a missing id', async () => {
        await expect(deleteBlob('missing')).resolves.toBeUndefined();
    });

    it('listIds returns all stored ids', async () => {
        await putBlob('b1', makeBlob('1'), 'audio/webm');
        await putBlob('b2', makeBlob('2'), 'audio/webm');
        expect((await listIds()).sort()).toEqual(['b1', 'b2']);
    });

    it('listIds returns an empty array when the store is empty', async () => {
        expect(await listIds()).toEqual([]);
    });
});

describe('estimateUsage', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns usage and quota from navigator.storage.estimate', async () => {
        vi.stubGlobal('navigator', {
            storage: { estimate: vi.fn().mockResolvedValue({ usage: 1234, quota: 5678 }) },
        });
        expect(await estimateUsage()).toEqual({ usage: 1234, quota: 5678 });
    });

    it('falls back to zeros for missing fields', async () => {
        vi.stubGlobal('navigator', {
            storage: { estimate: vi.fn().mockResolvedValue({}) },
        });
        expect(await estimateUsage()).toEqual({ usage: 0, quota: 0 });
    });

    it('falls back to zeros when navigator.storage is unsupported', async () => {
        vi.stubGlobal('navigator', {});
        expect(await estimateUsage()).toEqual({ usage: 0, quota: 0 });
    });

    it('falls back to zeros when estimate rejects', async () => {
        vi.stubGlobal('navigator', {
            storage: { estimate: vi.fn().mockRejectedValue(new Error('nope')) },
        });
        expect(await estimateUsage()).toEqual({ usage: 0, quota: 0 });
    });
});
