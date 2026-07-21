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
// maxPointsForPath/staircaseMaxPoints on the client) the score shown on the results
// page, so a forged path must be rejected. This replays real auto-scoring against the
// submitted answers (mirroring src/utils/testCalc.ts, src/utils/clozeParse.ts,
// src/utils/placementRouting.ts and src/utils/placementStaircase.ts) and requires an
// exact match with the client-claimed path — a structurally valid but score-inconsistent
// trace (e.g. claiming the pass edge on a failing score, or a higher CEFR level than the
// replay reaches) is rejected rather than merely a graph-impossible one.
const MAX_STAIRCASE_STEPS = 12;
const STEP_UP_AFTER_CORRECT = 2;
const CONVERGE_AFTER_REVERSALS = 2;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

interface MinimalOption {
    id: string;
    isCorrect: boolean;
}
interface MinimalMatchingPair {
    id: string;
}
interface MinimalOrderItem {
    id: string;
}
interface MinimalCategorizeItem {
    id: string;
    categoryId: string;
}
interface MinimalQuestion {
    id: string;
    type: string;
    points: number;
    sectionId?: string;
    prompt: string;
    options?: MinimalOption[];
    matchingPairs?: MinimalMatchingPair[];
    orderItems?: MinimalOrderItem[];
    categorizeItems?: MinimalCategorizeItem[];
    hotTextPassage?: string;
    hotTextCorrectIndices?: number[];
    expectedAnswer?: string;
    expectedAnswers?: string[];
    expectedNumericValue?: number;
    numericTolerance?: number;
    partialCredit?: boolean;
    correctBoolean?: boolean;
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
}
interface MinimalAnswer {
    questionId: string;
    response: string;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// ── Cloze / hot-text gap parsing (mirrors src/utils/clozeParse.ts) ──────────

function parseClozeGaps(prompt: string): { index: number; alternatives: string[] }[] {
    const gaps: { index: number; alternatives: string[] }[] = [];
    const pattern = /\{\{(.*?)\}\}/g;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = pattern.exec(prompt)) !== null) {
        const alternatives = match[1]
            .split('|')
            .map((alt) => alt.trim())
            .filter((alt) => alt.length > 0);
        gaps.push({ index, alternatives });
        index += 1;
    }
    return gaps;
}

function parseHotTextFragmentIndices(passage: string): number[] {
    const fragmentCount = passage.match(/\[\[(.*?)\]\]/g)?.length ?? 0;
    return Array.from({ length: fragmentCount }, (_, i) => i);
}

// ── Auto-scoring (mirrors src/utils/testCalc.ts) ────────────────────────────

function scoreShortAnswerExact(question: MinimalQuestion, response: string): number {
    const answers = question.expectedAnswers?.length
        ? question.expectedAnswers
        : question.expectedAnswer
          ? [question.expectedAnswer]
          : [];
    if (answers.length === 0) return 0;
    const trimmedResponse = response.trim().toLowerCase();
    return answers.some((a) => a.trim().toLowerCase() === trimmedResponse) ? question.points : 0;
}

function scoreNumeric(question: MinimalQuestion, response: string): number {
    if (question.expectedNumericValue === undefined) return 0;
    const trimmed = response.trim();
    if (trimmed === '') return 0;
    const value = Number(trimmed);
    if (Number.isNaN(value)) return 0;
    const tolerance = question.numericTolerance ?? 0;
    return Math.abs(value - question.expectedNumericValue) <= tolerance + 1e-9 ? question.points : 0;
}

function scoreMultipleResponse(question: MinimalQuestion, response: string): number {
    const options = question.options ?? [];
    let selected: string[];
    try {
        selected = response ? (JSON.parse(response) as string[]) : [];
    } catch {
        selected = [];
    }
    const selectedSet = new Set(selected);
    const correctSet = new Set(options.filter((o) => o.isCorrect).map((o) => o.id));

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
        return exact ? question.points : 0;
    }

    if (options.length === 0) return 0;
    const matches = options.filter((o) => selectedSet.has(o.id) === correctSet.has(o.id)).length;
    return question.points * (matches / options.length);
}

