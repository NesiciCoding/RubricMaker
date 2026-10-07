import { describe, it, expect, vi, afterEach } from 'vitest';
import { storageSync } from '../StorageSync';

const adapter = storageSync.adapter;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const attachmentSync = (storageSync as any).attachmentSync;

function stubAllFetches(delayMs = 0) {
    vi.spyOn(adapter, 'isConnected').mockReturnValue(true);
    const resolve = <T>(v: T) =>
        delayMs ? new Promise<T>((r) => setTimeout(() => r(v), delayMs)) : Promise.resolve(v);
    let proto = Object.getPrototypeOf(adapter);
    const names = new Set<string>();
    while (proto && proto !== Object.prototype) {
        Object.getOwnPropertyNames(proto)
            .filter((n) => n.startsWith('fetch'))
            .forEach((n) => names.add(n));
        proto = Object.getPrototypeOf(proto);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    names.forEach((n) => (vi.spyOn(adapter, n as never) as any).mockImplementation(() => resolve([])));
    vi.spyOn(adapter, 'fetchSettings').mockImplementation(() => resolve(null) as never);
    vi.spyOn(adapter, 'fetchMyProfileWithSchool').mockImplementation(() => resolve(null) as never);
    vi.spyOn(attachmentSync, 'hydrateExportTemplates').mockImplementation(() => resolve([]));
    vi.spyOn(attachmentSync, 'hydrateAttachments').mockImplementation(() => resolve([]));
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('StorageSync.hydrate progress', () => {
    it('counts every tracked fetch, then clears progress', async () => {
        stubAllFetches();
        const seen: Array<{ done: number; total: number } | null> = [];
        const unsub = storageSync.subscribe(() => seen.push(storageSync.getHydrateProgress()));

        const { data } = await storageSync.hydrate();
        unsub();

        expect(data).not.toBeNull();
        const max = Math.max(...seen.map((p) => p?.done ?? 0));
        expect(max).toBe(seen.find((p) => p)!.total);
        expect(storageSync.getHydrateProgress()).toBeNull();
    });

    it('hands a hydrate that outlives the timeout to onLateHydrate instead of dropping it', async () => {
        vi.useFakeTimers();
        stubAllFetches(10_000);
        const late = vi.fn();
        const unsub = storageSync.onLateHydrate(late);

        const pending = storageSync.hydrate();
        await vi.advanceTimersByTimeAsync(8_000);
        expect(await pending).toEqual({ data: null });
        expect(storageSync.getStatus()).toBe('syncing');
        expect(late).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(15_000);
        unsub();
        expect(late).toHaveBeenCalledTimes(1);
        expect(late.mock.calls[0][0].data).toBeTruthy();
        expect(storageSync.getStatus()).toBe('idle');
    });
});
