// Generated from src/context/AppContext.tsx by the domain-split refactor.
import React, { createContext, useMemo, ReactNode } from 'react';
import { AppContextValue, StoreActionsCtx, useContextOrThrow } from '../storeCore';
import type { AppSettings, GradeScale } from '../../types';
import { StoreData } from '../../store/storage';

export type SettingsValue = Pick<AppContextValue, 'settings' | 'updateSettings' | 'getActiveGradeScale'>;

const SettingsContext = createContext<SettingsValue | null>(null);

export type SettingsActions = Pick<SettingsValue, 'updateSettings' | 'getActiveGradeScale'>;

export function createSettingsActions(ctx: StoreActionsCtx): SettingsActions {
    const { getState, dispatch } = ctx;
    const updateSettings = (s: Partial<AppSettings>) => dispatch({ type: 'UPDATE_SETTINGS', payload: s });
    const getActiveGradeScale = (): GradeScale => {
        const { gradeScales, settings } = getState();
        return gradeScales.find((gs) => gs.id === settings.defaultGradeScaleId) ?? gradeScales[0];
    };
    return {
        updateSettings,
        getActiveGradeScale,
    };
}

export function useSettingsValue(state: StoreData, actions: SettingsActions): SettingsValue {
    return useMemo(
        () => ({
            settings: state.settings,
            ...actions,
        }),
        [actions, state.settings]
    );
}

export function SettingsProvider({
    ctx,
    state,
    children,
}: {
    ctx: StoreActionsCtx;
    state: StoreData;
    children: ReactNode;
}) {
    const actions = useMemo(() => createSettingsActions(ctx), [ctx]);
    const value = useSettingsValue(state, actions);
    return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
    return useContextOrThrow(SettingsContext, 'useSettings');
}
