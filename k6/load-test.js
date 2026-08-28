// Phase-1 load test — REGRESSION SMOKE, not a capacity test.
//
// Runs ~50 virtual users against a *local* Supabase stack (`supabase start`)
// co-located with the load generator on one CI runner. Its purpose is relative:
// catch a change that makes the hot student-facing paths error out or grossly
// slower than they are today. It cannot answer "can a school of 100+ students
// test at once" — the co-located local stack (single edge-runtime container,
// untuned Postgres, shared CPU) is not representative of production capacity.
// That question needs a dedicated staging project (Phase 2). See k6/README.md.
//
// Hot paths exercised each iteration:
//   1. get-test-assignment edge function — auth.getUser + 2 Postgres reads +
//      student-safe transform. The endpoint a whole class hits when opening a
//      test. Idempotent, so safe to hammer without growing data.
//   2. PostgREST RLS read of `tests` — the sync/hydrate path every connected
//      session drives on boot and after edits.

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend } from 'k6/metrics';

const SUPABASE_URL = (__ENV.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = __ENV.SUPABASE_SERVICE_KEY || '';

const VUS = Number(__ENV.VUS || 50);
const HOLD = __ENV.DURATION || '60s';

const edgeLatency = new Trend('edge_get_test_assignment', true);
const restLatency = new Trend('rest_tests_read', true);

export const options = {
    scenarios: {
        student_load: {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '15s', target: VUS },
                { duration: HOLD, target: VUS },
                { duration: '10s', target: 0 },
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        // Functional correctness: <1% of requests may fail. This is the
        // "functionality is good" gate — a regression that starts erroring
        // under concurrency fails the run.
        http_req_failed: ['rate<0.01'],
        // Response bodies must be well-formed (right shape, not just 200).
        checks: ['rate>0.99'],
        // Gross-regression guard, deliberately generous for a co-located local
        // stack. Not a production SLO — see the header note.
        edge_get_test_assignment: ['p(95)<1500'],
        rest_tests_read: ['p(95)<1000'],
    },
};

function required(name, value) {
    if (!value) fail(`Missing required env var ${name} — export it before running k6`);
    return value;
}

// Seeds one teacher (profile auto-created by the handle_new_user trigger), one
// test, and one assignment via the service_role key, then password-grants a JWT
// the load phase reuses. Runs once, before any VU starts.
export function setup() {
    required('SUPABASE_ANON_KEY', ANON_KEY);
    required('SUPABASE_SERVICE_KEY', SERVICE_KEY);

    const stamp = Date.now();
    const email = `loadtest+${stamp}@example.com`;
    const password = `Load-${stamp}-pw`;
    const testId = `loadtest-test-${stamp}`;
    const assignmentId = `loadtest-asgn-${stamp}`;
    const studentId = `loadtest-student-${stamp}`;

    const adminHeaders = {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
    };

    const createUser = http.post(
        `${SUPABASE_URL}/auth/v1/admin/users`,
        JSON.stringify({ email, password, email_confirm: true }),
        { headers: adminHeaders }
    );
    if (createUser.status !== 200 && createUser.status !== 201) {
        fail(`Seed: admin create user failed (${createUser.status}): ${createUser.body}`);
    }
    const ownerId = createUser.json('id');
    if (!ownerId) fail(`Seed: no user id in admin response: ${createUser.body}`);

    const testData = {
        name: 'Load test',
        questions: [
            {
                id: 'q1',
                type: 'multipleChoice',
                prompt: 'Pick one',
                points: 1,
                options: [
                    { id: 'a', text: 'A', isCorrect: true },
                    { id: 'b', text: 'B', isCorrect: false },
                ],
            },
            { id: 'q2', type: 'shortAnswer', prompt: 'Explain', points: 2, expectedAnswers: ['x'] },
        ],
    };

    const restHeaders = { ...adminHeaders, Prefer: 'return=minimal' };

    const insertTest = http.post(
        `${SUPABASE_URL}/rest/v1/tests`,
        JSON.stringify({ id: testId, owner_id: ownerId, data: testData }),
        { headers: restHeaders }
    );
    if (insertTest.status !== 201 && insertTest.status !== 200) {
        fail(`Seed: insert test failed (${insertTest.status}): ${insertTest.body}`);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const insertAssignment = http.post(
        `${SUPABASE_URL}/rest/v1/test_assignments`,
        JSON.stringify({
            id: assignmentId,
            owner_id: ownerId,
            test_id: testId,
            student_id: studentId,
            test_name: 'Load test',
            require_seb: false,
            duration_minutes: 30,
            expires_at: expiresAt,
        }),
        { headers: restHeaders }
    );
    if (insertAssignment.status !== 201 && insertAssignment.status !== 200) {
        fail(`Seed: insert assignment failed (${insertAssignment.status}): ${insertAssignment.body}`);
    }

    const token = http.post(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json', apikey: ANON_KEY } }
    );
    if (token.status !== 200) fail(`Seed: password grant failed (${token.status}): ${token.body}`);
    const accessToken = token.json('access_token');
    if (!accessToken) fail(`Seed: no access_token in grant response: ${token.body}`);

    return { assignmentId, ownerId, accessToken };
}

export default function (data) {
    const authHeaders = {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${data.accessToken}`,
    };

    const edge = http.post(
        `${SUPABASE_URL}/functions/v1/get-test-assignment`,
        JSON.stringify({ assignmentId: data.assignmentId }),
        { headers: authHeaders, tags: { name: 'get-test-assignment' } }
    );
    edgeLatency.add(edge.timings.duration);
    check(edge, {
        'edge 200': (r) => r.status === 200,
        'edge returns testId': (r) => {
            try {
                return typeof r.json('testId') === 'string';
            } catch {
                return false;
            }
        },
        'edge strips answers': (r) => {
            // Student-safe transform must remove expectedAnswers from the payload.
            return !/expectedAnswers/.test(r.body || '');
        },
    });

    const rest = http.get(
        `${SUPABASE_URL}/rest/v1/tests?owner_id=eq.${data.ownerId}&select=id`,
        { headers: authHeaders, tags: { name: 'tests-read' } }
    );
    restLatency.add(rest.timings.duration);
    check(rest, {
        'rest 200': (r) => r.status === 200,
        'rest returns the seeded test': (r) => {
            try {
                return Array.isArray(r.json()) && r.json().length >= 1;
            } catch {
                return false;
            }
        },
    });

    sleep(0.3);
}
