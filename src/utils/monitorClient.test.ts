import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { releaseStaleChannels } from './monitorClient';

function fakeClient(topics: string[]) {
    const channels = topics.map((topic) => ({ topic }));
    let release!: () => void;
    const removed = new Promise<void>((resolve) => {
        release = resolve;
    });
    const client = {
        getChannels: vi.fn(() => channels),
        removeChannel: vi.fn(() => removed.then(() => 'ok')),
    };
    return { client: client as unknown as SupabaseClient, raw: client, release };
}

describe('releaseStaleChannels', () => {
    it('returns null when no channel is registered on the wanted topics', () => {
        const { client, raw } = fakeClient(['realtime:monitor:test:other']);
        expect(releaseStaleChannels(client, ['monitor:test:key1'])).toBeNull();
        expect(raw.removeChannel).not.toHaveBeenCalled();
    });

    it('removes a still-registered channel on the same topic and resolves once it is gone', async () => {
        const { client, raw, release } = fakeClient(['realtime:monitor:test:key1', 'realtime:monitor:test:key2']);
        const pending = releaseStaleChannels(client, ['monitor:test:key1']);
        expect(pending).not.toBeNull();
        expect(raw.removeChannel).toHaveBeenCalledTimes(1);
        expect(raw.removeChannel).toHaveBeenCalledWith({ topic: 'realtime:monitor:test:key1' });

        let settled = false;
        void pending!.then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        release();
        await pending;
        expect(settled).toBe(true);
    });

    it('still resolves when removing a stale channel fails', async () => {
        const client = {
            getChannels: () => [{ topic: 'realtime:monitor:test:key1' }],
            removeChannel: vi.fn(() => Promise.reject(new Error('socket closed'))),
        } as unknown as SupabaseClient;
        await expect(releaseStaleChannels(client, ['monitor:test:key1'])).resolves.toBeUndefined();
    });
});
