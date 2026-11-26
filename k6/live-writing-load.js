// Load test for a live-writing room (Phase 43.6, #1153).
//
// Simulates one whole class in a live session at the cadence the student screen
// actually uses: join with the code (anon RPC, no account), then autosave the
// draft every ~1.2 s while writing. That save is the only per-student write in
// the room; the projector and roster reads are polling reads on the same rows.
//
// What this measures: the SECURITY DEFINER join + save RPC path under 30–100
// concurrent students, which is the part this repo owns. Supabase Realtime
// fan-out is a managed service and is not exercised from k6; the client only
// broadcasts phase hints and roster/timer changes (LiveWritingAdapter
// .broadcastSessionEvent), never draft text, and per-student saves are debounced
// to one write per 1.2 s in StudentLiveWritePage. Verify the broadcast side by
// opening a projector and a student screen during the run (see k6/README.md).
//
// ── Configuration (all via env) ──────────────────────────────────────────────
//   SUPABASE_URL           target (default http://127.0.0.1:54321)
//   SUPABASE_ANON_KEY      anon / publishable key           (required)
//   SUPABASE_SERVICE_KEY   service_role / secret key        (required, seeding)
//   PROFILE                live | smoke                      (default live)
//   VUS                    concurrent students (default STUDENTS)
//   STUDENTS               roster rows to seed             (default 100)
//   DURATION               hold time                        (default 60s)
//   SAVES                  autosaves per join/iteration     (default 30)
//   SAVE_INTERVAL_MS       pause between autosaves          (default 1200)

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Trend } from 'k6/metrics';

const SUPABASE_URL = (__ENV.SUPABASE_URL || 'http://127.0.0.1:54321').replace(/\/$/, '');
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const SERVICE_KEY = __ENV.SUPABASE_SERVICE_KEY || '';

const PROFILE = (__ENV.PROFILE || 'live').toLowerCase();
const STUDENTS = Math.max(3, Number(__ENV.STUDENTS || 100));
const SAVES = Math.max(1, Number(__ENV.SAVES || 30));
const SAVE_INTERVAL_MS = Math.max(200, Number(__ENV.SAVE_INTERVAL_MS || 1200));
const JOIN_CODE = (__ENV.JOIN_CODE || 'RM-LOAD01').toUpperCase();

const joinLatency = new Trend('live_join_rpc', true);
const saveLatency = new Trend('live_save_rpc', true);

const scenario = {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
        { duration: '20s', target: Number(__ENV.VUS || STUDENTS) },
        { duration: __ENV.DURATION || '60s', target: Number(__ENV.VUS || STUDENTS) },
        { duration: '5s', target: 0 },
    ],
    gracefulRampDown: '10s',
};

export const options = {
    scenarios: { live_writing_room: scenario },
    thresholds: {
        http_req_failed: ['rate<0.01'],
        live_join_rpc: ['p(95)<500'],
        live_save_rpc: ['p(95)<500'],
    },
};

function required(name, value) {
    if (!value) fail(`Missing required env var ${name} — export it before running k6`);
    return value;
}

const serviceHeaders = {
    'Content-Type': 'application/json',
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
};

const anonHeaders = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
};

function autosaveHtml(round) {
    // ~200 words, comfortably inside the 20 000-character response cap.
    const sentence =
        'I changed my mind after listening carefully to my friend because the argument made me see the question from another side. ';
    return `<p>Round ${round}. ${sentence.repeat(16)}</p>`;
}

