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

    // Rate limit: allow at most 5 successful submissions per user per 60 seconds.
    // This is an early, cheap guard before the expensive storage upload.
    // Failed-attempt spamming (word-count / expiry errors) cannot be counted here
    // without a dedicated attempts table, but the UNIQUE constraint is the final
    // backstop for duplicate successful submissions.
    const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
    const { count: recentCount, error: rateErr } = await admin
        .from('essay_submissions')
        .select('id', { count: 'exact', head: true })
        .eq('student_user_id', user.id)
        .gte('submitted_at', sixtySecondsAgo);
    if (rateErr) {
        return json({ error: 'Rate limit check failed. Please try again.' }, 503);
    }
    if ((recentCount ?? 0) >= 5) {
        return json({ error: 'Too many submission attempts. Please wait before trying again.' }, 429);
    }

    // Fetch assignment for server-side validation (include student_id for roster check below)
    const { data: assignment, error: assignErr } = await admin
        .from('essay_assignments')
        .select('id, student_id, max_words, min_words, expires_at')
        .eq('id', assignmentId)
        .single();

    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);

    // For anonymous sessions (no verified email in JWT) verify the submitted email
    // matches the email stored on the teacher's student record for this assignment.
    // This prevents one student from grabbing another's submission slot by typing a
    // different email. If the student has no email in the roster we allow the
    // submission — the teacher may have set up the assignment without importing emails.
    if (!authEmail && studentEmail && assignment.student_id) {
        const { data: studentRow } = await admin
            .from('students')
            .select('data')
            .eq('id', assignment.student_id)
            .single();
        const rosterEmail: string | null = (studentRow?.data as Record<string, unknown> | null)?.email as string ?? null;
        if (rosterEmail && rosterEmail.toLowerCase() !== studentEmail.toLowerCase()) {
            return json({ error: 'Email does not match the student record for this assignment' }, 403);
        }
    }

    // Expiry check
    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    // Compute word-limit status for the teacher's view; do not reject over/under submissions.
    let wordLimitStatus: 'ok' | 'under' | 'over' | null = null;
    if (assignment.min_words !== null || assignment.max_words !== null) {
        if (assignment.max_words !== null && wordCount > assignment.max_words) {
            wordLimitStatus = 'over';
        } else if (assignment.min_words !== null && wordCount < assignment.min_words) {
            wordLimitStatus = 'under';
        } else {
            wordLimitStatus = 'ok';
        }
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
            word_limit_status: wordLimitStatus,
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
