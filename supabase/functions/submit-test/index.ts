// Edge Function: submit-test
// Validates and persists a student test submission server-side, so a client-side
// patch cannot bypass the expiry check or the duplicate-submission guard (the
// unique index on student_tests(assignment_id, attempt_number) is the final backstop —
// see migration 056 for why attempt_number exists: practice-mode assignments allow
// more than one submission per assignment_id, assessment-mode ones don't).
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

// ── Placement path integrity ────────────────────────────────────────────────
// sectionPath/levelPath drive the provisional CEFR estimate and (via
// maxPointsForPath/staircaseMaxPoints on the client) the score shown on the
// results page, so a forged path — an unknown section/question id, a repeat,
// or a hop that isn't actually reachable per the test's own routing rules —
// must be rejected rather than silently trusted. This deliberately does NOT
// replay auto-scoring to verify each routing *decision* was correct (that
// would mean porting testCalc.ts's scoring engine to Deno, which the rest of
// this function already avoids, see the file header) — it only checks that
// the path is a structurally possible walk of the test's own graph.
const MAX_STAIRCASE_STEPS = 12;

interface MinimalSection {
    id: string;
    cefrLevel?: string;
    routing?: { passSectionId: string; failSectionId: string };
}
interface MinimalQuestion {
    id: string;
    type: string;
    sectionId?: string;
}
interface MinimalTest {
    sections?: MinimalSection[];
    questions?: MinimalQuestion[];
}

function isValidSectionPath(test: MinimalTest, sectionPath: string[]): boolean {
    const sections = test.sections ?? [];
    if (sections.length === 0 || sectionPath.length === 0) return false;
    if (new Set(sectionPath).size !== sectionPath.length) return false;
    if (sectionPath[0] !== sections[0].id) return false;

    const byId = new Map(sections.map((s) => [s.id, s]));
    for (let i = 0; i < sectionPath.length; i++) {
        const section = byId.get(sectionPath[i]);
        if (!section) return false;
        if (i === sectionPath.length - 1) continue;
        const next = sectionPath[i + 1];
        if (!section.routing) return false;
        if (section.routing.passSectionId !== next && section.routing.failSectionId !== next) return false;
    }
    return true;
}

function isValidLevelPath(
    test: MinimalTest,
    levelPath: { sectionId: string; level: string; questionId: string; correct: boolean }[]
): boolean {
    if (levelPath.length === 0 || levelPath.length > MAX_STAIRCASE_STEPS) return false;

    const questionsById = new Map((test.questions ?? []).map((q) => [q.id, q]));
    const seenQuestionIds = new Set<string>();
    for (const step of levelPath) {
        if (seenQuestionIds.has(step.questionId)) return false;
        seenQuestionIds.add(step.questionId);

        const question = questionsById.get(step.questionId);
        if (!question || question.sectionId !== step.sectionId || question.type === 'open') return false;

        const section = (test.sections ?? []).find((s) => s.id === step.sectionId);
        if (!section || section.cefrLevel !== step.level) return false;
    }
    return true;
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
        sectionPath?: string[];
        levelPath?: { sectionId: string; level: string; questionId: string; correct: boolean }[];
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { assignmentId, submissionId, answers, startedAt, submittedAt, events, sectionPath, levelPath } = body;
    if (
        !assignmentId ||
        !submissionId ||
        !Array.isArray(answers) ||
        !answers.every((a) => a && typeof a.questionId === 'string' && typeof a.response === 'string') ||
        !startedAt ||
        !submittedAt ||
        (events !== undefined && !Array.isArray(events)) ||
        (sectionPath !== undefined &&
            (!Array.isArray(sectionPath) || !sectionPath.every((s) => typeof s === 'string'))) ||
        (levelPath !== undefined &&
            (!Array.isArray(levelPath) ||
                !levelPath.every(
                    (s) =>
                        s &&
                        typeof s.sectionId === 'string' &&
                        typeof s.level === 'string' &&
                        typeof s.questionId === 'string' &&
                        typeof s.correct === 'boolean'
                )))
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
        .select('owner_id, test_id, student_id, expires_at, mode')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    if (sectionPath || levelPath) {
        const { data: testRow, error: testErr } = await admin
            .from('tests')
            .select('data')
            .eq('id', assignment.test_id)
            .single();
        if (testErr || !testRow) return json({ error: 'Test not found' }, 404);
        const test = testRow.data as MinimalTest;

        if (sectionPath && !isValidSectionPath(test, sectionPath)) {
            return json({ error: 'Invalid section path' }, 400);
        }
        if (levelPath && !isValidLevelPath(test, levelPath)) {
            return json({ error: 'Invalid level path' }, 400);
        }
    }

    // Practice-mode assignments allow retakes: each attempt gets the next attempt_number so
    // it doesn't collide with student_tests_assignment_attempt_uniq. Assessment-mode (or
    // legacy rows with no mode recorded) always inserts attempt 1, preserving the original
    // one-submission-per-assignment guard.
    //
    // Count-then-insert is a race for concurrent practice retakes (two tabs submitting at once
    // could both count the same prior total and collide on attempt_number). Retry a bounded
    // number of times on a 23505 conflict, re-counting each time, rather than failing a valid
    // retake outright — but only for practice mode; assessment-mode conflicts are always a
    // genuine duplicate submission and should fail immediately, as before.
    const isPractice = assignment.mode === 'practice';
    const maxAttempts = isPractice ? 5 : 1;

    for (let retry = 0; retry < maxAttempts; retry++) {
        let attemptNumber = 1;
        if (isPractice) {
            const { count } = await admin
                .from('student_tests')
                .select('id', { count: 'exact', head: true })
                .eq('assignment_id', assignmentId);
            attemptNumber = (count ?? 0) + 1;
        }

        const { error: insertErr } = await admin.from('student_tests').insert({
            id: submissionId,
            owner_id: assignment.owner_id,
            assignment_id: assignmentId,
            student_user_id: user.id,
            submitted_at: submittedAt,
            attempt_number: attemptNumber,
            data: {
                id: submissionId,
                testId: assignment.test_id,
                studentId: assignment.student_id,
                answers,
                status: 'submitted',
                startedAt,
                submittedAt,
                events: events ?? [],
                attemptNumber,
                ...(sectionPath ? { sectionPath } : {}),
                ...(levelPath ? { levelPath } : {}),
            },
        });

        if (!insertErr) return json({ success: true });

        if (insertErr.code === '23505') {
            if (isPractice && retry < maxAttempts - 1) continue;
            return json({ error: 'You have already submitted this assignment' }, 409);
        }
        console.error('submit-test insert failed:', insertErr);
        return json({ error: 'Failed to save submission. Please try again.' }, 500);
    }

    return json({ error: 'You have already submitted this assignment' }, 409);
});
