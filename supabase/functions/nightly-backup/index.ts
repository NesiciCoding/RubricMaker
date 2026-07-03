// Edge Function: nightly-backup
// Called nightly by Supabase Cron or by a self-hosted scheduler hitting this function URL
// (this repo's bundled docker-compose stack has no functions runtime, so it uses
// scripts/backup.sh instead — see README's "Nightly cloud backup" section).
// For every teacher/admin profile, dumps their rows via export_owner_backup() and
// uploads the JSON to the private 'backups' bucket at {userId}/{timestamp}.json,
// then prunes older snapshots beyond KEEP_COUNT for that user.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KEEP_COUNT = 7;
const PROFILE_PAGE_SIZE = 1000;

serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
        return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 });
    }

    // Supabase Cron passes the service role key as the bearer token.
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${serviceKey}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const admin = createClient(
        supabaseUrl,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let profiles: Array<{ id: string }>;
    try {
        profiles = await fetchAllOwnerProfiles(admin);
    } catch (e) {
        console.error('[nightly-backup] failed to list owner profiles', e);
        return new Response(JSON.stringify({ error: 'Failed to list owner profiles' }), { status: 500 });
    }

    let backedUp = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const profile of profiles) {
        try {
            const { data: snapshot, error: exportErr } = await admin.rpc('export_owner_backup', {
                target_owner: profile.id,
            });
            if (exportErr) throw new Error(exportErr.message);

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const path = `${profile.id}/${timestamp}.json`;
            const { error: uploadErr } = await admin.storage
                .from('backups')
                .upload(path, JSON.stringify(snapshot), { contentType: 'application/json' });
            if (uploadErr) throw new Error(uploadErr.message);

            await pruneOldBackups(admin, profile.id);
            backedUp++;
        } catch (e) {
            errors.push({ userId: profile.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return new Response(JSON.stringify({ backedUp, errors }), { status: 200 });
});

// The Supabase API caps a single response at 1000 rows, so a school with more than
// 1000 teacher/admin accounts would silently lose backup coverage for the rest
// without paging through the full result set.
async function fetchAllOwnerProfiles(admin: ReturnType<typeof createClient>): Promise<Array<{ id: string }>> {
    const all: Array<{ id: string }> = [];
    let from = 0;
    for (;;) {
        const { data, error } = await admin
            .from('profiles')
            .select('id')
            .in('role', ['admin', 'teacher'])
            .range(from, from + PROFILE_PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        all.push(...(data ?? []));
        if (!data || data.length < PROFILE_PAGE_SIZE) break;
        from += PROFILE_PAGE_SIZE;
    }
    return all;
}

async function pruneOldBackups(
    admin: ReturnType<typeof createClient>,
    userId: string,
): Promise<void> {
    const { data: files, error } = await admin.storage.from('backups').list(userId, {
        sortBy: { column: 'name', order: 'desc' },
    });
    if (error) throw new Error(`Failed to list backups: ${error.message}`);
    if (!files) return;
    const stale = files.slice(KEEP_COUNT);
    if (stale.length === 0) return;
    const { error: removeErr } = await admin.storage.from('backups').remove(stale.map((f) => `${userId}/${f.name}`));
    if (removeErr) throw new Error(`Failed to prune backups: ${removeErr.message}`);
}
