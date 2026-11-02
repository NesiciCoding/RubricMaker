// Edge Function: notify-student-graded
// Called by the frontend after a teacher saves a grade.
// Sends an email notification to the student (if email is stored and SMTP is configured).
// Silently no-ops when student has no email or when SMTP is not set up.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderGradedEmail } from '../_shared/notificationEmails.ts';
import { isValidEmailAddress } from '../_shared/smtp.ts';
import { appLink, sendEmail } from '../_deno/mail.ts';

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

    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    // Verify teacher JWT
    const {
        data: { user },
        error: authErr,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid token' }, 401);

    let body: {
        studentId?: string;
        rubricName?: string;
        portalUrl?: string;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { studentId, rubricName, portalUrl } = body;
    if (!studentId || !rubricName) {
        return json({ error: 'studentId and rubricName are required' }, 400);
    }

    const { data: studentRow } = await supabase
        .from('students')
        .select('data->>email as email, data->>name as name')
        .eq('id', studentId)
        .eq('owner_id', user.id)
        .single();

    const email = typeof studentRow?.email === 'string' ? studentRow.email.trim() : '';
    if (!email || !isValidEmailAddress(email)) {
        return json({ skipped: true, reason: 'no_email' });
    }

    const { data: teacher } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();

    const rendered = renderGradedEmail({
        studentName: studentRow?.name,
        teacherName: teacher?.display_name,
        rubricName,
        portalUrl: appLink(`/portal/${encodeURIComponent(studentId)}`) ?? portalUrl,
    });
    const result = await sendEmail({ to: email, ...rendered });
    if (!result.sent) return json({ skipped: true, reason: result.reason });
    return json({ sent: true });
});
