// Edge Function: notify-student-message
// Called by the frontend after a teacher sends/replies to a student message.
// Sends an email notification to the student (if email is stored and SMTP is configured).
// Silently no-ops when student has no email or when SMTP is not set up.
//
// Mirrors notify-student-graded's mailer approach (Supabase Auth's generateLink as a
// placeholder — see that function's own note that this is not a real transactional send,
// just whatever magic-link email SMTP happens to be configured to deliver). Not a shared
// helper with notify-student-graded: the two payloads differ (rubricName vs. message
// context/body) and both functions are small enough that duplication beats an abstraction
// for two call sites.
//
// Unlike notify-student-graded, this looks up the student's email from the jsonb `data`
// column (students.email/name are not real top-level columns) and scopes the lookup to
// the calling teacher's own roster (owner_id = caller), so one teacher can't use this to
// probe another teacher's student records.

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify teacher JWT
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    let body: {
        studentId?: string;
        contextLabel?: string;
        bodyPreview?: string;
        portalUrl?: string;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { studentId, contextLabel, bodyPreview, portalUrl } = body;
    if (!studentId) {
        return json({ error: 'studentId is required' }, 400);
    }

    // Look up the student's email, scoped to this teacher's own roster.
    const { data: studentRow } = await supabase
        .from('students')
        .select("data->>email as email, data->>name as name")
        .eq('id', studentId)
        .eq('owner_id', user.id)
        .single();

    if (!studentRow?.email) {
        // No email stored (or student not owned by this teacher) — silently skip
        return json({ skipped: true, reason: 'no_email' });
    }

    // Send notification via Supabase Auth mailer (reuses the same SMTP config).
    // Placeholder, same as notify-student-graded: this delivers whatever magic-link
    // template SMTP is configured with, not real "your teacher replied" content.
    const { error: mailErr } = await supabase.auth.admin.generateLink({
        type: 'magiclink',
        email: studentRow.email,
    });

    if (mailErr) {
        return json({ skipped: true, reason: 'smtp_not_configured' });
    }

    return json({ sent: true, studentEmail: studentRow.email, contextLabel, bodyPreview, portalUrl });
});
