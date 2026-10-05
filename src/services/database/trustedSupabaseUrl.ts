import { loadSupabaseConfig } from './supabaseConfig';

// Dependency-free like supabaseConfig.ts, so the student pages can check a link's project URL without
// pulling the Supabase client into their chunk first.

function originOf(url: string): string | null {
    try {
        return new URL(url).origin;
    } catch {
        return null;
    }
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
    const configured = loadSupabaseConfig();
    if (!configured) return true;
    return target === originOf(configured.supabaseUrl);
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
