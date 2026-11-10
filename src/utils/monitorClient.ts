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
 * churns sockets. Reusing one client per URL/key pair (and shard) fixes both.
 */
// Realtime caps the channels one socket may join (the tenant's max_channels_per_client,
// 100 by default — beyond it joins fail with ChannelRateLimitReached). The teacher monitor
// joins one channel per student, so it spreads them over several clients (one socket each).
export const MONITOR_CHANNELS_PER_CLIENT = 50;

const cached = new Map<string, SupabaseClient>();

export function getMonitorClient(supabaseUrl: string, supabaseAnonKey: string, shard = 0): SupabaseClient {
    const cacheKey = `${supabaseUrl}|${supabaseAnonKey}|${shard}`;
    const existing = cached.get(cacheKey);
    if (existing) return existing;
    const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            storageKey: shard === 0 ? 'rm_monitor_ephemeral' : `rm_monitor_ephemeral_${shard}`,
        },
    });
    cached.set(cacheKey, client);
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
    cached.clear();
}
