import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditCategory = 'admin' | 'grade' | 'export' | 'auth';

let client: SupabaseClient | null = null;
let actorId: string | null = null;

/** Call once when the Supabase client and current user ID are known. */
export function initAuditLogger(supabaseClient: SupabaseClient, userId: string): void {
    client = supabaseClient;
    actorId = userId;
}

/** Fire-and-forget audit event. Never throws; silently no-ops when offline. */
export function logAuditEvent(
    category: AuditCategory,
    action: string,
    entityType?: string,
    entityId?: string,
    details?: Record<string, unknown>
): void {
    if (!client || !actorId) return;
    void client.from('audit_logs').insert({
        actor_id: actorId,
        category,
        action,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        details: details ?? null,
    });
}
