import type { SupabaseClient } from '@supabase/supabase-js';

export type LogCategory = 'action' | 'sync' | 'error' | 'lifecycle' | 'pageview' | 'metric';
export type LogLevel = 'info' | 'warn' | 'error';

export interface ClientLoggerContext {
    role?: string;
    schoolId?: string;
    userId?: string;
}

export interface LogRow {
    session_id: string;
    role: string | null;
    school_id: string | null;
    user_id: string | null;
    category: LogCategory;
    name: string;
    level: LogLevel;
    path: string | null;
    meta: Record<string, unknown> | null;
}

export const STRESS_TEST_LOGGING_ENABLED = import.meta.env.VITE_STRESS_TEST_LOGGING === 'true';

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const MAX_QUEUED_SIZE = 200;

const sessionId = STRESS_TEST_LOGGING_ENABLED ? crypto.randomUUID() : '';

// Character limits; migration 089 rejects rows over 4x these in bytes, and one rejected row fails
// the whole batch insert.
const LIMITS = { name: 128, path: 512, role: 32, schoolId: 64 };
const MAX_META_CHARS = 2048;

function clamp(value: string | null, max: number): string | null {
    return value !== null && value.length > max ? value.slice(0, max) : value;
}

/** Keep a row inside the server's size limits (#638) so it is never rejected. */
export function boundLogRow(row: LogRow): LogRow {
    let meta = row.meta;
    if (meta) {
        const size = JSON.stringify(meta).length;
        if (size > MAX_META_CHARS) meta = { truncated: true, size };
    }
    return {
        ...row,
        role: clamp(row.role, LIMITS.role),
        school_id: clamp(row.school_id, LIMITS.schoolId),
        name: clamp(row.name, LIMITS.name) ?? '',
        path: clamp(row.path, LIMITS.path),
        meta,
    };
}

let client: SupabaseClient | null = null;
let context: ClientLoggerContext = {};
let buffer: LogRow[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;

/** Wire up the Supabase client and identifying context used to tag every log row. Safe no-op when logging is disabled. */
export function initClientLogger(supabaseClient: SupabaseClient, ctx: ClientLoggerContext = {}): void {
    if (!STRESS_TEST_LOGGING_ENABLED) return;
    client = supabaseClient;
    context = { ...context, ...ctx };
    if (!flushTimer) {
        flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
        window.addEventListener('beforeunload', flush);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') flush();
        });
    }
}

/** Update identifying context (e.g. once the user role/school becomes known after hydration). */
export function setLoggerContext(ctx: Partial<ClientLoggerContext>): void {
    if (!STRESS_TEST_LOGGING_ENABLED) return;
    context = { ...context, ...ctx };
}

/** Record a diagnostic event. `meta` must contain only ids/counts/durations — never free-text content. */
export function logEvent(
    category: LogCategory,
    name: string,
    meta?: Record<string, unknown>,
    level: LogLevel = 'info',
    path?: string
): void {
    if (!STRESS_TEST_LOGGING_ENABLED) return;
    buffer.push(
        boundLogRow({
            session_id: sessionId,
            role: context.role ?? null,
            school_id: context.schoolId ?? null,
            user_id: context.userId ?? null,
            category,
            name,
            level,
            path: path ?? (currentPath() || null),
            meta: meta ?? null,
        })
    );
    if (buffer.length > MAX_QUEUED_SIZE) buffer = buffer.slice(-MAX_QUEUED_SIZE);
    if (buffer.length >= MAX_BUFFER_SIZE) flush();
}

export function logPageView(path?: string): void {
    logEvent('pageview', 'pageview', undefined, 'info', path);
}

export function logMetric(name: string, value: number, extra?: Record<string, unknown>): void {
    logEvent('metric', name, { value, ...extra });
}

function currentPath(): string {
    try {
        const hash = window.location.hash.replace(/^#/, '');
        return hash ? hash.split('?')[0] : window.location.pathname;
    } catch {
        return '';
    }
}

function flush(): void {
    if (!STRESS_TEST_LOGGING_ENABLED || !client || buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    void client
        .from('client_logs')
        .insert(rows)
        .then(({ error }) => {
            if (error) console.warn('[clientLogger] flush failed', error);
        });
}
