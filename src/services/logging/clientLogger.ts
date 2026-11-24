import type { SupabaseClient } from '@supabase/supabase-js';
import { describeError, normalizeRoute, scrubMeta } from './errorSanitizer';

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
    /** The build this tab runs (the commit SHA in CI builds), so a stack maps to the right source map. */
    app_version?: string | null;
}

/** Everything: actions, page views, metrics and errors. For a stress-test window. */
export const STRESS_TEST_LOGGING_ENABLED = import.meta.env.VITE_STRESS_TEST_LOGGING === 'true';
/** Production default: only `category: 'error'` rows, with a sanitised payload (#870). */
export const ERROR_REPORTING_ENABLED = import.meta.env.VITE_ERROR_REPORTING === 'true';
/** True when either mode is on; the logger is otherwise a no-op. */
export const CLIENT_LOGGING_ENABLED = STRESS_TEST_LOGGING_ENABLED || ERROR_REPORTING_ENABLED;

const RELEASE = typeof __APP_RELEASE__ === 'string' ? __APP_RELEASE__ : null;

/** One browser session cannot flood the table: a render loop throws the same error thousands of times. */
const MAX_ERRORS_PER_SESSION = 20;

const FLUSH_INTERVAL_MS = 5000;
const MAX_BUFFER_SIZE = 20;
const MAX_QUEUED_SIZE = 200;

const sessionId = CLIENT_LOGGING_ENABLED ? crypto.randomUUID() : '';

// Character limits; migration 089 rejects rows over 4x these in bytes, and one rejected row fails
// the whole batch insert.
const LIMITS = { name: 128, path: 512, role: 32, schoolId: 64 };
const MAX_META_CHARS = 2048;

function clamp(value: string | null, max: number): string | null {
    return value !== null && value.length > max ? value.slice(0, max) : value;
}

/**
 * JSON length of `meta`, or null when it cannot be serialized at all (a cyclic value). Logging is a
 * diagnostic side effect, so this is total: an unserializable payload must not throw back into the
 * caller that reported the event.
 */
function metaSize(meta: Record<string, unknown>): number | null {
    try {
        return JSON.stringify(meta).length;
    } catch {
        return null;
    }
}

/** Keep a row inside the server's size limits (#638) so it is never rejected. */
export function boundLogRow(row: LogRow): LogRow {
    let meta = row.meta;
    if (meta) {
        const size = metaSize(meta);
        if (size === null) meta = { unserializable: true };
        else if (size > MAX_META_CHARS) meta = { truncated: true, size };
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
let errorRows = 0;
const seenErrorSignatures = new Set<string>();

/** Wire up the Supabase client and identifying context used to tag every log row. Safe no-op when logging is disabled. */
export function initClientLogger(supabaseClient: SupabaseClient, ctx: ClientLoggerContext = {}): void {
    if (!CLIENT_LOGGING_ENABLED) return;
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
    if (!CLIENT_LOGGING_ENABLED) return;
    context = { ...context, ...ctx };
}

/** Whether this build records a row of `category`: everything in stress-test mode, errors only otherwise. */
function recordsCategory(category: LogCategory): boolean {
    return STRESS_TEST_LOGGING_ENABLED || (ERROR_REPORTING_ENABLED && category === 'error');
}

/** Record a diagnostic event. `meta` must contain only ids/counts/durations — never free-text content. */
export function logEvent(
    category: LogCategory,
    name: string,
    meta?: Record<string, unknown>,
    level: LogLevel = 'info',
    path?: string
): void {
    if (!recordsCategory(category)) return;
    // In errors-only mode the payload is held to the strict rule even for callers that predate it,
    // and the session is capped. Stress-test mode keeps its full, uncapped behaviour.
    const errorsOnly = !STRESS_TEST_LOGGING_ENABLED;
    if (errorsOnly) {
        if (errorRows >= MAX_ERRORS_PER_SESSION) return;
        errorRows++;
    }
    buffer.push(
        boundLogRow({
            session_id: sessionId,
            role: context.role ?? null,
            school_id: context.schoolId ?? null,
            user_id: context.userId ?? null,
            category,
            name,
            level,
            path: path ?? (errorsOnly ? normalizeRoute(currentPath()) : currentPath() || null),
            meta: errorsOnly ? scrubMeta(meta) : (meta ?? null),
            app_version: RELEASE,
        })
    );
    if (buffer.length > MAX_QUEUED_SIZE) buffer = buffer.slice(-MAX_QUEUED_SIZE);
    if (buffer.length >= MAX_BUFFER_SIZE) flush();
}

/**
 * Record a caught or uncaught error without storing its message: the row carries the error name,
 * a hash of the normalised message, and the top frames of our own bundle (#870). A repeat of the
 * same failure in the same session is dropped.
 */
export function logError(name: string, error: unknown, extra?: Record<string, unknown>): void {
    if (!CLIENT_LOGGING_ENABLED) return;
    const described = describeError(error);
    if (seenErrorSignatures.has(described.signature)) return;
    seenErrorSignatures.add(described.signature);
    logEvent(
        'error',
        name,
        {
            errorName: described.errorName,
            messageHash: described.messageHash,
            signature: described.signature,
            frames: described.frames,
            ...extra,
        },
        'error'
    );
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
    if (!CLIENT_LOGGING_ENABLED || !client || buffer.length === 0) return;
    const rows = buffer;
    buffer = [];
    void client
        .from('client_logs')
        .insert(rows)
        .then(({ error }) => {
            if (error) console.warn('[clientLogger] flush failed', error);
        });
}
