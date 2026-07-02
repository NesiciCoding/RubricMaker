// Edge Function: nightly-backup
// Called nightly by Supabase Cron (Cloud only — self-hosted deployments should use
// scripts/backup.sh instead, which has direct DB/volume access via docker-compose).
// For every teacher/admin profile, dumps their rows via export_owner_backup() and
// uploads the JSON to the private 'backups' bucket at {userId}/{timestamp}.json,
// then prunes older snapshots beyond KEEP_COUNT for that user.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const KEEP_COUNT = 7;

serve(async (req) => {
    // Supabase Cron passes the service role key as the bearer token.
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (authHeader !== `Bearer ${serviceKey}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data: profiles, error: profilesErr } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'teacher']);
    if (profilesErr) {
        return new Response(JSON.stringify({ error: profilesErr.message }), { status: 500 });
    }

    let backedUp = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const profile of profiles ?? []) {
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

async function pruneOldBackups(
    admin: ReturnType<typeof createClient>,
    userId: string,
): Promise<void> {
    const { data: files, error } = await admin.storage.from('backups').list(userId, {
        sortBy: { column: 'name', order: 'desc' },
    });
    if (error || !files) return;
    const stale = files.slice(KEEP_COUNT);
    if (stale.length === 0) return;
    await admin.storage.from('backups').remove(stale.map((f) => `${userId}/${f.name}`));
}
