import { plainInlineScript } from './inlineScript';
import i18n from 'i18next';
import type { CefrLevel, Student, StudentTest, Test, TestAnswer, TestQuestion } from '../types';
import { stripHtmlTags } from './exportDataPrep';
import { gapCorrectAnswers, renderClozeSegments, parseHotTextFragments, plainQuestionPromptText } from './clozeParse';
import { parseErrorPicks, parsePlacedWords } from './answerResponseParsers';
import { keyWordChunks, parseErrorPassage, sentenceBuilderText } from '../../supabase/functions/_shared/testScoring';
import { parseAudioResponse } from './audioResponseCode';
import { autoScoreResponse, calcStudentTestRawPoints, calcTestMaxPoints, calcTestPercentage } from './testCalc';
import { estimatePlacement, type PlacementPathStep } from './placementResult';
import { clamp } from './clamp';
import { summarizeProctorFlags } from './proctorAggregator';

/** Shorthand for the test-summary-export string namespace. */
const tx = (key: string, opts?: Record<string, unknown>) =>
    opts ? i18n.t(`tests.export.summary.${key}`, opts) : i18n.t(`tests.export.summary.${key}`);

/**
 * Canonical "which submission represents this student" selector, shared by every export format:
 * highest attemptNumber, then latest submittedAt/startedAt — never array position, which isn't
 * guaranteed to be attempt order after import or sync. Returns null for an empty list.
 */
export function pickLatestAttempt(attempts: StudentTest[]): StudentTest | null {
    if (attempts.length === 0) return null;
    return attempts.reduce((latest, candidate) => {
        const latestAttempt = latest.attemptNumber ?? 1;
        const candidateAttempt = candidate.attemptNumber ?? 1;
        if (candidateAttempt !== latestAttempt) return candidateAttempt > latestAttempt ? candidate : latest;
        const latestTime = Date.parse(latest.submittedAt ?? latest.startedAt);
        const candidateTime = Date.parse(candidate.submittedAt ?? candidate.startedAt);
        return candidateTime > latestTime ? candidate : latest;
    });
}

