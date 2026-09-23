// Edge Function: submit-test
// Validates and persists a student test submission server-side, so a client-side
// patch cannot bypass the expiry check or the duplicate-submission guard (the
// unique index on student_tests(assignment_id, attempt_number) is the final backstop —
// see migration 056 for why attempt_number exists: practice-mode assignments allow
// more than one submission per assignment_id, assessment-mode ones don't).
//
// No auto-scoring persisted here: the teacher-side view still computes rawTotalPoints on
// read (studentTest.rawTotalPoints ?? calcStudentTestRawPoints(...)) — the same fallback a
// legacy submission-code import relies on. Auto-scoring IS replayed below, but only to verify
// a placement test's sectionPath/levelPath against the submitted answers (see "Placement path
// integrity"); it is never written back onto the row.
//
// A generator-engine placement test (roadmap 27.1) skips this replay entirely — its questions
// live only in question_bank_items, never in tests.data, so there's nothing to replay against.
// Its levelPath/askedQuestionSnapshots are pulled directly from the already-validated
// placement_sessions record written incrementally by next-placement-question, which requires
// the run to have reached status: 'converged' before a submission is accepted.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { autoScoreResponse, isAutoScorable, type ScorableQuestion } from '../_shared/testScoring.ts';
import { sanitizeAnswers, isAssignmentExpired, attemptPolicyFor } from './validation.ts';

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
// maxPointsForPath/staircaseMaxPoints on the client) the score shown on the results
// page, so a forged path must be rejected. This replays real auto-scoring (shared with the
// client via ../_shared/testScoring.ts) against the submitted answers, plus the routing and
// staircase rules (mirroring src/utils/placementRouting.ts and
// src/utils/placementStaircase.ts), and requires an
// exact match with the client-claimed path — a structurally valid but score-inconsistent
// trace (e.g. claiming the pass edge on a failing score, or a higher CEFR level than the
// replay reaches) is rejected rather than merely a graph-impossible one.
const MAX_STAIRCASE_STEPS = 12;
const STEP_UP_AFTER_CORRECT = 2;
const CONVERGE_AFTER_REVERSALS = 2;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface MinimalQuestion extends ScorableQuestion {
    id: string;
    sectionId?: string;
    eloRating?: number;
}
interface MinimalSection {
    id: string;
    cefrLevel?: string;
    routing?: { thresholdPct: number; passSectionId: string; failSectionId: string };
}
interface MinimalTest {
    sections?: MinimalSection[];
    questions?: MinimalQuestion[];
    placementEngine?: string;
}
interface MinimalAnswer {
    questionId: string;
    response: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// ── Multistage (MST) routing replay (mirrors src/utils/placementRouting.ts) ─

function entrySectionId(test: MinimalTest): string | null {
    return test.sections?.[0]?.id ?? null;
}

function sectionQuestions(test: MinimalTest, sectionId: string): MinimalQuestion[] {
    const isEntry = entrySectionId(test) === sectionId;
    return (test.questions ?? []).filter((q) => q.sectionId === sectionId || (isEntry && !q.sectionId));
}

function scoreSectionPct(
    test: MinimalTest,
    sectionId: string,
    answersByQuestionId: Map<string, MinimalAnswer>
): number {
    const scorable = sectionQuestions(test, sectionId).filter(isAutoScorable);
    const max = scorable.reduce((sum, q) => sum + q.points, 0);
    if (max <= 0) return 0;
    const raw = scorable.reduce((sum, q) => {
        const answer = answersByQuestionId.get(q.id);
        return sum + (answer ? autoScoreResponse(q, answer.response) : 0);
    }, 0);
    return clamp((raw / max) * 100, 0, 100);
}

function resolveNextSection(
    test: MinimalTest,
    sectionId: string,
    answersByQuestionId: Map<string, MinimalAnswer>,
    visited: string[]
): string | null {
    const section = (test.sections ?? []).find((s) => s.id === sectionId);
    if (!section?.routing) return null;
    const pct = scoreSectionPct(test, sectionId, answersByQuestionId);
    const nextId = pct >= section.routing.thresholdPct ? section.routing.passSectionId : section.routing.failSectionId;
    const nextExists = (test.sections ?? []).some((s) => s.id === nextId);
    if (!nextExists || visited.includes(nextId)) return null;
    return nextId;
}

/** Replays the routing walk from the entry section using the submitted answers; returns null if the test has no entry section. */
function recomputeSectionPath(test: MinimalTest, answers: MinimalAnswer[]): string[] | null {
    const entry = entrySectionId(test);
    if (!entry) return null;
    const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a]));
    const path = [entry];
    // Bounded by section count — resolveNextSection's visited-list guard prevents cycles anyway.
    const maxHops = (test.sections ?? []).length + 1;
    while (path.length <= maxHops) {
        const next = resolveNextSection(test, path[path.length - 1], answersByQuestionId, path);
        if (!next) break;
        path.push(next);
    }
    return path;
}

