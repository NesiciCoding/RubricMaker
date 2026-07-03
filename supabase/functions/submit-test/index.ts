// Edge Function: submit-test
// Validates and persists a student test submission server-side, so a client-side
// patch cannot bypass the expiry check or the duplicate-submission guard (the
// unique index on student_tests.assignment_id is the final backstop).
//
// No auto-scoring here: the teacher-side view already computes rawTotalPoints on
// read (studentTest.rawTotalPoints ?? calcStudentTestRawPoints(...)) — the same
// fallback a legacy submission-code import relies on, since that path never stored
// a score either. Leaving rawTotalPoints unset keeps both paths consistent without
// porting testCalc.ts's scoring logic to Deno.

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

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const {
        data: { user },
        error: authErr,
    } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    let body: {
        assignmentId?: string;
        submissionId?: string;
        answers?: { questionId: string; response: string }[];
        startedAt?: string;
        submittedAt?: string;
        events?: unknown[];
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { assignmentId, submissionId, answers, startedAt, submittedAt, events } = body;
    if (
        !assignmentId ||
        !submissionId ||
        !Array.isArray(answers) ||
        !answers.every((a) => a && typeof a.questionId === 'string' && typeof a.response === 'string') ||
        !startedAt ||
        !submittedAt ||
        (events !== undefined && !Array.isArray(events))
    ) {
        return json(
            { error: 'Missing required fields: assignmentId, submissionId, answers, startedAt, submittedAt' },
            400
        );
    }

    // Rate limit: at most 5 submissions per user per 60 seconds (mirrors submit-essay).
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await admin
        .from('student_tests')
        .select('id', { count: 'exact', head: true })
        .eq('student_user_id', user.id)
        .gte('submitted_at', sixtySecondsAgo);
    if (rateErr) {
        return json({ error: 'Rate limit check failed. Please try again.' }, 503);
    }
    if ((recentCount ?? 0) >= 5) {
        return json({ error: 'Too many submission attempts. Please wait before trying again.' }, 429);
    }

    const { data: assignment, error: assignErr } = await admin
        .from('test_assignments')
        .select('owner_id, test_id, student_id, expires_at')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    const { error: insertErr } = await admin.from('student_tests').insert({
        id: submissionId,
        owner_id: assignment.owner_id,
        assignment_id: assignmentId,
        student_user_id: user.id,
        submitted_at: submittedAt,
        data: {
            id: submissionId,
            testId: assignment.test_id,
            studentId: assignment.student_id,
            answers,
            status: 'submitted',
            startedAt,
            submittedAt,
            events: events ?? [],
        },
    });

    if (insertErr) {
        if (insertErr.code === '23505') {
            return json({ error: 'You have already submitted this assignment' }, 409);
        }
        console.error('submit-test insert failed:', insertErr);
        return json({ error: 'Failed to save submission. Please try again.' }, 500);
    }

    return json({ success: true });
});