function parseJson<T>(raw: string, fallback: T): T {
    try {
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/** Plain-text rendering of a student's answer — mirrors formatStudentResponse() in TestResultsPage, minus colour. */
export function formatGivenAnswer(question: TestQuestion, answer: TestAnswer | undefined): string {
    const NO_RESPONSE = tx('no_response');
    const response = answer?.response;
    if (!response) return NO_RESPONSE;

    switch (question.type) {
        case 'multiple-choice':
            return plainInlineScript(question.options?.find((o) => o.id === response)?.text ?? NO_RESPONSE);
        case 'multiple-response': {
            const texts = parseJson<string[]>(response, [])
                .map((id) => question.options?.find((o) => o.id === id)?.text)
                .map((text) => (text ? plainInlineScript(text) : text))
                .filter((text): text is string => !!text);
            return texts.length > 0 ? texts.join(', ') : NO_RESPONSE;
        }
        case 'true-false':
            return response === 'true' ? question.trueLabel?.trim() || 'True' : question.falseLabel?.trim() || 'False';
        case 'cloze':
        case 'cloze-dropdown':
        case 'cloze-bank': {
            const answers = parseJson<Record<string, string>>(response, {});
            const segments = renderClozeSegments(stripHtmlTags(question.prompt));
            if (!segments.some((s) => s.type === 'gap')) return NO_RESPONSE;
            return segments
                .map((s) => (s.type === 'text' ? s.text : `[${(answers[s.gap.index] ?? '').trim() || '___'}]`))
                .join('');
        }
        case 'error-correction': {
            const picks = parseErrorPicks(response);
            const picked = parseErrorPassage(question.errorPassage ?? '').flatMap((s) =>
                s.type === 'fragment' && s.index in picks
                    ? [`${s.text}${picks[s.index]?.trim() ? ` → ${picks[s.index].trim()}` : ''}`]
                    : []
            );
            return picked.length > 0 ? picked.join('; ') : NO_RESPONSE;
        }
        case 'sentence-builder': {
            const words = parsePlacedWords(response);
            return words.length > 0 ? words.join(' ') : NO_RESPONSE;
        }
        case 'matrix': {
            const rows = question.matrixRows ?? [];
            if (rows.length === 0) return NO_RESPONSE;
            const answers = parseJson<Record<string, string>>(response, {});
            const columns = new Map((question.matrixColumns ?? []).map((c) => [c.id, c.text]));
            return rows.map((r) => `${r.text} → ${columns.get(answers[r.id]) ?? '___'}`).join('; ');
        }
        case 'matching': {
            const pairs = question.matchingPairs ?? [];
            if (pairs.length === 0) return NO_RESPONSE;
            const answers = parseJson<Record<string, string>>(response, {});
            const rightById = matchingRightById(question);
            return pairs
                .map(
                    (p) => `${plainInlineScript(p.left)} → ${plainInlineScript(rightById.get(answers[p.id]) ?? '___')}`
                )
                .join('; ');
        }
        case 'ordering': {
            const items = question.orderItems ?? [];
            if (items.length === 0) return NO_RESPONSE;
            const byId = new Map(items.map((i) => [i.id, i]));
            return parseJson<string[]>(response, [])
                .map((id) => plainInlineScript(byId.get(id)?.text ?? '?'))
                .join(' → ');
        }
        case 'categorize': {
            const items = question.categorizeItems ?? [];
            if (items.length === 0) return NO_RESPONSE;
            const answers = parseJson<Record<string, string>>(response, {});
            const cats = new Map((question.categories ?? []).map((c) => [c.id, c.label]));
            return items.map((it) => `${plainInlineScript(it.text)} → ${cats.get(answers[it.id]) ?? '___'}`).join('; ');
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
            return parseAudioResponse(response) ? tx('audio_response') : NO_RESPONSE;
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
                .map((o) => plainInlineScript(o.text))
                .join(', ');
        case 'true-false':
            // Match autoScoreResponse: an unset correctBoolean scores `true` as correct.
            return (question.correctBoolean ?? true)
                ? question.trueLabel?.trim() || 'True'
                : question.falseLabel?.trim() || 'False';
        case 'short-answer': {
            const accepted = question.expectedAnswers ?? (question.expectedAnswer ? [question.expectedAnswer] : []);
            return accepted.join(' / ');
        }
        case 'numeric':
            if (question.expectedNumericValue === undefined) return '';
            return [
                question.numericTolerance
                    ? `${question.expectedNumericValue} ± ${question.numericTolerance}`
                    : String(question.expectedNumericValue),
                question.numericTolerancePercent ? `± ${question.numericTolerancePercent}%` : '',
                question.numericUnit?.trim() ?? '',
            ]
                .filter(Boolean)
                .join(' ');
        case 'cloze':
        case 'cloze-dropdown':
        case 'cloze-bank':
            return renderClozeSegments(stripHtmlTags(question.prompt))
                .map((s) =>
                    s.type === 'text'
                        ? s.text
                        : `[${gapCorrectAnswers(s.gap, question.type === 'cloze-dropdown').join(' / ')}]`
                )
                .join('');
        case 'dictation':
            return question.dictationText ?? '';
        case 'error-correction':
            return parseErrorPassage(question.errorPassage ?? '')
                .flatMap((s) =>
                    s.type === 'fragment' && s.corrections.length > 0
                        ? [`${s.text} → ${s.corrections.join(' / ')}`]
                        : []
                )
                .join('; ');
        case 'sentence-builder':
            return (question.sentenceTargets ?? []).map(sentenceBuilderText).join(' / ');
        case 'key-word-transformation':
            return (question.expectedAnswers ?? []).map((a) => keyWordChunks(a).join(' + ')).join(' / ');
        case 'matrix': {
            const columns = new Map((question.matrixColumns ?? []).map((c) => [c.id, c.text]));
            return (question.matrixRows ?? [])
                .map((r) => `${r.text} → ${columns.get(r.correctColumnId) ?? '?'}`)
                .join('; ');
        }
        case 'matching':
            return (question.matchingPairs ?? [])
                .map((p) => `${plainInlineScript(p.left)} → ${plainInlineScript(p.right)}`)
                .join('; ');
        case 'ordering':
            return (question.orderItems ?? []).map((i) => plainInlineScript(i.text)).join(' → ');
        case 'categorize': {
            const cats = new Map((question.categories ?? []).map((c) => [c.id, c.label]));
            return (question.categorizeItems ?? [])
                .map((it) => `${plainInlineScript(it.text)} → ${cats.get(it.categoryId) ?? '?'}`)
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
        return estimate ? tx('placement_estimate', { level: estimate.level }) : null;
    }
    if (!test.cefrTargetLevel) return null;
    const skill = test.cefrSkill ? ` ${test.cefrSkill}` : '';
    const target: CefrLevel = test.cefrTargetLevel;
    if (!studentTest) return tx('cefr_target_only', { level: target, skill });
    const maxPoints = calcTestMaxPoints(test);
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    const adjustedPoints = rawPoints + (studentTest.adjustmentPoints ?? 0);
    const pct = calcTestPercentage(adjustedPoints, maxPoints);
    const status = pct >= achieveThreshold ? tx('achieved') : tx('not_yet');
    return tx('cefr_result', { level: target, skill, status, pct: pct.toFixed(0), threshold: achieveThreshold });
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
            prompt: stripHtmlTags(plainQuestionPromptText(q)),
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
        if (minutes >= 0) lines.push(tx('time_on_task', { minutes: minutes.toFixed(0) }));
    }
    const flags = summarizeProctorFlags(studentTest.events ?? []);
    const parts: string[] = [];
    if (flags.tabSwitchCount > 0) parts.push(tx('flag_tab_switches', { count: flags.tabSwitchCount }));
    if (flags.pasteCount > 0) parts.push(tx('flag_pastes', { count: flags.pasteCount }));
    if (flags.copyCount > 0) parts.push(tx('flag_copies', { count: flags.copyCount }));
    if (flags.cutCount > 0) parts.push(tx('flag_cuts', { count: flags.cutCount }));
    if (flags.sebActive) parts.push(tx('flag_seb'));
    if (parts.length > 0) lines.push(tx('proctor_flags', { parts: parts.join(', ') }));
    return lines;
}

/** One linked standard / CEFR descriptor / framework descriptor and the student's accuracy on it. */
export interface LinkedItemAccuracy {
    label: string;
    /** Points earned on the questions linked to this item, as a percentage of their points, 0-100 */
    accuracyPct: number;
}

/**
 * Rolls one student's per-question answers up into an accuracy percentage per linked standard, CEFR
 * descriptor or framework descriptor (grammar items, IB, Bloom's, SLO). Unanswered linked questions
 * count as zero credit, so the figure is the student's own result on that item, not a class average.
 * Sorted strongest first.
 */
export function calcLinkedItemAccuracies(questions: TestQuestion[], rows: TestAnswerRow[]): LinkedItemAccuracy[] {
    const groups = new Map<string, { label: string; earned: number; points: number }>();

    const add = (key: string, label: string, row: TestAnswerRow) => {
        const group = groups.get(key) ?? { label, earned: 0, points: 0 };
        group.earned += clamp(row.pointsEarned, 0, row.points);
        group.points += row.points;
        groups.set(key, group);
    };

    questions.forEach((question, i) => {
        const row = rows[i];
        /* v8 ignore next 1 */
        if (!row) return;
        // Imports preserve repeated links; count each item once per question so its points are not
        // added twice, while keeping contributions from different questions.
        const seen = new Set<string>();
        const addOnce = (key: string, label: string) => {
            if (seen.has(key)) return;
            seen.add(key);
            add(key, label, row);
        };
        for (const standard of question.linkedStandards ?? []) {
            addOnce(`standard:${standard.guid}`, standard.statementNotation ?? standard.description);
        }
        for (const descriptor of question.linkedCefrDescriptors ?? []) {
            addOnce(`cefr:${descriptor.descriptorId}`, descriptor.descriptionEn);
        }
        for (const descriptor of question.frameworkDescriptors ?? []) {
            addOnce(`framework:${descriptor.framework}:${descriptor.descriptorId}`, descriptor.descriptionEn);
        }
    });

    return [...groups.values()]
        .filter((group) => group.points > 0)
        .map((group) => ({ label: group.label, accuracyPct: (group.earned / group.points) * 100 }))
        .sort((a, b) => b.accuracyPct - a.accuracyPct);
}

export interface TestStudentSummaryOptions {
    className?: string;
    /** Result level shown in the summary — the student's VO track, or the school year for primary classes. */
    level?: string;
}

/**
 * Condensed plain-text summary of one student's test result: name, class, level, percentage correct
 * and one accuracy line per linked standard / CEFR descriptor / grammar item. Deliberately has no
 * question-by-question breakdown — the PDF and Word exports carry that detail.
 */
export function buildTestStudentSummary(
    test: Test,
    studentTest: StudentTest,
    student: Student | undefined,
    questions: TestQuestion[],
    options: TestStudentSummaryOptions = {}
): string {
    const maxPoints = calcTestMaxPoints(test) || questions.reduce((sum, q) => sum + (q.points ?? 0), 0);
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    const pct = calcTestPercentage(rawPoints + (studentTest.adjustmentPoints ?? 0), maxPoints);

    const lines: string[] = [`${tx('name')}: ${student?.name ?? tx('student')}`];
    if (options.className) lines.push(`${tx('class')}: ${options.className}`);
    if (options.level) lines.push(`${tx('level')}: ${options.level}`);
    if (maxPoints > 0) lines.push(`${tx('score')}: ${tx('score_correct', { pct: pct.toFixed(0) })}`);

    const linked = calcLinkedItemAccuracies(questions, buildAnswerRows(test, studentTest, questions));
    if (linked.length > 0) {
        lines.push('', tx('frameworks_grammar'));
        for (const item of linked) lines.push(`  ${item.accuracyPct.toFixed(0).padStart(3)}%  ${item.label}`);
    }

    return lines.join('\n');
}

export function matchingRightById(question: TestQuestion): Map<string, string> {
    const map = new Map<string, string>((question.matchingPairs ?? []).map((p) => [p.id, p.right]));
    (question.matchingDistractors ?? []).filter(Boolean).forEach((text, i) => map.set(`distractor-${i}`, text));
    return map;
}