// Seeds a teacher, one class, a full roster and a session already in writing,
// then hands every VU the shared join code. Runs once, before any VU starts.
export function setup() {
    required('SUPABASE_ANON_KEY', ANON_KEY);
    required('SUPABASE_SERVICE_KEY', SERVICE_KEY);

    const stamp = Date.now();
    const email = `live-loadtest+${stamp}@example.com`;
    const createUser = http.post(
        `${SUPABASE_URL}/auth/v1/admin/users`,
        JSON.stringify({ email, password: `Live-${stamp}-pw`, email_confirm: true }),
        { headers: serviceHeaders }
    );
    if (createUser.status !== 200 && createUser.status !== 201) {
        fail(`Seed: admin create user failed (${createUser.status}): ${createUser.body}`);
    }
    const ownerId = createUser.json('id');
    if (!ownerId) fail(`Seed: no user id in admin response: ${createUser.body}`);

    const classId = `live-load-class-${stamp}`;
    const classInsert = http.post(
        `${SUPABASE_URL}/rest/v1/classes`,
        JSON.stringify([{ id: classId, owner_id: ownerId, data: { id: classId, name: 'Live load test' } }]),
        { headers: { ...serviceHeaders, Prefer: 'return=minimal' } }
    );
    if (classInsert.status !== 201 && classInsert.status !== 200) {
        fail(`Seed: insert class failed (${classInsert.status}): ${classInsert.body}`);
    }

    const studentIds = [];
    const studentRows = [];
    for (let i = 0; i < STUDENTS; i++) {
        const id = `live-load-student-${stamp}-${i}`;
        studentIds.push(id);
        studentRows.push({ id, owner_id: ownerId, class_id: classId, data: { id, name: `Student ${i + 1}`, classId } });
    }
    const studentInsert = http.post(`${SUPABASE_URL}/rest/v1/students`, JSON.stringify(studentRows), {
        headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    });
    if (studentInsert.status !== 201 && studentInsert.status !== 200) {
        fail(`Seed: insert students failed (${studentInsert.status}): ${studentInsert.body}`);
    }

    const sessionInsert = http.post(
        `${SUPABASE_URL}/rest/v1/live_writing_sessions`,
        JSON.stringify([
            {
                owner_id: ownerId,
                class_id: classId,
                title: 'Live load test',
                prompt: 'Write about a time you changed your mind.',
                status: 'writing',
                join_code: JOIN_CODE,
                round_count: 1,
                minutes_per_round: 30,
                min_words: 0,
                scaffold_enabled: false,
                live_leaderboard: true,
            },
        ]),
        { headers: { ...serviceHeaders, Prefer: 'return=representation' } }
    );
    if (sessionInsert.status !== 201) {
        fail(`Seed: insert session failed (${sessionInsert.status}): ${sessionInsert.body}`);
    }
    const sessionId = sessionInsert.json()[0]?.id;
    if (!sessionId) fail(`Seed: no session id in response: ${sessionInsert.body}`);

    const expected = Math.min(STUDENTS, Number(__ENV.VUS || STUDENTS));
    console.log(`Seeded session ${sessionId} (${JOIN_CODE}) with ${STUDENTS} roster students`);
    return { sessionId, joinCode: JOIN_CODE, studentIds, expected };
}

export default function (data) {
    const studentId = data.studentIds[(__VU - 1) % data.studentIds.length];

    const join = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/join_live_writing_session`,
        JSON.stringify({ p_code: data.joinCode, p_student_id: studentId }),
        { headers: anonHeaders }
    );
    joinLatency.add(join.timings.duration);
    const payload = join.status === 200 ? join.json() : null;
    // A RETURNS TABLE RPC comes back as an array of rows.
    const row = Array.isArray(payload) ? payload[0] : payload;
    const joined = check(join, {
        'join returns a participant': () => !!row?.participant_id && !!row?.join_token,
    });
    if (!joined) return;

    const participantId = row.participant_id;
    const token = row.join_token;

    for (let i = 0; i < SAVES; i++) {
        const save = http.post(
            `${SUPABASE_URL}/rest/v1/rpc/save_live_writing_text`,
            JSON.stringify({
                p_participant_id: participantId,
                p_token: token,
                p_round_index: 1,
                p_content_html: autosaveHtml(i + 1),
            }),
            { headers: anonHeaders }
        );
        saveLatency.add(save.timings.duration);
        const saved = save.status === 200 ? save.json() : null;
        const savedRow = Array.isArray(saved) ? saved[0] : saved;
        check(save, { 'autosave accepted': () => typeof savedRow?.word_count === 'number' });
        sleep(SAVE_INTERVAL_MS / 1000);
    }
}

// Confirms every seeded student actually joined — the room, not just latency, is the target.
export function teardown(data) {
    const res = http.get(
        `${SUPABASE_URL}/rest/v1/live_writing_participants?session_id=eq.${data.sessionId}&select=id`,
        { headers: serviceHeaders }
    );
    const rows = res.json();
    if (!Array.isArray(rows)) fail(`Teardown: could not read participants: ${res.body}`);
    if (rows.length < data.expected) {
        fail(`Teardown: only ${rows.length} of ${data.expected} concurrent students joined the room`);
    }
    console.log(`Joined participants: ${rows.length}/${data.expected} concurrent students`);
}
