// Edge Function: next-placement-question
//
// Server-authoritative question picker for a generator-engine placement test
// (Test.placementEngine === 'generator', roadmap Phase 27.1). Unlike the staircase
// engine (client-side resolveNextStaircaseQuestion against a pre-authored Test),
// a generator test has no pre-authored question pool — every question is pulled
// live from question_bank_items, and level/Elo state is owned here rather than
// trusted from the client, so a teacher's live level nudge (27.2) can take effect
// mid-run and the Live Monitor (27.3) can show authoritative live state.
//
// Called once per question: with no previousQuestionId on the very first call (or
// a page-reload resume, which idempotently re-serves the pending question instead
// of drawing a new one), and with previousQuestionId + previousResponse on every
// subsequent call to score the prior answer and advance.
//
// Mirrors submit-test's necessary duplication of scoring/staircase logic (Deno edge
// functions can't import from src/) — keep LEVEL_TO_ELO etc. in sync by hand with
// src/utils/placementStaircase.ts, the same known hazard already accepted there
// since Phase 25.4.

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

// ── Shared question/scoring shapes (mirrors submit-test/index.ts) ──────────

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
    [key: string]: unknown;
}
interface MinimalAnswer {
    questionId: string;
    response: string;
}

// ── Cloze / hot-text gap parsing (mirrors src/utils/clozeParse.ts) ─────────

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
    return 0; // open — needs manual points, never auto-scorable, so never picked by the generator
}

function isAutoScorable(question: MinimalQuestion): boolean {
    return question.type !== 'open';
}

// Removes fields that only exist to score an answer or calibrate item difficulty — mirrors (and,
// for expectedAnswers/expectedNumericValue/numericTolerance/categorizeItems[].categoryId, extends
// beyond) get-test-assignment's toStudentSafeTest, applied to a single question instead of a whole
// test. Short-answer/numeric/categorize questions need this too — expectedAnswers, the numeric
// target+tolerance, and each category item's correct categoryId are all answer keys, not just the
// singular legacy expectedAnswer field.
function toStudentSafeQuestion(question: MinimalQuestion): MinimalQuestion {
    const {
        expectedAnswer: _ea,
        expectedAnswers: _eas,
        expectedNumericValue: _env,
        numericTolerance: _nt,
        correctBoolean: _cb,
        hotTextCorrectIndices: _hci,
        eloRating: _er,
        options,
        categorizeItems,
        ...rest
    } = question;
    return {
        ...rest,
        ...(options ? { options: options.map(({ isCorrect: _ic, ...opt }) => opt) } : {}),
        ...(categorizeItems ? { categorizeItems: categorizeItems.map(({ categoryId: _cid, ...item }) => item) } : {}),
    } as MinimalQuestion;
}

// ── Staircase state (mirrors src/utils/placementStaircase.ts) ──────────────

const STEP_UP_AFTER_CORRECT = 2;
const CONVERGE_AFTER_REVERSALS = 2;
const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const DEFAULT_ELO_RATING = 1200;
const ELO_K_FACTOR = 24;
const LEVEL_TO_ELO: Record<string, number> = {
    A1: 600,
    A2: 900,
    B1: 1200,
    B2: 1500,
    C1: 1800,
    C2: 2100,
};

function moveLevel(level: string, direction: 'up' | 'down', minLevel: string, maxLevel: string): string {
    const idx = CEFR_LEVELS.indexOf(level);
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    const nextIdx = direction === 'up' ? idx + 1 : idx - 1;
    return CEFR_LEVELS[Math.min(maxIdx, Math.max(minIdx, nextIdx))];
}

function cefrMidpoint(minLevel: string, maxLevel: string): string {
    const minIdx = CEFR_LEVELS.indexOf(minLevel);
    const maxIdx = CEFR_LEVELS.indexOf(maxLevel);
    return CEFR_LEVELS[minIdx + Math.floor((maxIdx - minIdx) / 2)];
}

