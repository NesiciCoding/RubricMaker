// Edge Function: get-seb-config
// Returns the Safe Exam Browser settings file for one assignment.
//
// Why the server generates it: the config embeds the app base URL, so building it in the
// teacher's browser made the file depend on whichever device downloaded it (and on the origin
// that browser happened to be using). Here the base comes from APP_URL, so every student and
// teacher gets byte-identical bytes for the same assignment, and the file can later be loaded
// directly by SEB through a one-scan launch link.
//
// Access model: the random assignment code is the credential, exactly like the student's test
// link. Only an assignment that actually requires SEB returns a config. The settings contain no
// secrets — no answers, no keys — so no JWT is required (see the verify_jwt = false entry in
// supabase/config.toml, which also makes the future sebs:// launch link work).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeAppBase, renderSebConfigBytes, sebFileSlug, sebStartUrl } from '../_shared/sebConfig.ts';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Expose-Headers': 'Content-Disposition',
};

const CODE_PATTERN = /^[A-Za-z0-9_-]{10,40}$/;

function failure(error: string, status: number): Response {
    return new Response(JSON.stringify({ error }), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
    });
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'GET') return failure('Method not allowed', 405);

    const code = new URL(req.url).searchParams.get('code')?.trim() ?? '';
    if (!CODE_PATTERN.test(code)) return failure('Invalid assignment code', 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: testAssignment } = await admin
        .from('test_assignments')
        .select('require_seb, expires_at, test_name')
        .eq('id', code)
        .maybeSingle();

    let kind: 'test' | 'essay' = 'test';
    let assignment: { require_seb: boolean; expires_at: string | null } | null = testAssignment;
    let name: string | null = testAssignment?.test_name ?? null;

    if (!assignment) {
        const { data: essayAssignment } = await admin
            .from('essay_assignments')
            .select('require_seb, expires_at, title')
            .eq('id', code)
            .maybeSingle();
        if (essayAssignment) {
            kind = 'essay';
            assignment = essayAssignment;
            name = essayAssignment.title ?? null;
        }
    }

    if (!assignment) return failure('Assignment not found', 404);
    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return failure('Assignment has expired', 410);
    }
    if (!assignment.require_seb) return failure('This assignment does not require Safe Exam Browser', 409);

    const appBase = normalizeAppBase(Deno.env.get('APP_URL')) ?? normalizeAppBase(req.headers.get('Origin'));
    if (!appBase) return failure('APP_URL is not configured on the server', 500);

    const startUrl = sebStartUrl(appBase, kind, code);
    const config = renderSebConfigBytes({ startUrl, appBase });

    return new Response(config, {
        status: 200,
        headers: {
            ...CORS,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${sebFileSlug(name, 'exam')}.seb"`,
            'Cache-Control': 'no-store',
        },
    });
});
