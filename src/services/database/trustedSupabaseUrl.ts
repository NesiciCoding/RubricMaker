import { loadSupabaseConfig } from './supabaseConfig';

// Dependency-free like supabaseConfig.ts, so the student pages can check a link's project URL without
// pulling the Supabase client into their chunk first.

function originOf(url: string): string | null {
    try {
        const parsed = new URL(url);
        const local =
            parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
        return parsed.protocol === 'https:' || local ? parsed.origin : null;
    } catch {
        return null;
    }
}

// The student pages build short-code assignments from the environment URL first and the stored one second,
// so a link for either project is accepted.
function configuredOrigins(): string[] {
    const origins: string[] = [];
    const stored = loadSupabaseConfig();
    if (stored) origins.push(originOf(stored.supabaseUrl) ?? '');
    const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    if (envUrl) origins.push(originOf(envUrl) ?? '');
    return origins.filter(Boolean);
}

export function hasConfiguredProject(): boolean {
    return loadSupabaseConfig() !== null;
}

/**
 * A share link can carry its own Supabase URL. On a device configured for a project that URL must be that
 * project, so stored sessions are only ever used with the project they were issued for.
 */
export function isAllowedSupabaseUrl(url: string | undefined): boolean {
    if (!url) return false;
    const target = originOf(url);
    if (!target) return false;
    if (!loadSupabaseConfig()) return true;
    return configuredOrigins().includes(target);
}

export function hostOf(url: string): string {
    return new URL(url).host;
}

/**
 * Student sessions used to be stored under a key without the host. Carry an existing one over so a student
 * mid-assignment keeps the same identity after an update, but only for the project this device is
 * configured for, since the old key never recorded which host issued the session.
 */
export function carryOverLegacySession(legacyKey: string, newKey: string, url: string): void {
    try {
        if (!hasConfiguredProject() || !isAllowedSupabaseUrl(url)) return;
        const legacy = localStorage.getItem(legacyKey);
        if (legacy && localStorage.getItem(newKey) === null) localStorage.setItem(newKey, legacy);
    } catch {
        /* storage unavailable: the student simply signs in again */
    }
}
