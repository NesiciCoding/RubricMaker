import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScanSync } from '../ScanSync';
import { putScanBlob, getScanBlob } from '../../scanStore';
import { listIds, deleteBlob } from '../../mediaStore';
import type { Scan } from '../../../types';
import type { SupabaseAdapter } from '../SupabaseAdapter';

function makeAdapter() {
    return {
        uploadScanFile: vi.fn(async (id: string) => `user1/${id}`),
        upsertScanMetadata: vi.fn(async () => ({ success: true })),
        getScanSignedUrl: vi.fn(async () => 'https://example.com/signed-url'),
        deleteScanMetadata: vi.fn(async () => ({ success: true })),
        fetchScanIdsForStudent: vi.fn(async () => [] as string[]),
    } as unknown as SupabaseAdapter;
}

const scan: Scan = {
    id: 'scan_1',
    studentId: 'stu_1',
    ocrText: 'the cat',
    ocrConfidence: 0.9,
    lang: 'eng',
    schoolYear: '2025-2026',
    createdAt: '2026-01-01T00:00:00.000Z',
    synced: false,
};

describe('ScanSync', () => {
    beforeEach(async () => {
        for (const id of await listIds()) await deleteBlob(id);
        sessionStorage.clear();
    });

    it('pushScan uploads the local blob and upserts metadata', async () => {
        await putScanBlob('scan_1', new Blob(['x'], { type: 'image/png' }), 'image/png');
        const adapter = makeAdapter();
        const sync = new ScanSync(adapter);

        const result = await sync.pushScan(scan);

        expect(adapter.uploadScanFile).toHaveBeenCalledWith('scan_1', expect.anything(), 'image/png');
        expect(adapter.upsertScanMetadata).toHaveBeenCalledWith(scan, 'user1/scan_1');
        expect(result.storagePath).toBe('user1/scan_1');
        expect(result.synced).toBe(true);
    });

    it('pushScan upserts text-only metadata when the image was discarded (no blob)', async () => {
        const adapter = makeAdapter();
        const sync = new ScanSync(adapter);

        const result = await sync.pushScan(scan);

        expect(adapter.uploadScanFile).not.toHaveBeenCalled();
        expect(adapter.upsertScanMetadata).toHaveBeenCalledWith(scan, undefined);
        expect(result.storagePath).toBeUndefined();
        expect(result.synced).toBe(true);
    });

    it('pushScans skips scans already marked synced (including text-only, path-less ones)', async () => {
        const adapter = makeAdapter();
        const sync = new ScanSync(adapter);
        const syncedTextOnly: Scan = { ...scan, synced: true };

        const result = await sync.pushScans([syncedTextOnly]);

        expect(adapter.uploadScanFile).not.toHaveBeenCalled();
        expect(adapter.upsertScanMetadata).not.toHaveBeenCalled();
        expect(result).toEqual([syncedTextOnly]);
    });

    it('resolveScanUrl caches the signed URL in sessionStorage', async () => {
        const adapter = makeAdapter();
        const sync = new ScanSync(adapter);

        const url1 = await sync.resolveScanUrl('scan_1', 'user1/scan_1');
        const url2 = await sync.resolveScanUrl('scan_1', 'user1/scan_1');

        expect(url1).toBe('https://example.com/signed-url');
        expect(url2).toBe('https://example.com/signed-url');
        expect(adapter.getScanSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('pushScan rejects when upserting metadata fails', async () => {
        const adapter = makeAdapter();
        adapter.upsertScanMetadata = vi.fn(async () => ({ success: false, error: 'upsert failed' }));
        const sync = new ScanSync(adapter);

        await expect(sync.pushScan(scan)).rejects.toThrow('upsert failed');
    });

    it('deleteScan rejects when deleting metadata fails', async () => {
        await putScanBlob('scan_1', new Blob(['x'], { type: 'image/png' }), 'image/png');
        const adapter = makeAdapter();
        adapter.deleteScanMetadata = vi.fn(async () => ({ success: false, error: 'delete failed' }));
        const sync = new ScanSync(adapter);

        await expect(sync.deleteScan('scan_1')).rejects.toThrow('delete failed');
    });

    it('deleteScan removes the local blob and cloud metadata', async () => {
        await putScanBlob('scan_1', new Blob(['x'], { type: 'image/png' }), 'image/png');
        const adapter = makeAdapter();
        const sync = new ScanSync(adapter);

        await sync.deleteScan('scan_1');

        expect(await getScanBlob('scan_1')).toBeNull();
        expect(adapter.deleteScanMetadata).toHaveBeenCalledWith('scan_1');
    });

    it('deleteScansForStudent looks up and deletes all scans for a student', async () => {
        await putScanBlob('scan_1', new Blob(['x'], { type: 'image/png' }), 'image/png');
        await putScanBlob('scan_2', new Blob(['y'], { type: 'image/png' }), 'image/png');
        const adapter = makeAdapter();
        adapter.fetchScanIdsForStudent = vi.fn(async () => ['scan_1', 'scan_2']);
        const sync = new ScanSync(adapter);

        await sync.deleteScansForStudent('stu_1');

        expect(await getScanBlob('scan_1')).toBeNull();
        expect(await getScanBlob('scan_2')).toBeNull();
        expect(adapter.deleteScanMetadata).toHaveBeenCalledWith('scan_1');
        expect(adapter.deleteScanMetadata).toHaveBeenCalledWith('scan_2');
    });
});
