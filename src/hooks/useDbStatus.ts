import { useState, useEffect } from 'react';
import { storageSync } from '../services/database';
import type { SyncStatus, DbUser } from '../services/database';

export interface DbStatus {
    isConnected: boolean;
    status: SyncStatus;
    lastSyncAt: string | null;
    userId: string | null;
    currentUser: DbUser | null;
}

export function useDbStatus(): DbStatus {
    const [tick, setTick] = useState(0);
    const [currentUser, setCurrentUser] = useState<DbUser | null>(null);

    useEffect(() => {
        const unsubSync = storageSync.subscribe(() => setTick(t => t + 1));
        const unsubAuth = storageSync.onAuthChange(user => {
            setCurrentUser(user);
            setTick(t => t + 1);
        });
        return () => { unsubSync(); unsubAuth(); };
    }, []);

    return {
        isConnected: storageSync.isConnected(),
        status: storageSync.getStatus(),
        lastSyncAt: storageSync.getLastSyncAt(),
        userId: storageSync.getCurrentUserId(),
        currentUser,
    };
}
