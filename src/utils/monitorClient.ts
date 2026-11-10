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

/**
 * Because the client is shared, `client.channel(topic)` returns any channel already
 * registered under that topic — including one a previous effect run is still removing
 * (`removeChannel` is async). Subscribing to that leaving channel is a silent no-op, and
 * once its leave completes it is dropped, so the new subscriber hears nothing. Callers
 * must wait for every stale channel on their topics to be released before creating new
 * ones. Returns null when nothing is stale, so the caller can subscribe synchronously.
 */
export function releaseStaleChannels(client: SupabaseClient, topics: string[]): Promise<void> | null {
    const wanted = new Set(topics.map((topic) => `realtime:${topic}`));
    const stale = (client.getChannels?.() ?? []).filter((channel) => wanted.has(channel.topic));
    if (stale.length === 0) return null;
    return Promise.all(stale.map((channel) => client.removeChannel(channel).catch(() => undefined))).then(
        () => undefined
    );
}

/** Test-only: drop the cached client so `createClient` mocks re-run per test. */
export function __resetMonitorClientForTests(): void {
    cached = null;
}
