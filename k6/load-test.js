// Load test for RubricMaker's Supabase backend.
//
// Runs configurable virtual-user load against the hot student-facing paths:
//   1. get-test-assignment edge function — auth.getUser + 2 Postgres reads +
//      the student-safe transform. The endpoint a whole class hits when opening
//      a test. Idempotent, so safe to hammer.
//   2. PostgREST RLS read of `tests` — the sync/hydrate path every connected
//      session drives on boot and after edits.
//
// Reads are spread across a seeded POOL of assignments/tests (not one hot row),
// so Postgres and the edge runtime see a realistic access distribution rather
// than an unrealistically cache-friendly single-row workload.
//
// ── Scope ────────────────────────────────────────────────────────────────────
// Against a LOCAL stack the k6 generator and the whole Supabase stack (Postgres,
// PostgREST, GoTrue, Kong, a single edge-runtime container) share one machine's
// CPU, so absolute latency reflects that co-location, not production capacity —
// see k6/README.md for how to read the numbers and how to push past the local
// ceiling. Point SUPABASE_URL at a staging project to measure real capacity.
//
// ── Configuration (all via env) ──────────────────────────────────────────────
//   SUPABASE_URL           target (default http://127.0.0.1:54321)
//   SUPABASE_ANON_KEY      anon / publishable key           (required)
//   SUPABASE_SERVICE_KEY   service_role / secret key        (required, seeding)
//   PROFILE                smoke | load | stress | spike | soak   (default load)
//   TARGET                 both | edge | rest    (default both)
//   VUS                    override the profile's peak virtual users
//   DURATION               override the profile's hold time (e.g. 90s, 5m)
//   SEED_TESTS             tests to seed          (default 5)
//   SEED_ASSIGNMENTS       assignments to seed    (default 40 — ~a class+)
//
// TARGET note: the get-test-assignment edge function only exists where an edge
// runtime is deployed (Supabase Cloud, or the official self-hosted stack with a
// functions container behind Kong). This repo's own docker-compose.yml has NO
// edge runtime — point TARGET=rest at that to load-test only the PostgREST/DB
// tier. See k6/README.md and docs/LOAD_TESTING_STAGING.md.

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend } from 'k6/metrics';

const SUPABASE_URL = (__ENV.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = __ENV.SUPABASE_SERVICE_KEY || '';

const PROFILE = (__ENV.PROFILE || 'load').toLowerCase();
const TARGET = (__ENV.TARGET || 'both').toLowerCase();
const DO_EDGE = TARGET === 'both' || TARGET === 'edge';
const DO_REST = TARGET === 'both' || TARGET === 'rest';
const SEED_TESTS = Math.max(1, Number(__ENV.SEED_TESTS || 5));
const SEED_ASSIGNMENTS = Math.max(1, Number(__ENV.SEED_ASSIGNMENTS || 40));

const edgeLatency = new Trend('edge_get_test_assignment', true);
const restLatency = new Trend('rest_tests_read', true);

// ── Load profiles ────────────────────────────────────────────────────────────
// Each returns a { executor, ... } scenario config. VUS / DURATION env vars
// override the peak and hold where meaningful.
const PROFILES = {
    // Quick sanity check — is the path alive under a little concurrency?
    smoke() {
        const peak = Number(__ENV.VUS || 5);
        const hold = __ENV.DURATION || '15s';
        return ramp(peak, hold, '5s', '5s');
    },
    // The default regression / class-and-school workload.
    load() {
        const peak = Number(__ENV.VUS || 50);
        const hold = __ENV.DURATION || '60s';
        return ramp(peak, hold, '15s', '10s');
    },
    // Find the breaking point: climb in steps until latency/errors blow up.
    stress() {
        const peak = Number(__ENV.VUS || 200);
        const step = Math.max(1, Math.round(peak / 4));
        return {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '20s', target: step },
                { duration: '20s', target: step * 2 },
                { duration: '20s', target: step * 3 },
                { duration: '20s', target: peak },
                { duration: __ENV.DURATION || '40s', target: peak },
                { duration: '10s', target: 0 },
            ],
            gracefulRampDown: '10s',
        };
    },
    // Whole class hits "open test" in the same few seconds.
    spike() {
        const peak = Number(__ENV.VUS || 150);
        return {
            executor: 'ramping-vus',
            startVUs: 0,
            stages: [
                { duration: '10s', target: 10 },
                { duration: '3s', target: peak },
                { duration: __ENV.DURATION || '30s', target: peak },
                { duration: '5s', target: 10 },
                { duration: '5s', target: 0 },
            ],
            gracefulRampDown: '10s',
        };
    },
    // Sustained moderate load — surfaces leaks / slow degradation.
    soak() {
        const peak = Number(__ENV.VUS || 30);
        return {
            executor: 'constant-vus',
            vus: peak,
            duration: __ENV.DURATION || '10m',
        };
    },
};

