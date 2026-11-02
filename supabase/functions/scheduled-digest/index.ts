// Edge Function: scheduled-digest
// Triggered nightly by pg_cron's net.http_post (see migration 059_scheduled_digest.sql).
// Extended in migration 066 (roadmap 30.2) from a single moderation-only digest to three
// independent per-category opt-ins (moderation disputes, overdue grading, unread student
// messages — the same three the in-app Notification Center surfaces). For every teacher/
// admin who opted into at least one category and has a non-zero count in at least one of
// their enabled categories, sends a single combined email listing each non-zero category.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { pingHeartbeat } from '../_shared/heartbeat.ts';
import { digestTotal, renderDigestEmail, type DigestCounts } from '../_shared/notificationEmails.ts';
import { isValidEmailAddress } from '../_shared/smtp.ts';
import { appLink, mailConfigured, sendEmail } from '../_deno/mail.ts';
import { secretsMatch } from '../_shared/secureCompare.ts';

const PAGE_SIZE = 1000;

interface DigestFlags {
    moderation: boolean;
    overdueGrading: boolean;
    unreadMessages: boolean;
}

interface OptedInProfile {
    id: string;
    email: string | null;
    displayName: string | null;
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
    if (!secretsMatch(authHeader, `Bearer ${serviceKey}`)) {
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

    if (profiles.length > 0 && !mailConfigured()) {
        console.error('[scheduled-digest] SMTP_HOST / SMTP_ADMIN_EMAIL are not set; no digest can be sent');
        return new Response(JSON.stringify({ error: 'SMTP is not configured' }), { status: 500 });
    }

    let sent = 0;
    let skipped = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const profile of profiles) {
        if (!profile.email || !isValidEmailAddress(profile.email)) {
            skipped++;
            continue;
        }
        try {
            const counts = await enabledCounts(admin, profile);
            if (!digestTotal(counts)) {
                skipped++;
                continue;
            }

            const rendered = renderDigestEmail({ teacherName: profile.displayName, counts, appUrl: appLink('/') });
            const result = await sendEmail({ to: profile.email, ...rendered });
            if (!result.sent) throw new Error(result.reason);
            sent++;
        } catch (e) {
            errors.push({ userId: profile.id, error: e instanceof Error ? e.message : String(e) });
        }
    }

    if (errors.length === 0) await pingHeartbeat(Deno.env.get('DIGEST_HEARTBEAT_URL'));
    return new Response(JSON.stringify({ sent, skipped, errors }), { status: 200 });
});

// Only calls the RPC for a category the teacher actually opted into — an unopted-in
// category's count is never computed, matching the pre-30.2 behavior for teachers who
// only ever had the moderation flag.
async function enabledCounts(admin: ReturnType<typeof createClient>, profile: OptedInProfile): Promise<DigestCounts> {
    const [moderation, overdueGrading, unreadMessages] = await Promise.all([
        profile.flags.moderation ? rpcCount(admin, 'get_pending_moderation_count', profile.id) : 0,
        profile.flags.overdueGrading ? rpcCount(admin, 'get_overdue_grading_count', profile.id) : 0,
        profile.flags.unreadMessages ? rpcCount(admin, 'get_unread_messages_count', profile.id) : 0,
    ]);
    return { moderation, overdueGrading, unreadMessages };
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
            .select('user_id, settings, profiles!inner(email, display_name)')
            .or(
                'settings->>digestEmailEnabled.eq.true,settings->>digestOverdueGradingEnabled.eq.true,settings->>digestUnreadMessagesEnabled.eq.true'
            )
            .order('user_id')
            .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as Array<{
            user_id: string;
            settings: Record<string, unknown> | null;
            profiles: { email: string | null; display_name: string | null } | null;
        }>) {
            const settings = row.settings ?? {};
            all.push({
                id: row.user_id,
                email: row.profiles?.email ?? null,
                displayName: row.profiles?.display_name ?? null,
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
