// Edge Function: set-student-password
// Lets a teacher set (or reset) the login password for one of their own students,
// as an alternative to email OTP — school email filters frequently block or delay
// Supabase's default OTP sender, leaving students unable to sign in.
//
// Security model:
//   - Caller must be a signed-in (non-anonymous) teacher or admin, checked against profiles.role.
//   - The target email must belong to a student row owned by that teacher — a
//     teacher can only set passwords for their own roster, never arbitrary emails.
//   - An existing account is only changed when its profile role is `student`.
//   - Emails are matched exactly (case-insensitive), never as patterns.
//   - The actual auth.users write uses the service-role admin API and never runs
//     client-side. Every call is recorded in audit_logs and rate limited per caller.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
    authorizeCaller,
    authorizeTarget,
    escapeLikePattern,
    normalizeStudentEmail,
    validatePassword,
} from '../_shared/studentPasswordGuard.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RATE_LIMIT_PER_MINUTE = 20;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: { ...CORS, 'Content-Type': 'application/json', Allow: 'POST, OPTIONS' },
        });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const {
        data: { user: teacher },
        error: authErr,
    } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !teacher) return json({ error: 'Invalid or expired token' }, 401);

    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', teacher.id).maybeSingle();
    const callerDecision = authorizeCaller({
        isAnonymous: teacher.is_anonymous === true,
        role: callerProfile?.role ?? null,
    });
    if (!callerDecision.ok) return json({ error: callerDecision.error }, callerDecision.status);

    let body: { studentEmail?: unknown; password?: unknown } | null;
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }
    if (!body || typeof body !== 'object') return json({ error: 'Invalid request body' }, 400);

    const studentEmail = normalizeStudentEmail(body.studentEmail);
    if (!studentEmail) return json({ error: 'Missing or invalid field: studentEmail' }, 400);
    if (!validatePassword(body.password)) return json({ error: 'password must be at least 8 characters' }, 400);
    const password = body.password;

    // The attempt is recorded first and counted afterwards, so concurrent requests each see the others'
    // rows and failed attempts count towards the limit too.
    const { error: attemptErr } = await admin.from('audit_logs').insert({
        actor_id: teacher.id,
        category: 'admin',
        action: 'set_student_password_attempt',
    });
    if (attemptErr) return json({ error: 'Could not record the request' }, 500);
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCalls, error: countErr } = await admin
        .from('audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('actor_id', teacher.id)
        .eq('action', 'set_student_password_attempt')
        .gte('created_at', since);
    if (countErr) return json({ error: 'Could not record the request' }, 500);
    if ((recentCalls ?? 0) > RATE_LIMIT_PER_MINUTE) return json({ error: 'Too many requests' }, 429);

    const pattern = escapeLikePattern(studentEmail);

    // Confirm this email belongs to one of the calling teacher's own students.
    const { data: rosterMatch } = await admin
        .from('students')
        .select('id')
        .eq('owner_id', teacher.id)
        .ilike('data->>email', pattern)
        .limit(1)
        .maybeSingle();

    if (!rosterMatch) {
        return json({ error: 'This email does not match a student in your roster' }, 403);
    }

    const { data: existingProfile } = await admin.from('profiles').select('id, role').ilike('email', pattern).limit(2);
    if ((existingProfile ?? []).length > 1) return json({ error: 'That account cannot be managed here' }, 403);

    const target = existingProfile?.[0] ?? null;
    const targetDecision = authorizeTarget(teacher.id, target);
    if (!targetDecision.ok) return json({ error: targetDecision.error }, targetDecision.status);

    if (target) {
        const { data: authTarget } = await admin.auth.admin.getUserById(target.id);
        if (authTarget?.user?.email?.toLowerCase() !== studentEmail) {
            return json({ error: 'That account cannot be managed here' }, 403);
        }
        const { error: updateErr } = await admin.auth.admin.updateUserById(target.id, { password });
        if (updateErr) return json({ error: updateErr.message }, 500);
    } else {
        const { error: createErr } = await admin.auth.admin.createUser({
            email: studentEmail,
            password,
            email_confirm: true,
        });
        if (createErr) return json({ error: createErr.message }, 500);
    }

    await admin.from('audit_logs').insert({
        actor_id: teacher.id,
        category: 'admin',
        action: 'set_student_password',
        entity_type: 'student',
        entity_id: rosterMatch.id,
    });

    return json({ success: true });
});
