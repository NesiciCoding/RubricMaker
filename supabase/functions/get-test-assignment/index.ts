// Edge Function: get-test-assignment
// Returns the student-facing content of a test assignment.
//
// Mirrors get-essay-assignment: this is the only way an anonymous (or portal)
// student session can read test content for a bare share-code link. Direct REST
// access to `tests` for anonymous users is not granted (only the owning teacher,
// and — via a separate scoped policy from migration 044 — a portal-authenticated
// student with a persisted test_assignments row).
//
// Security model:
//   - Caller must supply a valid JWT (anonymous or email-authenticated).
//   - Any authenticated user who presents a valid assignment ID can read it. The
//     random nanoid ID is the access credential; brute-force is infeasible.
//   - test_assignments.test_id has no FK-enforced owner match, so the lookup below
//     also checks owner_id to prevent an assignment row from leaking a different
//     teacher's test content.

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

    const {
        data: { user },
        error: authErr,
    } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
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
        .from('test_assignments')
        .select('owner_id, test_id, student_id, require_seb, duration_minutes, expires_at')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment has expired' }, 410);
    }

    const { data: test, error: testErr } = await admin
        .from('tests')
        .select('data')
        .eq('id', assignment.test_id)
        .eq('owner_id', assignment.owner_id)
        .single();

    if (testErr || !test) return json({ error: 'Test not found' }, 404);

    return json({
        testId: assignment.test_id,
        studentId: assignment.student_id,
        requireSEB: assignment.require_seb,
        durationMinutes: assignment.duration_minutes ?? null,
        expiresAt: assignment.expires_at ?? null,
        test: test.data,
    });
});
