import type { SupabaseClient } from '@supabase/supabase-js';

export type LogCategory = 'action' | 'sync' | 'error' | 'lifecycle';
export type LogLevel = 'info' | 'warn' | 'error';

export interface ClientLoggerContext {
    role?: string;
    schoolId?: string;
    userId?: string;
}

interface LogRow {
    session_id: string;
    role: string | null;
    school_id: string | null;
    user_id: string | null;
    category: LogCategory;
    name: string;
    level: LogLevel;
    meta: Record<string, unknown> | null;
}

export const STRESS_TEST_LOGGING_ENABLED = import.meta.env.VITE_STRESS_TEST_LOGGING === 'true';

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const MAX_QUEUED_SIZE = 200;

const sessionId = STRESS_TEST_LOGGING_ENABLED ? crypto.randomUUID() : '';

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
    level: LogLevel = 'info'
): void {
    if (!STRESS_TEST_LOGGING_ENABLED) return;
    buffer.push({
        session_id: sessionId,
        role: context.role ?? null,
        school_id: context.schoolId ?? null,
        user_id: context.userId ?? null,
        category,
        name,
        level,
        meta: meta ?? null,
    });
    if (buffer.length > MAX_QUEUED_SIZE) buffer = buffer.slice(-MAX_QUEUED_SIZE);
    if (buffer.length >= MAX_BUFFER_SIZE) flush();
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
