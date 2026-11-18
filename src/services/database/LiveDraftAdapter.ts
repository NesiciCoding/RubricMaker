import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { storageSync } from './StorageSync';
import { isAllowedSupabaseUrl } from './trustedSupabaseUrl';

export interface PersistedDraftSnapshot {
    /** Epoch ms, matching WordSample.at in utils/monitorSignals. */
    at: number;
    wordCount: number;
    /** Draft HTML; undefined on a words-only tick. */
    text?: string;
}

// A class writes one row per student per minute, so a session's history runs past the single page
// (max_rows = 1000) PostgREST returns. That page is all the roster needs: newest first, and the
// pace windows it seeds only cover about seven minutes.
const HISTORY_PAGE = 1000;

type Row = Record<string, unknown>;

function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function throwIfError(error: { message: string } | null): void {
    if (error) throw new Error(error.message);
}

// Students open the same assignment in many tabs on one machine; reusing one anon client per
// project keeps a reload from stacking GoTrue instances.
const studentClients = new Map<string, SupabaseClient>();

/**
 * Essay draft history for the live monitor (#1246 follow-up).
 *
 * Students write through a SECURITY DEFINER RPC (they have no table access), teachers read their
 * own rows through RLS. Everything here is best-effort: the Realtime broadcast remains the live
 * path, and a failed write only costs history, never the session.
 */
export class LiveDraftAdapter {
    constructor(private readonly client: SupabaseClient) {}

    static forTeacher(): LiveDraftAdapter | null {
        const client = storageSync.adapter.getClient();
        return client ? new LiveDraftAdapter(client) : null;
    }

    static forStudent(supabaseUrl?: string, supabaseAnonKey?: string): LiveDraftAdapter | null {
        if (!supabaseUrl || !supabaseAnonKey || !isAllowedSupabaseUrl(supabaseUrl)) return null;
        const cacheKey = `${supabaseUrl}|${supabaseAnonKey}`;
        let client = studentClients.get(cacheKey);
        if (!client) {
            client = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { persistSession: false, autoRefreshToken: false },
            });
            studentClients.set(cacheKey, client);
        }
        return new LiveDraftAdapter(client);
    }

    async recordSnapshot(
        assignmentId: string,
        wordCount: number | undefined,
        draftText: string | undefined
    ): Promise<void> {
        if (!assignmentId) return;
        const { error } = await this.client.rpc('record_live_draft_snapshot', {
            p_assignment_id: assignmentId,
            p_word_count: wordCount ?? null,
            p_draft_text: draftText ?? null,
        });
        throwIfError(error);
    }

    /** Snapshots for a set of essay assignments, oldest first, grouped by the student they belong to. */
    async listSnapshots(assignmentIds: string[]): Promise<Map<string, PersistedDraftSnapshot[]>> {
        const grouped = new Map<string, PersistedDraftSnapshot[]>();
        const ids = [...new Set(assignmentIds.filter((id) => id !== ''))];
        if (ids.length === 0) return grouped;

        const { data, error } = await this.client
            .from('live_draft_snapshots')
            .select('student_id, captured_at, word_count, draft_text')
            .in('assignment_id', ids)
            .order('captured_at', { ascending: false })
            .limit(HISTORY_PAGE);
        throwIfError(error);

        const rows = Array.isArray(data) ? (data as Row[]) : [];
        // Newest-first from the query (so the page keeps the recent lesson, not last term's), then
        // reversed per student below because the roster reads history oldest-first.
        for (const row of rows) {
            const studentId = text(row.student_id);
            const at = new Date(text(row.captured_at)).getTime();
            if (!studentId || Number.isNaN(at)) continue;
            const draftText = typeof row.draft_text === 'string' ? row.draft_text : undefined;
            const list = grouped.get(studentId) ?? [];
            list.push({ at, wordCount: num(row.word_count), text: draftText });
            grouped.set(studentId, list);
        }
        for (const [studentId, list] of grouped) grouped.set(studentId, list.reverse());
        return grouped;
    }
}
