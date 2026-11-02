import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({ isConnected: true, userId: 'me' as string | null }));
const mockFetch = vi.fn();
const mockUpdate = vi.fn();

vi.mock('../useDbStatus', () => ({
    useDbStatus: () => ({ isConnected: db.isConnected, userId: db.userId }),
}));
vi.mock('../../services/database', () => ({
    storageSync: {
        adapter: {
            fetchSharedMaterials: (...a: unknown[]) => mockFetch(...a),
            updateSharedMaterial: (...a: unknown[]) => mockUpdate(...a),
        },
    },
}));

import { useSharedMaterials, useOwnOrSharedItem, resetSharedMaterialsCache } from '../useSharedMaterials';

const entry = { item: { id: 'r1', name: 'Shared' }, ownerId: 'ann', ownerName: 'Ann', access: 'edit' };

describe('useSharedMaterials', () => {
    beforeEach(() => {
        resetSharedMaterialsCache();
        db.isConnected = true;
        db.userId = 'me';
        mockFetch.mockReset().mockResolvedValue({ items: [entry], folders: [] });
        mockUpdate.mockReset().mockResolvedValue({ success: true });
    });

    it('loads once per signed-in user and kind, then serves the cache', async () => {
        const { result, rerender } = renderHook(() => useSharedMaterials('rubric'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        expect(result.current.items).toHaveLength(1);
        rerender();
        renderHook(() => useSharedMaterials('rubric'));
        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(mockFetch).toHaveBeenCalledWith('rubric');
    });

    it('stays empty and does not fetch while offline or disabled', () => {
        db.isConnected = false;
        const offline = renderHook(() => useSharedMaterials('test'));
        expect(offline.result.current).toMatchObject({ connected: false, status: 'idle', items: [] });
        db.isConnected = true;
        renderHook(() => useSharedMaterials('test', false));
        expect(mockFetch).not.toHaveBeenCalled();
        act(() => offline.result.current.refresh());
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('hides another account’s cache', async () => {
        const first = renderHook(() => useSharedMaterials('rubric'));
        await waitFor(() => expect(first.result.current.status).toBe('ready'));
        db.userId = 'someone-else';
        mockFetch.mockReturnValue(new Promise(() => {}));
        const second = renderHook(() => useSharedMaterials('rubric'));
        expect(second.result.current.items).toEqual([]);
    });

    it('reports a failed load', async () => {
        mockFetch.mockRejectedValue(new Error('down'));
        const { result } = renderHook(() => useSharedMaterials('test'));
        await waitFor(() => expect(result.current.status).toBe('error'));
        expect(result.current.items).toEqual([]);
    });

    it('updates the cached item after a successful save, and leaves it on failure', async () => {
        const { result } = renderHook(() => useSharedMaterials('rubric'));
        await waitFor(() => expect(result.current.status).toBe('ready'));

        await act(async () => {
            await result.current.save({ id: 'r1', name: 'Renamed' } as never);
        });
        expect(mockUpdate).toHaveBeenCalledWith('rubric', { id: 'r1', name: 'Renamed' });
        expect(result.current.items[0].item.name).toBe('Renamed');

        mockUpdate.mockResolvedValue({ success: false, error: 'not_permitted' });
        let outcome: { success: boolean } | undefined;
        await act(async () => {
            outcome = await result.current.save({ id: 'r1', name: 'Again' } as never);
        });
        expect(outcome?.success).toBe(false);
        expect(result.current.items[0].item.name).toBe('Renamed');
    });

    it('refresh reloads the list', async () => {
        const { result } = renderHook(() => useSharedMaterials('rubric'));
        await waitFor(() => expect(result.current.status).toBe('ready'));
        act(() => result.current.refresh());
        await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    });

    describe('useOwnOrSharedItem', () => {
        it('prefers my own item and never fetches for it', () => {
            const own = { id: 'r1', name: 'Mine' } as never;
            const { result } = renderHook(() => useOwnOrSharedItem('rubric', 'r1', own));
            expect(result.current).toMatchObject({ item: own, entry: undefined, loading: false });
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('loads a colleague’s item, then reports it with its share entry', async () => {
            const { result } = renderHook(() => useOwnOrSharedItem('rubric', 'r1', undefined));
            expect(result.current.loading).toBe(true);
            await waitFor(() => expect(result.current.loading).toBe(false));
            expect(result.current.item).toEqual(entry.item);
            expect(result.current.entry?.ownerName).toBe('Ann');
        });

        it('stops loading without a match, and never loads without an id or offline', async () => {
            const missing = renderHook(() => useOwnOrSharedItem('rubric', 'nope', undefined));
            await waitFor(() => expect(missing.result.current.loading).toBe(false));
            expect(missing.result.current.item).toBeUndefined();
            expect(renderHook(() => useOwnOrSharedItem('test', undefined, undefined)).result.current.loading).toBe(
                false
            );
            db.isConnected = false;
            expect(renderHook(() => useOwnOrSharedItem('test', 't1', undefined)).result.current.loading).toBe(false);
        });
    });
});
