import type { CefrLevel, StudentTest, TestQuestion, TestSection } from '../types';
import { stripHtmlTags } from './exportDataPrep';

export type TestQualityCheckId =
    | 'time_over'
    | 'time_short'
    | 'time_rough_over'
    | 'time_rough_short'
    | 'cefr_off_target'
    | 'no_points'
    | 'duplicate_options'
    | 'no_distractor';

export interface TestQualityFinding {
    id: TestQualityCheckId;
    /** Questions the hint is about, empty when it is about the test as a whole. */
    questionIds: string[];
    /** The same questions numbered as students see them (1-based, in the order given). */
    numbers: number[];
    values?: Record<string, string | number>;
}

export interface TestQualityInput {
    questions: TestQuestion[];
    sections?: TestSection[];
    /** Configured time limit; the time hints are absent without one. */
    durationMinutes?: number;
    /** The test's CEFR target; the CEFR hint is absent without one. */
    cefrTargetLevel?: CefrLevel;
    /** How long submitted sittings of this test actually took, in minutes. */
    attemptMinutes?: number[];
}

/** How far the duration may drift from the configured limit before it is flagged, as a fraction. */
export const QUALITY_TIME_TOLERANCE = 0.2;
/** Reading speed the rough estimate assumes for a section passage. */
export const ROUGH_WORDS_PER_MINUTE = 120;
/** Answering time the rough estimate assumes per question, in minutes. */
export const ROUGH_MINUTES_PER_QUESTION = 1;

// A sitting left open overnight is not a duration anyone can learn from.
const MAX_ATTEMPT_MINUTES = 24 * 60;

const countWords = (text: string | undefined): number =>
    text ? stripHtmlTags(text).trim().split(/\s+/).filter(Boolean).length : 0;

const normalizeText = (text: string | undefined): string =>
    stripHtmlTags(text ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

function medianOf(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * A rough duration for a test nobody has sat yet: a minute per question plus a minute per 120 words
 * of passage. Deliberately coarse — once the test has been taken, the median of real sittings says
 * what it takes and this number is no longer used.
 */
export function roughTestMinutes(questions: TestQuestion[], sections: TestSection[] = []): number {
    const passageWords = sections.reduce((sum, section) => sum + countWords(section.content), 0);
    const minutes = questions.length * ROUGH_MINUTES_PER_QUESTION + passageWords / ROUGH_WORDS_PER_MINUTE;
    return Math.max(1, Math.round(minutes));
}

/** How long each submitted sitting of this test took, in minutes, from its start and submit stamps. */
export function attemptDurationsMinutes(
    attempts: Pick<StudentTest, 'testId' | 'status' | 'startedAt' | 'submittedAt'>[],
    testId: string
): number[] {
    return attempts.flatMap((attempt) => {
        if (attempt.testId !== testId || attempt.status === 'in_progress' || !attempt.submittedAt) return [];
        const minutes = (Date.parse(attempt.submittedAt) - Date.parse(attempt.startedAt)) / 60000;
        return Number.isFinite(minutes) && minutes > 0 && minutes <= MAX_ATTEMPT_MINUTES ? [minutes] : [];
    });
}

/**
 * Non-blocking hints about test quality, derived from the test as written and from its sittings:
 * nothing here is stored and nothing prevents a save. Each hint names the questions it belongs to so
 * the checks screen can link to them.
 */
export function testQualityChecks({
    questions,
    sections = [],
    durationMinutes,
    cefrTargetLevel,
    attemptMinutes = [],
}: TestQualityInput): TestQualityFinding[] {
    const findings: TestQualityFinding[] = [];

    if (questions.length > 0 && durationMinutes && durationMinutes > 0) {
        const measured = medianOf(attemptMinutes);
        const minutes = measured === null ? roughTestMinutes(questions, sections) : Math.round(measured);
        const values = { minutes, duration: durationMinutes };
        // The two ids keep the panel honest about its source: a measured median is what the class
        // actually needed, the item-count estimate is a guess until the first sitting.
        if (minutes > durationMinutes * (1 + QUALITY_TIME_TOLERANCE)) {
            findings.push({
                id: measured === null ? 'time_rough_over' : 'time_over',
                questionIds: [],
                numbers: [],
                values,
            });
        } else if (minutes < durationMinutes * (1 - QUALITY_TIME_TOLERANCE)) {
            findings.push({
                id: measured === null ? 'time_rough_short' : 'time_short',
                questionIds: [],
                numbers: [],
                values,
            });
        }
    }

    if (cefrTargetLevel) {
        const offTarget = questions.filter((q) =>
            (q.linkedCefrDescriptors ?? []).some((descriptor) => descriptor.level !== cefrTargetLevel)
        );
        if (offTarget.length > 0) {
            findings.push({
                id: 'cefr_off_target',
                questionIds: offTarget.map((q) => q.id),
                numbers: [],
                values: { count: offTarget.length, total: questions.length, target: cefrTargetLevel },
            });
        }
    }

    questions.forEach((q, index) => {
        const number = index + 1;
        if (!(q.points > 0)) {
            findings.push({ id: 'no_points', questionIds: [q.id], numbers: [number], values: { number } });
        }
        if (q.type === 'multiple-choice' || q.type === 'multiple-response') {
            const options = q.options ?? [];
            const texts = options.map((o) => normalizeText(o.text)).filter(Boolean);
            if (new Set(texts).size < texts.length) {
                findings.push({ id: 'duplicate_options', questionIds: [q.id], numbers: [number], values: { number } });
            }
            if (q.type === 'multiple-choice' && options.length >= 2 && options.every((o) => o.isCorrect)) {
                findings.push({ id: 'no_distractor', questionIds: [q.id], numbers: [number], values: { number } });
            }
        }
    });

    return findings;
}
