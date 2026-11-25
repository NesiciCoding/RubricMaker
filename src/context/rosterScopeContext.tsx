import { createContext, useContext } from 'react';
import type { RosterScope } from '../utils/rosterScope';

export interface RosterScopeValue {
    /** The scope the roster is currently read in. */
    scope: RosterScope;
    isAdmin: boolean;
    userId?: string;
    /** True only for an admin who owns or co-teaches at least one class. */
    canSwitchScope: boolean;
}

const RosterScopeContext = createContext<RosterScopeValue>({
    scope: 'mine',
    isAdmin: false,
    userId: undefined,
    canSwitchScope: false,
});

export const RosterScopeProvider = RosterScopeContext.Provider;

export function useRosterScopeValue(): RosterScopeValue {
    return useContext(RosterScopeContext);
}
