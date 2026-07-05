import i18n from 'i18next';
import type { DatabaseConfig } from './types';

// Deliberately dependency-free (no supabase-js, no StorageSync) so callers that only need
// to read/write the connection config — e.g. LandingPage deciding whether to show a login
// form — don't pull the ~450KB adapter/client bundle into their chunk just to check this.

const CONFIG_KEY = 'rm_supabase_config';

function normalizeSupabaseUrl(url: string): string {
    let normalized = url.trim();
    if (!normalized) {
        throw new Error(i18n.t('toast.empty_supabase_url'));
    }
    if (/^[a-z][a-z\d+\-.]*:\/\//i.test(normalized) && !/^https?:\/\//i.test(normalized)) {
        throw new Error(i18n.t('toast.invalid_supabase_url_protocol'));
    }
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = 'https://' + normalized;
    }
    // Preserve http:// for localhost/127.0.0.1 (local dev); upgrade everything else to https://
    if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?([/?#]|$)/i.test(normalized)) {
        normalized = normalized.replace(/^http:\/\//i, 'https://');
    }
    return normalized.replace(/\/+$/, '');
}

export function loadSupabaseConfig(): DatabaseConfig | null {
    try {
        const envUrl = import.meta.env.VITE_SUPABASE_URL;
        const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const raw = localStorage.getItem(CONFIG_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as DatabaseConfig;
            return { ...parsed, supabaseUrl: normalizeSupabaseUrl(parsed.supabaseUrl) };
        }
        if (envUrl && envKey) return { supabaseUrl: normalizeSupabaseUrl(envUrl), supabaseAnonKey: envKey };
        return null;
    } catch {
        return null;
    }
}

export function saveSupabaseConfig(config: DatabaseConfig) {
    localStorage.setItem(
        CONFIG_KEY,
        JSON.stringify({
            ...config,
            supabaseUrl: normalizeSupabaseUrl(config.supabaseUrl),
        })
    );
}

export function clearSupabaseConfig() {
    localStorage.removeItem(CONFIG_KEY);
}
