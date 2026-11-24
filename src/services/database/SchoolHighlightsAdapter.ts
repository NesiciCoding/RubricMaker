import type { SupabaseClient } from '@supabase/supabase-js';
import { storageSync } from './StorageSync';
import type { SchoolHighlightsSnapshot } from '../../utils/schoolHighlights';

/**
 * Pushes the teacher's aggregate snapshot for the school wall display (migration 108). One row per
 * teacher per day, replaced on every push; RLS keeps it to the signed-in teacher's own row.
 */
export class SchoolHighlightsAdapter {
    constructor(private readonly client: SupabaseClient) {}

    static forTeacher(): SchoolHighlightsAdapter | null {
        if (!storageSync.isConnected() || storageSync.adapter.isAnonymousSession()) return null;
        const client = storageSync.adapter.getClient();
        return client ? new SchoolHighlightsAdapter(client) : null;
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
