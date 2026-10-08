// Edge Function: delete-old-attachments
// Called nightly by Supabase Cron. Deletes storage files and metadata rows for
// attachments that have aged past the owner's school retention period, and for
// handwriting scans past their one-academic-year cap (get_overdue_scans, 074/082).
// Uses the Storage API — direct SQL deletion is blocked by protect_objects_delete.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isMetadataOnlyRow, isPurgeableRow, type PurgeRow } from '../_shared/attachmentPurgeGuard.ts';
import { secretsMatch } from '../_shared/secureCompare.ts';

const BATCH_SIZE = 100;
// Candidates are fetched wider than the batch so rows the guard rejects cannot crowd out the rest.
const CANDIDATE_SIZE = 100000;

interface PurgeTarget {
    rpc: string;
    bucket: string;
    table: string;
}

const TARGETS: Record<string, PurgeTarget> = {
    attachments: { rpc: 'get_overdue_attachments', bucket: 'attachments', table: 'attachments' },
    scans: { rpc: 'get_overdue_scans', bucket: 'scans', table: 'scan_metadata' },
};

interface PurgeResult {
    deleted: number;
    skipped: number;
    error?: string;
}

async function purge(admin: SupabaseClient, target: PurgeTarget): Promise<PurgeResult> {
    const { data: candidates, error: fetchErr } = await admin.rpc(target.rpc, { batch_size: CANDIDATE_SIZE });
    if (fetchErr) return { deleted: 0, skipped: 0, error: fetchErr.message };

    // Ids and paths are chosen by the uploader: only files in the owner's own folder are purged. Any
    // other overdue row is left in place and counted, so it can be looked at.
    const all = (candidates ?? []) as PurgeRow[];
    const purgeable = all.filter(isPurgeableRow);
    const metadataOnly = all.filter(isMetadataOnlyRow);
    const skipped = all.length - purgeable.length - metadataOnly.length;
    const rows = purgeable.slice(0, BATCH_SIZE);
    const rowsWithoutFile = metadataOnly.slice(0, BATCH_SIZE);
    if (!rows.length && !rowsWithoutFile.length) return { deleted: 0, skipped };

    if (rows.length) {
        // Storage API — this is the only way to delete; direct SQL is blocked.
        const { error: storageErr } = await admin.storage
            .from(target.bucket)
            .remove(rows.map((r) => r.storage_path as string));
        if (storageErr) return { deleted: 0, skipped, error: `Storage removal failed: ${storageErr.message}` };
    }

    const ids = [...rows, ...rowsWithoutFile].map((r) => r.id);
    const { error: dbErr } = await admin.from(target.table).delete().in('id', ids);
    if (dbErr) return { deleted: 0, skipped, error: `DB cleanup failed: ${dbErr.message}` };

    return { deleted: ids.length, skipped };
}

serve(async (req) => {
    // Supabase Cron passes the service role key as the bearer token.
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!secretsMatch(authHeader, `Bearer ${serviceKey}`)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    // Each target is purged independently, so a failure in one does not stop the other.
    const attachments = await purge(admin, TARGETS.attachments);
    const scans = await purge(admin, TARGETS.scans);
    const failed = [attachments.error, scans.error].filter(Boolean);

    return new Response(
        JSON.stringify({
            // Top-level fields keep the attachment counts the function has always returned.
            deleted: attachments.deleted,
            skipped: attachments.skipped,
            ...(attachments.error ? { error: attachments.error } : {}),
            scans,
        }),
        { status: failed.length ? 500 : 200 }
    );
});
