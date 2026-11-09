import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client for live-monitor Realtime channels (teacher-side
 * LiveMonitorPage + student-side useLiveSessionTelemetry).
 *
 * Both sides use `persistSession: false` — no session is ever stored — but
 * supabase-js still warns ("Multiple GoTrueClient instances detected ... under
 * the same storage key") every time `createClient` runs with the same
 * `storageKey`. LiveMonitorPage re-subscribes whenever the roster or teacher
 * keys change, so a naive per-effect `createClient` spams that warning and
 * churns sockets. Reusing one client per URL/key pair fixes both.
 */
let cached: { url: string; key: string; client: SupabaseClient } | null = null;

export function getMonitorClient(supabaseUrl: string, supabaseAnonKey: string): SupabaseClient {
    if (cached && cached.url === supabaseUrl && cached.key === supabaseAnonKey) return cached.client;
    const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rm_monitor_ephemeral' },
    });
    cached = { url: supabaseUrl, key: supabaseAnonKey, client };
    return client;
}

/** Test-only: drop the cached client so `createClient` mocks re-run per test. */
export function __resetMonitorClientForTests(): void {
    cached = null;
}
