import React, { createContext, useCallback, useContext, useRef, useSyncExternalStore } from 'react';
import type { Action, StoreData } from './storeCore';

/**
 * Minimal external-store handle over the AppContext reducer. The store doesn't own
 * state — AppProvider's useReducer does — it just exposes the latest state and a
 * listener hub so selector consumers (useStoreSelector) can subscribe to slices.
 */
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

/** Object.is for primitives/arrays, shallow field-compare for plain objects. */
function isShallowEqual(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const key of aKeys) {
        if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
    }
    return true;
}

const StoreContext = createContext<SelectorStore | null>(null);

export function StoreProvider({ store, children }: { store: SelectorStore; children: React.ReactNode }) {
    return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

/**
 * Subscribe to a slice of AppContext state: the component re-renders only when the
 * selected value changes (Object.is for primitives/arrays, shallow-compare for
 * objects), independent of which domain context changed.
 *
 * The selected value is cached across renders and shallow-compared against the
 * previous selection, so it is safe to return derived data — e.g.
 * `(s) => s.students.filter((st) => !st.archivedAt)` stays referentially stable
 * while the underlying collection is unchanged, and a one-shot object literal
 * `(s) => ({ students: s.students, rubrics: s.rubrics })` stays stable until one
 * of its members changes. This is what lets a page subscribe to exactly the
 * slices it renders instead of whole domains.
 *
 * A selector that captures component values (props/state) simply changes identity
 * on those renders; the cache is keyed on selector identity, so stale selections
 * are never served.
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

/** Raw store handle for event handlers / imperative reads (e.g. store.getState()). */
export function useStore(): SelectorStore {
    const store = useContext(StoreContext);
    if (!store) throw new Error('useStore must be used within AppProvider');
    return store;
}