interface StaircaseStepLike {
    correct: boolean;
    overridden?: 'up' | 'down';
}

/** Mirrors src/utils/placementStaircase.ts's computeStaircaseState (with the 27.2 override extension). */
function computeState(
    steps: StaircaseStepLike[],
    minLevel: string,
    maxLevel: string,
    startLevel: string
): { level: string; reversalCount: number } {
    let level = startLevel;
    let consecutiveCorrect = 0;
    let reversalCount = 0;
    let lastDirection: 'up' | 'down' | null = null;

    for (const step of steps) {
        if (step.overridden) {
            level = moveLevel(level, step.overridden, minLevel, maxLevel);
            consecutiveCorrect = 0;
        }
        const direction: 'up' | 'down' = step.correct ? 'up' : 'down';
        if (step.correct) {
            consecutiveCorrect++;
            if (consecutiveCorrect < STEP_UP_AFTER_CORRECT) continue;
        }
        const moved = moveLevel(level, direction, minLevel, maxLevel);
        if (moved !== level) {
            if (lastDirection !== null && lastDirection !== direction) reversalCount++;
            lastDirection = direction;
        }
        level = moved;
        consecutiveCorrect = 0;
    }
    return { level, reversalCount };
}

function eloExpectedScore(itemRating: number, opponentRating: number): number {
    return 1 / (1 + 10 ** ((itemRating - opponentRating) / 400));
}

function updateItemElo(itemRating: number, opponentRating: number, correct: boolean): number {
    const expected = eloExpectedScore(itemRating, opponentRating);
    const actual = correct ? 1 : 0;
    return itemRating - ELO_K_FACTOR * (actual - expected);
}