function scoreCloze(question: MinimalQuestion, response: string): number {
    const gaps = parseClozeGaps(question.prompt);
    if (gaps.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const isDropdown = question.type === 'cloze-dropdown';
    const correctCount = gaps.filter((gap) => {
        const studentAnswer = (answers[gap.index] ?? '').trim();
        if (!studentAnswer) return false;
        if (isDropdown) return studentAnswer === gap.alternatives[0];
        return gap.alternatives.some((alt) => alt.toLowerCase() === studentAnswer.toLowerCase());
    }).length;

    if (question.partialCredit === false) {
        return correctCount === gaps.length ? question.points : 0;
    }
    return question.points * (correctCount / gaps.length);
}

function scoreMatching(question: MinimalQuestion, response: string): number {
    const pairs = question.matchingPairs ?? [];
    if (pairs.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const correctCount = pairs.filter((pair) => answers[pair.id] === pair.id).length;

    if (question.partialCredit === false) {
        return correctCount === pairs.length ? question.points : 0;
    }
    return question.points * (correctCount / pairs.length);
}

function scoreOrdering(question: MinimalQuestion, response: string): number {
    const items = question.orderItems ?? [];
    if (items.length === 0) return 0;

    let order: string[] = [];
    try {
        order = response ? (JSON.parse(response) as string[]) : [];
    } catch {
        order = [];
    }

    const correctCount = items.filter((item, i) => order[i] === item.id).length;

    if (question.partialCredit === false) {
        return correctCount === items.length ? question.points : 0;
    }
    return question.points * (correctCount / items.length);
}

function scoreCategorize(question: MinimalQuestion, response: string): number {
    const items = question.categorizeItems ?? [];
    if (items.length === 0) return 0;

    let answers: Record<string, string> = {};
    try {
        answers = response ? (JSON.parse(response) as Record<string, string>) : {};
    } catch {
        answers = {};
    }

    const correctCount = items.filter((item) => answers[item.id] === item.categoryId).length;

    if (question.partialCredit === false) {
        return correctCount === items.length ? question.points : 0;
    }
    return question.points * (correctCount / items.length);
}

function scoreHotText(question: MinimalQuestion, response: string): number {
    const fragmentIndices = parseHotTextFragmentIndices(question.hotTextPassage ?? '');
    if (fragmentIndices.length === 0) return 0;

    let selected: number[];
    try {
        selected = response ? (JSON.parse(response) as number[]) : [];
    } catch {
        selected = [];
    }

    const selectedSet = new Set(selected);
    const correctSet = new Set(question.hotTextCorrectIndices ?? []);

    if (question.partialCredit === false) {
        const exact = selectedSet.size === correctSet.size && [...selectedSet].every((i) => correctSet.has(i));
        return exact ? question.points : 0;
    }

    const matches = fragmentIndices.filter((i) => selectedSet.has(i) === correctSet.has(i)).length;
    return question.points * (matches / fragmentIndices.length);
}

function isAutoScorable(question: MinimalQuestion): boolean {
    return question.type !== 'open';
}

function autoScoreResponse(question: MinimalQuestion, response: string): number {
    if (question.type === 'multiple-choice') {
        const selected = question.options?.find((o) => o.id === response);
        return selected?.isCorrect ? question.points : 0;
    }
    if (question.type === 'multiple-response') return scoreMultipleResponse(question, response);
    if (question.type === 'true-false')
        return response === String(question.correctBoolean ?? true) ? question.points : 0;
    if (question.type === 'short-answer') return scoreShortAnswerExact(question, response);
    if (question.type === 'numeric') return scoreNumeric(question, response);
    if (question.type === 'cloze' || question.type === 'cloze-dropdown') return scoreCloze(question, response);
    if (question.type === 'matching') return scoreMatching(question, response);
    if (question.type === 'ordering') return scoreOrdering(question, response);
    if (question.type === 'categorize') return scoreCategorize(question, response);
    if (question.type === 'hot-text') return scoreHotText(question, response);
    return 0; // open — needs manual points
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

const DEFAULT_ELO_RATING = 1200;
const ELO_K_FACTOR = 24;
const LEVEL_TO_ELO: Record<string, number> = {
    A1: 800,
    A2: 1000,
    B1: 1200,
    B2: 1400,
    C1: 1600,
    C2: 1800,
};

function eloExpectedScore(itemRating: number, opponentRating: number): number {
    return 1 / (1 + 10 ** ((itemRating - opponentRating) / 400));
}

function updateItemElo(itemRating: number, opponentRating: number, correct: boolean): number {
    const expected = eloExpectedScore(itemRating, opponentRating);
    const actual = correct ? 1 : 0;
    return itemRating - ELO_K_FACTOR * (actual - expected);
}

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
    // can never reach storage in the first place.
    const sanitizedAnswers: MinimalAnswer[] = answers.map((a) => ({ questionId: a.questionId, response: a.response }));

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

    // Set below once a staircase levelPath has been validated and its items' Elo ratings
    // recomputed, so the update can be persisted after the (unrelated) submission insert below.
    let eloUpdate: { testId: string; data: MinimalTest } | null = null;

    if (sectionPath || levelPath) {
        const { data: testRow, error: testErr } = await admin
            .from('tests')
            .select('data')
            .eq('id', assignment.test_id)
            .single();
        if (testErr || !testRow) return json({ error: 'Test not found' }, 404);
        const test = testRow.data as MinimalTest;

        // The scoring replay below parses each answer's `response` as JSON per question type
        // (arrays for multiple-response/ordering/hot-text, objects for cloze/matching/categorize).
        // A syntactically valid but wrongly-shaped response (e.g. an object where an array is
        // expected) throws inside Set/array construction rather than JSON.parse itself, which
        // the per-scorer try/catch around JSON.parse doesn't cover — treat any such failure as
        // an invalid submission rather than letting it crash the request to an unhandled 500.
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

                levelPath.forEach((step, i) => {
                    const question = questionsById.get(step.questionId);
                    if (!question) return;
                    const opponentRating = LEVEL_TO_ELO[levelBeforeStep[i]] ?? DEFAULT_ELO_RATING;
                    const currentRating = question.eloRating ?? DEFAULT_ELO_RATING;
                    question.eloRating = updateItemElo(currentRating, opponentRating, correctFlags[i]);
                });
                eloUpdate = { testId: assignment.test_id, data: test };
            }
        } catch (e) {
            console.error('submit-test placement path replay failed:', e);
            return json({ error: 'Invalid submission' }, 400);
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
                answers: sanitizedAnswers,
                status: 'submitted',
                startedAt,
                submittedAt,
                events: events ?? [],
                attemptNumber,
                ...(sectionPath ? { sectionPath } : {}),
                ...(levelPath ? { levelPath } : {}),
            },
        });

        if (!insertErr) {
            // Best-effort: item ratings are an internal refinement, not authoritative data — a
            // failed update here should never fail an otherwise-successful submission.
            if (eloUpdate) {
                const { error: eloErr } = await admin
                    .from('tests')
                    .update({ data: eloUpdate.data })
                    .eq('id', eloUpdate.testId);
                if (eloErr) console.error('submit-test elo rating update failed:', eloErr);
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
