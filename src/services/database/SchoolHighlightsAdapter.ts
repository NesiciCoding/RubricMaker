import type { SupabaseClient } from '@supabase/supabase-js';
import { storageSync } from './StorageSync';
import type { SchoolHighlightsSnapshot } from '../../utils/schoolHighlights';

/**
 * Pushes the teacher's aggregate snapshot for the school wall display (migration 109). One row per
 * teacher per day, replaced on every push; RLS keeps it to the signed-in teacher's own row.
 */
const PAGE = 1000;

export class SchoolHighlightsAdapter {
    constructor(private readonly client: SupabaseClient) {}

    static forTeacher(): SchoolHighlightsAdapter | null {
        if (!storageSync.isConnected() || storageSync.adapter.isAnonymousSession()) return null;
        const client = storageSync.adapter.getClient();
        return client ? new SchoolHighlightsAdapter(client) : null;
    }

    /** Ids of the students this teacher owns; RLS also exposes shared-class (and, for admins, all) students. */
    async fetchOwnStudentIds(ownerId: string): Promise<Set<string>> {
        const ids = new Set<string>();
        for (let from = 0; ; from += PAGE) {
            const { data, error } = await this.client
                .from('students')
                .select('id')
                .eq('owner_id', ownerId)
                .order('id')
                .range(from, from + PAGE - 1);
            if (error) throw new Error(error.message);
            for (const row of data ?? []) ids.add(row.id as string);
            if (!data || data.length < PAGE) return ids;
        }
    }

    async push(ownerId: string, snapshot: SchoolHighlightsSnapshot, today: string): Promise<void> {
        const { error } = await this.client.from('school_highlight_snapshots').upsert(
            {
                owner_id: ownerId,
                snapshot_date: today,
                student_count: snapshot.studentCount,
                cefr: snapshot.cefr,
                grammar: snapshot.grammar,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'owner_id,snapshot_date' }
        );
        if (error) throw new Error(error.message);
    }
}
