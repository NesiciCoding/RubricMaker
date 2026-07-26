// Edge Function: scheduled-digest
// Triggered nightly by pg_cron's net.http_post (see migration 059_scheduled_digest.sql).
// Extended in migration 065 (roadmap 30.2) from a single moderation-only digest to three
// independent per-category opt-ins (moderation disputes, overdue grading, unread student
// messages — the same three the in-app Notification Center surfaces). For every teacher/
// admin who opted into at least one category and has a non-zero count in at least one of
// their enabled categories, sends a single combined placeholder email — same generateLink
// magiclink stand-in used by notify-student-graded/notify-student-message, since no real
// transactional-email template exists in this repo yet for any recipient.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PAGE_SIZE = 1000;

interface DigestFlags {
    moderation: boolean;
    overdueGrading: boolean;
    unreadMessages: boolean;
}

interface OptedInProfile {
    id: string;
    email: string | null;
    flags: DigestFlags;
}

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

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    let profiles: OptedInProfile[];
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
            const total = await sumEnabledCounts(admin, profile);
            if (!total) {
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

// Only calls the RPC for a category the teacher actually opted into — an unopted-in
// category's count is never computed, matching the pre-30.2 behavior for teachers who
// only ever had the moderation flag.
async function sumEnabledCounts(admin: ReturnType<typeof createClient>, profile: OptedInProfile): Promise<number> {
    const calls: Array<Promise<number>> = [];
    if (profile.flags.moderation) {
        calls.push(rpcCount(admin, 'get_pending_moderation_count', profile.id));
    }
    if (profile.flags.overdueGrading) {
        calls.push(rpcCount(admin, 'get_overdue_grading_count', profile.id));
    }
    if (profile.flags.unreadMessages) {
        calls.push(rpcCount(admin, 'get_unread_messages_count', profile.id));
    }
    const counts = await Promise.all(calls);
    return counts.reduce((sum, c) => sum + c, 0);
}

async function rpcCount(
    admin: ReturnType<typeof createClient>,
    fn: 'get_pending_moderation_count' | 'get_overdue_grading_count' | 'get_unread_messages_count',
    targetOwner: string
): Promise<number> {
    const { data, error } = await admin.rpc(fn, { target_owner: targetOwner });
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
}

// The Supabase API caps a single response at 1000 rows, same paging concern as
// nightly-backup's fetchAllOwnerProfiles.
async function fetchOptedInProfiles(admin: ReturnType<typeof createClient>): Promise<OptedInProfile[]> {
    const all: OptedInProfile[] = [];
    let from = 0;
    for (;;) {
        const { data, error } = await admin
            .from('user_settings')
            .select('user_id, settings, profiles!inner(email)')
            .or(
                'settings->>digestEmailEnabled.eq.true,settings->>digestOverdueGradingEnabled.eq.true,settings->>digestUnreadMessagesEnabled.eq.true'
            )
            .order('user_id')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{
            user_id: string;
            settings: Record<string, unknown> | null;
            profiles: { email: string | null } | null;
        }>) {
            const settings = row.settings ?? {};
            all.push({
                id: row.user_id,
                email: row.profiles?.email ?? null,
                flags: {
                    moderation: settings.digestEmailEnabled === true,
                    overdueGrading: settings.digestOverdueGradingEnabled === true,
                    unreadMessages: settings.digestUnreadMessagesEnabled === true,
                },
            });
        }
        if (!data || data.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }
    return all;
}
