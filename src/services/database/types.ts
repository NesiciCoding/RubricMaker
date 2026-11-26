export interface DatabaseConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncResult {
    success: boolean;
    error?: string;
    /**
     * 'forbidden' means access rules rejected the write (RLS, or an update/delete that matched no
     * row). Retrying can never succeed, so it must not enter the pending-sync queue.
     */
    code?: 'forbidden';
}

export interface DbUser {
    id: string;
    email?: string;
    displayName?: string;
    role: 'admin' | 'teacher' | 'student';
}
