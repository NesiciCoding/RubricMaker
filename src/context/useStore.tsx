import React, { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { Action, StoreData } from './storeCore';

export interface SelectorStore {
    getState: () => StoreData;
    dispatch: React.Dispatch<Action>;
    subscribe: (listener: () => void) => () => void;
    /** Fired by AppProvider after each commit so useSyncExternalStore re-checks snapshots. */
    notify: () => void;
}

export function createSelectorStore(getState: () => StoreData, dispatch: React.Dispatch<Action>): SelectorStore {
    const listeners = new Set<() => void>();
    return {
        getState,
        dispatch,
        notify: () => {
            for (const listener of [...listeners]) listener();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
    };
}

function isShallowEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        // b must own the key: two objects with different key names but equal counts would
        // otherwise compare equal when both reads yield undefined (e.g. { x: undefined }
        // vs { y: undefined }).
        if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
        if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
}

const StoreContext = createContext<SelectorStore | null>(null);

export function StoreProvider({ store, children }: { store: SelectorStore; children: React.ReactNode }) {
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * The selected value is cached across renders and shallow-compared against the
 * previous selection; the cache is keyed on selector identity, so a selector that
 * captures component values simply changes identity on those renders and stale
 * selections are never served.
 */
export function useStoreSelector<T>(selector: (state: StoreData) => T): T {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useStoreSelector must be used within AppProvider');

    const cacheRef = useRef<{ state: StoreData; selector: (state: StoreData) => T; value: T } | null>(null);
    const getSnapshot = useCallback(() => {
        const state = store.getState();
        const cached = cacheRef.current;
        if (cached && cached.state === state && cached.selector === selector) return cached.value;
        const next = selector(state);
        const value = cached && isShallowEqual(cached.value, next) ? cached.value : next;
        cacheRef.current = { state, selector, value };
        return value;
    }, [store, selector]);

    return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

export function useStore(): SelectorStore {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useStore must be used within AppProvider');
    return store;
}
