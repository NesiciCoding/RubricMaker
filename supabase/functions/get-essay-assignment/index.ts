// Edge Function: get-essay-assignment
// Returns the student-facing content of an essay assignment.
//
// This function is the only way anonymous (SEB) and portal students can read
// assignment content. Direct REST access to essay_assignments is blocked for
// anonymous users (migration 029), preventing bulk enumeration of prompts.
//
// Security model:
//   - Caller must supply a valid JWT (anonymous or email-authenticated).
//   - Any authenticated user who presents a valid assignment ID can read it.
//     The random nanoid ID is the access credential; brute-force is infeasible.
//   - Only student-facing columns are returned; owner_id is never exposed.

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

    const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify the JWT — accepts both anonymous and email-authenticated sessions.
    const { data: { user }, error: authErr } = await admin.auth.getUser(
        authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    let body: { assignmentId?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { assignmentId } = body;
    if (!assignmentId || typeof assignmentId !== 'string') {
        return json({ error: 'Missing required field: assignmentId' }, 400);
    }

    const { data: assignment, error: assignErr } = await admin
        .from('essay_assignments')
        .select('rubric_id, student_id, title, prompt, min_words, max_words, time_limit_minutes, require_seb, expires_at, read_only_after_submit')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment has expired' }, 410);
    }

    return json({
        rubricId: assignment.rubric_id,
        studentId: assignment.student_id,
        title: assignment.title,
        prompt: assignment.prompt ?? null,
        minWords: assignment.min_words ?? null,
        maxWords: assignment.max_words ?? null,
        timeLimitMinutes: assignment.time_limit_minutes ?? null,
        requireSEB: assignment.require_seb,
        expiresAt: assignment.expires_at ?? null,
        readOnlyAfterSubmit: assignment.read_only_after_submit,
    });
});
