import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';

// hydratePartial refreshes only the collections whose tables changed (realtime), reusing the
// adapter's fetchers on the shared singleton. We spy those fetchers rather than a fresh instance
// because only the singleton is exported.
const adapter = storageSync.adapter;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stub(name: string, value: unknown): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (vi.spyOn(adapter, name as never) as any).mockResolvedValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe('StorageSync.hydratePartial', () => {
    it('fetches only the requested collection', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const fetchTests = stub('fetchTests', [{ id: 't1' }]);
        const fetchRubrics = stub('fetchRubrics', [{ id: 'r1' }]);

        const { data, fullFallback } = await storageSync.hydratePartial(new Set(['tests']));

        expect(fullFallback).toBeFalsy();
        expect(data).toEqual({ tests: [{ id: 't1' }] });
        expect(fetchTests).toHaveBeenCalledTimes(1);
        expect(fetchRubrics).not.toHaveBeenCalled();
    });

    it('maps student_rubrics to both studentRubrics and peerReviews', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        stub('fetchStudentRubrics', [{ id: 'sr1' }]);
        stub('fetchPeerReviews', [{ id: 'pr1' }]);

        const { data } = await storageSync.hydratePartial(new Set(['student_rubrics']));

        expect(data).toEqual({ studentRubrics: [{ id: 'sr1' }], peerReviews: [{ id: 'pr1' }] });
    });

    it('maps either comment table to a single merged commentBank fetch', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const snips = stub('fetchCommentSnippets', []);
        const bank = stub('fetchCommentBank', [{ id: 'cb1' }]);

        const { data } = await storageSync.hydratePartial(new Set(['comment_snippets', 'comment_bank']));

        expect(data?.commentBank).toEqual([{ id: 'cb1' }]);
        expect(snips).toHaveBeenCalledTimes(1); // not queued twice
        expect(bank).toHaveBeenCalledTimes(1);
    });

    it('falls back to a full hydrate for user_settings (needs profile machinery)', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const { data, fullFallback } = await storageSync.hydratePartial(new Set(['user_settings']));
        expect(fullFallback).toBe(true);
        expect(data).toBeNull();
    });

    it('falls back to a full hydrate for an unknown table', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        const { fullFallback } = await storageSync.hydratePartial(new Set(['tests', 'some_new_table']));
        expect(fullFallback).toBe(true);
    });

    it('falls back to a full hydrate when a fetch throws', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
        vi.spyOn(adapter, 'fetchTests').mockRejectedValue(new Error('boom'));
        const { fullFallback } = await storageSync.hydratePartial(new Set(['tests']));
        expect(fullFallback).toBe(true);
    });

    it('returns no data when disconnected', async () => {
        vi.spyOn(adapter, 'isConnected').mockReturnValue(false);
        const { data, fullFallback } = await storageSync.hydratePartial(new Set(['tests']));
        expect(data).toBeNull();
        expect(fullFallback).toBeFalsy();
    });
});
