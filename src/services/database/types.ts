export interface DatabaseConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface SyncResult {
    success: boolean;
    error?: string;
}

export interface DbUser {
    id: string;
    email?: string;
    displayName?: string;
    role: 'admin' | 'user' | 'student';
}
