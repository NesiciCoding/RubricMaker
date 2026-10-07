import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';
import { makeClient, adapterWithClient } from './supabaseTestUtils';
import { mergeStoreData } from '../../../utils/syncMerge';
import { loadStore } from '../../../store/storage';

const adapter = storageSync.adapter;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attachmentSync = (storageSync as any).attachmentSync;

function stubAllFetches() {
    vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
    let proto = Object.getPrototypeOf(adapter);
    const names = new Set<string>();
    while (proto && proto !== Object.prototype) {
        Object.getOwnPropertyNames(proto)
            .filter((n) => n.startsWith('fetch'))
            .forEach((n) => names.add(n));
        proto = Object.getPrototypeOf(proto);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    names.forEach((n) => (vi.spyOn(adapter, n as never) as any).mockResolvedValue([]));
    vi.spyOn(adapter, 'fetchSettings').mockResolvedValue(null);
    vi.spyOn(adapter, 'fetchMyProfileWithSchool').mockResolvedValue(null);
    vi.spyOn(adapter, 'fetchSchoolName').mockResolvedValue('School');
    vi.spyOn(attachmentSync, 'hydrateExportTemplates').mockResolvedValue([]);
    vi.spyOn(attachmentSync, 'hydrateAttachments').mockResolvedValue([]);
}

afterEach(() => vi.restoreAllMocks());

describe('SupabaseAdapter hydrate fetchers', () => {
    it('reject on a query error instead of returning [] (which would read as "remote has none")', async () => {
        const failing = adapterWithClient(makeClient({ data: null, error: { message: 'boom' } }));
        await expect(failing.fetchRubrics()).rejects.toEqual({ message: 'boom' });
        await expect(failing.fetchFlashcardDecks()).rejects.toEqual({ message: 'boom' });
        await expect(failing.fetchSettings()).rejects.toEqual({ message: 'boom' });
    });

    it('fetchSettings returns null when the user has no settings row', async () => {
        const empty = adapterWithClient(makeClient({ data: null, error: null }));
        await expect(empty.fetchSettings()).resolves.toBeNull();
    });
});

describe('StorageSync.hydrate partial failure', () => {
    it('skips only the failed collection, so the merge keeps its local records', async () => {
        stubAllFetches();
        vi.spyOn(adapter, 'fetchRubrics').mockRejectedValue(new Error('rubrics down'));
        vi.spyOn(adapter, 'fetchTests').mockResolvedValue([{ id: 't1' }] as never);

        const { data, error } = await storageSync.hydrate();

        expect(error).toMatch(/1 collection/);
        expect(storageSync.getStatus()).toBe('error');
        expect(data).not.toHaveProperty('rubrics');
        expect(data?.tests).toEqual([{ id: 't1' }]);

        const local = { ...loadStore(), rubrics: [{ id: 'r-local', name: 'Mine', criteria: [] }] } as never;
        const merged = mergeStoreData(local, data!, []);
        expect(merged.rubrics.map((r) => r.id)).toEqual(['r-local']);
    });

    it('keeps local settings when the settings fetch fails, even though the profile loaded', async () => {
        stubAllFetches();
        vi.spyOn(adapter, 'fetchSettings').mockRejectedValue(new Error('settings down'));
        vi.spyOn(adapter, 'fetchMyProfileWithSchool').mockResolvedValue({ id: 'u1', role: 'teacher', schoolId: 's1' });

        const { data } = await storageSync.hydrate();

        expect(data).not.toHaveProperty('settings');
    });

    it('still reports success when nothing failed', async () => {
        stubAllFetches();
        const { data, error } = await storageSync.hydrate();
        expect(error).toBeUndefined();
        expect(data?.rubrics).toEqual([]);
        expect(storageSync.getStatus()).toBe('idle');
    });
});
