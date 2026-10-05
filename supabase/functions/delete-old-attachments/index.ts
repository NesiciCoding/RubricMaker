// Edge Function: delete-old-attachments
// Called nightly by Supabase Cron. Deletes storage files and metadata rows for
// attachments that have aged past the owner's school retention period.
// Uses the Storage API — direct SQL deletion is blocked by protect_objects_delete.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { isPurgeableRow, type PurgeRow } from '../_shared/attachmentPurgeGuard.ts';
import { secretsMatch } from '../_shared/secureCompare.ts';

const BATCH_SIZE = 100;
// Candidates are fetched wider than the batch so rows the guard rejects cannot crowd out the rest.
const CANDIDATE_SIZE = 100000;

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

    const { data: candidates, error: fetchErr } = await admin.rpc('get_overdue_attachments', {
        batch_size: CANDIDATE_SIZE,
    });
    if (fetchErr) {
        return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500 });
    }
    // Ids and paths are chosen by the uploader: only files in the owner's own folder are purged. Any
    // other overdue row is left in place and counted, so it can be looked at.
    const all = (candidates ?? []) as PurgeRow[];
    const rows = all.filter(isPurgeableRow).slice(0, BATCH_SIZE);
    const skipped = all.length - all.filter(isPurgeableRow).length;
    if (!rows.length) {
        return new Response(JSON.stringify({ deleted: 0, skipped }), { status: 200 });
    }

    const paths = rows.map((r) => r.storage_path);
    const ids = rows.map((r) => r.id);

    // Storage API — this is the only way to delete; direct SQL is blocked.
    const { error: storageErr } = await admin.storage.from('attachments').remove(paths);
    if (storageErr) {
        return new Response(JSON.stringify({ error: `Storage removal failed: ${storageErr.message}` }), {
            status: 500,
        });
    }

    const { error: dbErr } = await admin.from('attachments').delete().in('id', ids);
    if (dbErr) {
        return new Response(JSON.stringify({ error: `DB cleanup failed: ${dbErr.message}` }), { status: 500 });
    }

    return new Response(JSON.stringify({ deleted: ids.length, skipped }), { status: 200 });
});
