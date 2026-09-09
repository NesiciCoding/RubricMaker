import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { putBlob, deleteBlob, listIds } from '../mediaStore';
import {
    SCAN_ID_PREFIX,
    newScanId,
    isScanId,
    putScanBlob,
    getScanBlob,
    deleteScanBlob,
    listScanIds,
} from '../scanStore';

function makeBlob(content: string, type = 'image/png'): Blob {
    return new Blob([content], { type });
}

describe('scanStore ids', () => {
    it('newScanId is prefixed and unique', () => {
        const a = newScanId();
        const b = newScanId();
        expect(a.startsWith(SCAN_ID_PREFIX)).toBe(true);
        expect(a).not.toBe(b);
    });

    it('isScanId distinguishes scan ids from other blob ids', () => {
        expect(isScanId(newScanId())).toBe(true);
        expect(isScanId('rec_123')).toBe(false);
    });
});

describe('scanStore blobs', () => {
    beforeEach(async () => {
        for (const id of await listIds()) {
            await deleteBlob(id);
        }
    });

    it('round-trips a scan blob', async () => {
        const id = newScanId();
        await putScanBlob(id, makeBlob('img'), 'image/png');
        const record = await getScanBlob(id);
        expect(record).not.toBeNull();
        expect(record!.id).toBe(id);
        expect(record!.mimeType).toBe('image/png');
    });

    it('deleteScanBlob removes a scan blob', async () => {
        const id = newScanId();
        await putScanBlob(id, makeBlob('img'), 'image/png');
        await deleteScanBlob(id);
        expect(await getScanBlob(id)).toBeNull();
    });

    it('listScanIds returns only scan-prefixed blobs, not recordings', async () => {
        const scanId = newScanId();
        await putScanBlob(scanId, makeBlob('img'), 'image/png');
        await putBlob('rec_abc', makeBlob('audio', 'audio/webm'), 'audio/webm');

        expect(await listScanIds()).toEqual([scanId]);
    });
});
