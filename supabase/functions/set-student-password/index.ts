// Edge Function: set-student-password
// Lets a teacher set (or reset) the login password for one of their own students,
// as an alternative to email OTP — school email filters frequently block or delay
// Supabase's default OTP sender, leaving students unable to sign in.
//
// Security model:
//   - Caller must be an authenticated teacher (valid JWT).
//   - The target email must belong to a student row owned by that teacher — a
//     teacher can only set passwords for their own roster, never arbitrary emails.
//   - The actual auth.users write uses the service-role admin API and never runs
//     client-side.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user: teacher }, error: authErr } = await admin.auth.getUser(
        authHeader.replace('Bearer ', ''),
    );
    if (authErr || !teacher) return json({ error: 'Invalid or expired token' }, 401);

    let body: { studentEmail?: string; password?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { studentEmail, password } = body;
    if (!studentEmail || typeof studentEmail !== 'string') {
        return json({ error: 'Missing required field: studentEmail' }, 400);
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return json({ error: 'password must be at least 8 characters' }, 400);
    }

    // Confirm this email belongs to one of the calling teacher's own students.
    const { data: rosterMatch } = await admin
        .from('students')
        .select('id')
        .eq('owner_id', teacher.id)
        .ilike('data->>email', studentEmail)
        .limit(1)
        .maybeSingle();

    if (!rosterMatch) {
        return json({ error: 'This email does not match a student in your roster' }, 403);
    }

    const { error: createErr } = await admin.auth.admin.createUser({
        email: studentEmail,
        password,
        email_confirm: true,
    });

    if (!createErr) return json({ success: true });

    // Most likely cause: the student already has an auth account (e.g. they signed
    // in once before, or a password was already set previously) — update it instead.
    const { data: existingProfile } = await admin
        .from('profiles')
        .select('id')
        .ilike('email', studentEmail)
        .maybeSingle();

    if (!existingProfile) {
        return json({ error: createErr.message }, 500);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(existingProfile.id, { password });
    if (updateErr) return json({ error: updateErr.message }, 500);

    return json({ success: true });
});
