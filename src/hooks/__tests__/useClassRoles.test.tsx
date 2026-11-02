import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ isConnected: true, userId: 'me' as string | null }));
const mockFetchRoles = vi.fn();

vi.mock('../useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: db.isConnected, userId: db.userId }),
}));
vi.mock('../../services/database', () => ({
    storageSync: { adapter: { fetchMyClassRoles: (...a: unknown[]) => mockFetchRoles(...a) } },
}));

import { useCanEditStudentWork, resetClassRolesCache } from '../useClassRoles';

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