function ramp(peak, hold, up, down) {
    return {
        executor: 'ramping-vus',
        startVUs: 0,
        stages: [
            { duration: up, target: peak },
            { duration: hold, target: peak },
            { duration: down, target: 0 },
        ],
        gracefulRampDown: '10s',
    };
}

const scenario = (PROFILES[PROFILE] || PROFILES.load)();

// Latency thresholds are gross-regression guards for the steady-state profiles.
// stress/spike deliberately overload the target, so pass/fail thresholds there
// would just report the expected breakage — omit them and read the numbers.
const steady = PROFILE === 'smoke' || PROFILE === 'load' || PROFILE === 'soak';

function buildThresholds() {
    if (!steady) return {};
    const t = {
        http_req_failed: ['rate<0.01'],
        checks: ['rate>0.99'],
    };
    if (DO_EDGE) t.edge_get_test_assignment = ['p(95)<1500'];
    if (DO_REST) t.rest_tests_read = ['p(95)<1000'];
    return t;
}

export const options = {
    scenarios: { student_load: scenario },
    thresholds: buildThresholds(),
};

function required(name, value) {
    if (!value) fail(`Missing required env var ${name} — export it before running k6`);
    return value;
}

// Seeds one teacher (profile auto-created by the handle_new_user trigger), a
// pool of tests, and a pool of assignments spread across them, then
// password-grants a JWT the load phase reuses. Runs once, before any VU starts.
export function setup() {
    required('SUPABASE_ANON_KEY', ANON_KEY);
    required('SUPABASE_SERVICE_KEY', SERVICE_KEY);

    const stamp = Date.now();
    const email = `loadtest+${stamp}@example.com`;
    const password = `Load-${stamp}-pw`;

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

    const testData = (i) => ({
        name: `Load test ${i}`,
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
    });

    const restHeaders = { ...adminHeaders, Prefer: 'return=minimal' };

    const testIds = [];
    const testRows = [];
    for (let i = 0; i < SEED_TESTS; i++) {
        const id = `loadtest-test-${stamp}-${i}`;
        testIds.push(id);
        testRows.push({ id, owner_id: ownerId, data: testData(i) });
    }
    const insertTests = http.post(`${SUPABASE_URL}/rest/v1/tests`, JSON.stringify(testRows), {
        headers: restHeaders,
    });
    if (insertTests.status !== 201 && insertTests.status !== 200) {
        fail(`Seed: insert tests failed (${insertTests.status}): ${insertTests.body}`);
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const assignmentIds = [];
    const assignmentRows = [];
    for (let i = 0; i < SEED_ASSIGNMENTS; i++) {
        const id = `loadtest-asgn-${stamp}-${i}`;
        assignmentIds.push(id);
        assignmentRows.push({
            id,
            owner_id: ownerId,
            test_id: testIds[i % SEED_TESTS],
            student_id: `loadtest-student-${stamp}-${i}`,
            test_name: `Load test ${i % SEED_TESTS}`,
            require_seb: false,
            duration_minutes: 30,
            expires_at: expiresAt,
        });
    }
    const insertAssignments = http.post(
        `${SUPABASE_URL}/rest/v1/test_assignments`,
        JSON.stringify(assignmentRows),
        { headers: restHeaders }
    );
    if (insertAssignments.status !== 201 && insertAssignments.status !== 200) {
        fail(`Seed: insert assignments failed (${insertAssignments.status}): ${insertAssignments.body}`);
    }

    const token = http.post(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        JSON.stringify({ email, password }),
        { headers: { 'Content-Type': 'application/json', apikey: ANON_KEY } }
    );
    if (token.status !== 200) fail(`Seed: password grant failed (${token.status}): ${token.body}`);
    const accessToken = token.json('access_token');
    if (!accessToken) fail(`Seed: no access_token in grant response: ${token.body}`);

    return { assignmentIds, ownerId, accessToken };
}

export default function (data) {
    const authHeaders = {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${data.accessToken}`,
    };

    if (DO_EDGE) {
        const assignmentId = data.assignmentIds[Math.floor(Math.random() * data.assignmentIds.length)];
        const edge = http.post(
            `${SUPABASE_URL}/functions/v1/get-test-assignment`,
            JSON.stringify({ assignmentId }),
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
            'edge strips answers': (r) => !/expectedAnswers/.test(r.body || ''),
        });
    }

    if (DO_REST) {
        const rest = http.get(
            `${SUPABASE_URL}/rest/v1/tests?owner_id=eq.${data.ownerId}&select=id`,
            { headers: authHeaders, tags: { name: 'tests-read' } }
        );
        restLatency.add(rest.timings.duration);
        check(rest, {
            'rest 200': (r) => r.status === 200,
            'rest returns seeded tests': (r) => {
                try {
                    return Array.isArray(r.json()) && r.json().length >= 1;
                } catch {
                    return false;
                }
            },
        });
    }

    sleep(0.3);
}
