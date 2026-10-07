import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { HydrationProgress } from '../HydrationProgress';

const sync = vi.hoisted(() => {
    const listeners = new Set<() => void>();
    return {
        status: 'syncing' as string,
        progress: { done: 17, total: 34 } as { done: number; total: number } | null,
        listeners,
        storageSync: {
            getStatus: () => sync.status,
            getHydrateProgress: () => sync.progress,
            subscribe: (cb: () => void) => {
                listeners.add(cb);
                return () => listeners.delete(cb);
            },
        },
    };
});

vi.mock('../../../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: () => ({ url: 'x', anonKey: 'y' }),
}));
vi.mock('../../../services/database/lazyDb', () => ({
    loadDb: () => Promise.resolve({ storageSync: sync.storageSync }),
}));

describe('HydrationProgress', () => {
    it('shows hydrate progress while syncing and hides once it finishes', async () => {
        render(<HydrationProgress />);
        expect(await screen.findByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');

        sync.status = 'idle';
        sync.progress = null;
        act(() => sync.listeners.forEach((cb) => cb()));
        expect(screen.queryByRole('progressbar')).toBeNull();
    });
});