function sectionPathsMatch(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

// ── Staircase replay (mirrors src/utils/placementStaircase.ts) ─────────────

function moveLevel(level: string, direction: 'up' | 'down'): string {
    const idx = CEFR_LEVELS.indexOf(level);
    const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
    return CEFR_LEVELS[Math.min(CEFR_LEVELS.length - 1, Math.max(0, nextIdx))];
}

/**
 * Level assigned to each step, replayed purely from a corrected correct/incorrect sequence
 * — mirrors computeStaircaseState. resolveNextStaircaseQuestion checks convergence on the
 * *prefix before* every step it asks, including the last one recorded, so a legitimate
 * levelPath can never contain a step whose own preceding prefix was already converged.
 */
function replayStaircaseLevels(correctFlags: boolean[]): { levelBeforeStep: string[]; askedAfterConverged: boolean } {
    let level = 'A2';
    let consecutiveCorrect = 0;
    let reversalCount = 0;
    let lastDirection: 'up' | 'down' | null = null;
    let askedAfterConverged = false;
    const levelBeforeStep: string[] = [];

    for (let i = 0; i < correctFlags.length; i++) {
        levelBeforeStep.push(level);
        const converged = reversalCount >= CONVERGE_AFTER_REVERSALS || i >= MAX_STAIRCASE_STEPS;
        if (converged) askedAfterConverged = true;

        const correct = correctFlags[i];
        const direction: 'up' | 'down' = correct ? 'up' : 'down';
        if (correct) {
            consecutiveCorrect++;
            if (consecutiveCorrect < STEP_UP_AFTER_CORRECT) continue;
        }
        const moved = moveLevel(level, direction);
        if (moved !== level) {
            if (lastDirection !== null && lastDirection !== direction) reversalCount++;
            lastDirection = direction;
        }
        level = moved;
        consecutiveCorrect = 0;
    }
    return { levelBeforeStep, askedAfterConverged };
}

// ── Elo self-calibration (roadmap Phase 25.4, mirrors src/utils/placementStaircase.ts) ─────
// Item-only ratings, no persisted per-student rating — each level's fixed anchor stands in for
// the student. Runs only after the level path itself has been validated below, using the same
// levelBeforeStep/correctFlags the replay already computed, so a forged path can't skew ratings.
// The actual expected-score/rating-delta math (mirroring eloExpectedScore/updateItemElo in
// src/utils/placementStaircase.ts) now lives in the update_test_question_elo RPC (migration
// 064), which recomputes it from the row's current eloRating under lock — only the replay
// inputs (opponent rating, correct flag) are computed here.

const DEFAULT_ELO_RATING = 1200;
const LEVEL_TO_ELO: Record<string, number> = {
    A1: 600,
    A2: 900,
    B1: 1200,
    B2: 1500,
    C1: 1800,
    C2: 2100,
};

/** Structural checks only (ids exist, no repeats, question/section/level agree) — score/level correctness is verified separately once the real answers are in scope. */
function isStructurallyValidLevelPath(
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
        answers?: MinimalAnswer[];
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
    // `req.json()` of the literal JSON `null` resolves to `null` (it only throws on
    // malformed JSON), so destructuring it below would crash with a 500 instead of
    // the 400 the validation block is meant to produce.
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
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

    // Client input can carry arbitrary extra fields — most importantly pointsEarned, which
    // scoreAnswer() on the teacher-facing side (src/utils/testCalc.ts) treats as an
    // already-graded manual score and uses verbatim instead of auto-scoring. Reconstructing
    // the answer objects here (rather than trusting the spread) means a forged pointsEarned
    // can never reach storage in the first place — see sanitizeAnswers in validation.ts.
    const sanitizedAnswers: MinimalAnswer[] = sanitizeAnswers(answers);

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

    if (isAssignmentExpired(assignment.expires_at)) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    // Set below once a staircase levelPath has been validated, so the touched questions' Elo
    // replay inputs can be persisted atomically (via the update_test_question_elo RPC — see
    // migration 064) after the (unrelated) submission insert below. Only {questionId,
    // opponentRating, correct} triples are collected here — never a precomputed rating or a
    // copy of the whole test.questions array — so the RPC itself both does the only
    // read-modify-write of tests.data AND computes the new rating from whatever eloRating the
    // row holds once it acquires the lock, closing the race a client-computed absolute value
    // (correct against a pre-lock snapshot only) would reintroduce for concurrent submissions
    // touching the same question.
    let eloRatingUpdates: { questionId: string; opponentRating: number; correct: boolean }[] | null = null;
    // Set below for a generator-engine (roadmap 27.1) run instead — its trace lives in
    // placement_sessions, not in a client-claimed levelPath (which the client never sends,
    // since question selection/scoring already happened server-side, live, per question).
    let generatorLevelPath:
        { sectionId: string; level: string; questionId: string; correct: boolean; overridden?: string }[] | null = null;
    let generatorAskedQuestions: MinimalQuestion[] | null = null;
    // The level the run actually started from (configured range midpoint, or a clamped starter
    // item's level) — persisted onto the submission so the client's placement estimate replay
    // (src/utils/placementResult.ts) can start from the same point the server run did, rather
    // than approximating with cefrMidpoint() alone.
    let generatorStartLevel: string | null = null;
    // sanitizedAnswers filtered to only questions the trace actually asked, and validated for
    // score-consistency against the trace's own correct flags — see the generator branch below.
    let generatorAnswers: MinimalAnswer[] | null = null;

    if (assignment.mode === 'placement') {
        const { data: testRow, error: testErr } = await admin
            .from('tests')
            .select('data')
            .eq('id', assignment.test_id)
            .single();
        if (testErr || !testRow) return json({ error: 'Test not found' }, 404);
        const test = testRow.data as MinimalTest;

        if (test.placementEngine === 'generator') {
            // A generator-engine run has no test.questions to replay answers against — every
            // question was picked and scored live by next-placement-question, which already
            // wrote the authoritative trace into placement_sessions. Trust that record rather
            // than re-deriving/replaying anything here.
            const { data: session, error: sessionErr } = await admin
                .from('placement_sessions')
                .select('status, level_path, asked_questions, start_level, student_user_id')
                .eq('assignment_id', assignmentId)
                .single();
            if (sessionErr || !session) return json({ error: 'No placement session found for this assignment' }, 400);
            if (session.student_user_id !== user.id) {
                return json({ error: 'This placement session belongs to a different student' }, 403);
            }
            if (session.status !== 'converged') {
                return json({ error: 'Placement run has not finished yet' }, 400);
            }
            generatorLevelPath = session.level_path;
            generatorAskedQuestions = session.asked_questions;
            generatorStartLevel = session.start_level;

            // The client controls the submitted response text, but for a generator run
            // correctness was already locked in live, per question, by next-placement-question —
            // level_path.correct is authoritative and must never be overridable in the student's
            // favor at final submit. Drop any answer for a question id that was never actually
            // asked, and reject the whole submission if a kept answer's response text doesn't
            // score consistently with the trace's own correct flag — the same path-consistency
            // principle the staircase engine already applies below, per-question instead of
            // per-path (a generator run has no single path to replay, only independent picks).
            try {
                const askedById = new Map(generatorAskedQuestions.map((q) => [q.id, q]));
                const stepById = new Map(generatorLevelPath.map((step) => [step.questionId, step]));
                const filtered = sanitizedAnswers.filter((a) => stepById.has(a.questionId));
                for (const a of filtered) {
                    const q = askedById.get(a.questionId);
                    const step = stepById.get(a.questionId)!;
                    if (!q || autoScoreResponse(q, a.response) >= q.points !== step.correct) {
                        return json({ error: 'Invalid submission' }, 400);
                    }
                }
                generatorAnswers = filtered;
            } catch (e) {
                console.error('submit-test generator answer validation failed:', e);
                return json({ error: 'Invalid submission' }, 400);
            }
        } else if (sectionPath || levelPath) {
            // The shared scorers treat a wrongly-shaped response as unanswered rather than
            // throwing, so a malformed answer can only lower the replayed score. Any unexpected
            // throw is still treated as an invalid submission rather than an unhandled 500.
            try {
                if (sectionPath) {
                    const recomputed = recomputeSectionPath(test, sanitizedAnswers);
                    if (!recomputed || !sectionPathsMatch(recomputed, sectionPath)) {
                        return json({ error: 'Invalid section path' }, 400);
                    }
                }

                if (levelPath) {
                    if (!isStructurallyValidLevelPath(test, levelPath)) {
                        return json({ error: 'Invalid level path' }, 400);
                    }
                    const questionsById = new Map((test.questions ?? []).map((q) => [q.id, q]));
                    const answersByQuestionId = new Map(sanitizedAnswers.map((a) => [a.questionId, a]));
                    const correctFlags = levelPath.map((step) => {
                        const question = questionsById.get(step.questionId)!;
                        const answer = answersByQuestionId.get(step.questionId);
                        return (answer ? autoScoreResponse(question, answer.response) : 0) >= question.points;
                    });
                    if (!correctFlags.every((c, i) => c === levelPath[i].correct)) {
                        return json({ error: 'Invalid level path' }, 400);
                    }
                    const { levelBeforeStep, askedAfterConverged } = replayStaircaseLevels(correctFlags);
                    if (askedAfterConverged || !levelBeforeStep.every((lvl, i) => lvl === levelPath[i].level)) {
                        return json({ error: 'Invalid level path' }, 400);
                    }

                    // Replay inputs only (opponent rating, correct flag) — the RPC recomputes the
                    // new rating from whatever eloRating the row actually holds once it acquires
                    // the lock, not a value precomputed here against a pre-lock snapshot. Sending
                    // an absolute replacement would still lose an update when two submissions
                    // touch the same question, since the second caller's precomputed value is
                    // only correct against the state it read before waiting on the lock.
                    eloRatingUpdates = levelPath.reduce<
                        { questionId: string; opponentRating: number; correct: boolean }[]
                    >((acc, step, i) => {
                        if (!questionsById.has(step.questionId)) return acc;
                        acc.push({
                            questionId: step.questionId,
                            opponentRating: LEVEL_TO_ELO[levelBeforeStep[i]] ?? DEFAULT_ELO_RATING,
                            correct: correctFlags[i],
                        });
                        return acc;
                    }, []);
                }
            } catch (e) {
                console.error('submit-test placement path replay failed:', e);
                return json({ error: 'Invalid submission' }, 400);
            }
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
    const { isPractice, maxAttempts } = attemptPolicyFor(assignment.mode);

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
                answers: generatorAnswers ?? sanitizedAnswers,
                status: 'submitted',
                startedAt,
                submittedAt,
                events: events ?? [],
                attemptNumber,
                ...(sectionPath ? { sectionPath } : {}),
                ...(generatorLevelPath
                    ? {
                          levelPath: generatorLevelPath,
                          askedQuestionSnapshots: generatorAskedQuestions ?? [],
                          ...(generatorStartLevel ? { placementStartLevel: generatorStartLevel } : {}),
                      }
                    : levelPath
                      ? { levelPath }
                      : {}),
            },
        });

        if (!insertErr) {
            // Best-effort: item ratings are an internal refinement, not authoritative data — a
            // failed update here should never fail an otherwise-successful submission.
            if (eloRatingUpdates && eloRatingUpdates.length > 0) {
                const { error: eloErr } = await admin.rpc('update_test_question_elo', {
                    p_test_id: assignment.test_id,
                    p_updates: eloRatingUpdates,
                });
                if (eloErr) console.error('submit-test elo rating update failed:', eloErr);
            }
            // Generator-engine Elo updates already happened incrementally, per item, inside
            // next-placement-question — nothing to write back to `tests` here. Just mark the
            // session closed so a stray resume/answer call after submission is rejected.
            if (generatorLevelPath) {
                const { error: sessionErr } = await admin
                    .from('placement_sessions')
                    .update({ status: 'submitted' })
                    .eq('assignment_id', assignmentId);
                if (sessionErr) console.error('submit-test placement_sessions status update failed:', sessionErr);
            }
            return json({ success: true });
        }

        if (insertErr.code === '23505') {
            if (isPractice && retry < maxAttempts - 1) continue;
            return json({ error: 'You have already submitted this assignment' }, 409);
        }
        console.error('submit-test insert failed:', insertErr);
        return json({ error: 'Failed to save submission. Please try again.' }, 500);
    }

    return json({ error: 'You have already submitted this assignment' }, 409);
});
