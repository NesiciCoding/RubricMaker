import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecordingSync } from '../RecordingSync';
import { putBlob, getBlob, listIds, deleteBlob } from '../../mediaStore';
import type { SessionRecording } from '../../../types';
import type { SupabaseAdapter } from '../SupabaseAdapter';

function makeAdapter() {
    return {
        uploadRecordingFile: vi.fn(async (id: string) => `user1/${id}`),
        upsertRecordingMetadata: vi.fn(async () => ({ success: true })),
        getRecordingSignedUrl: vi.fn(async () => 'https://example.com/signed-url'),
        deleteRecordingMetadata: vi.fn(async () => ({ success: true })),
        fetchRecordingIdsForSession: vi.fn(async () => [] as string[]),
    } as unknown as SupabaseAdapter;
}

const recording: SessionRecording = {
    id: 'rec1',
    mediaType: 'audio',
    mimeType: 'audio/webm',
    durationSec: 10,
    sizeBytes: 5,
    createdAt: '2024-01-01T00:00:00.000Z',
};

describe('RecordingSync', () => {
    beforeEach(async () => {
        for (const id of await listIds()) await deleteBlob(id);
        sessionStorage.clear();
    });

    it('pushRecording uploads the local blob and upserts metadata', async () => {
        await putBlob('rec1', new Blob(['x'], { type: 'audio/webm' }), 'audio/webm');
        const adapter = makeAdapter();
        const sync = new RecordingSync(adapter);

        const result = await sync.pushRecording(recording, 'session1');

        expect(adapter.uploadRecordingFile).toHaveBeenCalledWith('rec1', expect.anything(), 'audio/webm');
        expect(adapter.upsertRecordingMetadata).toHaveBeenCalledWith(recording, 'session1', 'user1/rec1');
        expect(result.storagePath).toBe('user1/rec1');
        expect(result.synced).toBe(true);
    });

    it('pushRecording upserts metadata without a storage path when no local blob exists', async () => {
        const adapter = makeAdapter();
        const sync = new RecordingSync(adapter);

        const result = await sync.pushRecording(recording, 'session1');

        expect(adapter.uploadRecordingFile).not.toHaveBeenCalled();
        expect(adapter.upsertRecordingMetadata).toHaveBeenCalledWith(recording, 'session1', undefined);
        expect(result.storagePath).toBeUndefined();
        expect(result.synced).toBe(false);
    });

    it('pushSessionRecordings skips recordings already marked synced with a storage path', async () => {
        const adapter = makeAdapter();
        const sync = new RecordingSync(adapter);
        const syncedRecording: SessionRecording = { ...recording, synced: true, storagePath: 'user1/rec1' };

        const result = await sync.pushSessionRecordings([syncedRecording], 'session1');

        expect(adapter.uploadRecordingFile).not.toHaveBeenCalled();
        expect(adapter.upsertRecordingMetadata).not.toHaveBeenCalled();
        expect(result).toEqual([syncedRecording]);
    });

    it('resolveRecordingUrl caches the signed URL in sessionStorage', async () => {
        const adapter = makeAdapter();
        const sync = new RecordingSync(adapter);

        const url1 = await sync.resolveRecordingUrl('rec1', 'user1/rec1');
        const url2 = await sync.resolveRecordingUrl('rec1', 'user1/rec1');

        expect(url1).toBe('https://example.com/signed-url');
        expect(url2).toBe('https://example.com/signed-url');
        expect(adapter.getRecordingSignedUrl).toHaveBeenCalledTimes(1);
    });

    it('deleteRecording removes the local blob and cloud metadata', async () => {
        await putBlob('rec1', new Blob(['x'], { type: 'audio/webm' }), 'audio/webm');
        const adapter = makeAdapter();
        const sync = new RecordingSync(adapter);

        await sync.deleteRecording('rec1');

        expect(await getBlob('rec1')).toBeNull();
        expect(adapter.deleteRecordingMetadata).toHaveBeenCalledWith('rec1');
    });

    it('deleteSessionRecordingsById looks up and deletes all recordings for a session', async () => {
        await putBlob('rec1', new Blob(['x'], { type: 'audio/webm' }), 'audio/webm');
        await putBlob('rec2', new Blob(['y'], { type: 'audio/webm' }), 'audio/webm');
        const adapter = makeAdapter();
        adapter.fetchRecordingIdsForSession = vi.fn(async () => ['rec1', 'rec2']);
        const sync = new RecordingSync(adapter);

        await sync.deleteSessionRecordingsById('session1');

        expect(await getBlob('rec1')).toBeNull();
        expect(await getBlob('rec2')).toBeNull();
        expect(adapter.deleteRecordingMetadata).toHaveBeenCalledWith('rec1');
        expect(adapter.deleteRecordingMetadata).toHaveBeenCalledWith('rec2');
    });
});
