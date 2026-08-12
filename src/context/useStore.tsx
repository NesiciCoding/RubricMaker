import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Action, StoreActionsCtx, StoreData } from './storeCore';
import { createRosterActions } from './domains/roster';
import type { RosterActions } from './domains/roster';
import { createAuthoringActions } from './domains/authoring';
import type { AuthoringActions } from './domains/authoring';
import { createAssessmentActions } from './domains/assessment';
import type { AssessmentActions } from './domains/assessment';
import { createEssaysActions } from './domains/essays';
import type { EssaysActions } from './domains/essays';
import { createFlashcardsActions } from './domains/flashcards';
import type { FlashcardsActions } from './domains/flashcards';
import { createSettingsActions } from './domains/settings';
import type { SettingsActions } from './domains/settings';

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

/**
 * All reducer actions across the six store domains, in one context. Actions are pure
 * functions of the (stable) actions ctx — they read fresh state via getState() at call
 * time — so this value never changes between dispatches. Reading actions here instead of
 * from a domain context means a component that only triggers actions does not subscribe
 * to any domain value and therefore never re-renders on unrelated data changes.
 */
export type StoreActions = RosterActions &
    AuthoringActions &
    AssessmentActions &
    EssaysActions &
    FlashcardsActions &
    SettingsActions;

const ActionsContext = createContext<StoreActions | null>(null);

export function StoreActionsProvider({ ctx, children }: { ctx: StoreActionsCtx; children: React.ReactNode }) {
    const value = useMemo(
        () => ({
            ...createRosterActions(ctx),
            ...createAuthoringActions(ctx),
            ...createAssessmentActions(ctx),
            ...createEssaysActions(ctx),
            ...createFlashcardsActions(ctx),
            ...createSettingsActions(ctx),
        }),
        [ctx]
    );
    return <ActionsContext.Provider value={value}>{children}</ActionsContext.Provider>;
}

/** All reducer actions with stable identity; use for components that only trigger actions. */
export function useStoreActions(): StoreActions {
    const actions = useContext(ActionsContext);
    if (!actions) throw new Error('useStoreActions must be used within AppProvider');
    return actions;
}
