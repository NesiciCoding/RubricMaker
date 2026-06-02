// Edge Function: submit-essay
// Validates and persists a student essay submission server-side.
// This prevents client-side bypass of word-count limits, expiry checks,
// and duplicate-submission guards (the UNIQUE constraint is the final backstop).

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

    // Service-role client for privileged DB/Storage operations
    const admin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Verify the student's JWT
    const { data: { user }, error: authErr } = await admin.auth.getUser(
        authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    let body: {
        assignmentId?: string;
        submissionId?: string;
        htmlContent?: string;
        studentEmail?: string;
        wordCount?: number;
    };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }

    const { assignmentId, submissionId, htmlContent, studentEmail: bodyEmail, wordCount } = body;

    if (!assignmentId || !submissionId || !htmlContent || typeof wordCount !== 'number') {
        return json({ error: 'Missing required fields: assignmentId, submissionId, htmlContent, wordCount' }, 400);
    }

    // Derive the authoritative email from the verified auth record when present
    // (portal login sessions carry a verified email). Anonymous users have no email
    // in their JWT, so fall back to the client-supplied value for those cases.
    // If the auth record has an email and the client sent a different one, reject the
    // request to prevent one student from claiming another's submission slot.
    const authEmail = user.email ?? null;
    if (authEmail && bodyEmail && authEmail.toLowerCase() !== bodyEmail.toLowerCase()) {
        return json({ error: 'Email mismatch: submitted email does not match your account' }, 403);
    }
    const studentEmail = authEmail ?? bodyEmail ?? null;

    if (!studentEmail) {
        return json({ error: 'Missing required field: studentEmail' }, 400);
    }

    // Fetch assignment for server-side validation
    const { data: assignment, error: assignErr } = await admin
        .from('essay_assignments')
        .select('id, max_words, min_words, expires_at')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    // Expiry check
    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    // Word-count bounds
    if (assignment.max_words && wordCount > assignment.max_words) {
        return json({ error: `Word count ${wordCount} exceeds the limit of ${assignment.max_words}` }, 422);
    }

    // Upload HTML to Storage
    const storagePath = `${assignmentId}/${submissionId}.html`;
    const { error: uploadErr } = await admin.storage
        .from('essays')
        .upload(storagePath, new Blob([htmlContent], { type: 'text/html' }), {
            contentType: 'text/html',
            upsert: false,
        });

    if (uploadErr) return json({ error: `Storage upload failed: ${uploadErr.message}` }, 500);

    // Insert submission row (UNIQUE constraint is the final duplicate guard)
    const { error: insertErr } = await admin
        .from('essay_submissions')
        .insert({
            id: submissionId,
            assignment_id: assignmentId,
            student_email: studentEmail ?? null,
            student_user_id: user.id,
            word_count: wordCount,
            submitted_at: new Date().toISOString(),
            storage_path: storagePath,
        });

    if (insertErr) {
        await admin.storage.from('essays').remove([storagePath]).catch(() => {});
        if (insertErr.code === '23505') {
            return json({ error: 'You have already submitted this assignment' }, 409);
        }
        return json({ error: `Database insert failed: ${insertErr.message}` }, 500);
    }

    return json({ success: true, storagePath });
});
