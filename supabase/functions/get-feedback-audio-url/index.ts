// Edge Function: get-feedback-audio-url
// Mints a short-lived signed URL for a student's own voice feedback on a portal grade card.
//
// The `feedback-audio` bucket RLS is owner-scoped: only paths whose first folder matches
// auth.uid() can be read, and uploads live under the grader's uid. A portal student session
// therefore cannot sign the teacher-owned path itself (the client-side sign silently returns an
// empty URL and the player disappears). This resolver instead authorizes the caller against the
// RLS-readable `student_rubrics` row they are already viewing and signs that row's own path with
// the service role — the owner-only bucket policy is left untouched.
//
// Security model:
//   - Caller must supply a valid JWT (portal/student or teacher session).
//   - The grade is read through the caller's own session, so student_rubrics RLS decides access:
//     a caller only gets a row they are entitled to read.
//   - The path is taken from that row, never from the request, and is pinned to the row's grader
//     folder (`{graderId}/{studentRubricId}/{criterionId}`) so nothing outside it can be signed.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1h, matching teacher-side playback

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

interface RawEntry {
    criterionId?: string;
    audioStoragePath?: string;
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

    let body: { studentRubricId?: unknown; criterionId?: unknown };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const studentRubricId = typeof body.studentRubricId === 'string' ? body.studentRubricId : '';
    const criterionId = typeof body.criterionId === 'string' ? body.criterionId : '';
    if (!studentRubricId || !criterionId) {
        return json({ error: 'Missing required fields: studentRubricId, criterionId' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const {
        data: { user },
        error: authErr,
    } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    // Read through the caller's session so student_rubrics RLS is the authorization check.
    const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
    });
    const { data: sr, error: srErr } = await caller
        .from('student_rubrics')
        .select('grader_id, data')
        .eq('id', studentRubricId)
        .maybeSingle();
    if (srErr || !sr) return json({ error: 'Not found' }, 404);

    const row = sr as { grader_id?: string; data?: { entries?: RawEntry[] } };
    const entries = Array.isArray(row.data?.entries) ? row.data.entries : [];
    const storagePath = entries.find((e) => e.criterionId === criterionId)?.audioStoragePath;
    if (!storagePath) return json({ error: 'No audio for this criterion' }, 404);

    const expectedPrefix = `${row.grader_id}/${studentRubricId}/`;
    if (!row.grader_id || !storagePath.startsWith(expectedPrefix)) {
        return json({ error: 'Not found' }, 404);
    }

    const { data: signed, error: signErr } = await admin.storage
        .from('feedback-audio')
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) return json({ error: 'Could not sign URL' }, 500);

    return json({ url: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
});
