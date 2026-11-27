import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';
import { addToPendingQueue, loadPendingQueue } from '../../../store/storage';
import type { DocumentMark } from '../../../types';

const adapter = storageSync.adapter;

function mark(overrides: Partial<DocumentMark> = {}): DocumentMark {
    return {
        id: 'dm1',
        attachmentId: 'att-1',
        authorId: 'teacher-1',
        symbolId: 'sp',
        anchor: { from: 1, to: 5 },
        snippetHash: 'hash',
        status: 'noted',
        createdAt: '2024-01-01T00:00:00Z',
        ...overrides,
    };
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('documentMark pending-sync queue', () => {
    it('retries a queued mark upsert through the mark adapter and drains it', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const upsert = vi.spyOn(adapter, 'upsertDocumentMark').mockResolvedValue({ success: true });
        const queued = mark();
        addToPendingQueue({ entity: 'documentMark', action: 'upsert', payload: queued, entityId: queued.id });

        await storageSync.flushPendingQueue();

        expect(upsert).toHaveBeenCalledWith(queued);
        expect(loadPendingQueue()).toHaveLength(0);
    });

    it('retries a queued mark delete through the mark adapter and drains it', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const remove = vi.spyOn(adapter, 'deleteDocumentMark').mockResolvedValue({ success: true });
        addToPendingQueue({ entity: 'documentMark', action: 'delete', payload: null, entityId: 'dm2' });

        await storageSync.flushPendingQueue();

        expect(remove).toHaveBeenCalledWith('dm2');
        expect(loadPendingQueue()).toHaveLength(0);
    });

    it('keeps a mark queued when the write does not land', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'upsertDocumentMark').mockResolvedValue({ success: false, error: 'rls' });
        const queued = mark({ id: 'dm3' });
        addToPendingQueue({ entity: 'documentMark', action: 'upsert', payload: queued, entityId: queued.id });

        await storageSync.flushPendingQueue();

        expect(loadPendingQueue().map((op) => op.entityId)).toEqual(['dm3']);
    });
});
