import type { CefrLevel, Student, StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import { stripHtmlTags } from './exportDataPrep';
import { renderClozeSegments, parseHotTextFragments } from './clozeParse';
import { parseAudioResponse } from './audioResponseCode';
import { autoScoreResponse, calcStudentTestRawPoints, calcTestMaxPoints, calcTestPercentage } from './testCalc';
import { estimatePlacement, type PlacementPathStep } from './placementResult';
import { summarizeProctorFlags } from './proctorAggregator';

function parseJson<T>(raw: string, fallback: T): T {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

const NO_RESPONSE = '(no response)';

/** Plain-text rendering of a student's answer — mirrors formatStudentResponse() in TestResultsPage, minus colour. */
export function formatGivenAnswer(question: TestQuestion, answer: TestAnswer | undefined): string {
    const response = answer?.response;
    if (!response) return NO_RESPONSE;

    switch (question.type) {
        case 'multiple-choice':
            return question.options?.find((o) => o.id === response)?.text ?? NO_RESPONSE;
        case 'multiple-response': {
            const texts = parseJson<string[]>(response, [])
                .map((id) => question.options?.find((o) => o.id === id)?.text)
                .filter((text): text is string => !!text);
            return texts.length > 0 ? texts.join(', ') : NO_RESPONSE;
        }
        case 'true-false':
            return response === 'true' ? 'True' : 'False';
        case 'cloze':
        case 'cloze-dropdown': {
            const answers = parseJson<Record<string, string>>(response, {});
            const segments = renderClozeSegments(stripHtmlTags(question.prompt));
            if (!segments.some((s) => s.type === 'gap')) return NO_RESPONSE;
            return segments
                .map((s) => (s.type === 'text' ? s.text : `[${(answers[s.gap.index] ?? '').trim() || '___'}]`))
                .join('');
        }
        case 'matching': {
            const pairs = question.matchingPairs ?? [];
            if (pairs.length === 0) return NO_RESPONSE;
            const answers = parseJson<Record<string, string>>(response, {});
            const byId = new Map(pairs.map((p) => [p.id, p]));
            return pairs.map((p) => `${p.left} → ${byId.get(answers[p.id])?.right ?? '___'}`).join('; ');
        }
        case 'ordering': {
            const items = question.orderItems ?? [];
            if (items.length === 0) return NO_RESPONSE;
            const byId = new Map(items.map((i) => [i.id, i]));
            return parseJson<string[]>(response, [])
                .map((id) => byId.get(id)?.text ?? '?')
                .join(' → ');
        }
        case 'categorize': {
            const items = question.categorizeItems ?? [];
            if (items.length === 0) return NO_RESPONSE;
            const answers = parseJson<Record<string, string>>(response, {});
            const cats = new Map((question.categories ?? []).map((c) => [c.id, c.label]));
            return items.map((it) => `${it.text} → ${cats.get(answers[it.id]) ?? '___'}`).join('; ');
        }
        case 'hot-text': {
            const segments = parseHotTextFragments(stripHtmlTags(question.hotTextPassage ?? ''));
            const selected = new Set(parseJson<number[]>(response, []));
            const picked = segments
                .filter((s) => s.type === 'fragment' && selected.has(s.index))
                .map((s) => (s.type === 'fragment' ? s.text : ''));
            return picked.length > 0 ? picked.join(', ') : NO_RESPONSE;
        }
        case 'audio-response':
            return parseAudioResponse(response) ? '(audio response)' : NO_RESPONSE;
        default:
            return stripHtmlTags(response).trim() || NO_RESPONSE;
    }
}

/** Plain-text model/correct answer for auto-scorable question types; '' for open-ended ones with no single answer. */
export function formatCorrectAnswer(question: TestQuestion): string {
    switch (question.type) {
        case 'multiple-choice':
        case 'multiple-response':
            return (question.options ?? [])
                .filter((o) => o.isCorrect)
                .map((o) => o.text)
                .join(', ');
        case 'true-false':
            return question.correctBoolean ? 'True' : 'False';
        case 'short-answer': {
            const accepted = question.expectedAnswers ?? (question.expectedAnswer ? [question.expectedAnswer] : []);
            return accepted.join(' / ');
        }
        case 'numeric':
            if (question.expectedNumericValue === undefined) return '';
            return question.numericTolerance
                ? `${question.expectedNumericValue} ± ${question.numericTolerance}`
                : String(question.expectedNumericValue);
        case 'cloze':
        case 'cloze-dropdown':
            return renderClozeSegments(stripHtmlTags(question.prompt))
                .map((s) => (s.type === 'text' ? s.text : `[${s.gap.alternatives[0] ?? ''}]`))
                .join('');
        case 'matching':
            return (question.matchingPairs ?? []).map((p) => `${p.left} → ${p.right}`).join('; ');
        case 'ordering':
            return (question.orderItems ?? []).map((i) => i.text).join(' → ');
        case 'categorize': {
            const cats = new Map((question.categories ?? []).map((c) => [c.id, c.label]));
            return (question.categorizeItems ?? [])
                .map((it) => `${it.text} → ${cats.get(it.categoryId) ?? '?'}`)
                .join('; ');
        }
        case 'hot-text': {
            const segments = parseHotTextFragments(stripHtmlTags(question.hotTextPassage ?? ''));
            const correct = new Set(question.hotTextCorrectIndices ?? []);
            return segments
                .filter((s) => s.type === 'fragment' && correct.has(s.index))
                .map((s) => (s.type === 'fragment' ? s.text : ''))
                .join(', ');
        }
        default:
            return '';
    }
}

/** Default achieve threshold when no AppSettings.cefrAchieveThreshold is configured. */
export const DEFAULT_CEFR_ACHIEVE_THRESHOLD = 70;

/** One-line CEFR estimate for a summary export, or null when the test carries no CEFR data. */
export function describeTestCefr(
    test: Test,
    studentTest: StudentTest | null,
    achieveThreshold: number = DEFAULT_CEFR_ACHIEVE_THRESHOLD
): string | null {
    if (test.mode === 'placement') {
        if (!studentTest) return null;
        const estimate = estimatePlacement(test, studentTest);
        return estimate ? `${estimate.level} (provisional placement estimate)` : null;
    }
    if (!test.cefrTargetLevel) return null;
    const skill = test.cefrSkill ? ` ${test.cefrSkill}` : '';
    const target: CefrLevel = test.cefrTargetLevel;
    if (!studentTest) return `${target}${skill} (target)`;
    const maxPoints = calcTestMaxPoints(test);
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    const pct = calcTestPercentage(rawPoints, maxPoints);
    const achieved = pct >= achieveThreshold;
    return `${target}${skill} target — ${achieved ? 'achieved' : 'not yet'} (${pct.toFixed(0)}%, threshold ${achieveThreshold}%)`;
}

export type AnswerStatus = 'correct' | 'partial' | 'wrong' | 'blank' | 'na';

/** ✓ / ✗ / ~ / (blank) marker for an answer row's correctness. */
export const ANSWER_STATUS_MARK: Record<AnswerStatus, string> = {
    correct: '✓',
    partial: '~',
    wrong: '✗',
    blank: '·',
    na: '',
};

function answerStatus(hasAnswer: boolean, earned: number, points: number): AnswerStatus {
    if (points <= 0) return 'na';
    if (!hasAnswer) return 'blank';
    if (earned >= points) return 'correct';
    if (earned <= 0) return 'wrong';
    return 'partial';
}

/** One row of the per-question answer breakdown for a single student's summary. */
export interface TestAnswerRow {
    prompt: string;
    given: string;
    correct: string;
    pointsEarned: number;
    points: number;
    status: AnswerStatus;
    feedback?: string;
}

export function buildAnswerRows(test: Test, studentTest: StudentTest, questions: TestQuestion[]): TestAnswerRow[] {
    const byId = new Map(studentTest.answers.map((a) => [a.questionId, a]));
    return questions.map((q) => {
        const answer = byId.get(q.id);
        const earned = answer?.pointsEarned ?? (answer ? autoScoreResponse(q, answer.response) : 0);
        return {
            prompt: stripHtmlTags(q.prompt),
            given: formatGivenAnswer(q, answer),
            correct: formatCorrectAnswer(q),
            pointsEarned: earned,
            points: q.points,
            status: answerStatus(!!answer, earned, q.points),
            feedback: answer?.feedback,
        };
    });
}

/** Placement-path steps (section → CEFR level → score) for a placement submission; [] otherwise. */
export function describePlacementPath(test: Test, studentTest: StudentTest): PlacementPathStep[] {
    if (test.mode !== 'placement') return [];
    return estimatePlacement(test, studentTest)?.path ?? [];
}

/**
 * Extra per-student metadata lines: time on task (from startedAt/submittedAt) and any
 * proctor flags (tab switches, paste, Safe Exam Browser). Returns [] when nothing applies.
 */
export function describeTestMeta(studentTest: StudentTest): string[] {
    const lines: string[] = [];
    if (studentTest.submittedAt) {
        const minutes = (Date.parse(studentTest.submittedAt) - Date.parse(studentTest.startedAt)) / 60_000;
        if (minutes >= 0) lines.push(`Time on task: ${minutes.toFixed(0)} min`);
    }
    const flags = summarizeProctorFlags(studentTest.events ?? []);
    const parts: string[] = [];
    if (flags.tabSwitchCount > 0) parts.push(`${flags.tabSwitchCount} tab switch(es)`);
    if (flags.pasteCount > 0) parts.push(`${flags.pasteCount} paste(s)`);
    if (flags.copyCount > 0) parts.push(`${flags.copyCount} copy`);
    if (flags.cutCount > 0) parts.push(`${flags.cutCount} cut`);
    if (flags.sebActive) parts.push('Safe Exam Browser');
    if (parts.length > 0) lines.push(`Proctor flags: ${parts.join(', ')}`);
    return lines;
}

/**
 * Plain-text "mini summary" of one student's test result — mirrors buildStudentSummary() for
 * rubrics (StudentsPage): score, CEFR estimate, and per-question given/correct answers.
 */
export function buildTestStudentSummary(
    test: Test,
    studentTest: StudentTest,
    student: Student | undefined,
    questions: TestQuestion[],
    achieveThreshold: number = DEFAULT_CEFR_ACHIEVE_THRESHOLD
): string {
    const name = student?.name ?? 'Student';
    const maxPoints = calcTestMaxPoints(test);
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    const adjustment = studentTest.adjustmentPoints ?? 0;
    const pct = calcTestPercentage(rawPoints + adjustment, maxPoints);

    const lines: string[] = [name, '─'.repeat(name.length), ''];
    lines.push(`Test: ${test.name}`);
    if (maxPoints > 0) lines.push(`Score: ${pct.toFixed(1)}% — ${rawPoints + adjustment}/${maxPoints} pts`);
    const cefr = describeTestCefr(test, studentTest, achieveThreshold);
    if (cefr) lines.push(`CEFR: ${cefr}`);
    for (const line of describeTestMeta(studentTest)) lines.push(line);

    const path = describePlacementPath(test, studentTest);
    if (path.length > 0) {
        lines.push('');
        lines.push('Placement path:');
        for (const step of path) {
            lines.push(`  ${step.title}: ${step.level ?? '—'} — ${step.scorePct.toFixed(0)}%`);
        }
    }
    lines.push('');

    buildAnswerRows(test, studentTest, questions).forEach((row, i) => {
        const mark = ANSWER_STATUS_MARK[row.status];
        lines.push(`${mark ? mark + ' ' : ''}Q${i + 1}. ${row.prompt} (${row.pointsEarned}/${row.points} pts)`);
        lines.push(`  Given:   ${row.given}`);
        if (row.correct) lines.push(`  Correct: ${row.correct}`);
        if (row.feedback) lines.push(`  Feedback: ${stripHtmlTags(row.feedback)}`);
    });

    return lines.join('\n');
}