/** Deterministic Fisher-Yates shuffle seeded by a string — mirrors src/utils/seededShuffle.ts. */
function seededShuffle<T>(items: T[], seed: string): T[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    const rand = () => {
        h = (Math.imul(h, 1103515245) + 12345) | 0;
        return ((h >>> 0) % 1_000_000) / 1_000_000;
    };
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function pickNearestEloItem<T extends { eloRating?: number }>(items: T[], anchor: number): T {
    return items.reduce((best, item) => {
        const bestDistance = Math.abs((best.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        const itemDistance = Math.abs((item.eloRating ?? DEFAULT_ELO_RATING) - anchor);
        return itemDistance < bestDistance ? item : best;
    });
}

// ── Question bank item shape ─────────────────────────────────────────────

interface BankItem {
    id: string;
    kind?: 'question' | 'section';
    cefrLevel?: string;
    cefrSkill?: string;
    tags?: string[];
    question?: MinimalQuestion;
    section?: { title: string; content?: string; audioUrl?: string; questions: MinimalQuestion[] };
}

/** True when the item carries at least one of the config's tags (case-insensitive), or no tag filter is set. */
function matchesTagFilter(item: BankItem, tags: string[] | undefined): boolean {
    if (!tags?.length) return true;
    const wanted = new Set(tags.map((t) => t.toLowerCase()));
    return (item.tags ?? []).some((t) => wanted.has(t.toLowerCase()));
}

/** The nested/standalone question a bank item's pick represents, for a given kind + index. */
function bankItemQuestion(item: BankItem, sectionQuestionIndex?: number): MinimalQuestion | null {
    if ((item.kind ?? 'question') === 'question') return item.question ?? null;
    return item.section?.questions[sectionQuestionIndex ?? 0] ?? null;
}

/** The rating used to rank a bank item for selection — a section bundle is represented by its first nested question's rating. */
function bankItemEloRating(item: BankItem): number | undefined {
    const q = (item.kind ?? 'question') === 'question' ? item.question : item.section?.questions[0];
    return q?.eloRating;
}

interface PendingState {
    bankItemId: string;
    kind: 'question' | 'section';
    questionId: string;
    sectionQuestionIndex?: number;
    level: string;
    overridden?: 'up' | 'down';
}

function passageFor(item: BankItem, sectionQuestionIndex: number) {
    if ((item.kind ?? 'question') !== 'section' || !item.section) return undefined;
    return {
        bankItemId: item.id,
        title: item.section.title,
        content: item.section.content,
        audioUrl: item.section.audioUrl,
        questionIndex: sectionQuestionIndex,
        questionCount: item.section.questions.length,
    };
}

// Sliding-window rate limit, scoped to this session (there's no natural per-call log table to
// count against, unlike submit-test's once-per-attempt student_tests count).
const RATE_WINDOW_MS = 60_000;
const RATE_WINDOW_MAX_CALLS = 30;

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

    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const {
        data: { user },
        error: authErr,
    } = await admin.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authErr || !user) return json({ error: 'Invalid or expired token' }, 401);

    let body: { assignmentId?: string; previousQuestionId?: string; previousResponse?: string };
    try {
        body = await req.json();
    } catch {
        return json({ error: 'Invalid request body' }, 400);
    }
    const { assignmentId, previousQuestionId, previousResponse } = body;
    if (!assignmentId || typeof assignmentId !== 'string') {
        return json({ error: 'Missing required field: assignmentId' }, 400);
    }
    if (previousQuestionId !== undefined && typeof previousResponse !== 'string') {
        return json({ error: 'previousResponse is required alongside previousQuestionId' }, 400);
    }

    const { data: assignment, error: assignErr } = await admin
        .from('test_assignments')
        .select('owner_id, test_id, expires_at')
        .eq('id', assignmentId)
        .single();
    if (assignErr || !assignment) return json({ error: 'Assignment not found' }, 404);
    if (assignment.expires_at && new Date(assignment.expires_at) < new Date()) {
        return json({ error: 'Assignment deadline has passed' }, 403);
    }

    const { data: testRow, error: testErr } = await admin
        .from('tests')
        .select('data')
        .eq('id', assignment.test_id)
        .eq('owner_id', assignment.owner_id)
        .single();
    if (testErr || !testRow) return json({ error: 'Test not found' }, 404);
    const test = testRow.data as {
        mode?: string;
        placementEngine?: string;
        generatorConfig?: {
            minCefrLevel: string;
            maxCefrLevel: string;
            skills?: string[];
            tags?: string[];
            minQuestions: number;
            maxQuestions: number;
            starterBankItemId?: string;
        };
    };
    if (test.mode !== 'placement' || test.placementEngine !== 'generator' || !test.generatorConfig) {
        return json({ error: 'This test is not a generator-engine placement test' }, 400);
    }
    const cfg = test.generatorConfig;
    const ownerId = assignment.owner_id as string;

    // ── Load or create the session row ──────────────────────────────────────
    const { data: existing } = await admin.from('placement_sessions').select('*').eq('id', assignmentId).single();

    if (existing && existing.student_user_id !== user.id) {
        return json({ error: 'This session belongs to a different student' }, 403);
    }

    // Rate limit (only meaningful once a session exists; a brand-new session's first call can't
    // have been rate-limited yet).
    if (existing) {
        const now = Date.now();
        const windowStart = existing.rate_window_start ? new Date(existing.rate_window_start).getTime() : 0;
        const withinWindow = now - windowStart < RATE_WINDOW_MS;
        const nextCount = withinWindow ? existing.rate_window_count + 1 : 1;
        if (withinWindow && nextCount > RATE_WINDOW_MAX_CALLS) {
            return json({ error: 'Too many requests. Please slow down.' }, 429);
        }
        const { error: rateErr } = await admin
            .from('placement_sessions')
            .update({
                rate_window_start: withinWindow ? existing.rate_window_start : new Date(now).toISOString(),
                rate_window_count: nextCount,
            })
            .eq('id', assignmentId);
        // Best-effort: a failed rate-limit counter update just means the next call's window
        // check is slightly stale, not a correctness issue worth failing the request over.
        if (rateErr) console.error('placement_sessions rate-limit update failed:', rateErr);
    }

    async function fetchBankItem(bankItemId: string): Promise<BankItem | null> {
        const { data } = await admin
            .from('question_bank_items')
            .select('id, data')
            .eq('id', bankItemId)
            .eq('owner_id', ownerId)
            .single();
        if (!data) return null;
        return { id: data.id, ...(data.data as Omit<BankItem, 'id'>) };
    }

    function respondQuestion(item: BankItem, pending: PendingState, questionsAsked: number) {
        const rawQuestion = bankItemQuestion(item, pending.sectionQuestionIndex);
        if (!rawQuestion) return json({ error: 'Picked question is missing from its bank item' }, 500);
        const safeQuestion = toStudentSafeQuestion({ ...rawQuestion, sectionId: pending.level });
        return json({
            done: false,
            question: safeQuestion,
            passage: passageFor(item, pending.sectionQuestionIndex ?? 0),
            cefrLevel: pending.level,
            eloAnchor: LEVEL_TO_ELO[pending.level],
            questionsAsked,
        });
    }

    /** A bank item is pickable when it has at least one question and every question in it is auto-scorable — mirrors pickNewItem's own pool filter, applied to a single (e.g. teacher-preselected starter) item. */
    function isValidBankItem(item: BankItem): boolean {
        const questions = (item.kind ?? 'question') === 'section' ? (item.section?.questions ?? []) : [item.question];
        return questions.length > 0 && questions.every((q) => q && isAutoScorable(q));
    }

    /**
     * Draws a fresh top-level bank item at `pickLevel`, sets it as the new pending question.
     * Returns null if the pool is empty. `remainingBudget` (cfg.maxQuestions minus steps already
     * taken) excludes section bundles that couldn't be *finished* within the cap — a bundle, once
     * started, is always served in full (mid-bundle continuation never re-checks the cap), so the
     * only way to keep the run within maxQuestions is to never start one that wouldn't fit.
     */
    async function pickNewItem(
        pickLevel: string,
        overridden: 'up' | 'down' | undefined,
        askedItemIds: string[],
        remainingBudget: number
    ): Promise<{ item: BankItem; pending: PendingState } | null> {
        // Filter by cefrLevel in the query itself rather than fetching the whole bank and
        // filtering in memory — beyond the per-question I/O cost of re-downloading every item on
        // every call, PostgREST applies a default max-rows cap, which could otherwise silently
        // truncate a large bank's candidate pool to an arbitrary subset. An explicit .limit() is
        // still set as defense-in-depth, well above any realistic single-level pool size.
        const { data: candidates } = await admin
            .from('question_bank_items')
            .select('id, data')
            .eq('owner_id', ownerId)
            .eq('data->>cefrLevel', pickLevel)
            .limit(5000);
        const pool = (candidates ?? [])
            .map((row) => ({ id: row.id as string, ...(row.data as Omit<BankItem, 'id'>) }) as BankItem)
            .filter((item) => !cfg.skills?.length || (item.cefrSkill && cfg.skills.includes(item.cefrSkill)))
            .filter((item) => matchesTagFilter(item, cfg.tags))
            .filter((item) => !askedItemIds.includes(item.id))
            // A section bundle is served in full, so every nested question must be auto-scorable —
            // one 'open' question among them would always score 0, needing manual points.
            .filter(isValidBankItem)
            .filter((item) => {
                // Never start a bundle that couldn't be finished within the question cap.
                if ((item.kind ?? 'question') !== 'section') return true;
                return (item.section?.questions.length ?? 0) <= remainingBudget;
            });
        if (pool.length === 0) return null;

        const shuffled = seededShuffle(pool, `${assignmentId}-${pickLevel}`);
        const withRatings = shuffled.map((item) => ({ item, eloRating: bankItemEloRating(item) }));
        const picked = pickNearestEloItem(withRatings, LEVEL_TO_ELO[pickLevel]).item;

        const isSection = (picked.kind ?? 'question') === 'section';
        const questionId = isSection ? (picked.section?.questions[0]?.id ?? '') : (picked.question?.id ?? '');
        const pending: PendingState = {
            bankItemId: picked.id,
            kind: isSection ? 'section' : 'question',
            questionId,
            sectionQuestionIndex: isSection ? 0 : undefined,
            level: pickLevel,
            overridden,
        };
        return { item: picked, pending };
    }

    // ── Brand-new session: create it and serve the first question ──────────
    if (!existing) {
        if (previousQuestionId) {
            return json({ error: 'No session exists yet for this assignment' }, 400);
        }

        let startLevel = cefrMidpoint(cfg.minCefrLevel, cfg.maxCefrLevel);
        let starterItem: BankItem | null = null;
        if (cfg.starterBankItemId) {
            const fetched = await fetchBankItem(cfg.starterBankItemId);
            // A starter item that's missing, has no question, or has an unscorable ('open')
            // question would either score 0 forever or never resolve a matchable questionId —
            // wedging the run permanently. Fall back to the normal pool pick instead.
            starterItem = fetched && isValidBankItem(fetched) ? fetched : null;
            if (starterItem?.cefrLevel) {
                const idx = CEFR_LEVELS.indexOf(starterItem.cefrLevel);
                const minIdx = CEFR_LEVELS.indexOf(cfg.minCefrLevel);
                const maxIdx = CEFR_LEVELS.indexOf(cfg.maxCefrLevel);
                startLevel = CEFR_LEVELS[Math.min(maxIdx, Math.max(minIdx, idx))];
            }
        }

        let item: BankItem;
        let pending: PendingState;
        if (starterItem) {
            const isSection = (starterItem.kind ?? 'question') === 'section';
            item = starterItem;
            pending = {
                bankItemId: starterItem.id,
                kind: isSection ? 'section' : 'question',
                questionId: isSection
                    ? (starterItem.section?.questions[0]?.id ?? '')
                    : (starterItem.question?.id ?? ''),
                sectionQuestionIndex: isSection ? 0 : undefined,
                level: startLevel,
            };
        } else {
            const picked = await pickNewItem(startLevel, undefined, [], cfg.maxQuestions);
            if (!picked) return json({ error: 'No bank questions available at the starting level' }, 400);
            item = picked.item;
            pending = picked.pending;
        }

        const { error: insertErr } = await admin.from('placement_sessions').insert({
            id: assignmentId,
            owner_id: ownerId,
            assignment_id: assignmentId,
            student_user_id: user.id,
            start_level: startLevel,
            current_level: startLevel,
            pending,
            level_path: [],
            asked_questions: [],
            asked_item_ids: [],
            status: 'in_progress',
        });
        if (insertErr) {
            // A concurrent first call (two tabs/devices loading the same fresh link at once) can
            // race this insert on the assignmentId primary key — re-read and re-serve whichever
            // row actually landed instead of discarding the student's very first question.
            if (insertErr.code === '23505') {
                const { data: raced } = await admin
                    .from('placement_sessions')
                    .select('*')
                    .eq('id', assignmentId)
                    .single();
                if (raced?.pending) {
                    const racedItem = await fetchBankItem(raced.pending.bankItemId);
                    if (racedItem) return respondQuestion(racedItem, raced.pending, (raced.level_path ?? []).length);
                }
            }
            console.error('placement_sessions insert failed:', insertErr);
            return json({ error: 'Could not start the placement run' }, 500);
        }

        return respondQuestion(item, pending, 0);
    }

    const minLevel = cfg.minCefrLevel;
    const maxLevel = cfg.maxCefrLevel;
    const startLevel = existing.start_level as string;
    let levelPath: (StaircaseStepLike & { sectionId: string; questionId: string })[] = existing.level_path ?? [];
    let askedQuestions: MinimalQuestion[] = existing.asked_questions ?? [];
    let askedItemIds: string[] = existing.asked_item_ids ?? [];
    const pending: PendingState | null = existing.pending ?? null;

    // ── Resume: no answer submitted, just re-serve the pending question idempotently ──
    if (!previousQuestionId) {
        if (existing.status !== 'in_progress' || !pending) {
            const state = computeState(levelPath, minLevel, maxLevel, startLevel);
            return json({ done: true, finalLevel: state.level, questionsAsked: levelPath.length });
        }
        const item = await fetchBankItem(pending.bankItemId);
        if (!item) return json({ error: 'Pending question is no longer available' }, 500);
        return respondQuestion(item, pending, levelPath.length);
    }

    // ── Answering: previousQuestionId must match the session's own pending question ──
    if (existing.status !== 'in_progress' || !pending || pending.questionId !== previousQuestionId) {
        return json({ error: 'This question is no longer pending — refresh and try again' }, 409);
    }
    const answeredQuestionId = previousQuestionId;

    // Every write below is a compare-and-swap against the *exact* pending question just read,
    // not a plain unconditional update — two in-flight calls carrying the same previousQuestionId
    // (double-click, retry, duplicate tab) would otherwise both pass the check above (both read
    // the same snapshot), both append the same step, and both apply an Elo delta, corrupting the
    // trace that submit-test later trusts verbatim. Only the call whose write actually lands (0
    // rows updated for the loser) proceeds; the loser gets the same 409 as a genuinely stale call.
    async function casUpdate(patch: Record<string, unknown>): Promise<boolean> {
        const { data, error } = await admin
            .from('placement_sessions')
            .update(patch)
            .eq('id', assignmentId)
            .eq('status', 'in_progress')
            .eq('pending->>questionId', answeredQuestionId)
            .select('id');
        if (error) console.error('placement_sessions CAS update failed:', error);
        return !!data?.length;
    }

    const item = await fetchBankItem(pending.bankItemId);
    if (!item) return json({ error: 'Answered question is no longer available' }, 500);
    const question = bankItemQuestion(item, pending.sectionQuestionIndex);
    if (!question) return json({ error: 'Answered question is missing from its bank item' }, 500);

    const earned = autoScoreResponse(question, previousResponse ?? '');
    const correct = earned >= question.points;

    // Elo self-calibration (roadmap 25.4 pattern) — updates the item's OWN row only, so
    // (unlike submit-test's whole-tests.data-blob overwrite) concurrent updates to different
    // bank items never race, and even concurrent updates to the same item are just a plain
    // last-write-wins on that one small row rather than the entire test document.
    const opponentRating = LEVEL_TO_ELO[pending.level] ?? DEFAULT_ELO_RATING;
    const currentRating = question.eloRating ?? DEFAULT_ELO_RATING;
    const newRating = updateItemElo(currentRating, opponentRating, correct);
    const updatedItemData: BankItem = structuredClone(item);
    if ((updatedItemData.kind ?? 'question') === 'section' && updatedItemData.section) {
        updatedItemData.section.questions[pending.sectionQuestionIndex ?? 0].eloRating = newRating;
    } else if (updatedItemData.question) {
        updatedItemData.question.eloRating = newRating;
    }
    const { id: _itemId, ...updatedItemBody } = updatedItemData;
    // Deferred until the CAS below actually lands (see call sites) — applying this unconditionally
    // here would let a losing duplicate request (same previousQuestionId, rejected by the CAS)
    // still mutate the item's rating, double-applying the Elo delta for one real answer.
    async function applyEloWriteBack(): Promise<void> {
        const { error: eloErr } = await admin
            .from('question_bank_items')
            .update({ data: updatedItemBody })
            .eq('id', item.id)
            .eq('owner_id', ownerId);
        // Best-effort, same posture as submit-test's staircase Elo write-back: item ratings are an
        // internal self-calibration refinement, not authoritative data — never fail the request over it.
        if (eloErr) console.error('question_bank_items elo rating update failed:', eloErr);
    }

    const step = {
        sectionId: pending.level,
        level: pending.level,
        questionId: previousQuestionId,
        correct,
        ...(pending.overridden ? { overridden: pending.overridden } : {}),
    };
    levelPath = [...levelPath, step];
    askedQuestions = [...askedQuestions, { ...question, sectionId: pending.level }];

    // ── Mid-bundle: more nested questions left in this same passage ────────
    const bundleQuestionCount = (item.kind ?? 'question') === 'section' ? (item.section?.questions.length ?? 0) : 1;
    const nextIndex = (pending.sectionQuestionIndex ?? 0) + 1;
    if ((item.kind ?? 'question') === 'section' && nextIndex < bundleQuestionCount) {
        const nextQuestion = item.section!.questions[nextIndex];
        const nextPending: PendingState = {
            bankItemId: item.id,
            kind: 'section',
            questionId: nextQuestion.id,
            sectionQuestionIndex: nextIndex,
            level: pending.level,
        };
        const swapped = await casUpdate({
            level_path: levelPath,
            asked_questions: askedQuestions,
            pending: nextPending,
            updated_at: new Date().toISOString(),
        });
        if (!swapped) return json({ error: 'This question is no longer pending — refresh and try again' }, 409);
        await applyEloWriteBack();
        return respondQuestion(item, nextPending, levelPath.length);
    }

    // Whole item (plain question, or the last nested question of a bundle) is now fully asked.
    askedItemIds = [...askedItemIds, item.id];

    const state = computeState(levelPath, minLevel, maxLevel, startLevel);
    const stop =
        levelPath.length >= cfg.maxQuestions ||
        (levelPath.length >= cfg.minQuestions && state.reversalCount >= CONVERGE_AFTER_REVERSALS);

    if (stop) {
        const swapped = await casUpdate({
            level_path: levelPath,
            asked_questions: askedQuestions,
            asked_item_ids: askedItemIds,
            pending: null,
            current_level: state.level,
            override_direction: null,
            status: 'converged',
            updated_at: new Date().toISOString(),
        });
        if (!swapped) return json({ error: 'This question is no longer pending — refresh and try again' }, 409);
        await applyEloWriteBack();
        return json({ done: true, finalLevel: state.level, questionsAsked: levelPath.length });
    }

    const overrideDirection = (existing.override_direction as 'up' | 'down' | null) ?? undefined;
    const pickLevel = overrideDirection ? moveLevel(state.level, overrideDirection, minLevel, maxLevel) : state.level;
    const picked = await pickNewItem(pickLevel, overrideDirection, askedItemIds, cfg.maxQuestions - levelPath.length);

    if (!picked) {
        const swapped = await casUpdate({
            level_path: levelPath,
            asked_questions: askedQuestions,
            asked_item_ids: askedItemIds,
            pending: null,
            current_level: pickLevel,
            override_direction: null,
            status: 'converged',
            updated_at: new Date().toISOString(),
        });
        if (!swapped) return json({ error: 'This question is no longer pending — refresh and try again' }, 409);
        await applyEloWriteBack();
        return json({ done: true, finalLevel: pickLevel, questionsAsked: levelPath.length });
    }

    const swapped = await casUpdate({
        level_path: levelPath,
        asked_questions: askedQuestions,
        asked_item_ids: askedItemIds,
        pending: picked.pending,
        current_level: pickLevel,
        override_direction: null,
        updated_at: new Date().toISOString(),
    });
    if (!swapped) return json({ error: 'This question is no longer pending — refresh and try again' }, 409);
    await applyEloWriteBack();

    return respondQuestion(picked.item, picked.pending, levelPath.length);
});
