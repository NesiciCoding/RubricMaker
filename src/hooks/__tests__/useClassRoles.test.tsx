import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ isConnected: true, userId: 'me' as string | null }));
const mockFetchRoles = vi.fn();

vi.mock('../../services/database/supabaseConfig', () => ({
    loadSupabaseConfig: () => ({ supabaseUrl: 'https://example.test', supabaseAnonKey: 'anon' }),
}));
// The hook loads the database module lazily (it is read by the app-wide roster provider, which
// must not pull supabase-js into the entry chunk), so the test stubs the loader, not the module.
vi.mock('../../services/database/lazyDb', () => ({
    loadDb: async () => ({
        storageSync: {
            isConnected: () => db.isConnected,
            getCurrentUserId: () => db.userId,
            adapter: { fetchMyClassRoles: (...a: unknown[]) => mockFetchRoles(...a) },
            subscribe: () => () => {},
        },
    }),
}));

import { useCanEditRoster, useCanEditStudentWork, resetClassRolesCache } from '../useClassRoles';

describe('useCanEditStudentWork', () => {
    beforeEach(() => {
        resetClassRolesCache();
        db.isConnected = true;
        db.userId = 'me';
        mockFetchRoles.mockReset().mockResolvedValue({ shared: 'viewer', coTaught: 'editor' });
    });

    it('makes only "Can view" classes read-only', async () => {
        const { result } = renderHook(() => useCanEditStudentWork());
        await waitFor(() => expect(result.current('shared')).toBe(false));
        expect(result.current('coTaught')).toBe(true);
        expect(result.current('mine')).toBe(true);
        expect(result.current(undefined)).toBe(true);
        renderHook(() => useCanEditStudentWork());
        expect(mockFetchRoles).toHaveBeenCalledTimes(1);
    });

    it('allows everything offline, on a failed lookup, and for another account until it loads', async () => {
        db.isConnected = false;
        expect(renderHook(() => useCanEditStudentWork()).result.current('shared')).toBe(true);
        expect(mockFetchRoles).not.toHaveBeenCalled();

        db.isConnected = true;
        mockFetchRoles.mockRejectedValueOnce(new Error('down'));
        const failed = renderHook(() => useCanEditStudentWork());
        await waitFor(() => expect(mockFetchRoles).toHaveBeenCalledTimes(1));
        expect(failed.result.current('shared')).toBe(true);

        db.userId = 'other';
        mockFetchRoles.mockReturnValueOnce(new Promise(() => {}));
        expect(renderHook(() => useCanEditStudentWork()).result.current('shared')).toBe(true);
    });
});

describe('useCanEditRoster', () => {
    beforeEach(() => {
        resetClassRolesCache();
        db.isConnected = true;
        db.userId = 'me';
        mockFetchRoles.mockReset().mockResolvedValue({ shared: 'viewer', coTaught: 'editor' });
    });

    it('makes every co-taught class read-only, even as "Can edit", since students are owner-only rows', async () => {
        const { result } = renderHook(() => useCanEditRoster());
        await waitFor(() => expect(result.current('shared')).toBe(false));
        expect(result.current('coTaught')).toBe(false);
        expect(result.current('mine')).toBe(true);
        expect(result.current(undefined)).toBe(true);
    });

    it('allows everything while offline', () => {
        db.isConnected = false;
        expect(renderHook(() => useCanEditRoster()).result.current('coTaught')).toBe(true);
        expect(mockFetchRoles).not.toHaveBeenCalled();
    });
});
