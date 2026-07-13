// Edge Function: scheduled-digest
// Triggered nightly by pg_cron's net.http_post (see migration 059_scheduled_digest.sql).
// For every teacher/admin who opted in (settings.digestEmailEnabled) and has a
// non-zero pending-moderation count, sends a placeholder email — same generateLink
// magiclink stand-in used by notify-student-graded/notify-student-message, since no
// real transactional-email template exists in this repo yet for any recipient.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAGE_SIZE = 1000;

serve(async (req) => {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
        return new Response(JSON.stringify({ error: 'Server misconfigured' }), { status: 500 });
    }

    // pg_cron passes the service role key as the bearer token (see migration 059).
    const authHeader = req.headers.get('Authorization') ?? '';
    if (authHeader !== `Bearer ${serviceKey}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const admin = createClient(
        supabaseUrl,
        serviceKey,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );

    let profiles: Array<{ id: string; email: string | null }>;
    try {
        profiles = await fetchOptedInProfiles(admin);
    } catch (e) {
        console.error('[scheduled-digest] failed to list opted-in profiles', e);
        return new Response(JSON.stringify({ error: 'Failed to list opted-in profiles' }), { status: 500 });
    }

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const profile of profiles) {
        if (!profile.email) {
            skipped++;
            continue;
        }
        try {
            const { data: count, error: countErr } = await admin.rpc('get_pending_moderation_count', {
                target_owner: profile.id,
            });
            if (countErr) throw new Error(countErr.message);
            if (!count) {
                skipped++;
                continue;
            }

            const { error: mailErr } = await admin.auth.admin.generateLink({
                type: 'magiclink',
                email: profile.email,
            });
            if (mailErr) throw new Error(mailErr.message);
            sent++;
        } catch (e) {
            errors.push({ userId: profile.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return new Response(JSON.stringify({ sent, skipped, errors }), { status: 200 });
});

// The Supabase API caps a single response at 1000 rows, same paging concern as
// nightly-backup's fetchAllOwnerProfiles.
async function fetchOptedInProfiles(
    admin: ReturnType<typeof createClient>,
): Promise<Array<{ id: string; email: string | null }>> {
    const all: Array<{ id: string; email: string | null }> = [];
    let from = 0;
    for (;;) {
        const { data, error } = await admin
            .from('user_settings')
            .select('user_id, profiles!inner(email)')
            .eq('settings->>digestEmailEnabled', 'true')
            .order('user_id')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{ user_id: string; profiles: { email: string | null } | null }>) {
            all.push({ id: row.user_id, email: row.profiles?.email ?? null });
        }
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}
