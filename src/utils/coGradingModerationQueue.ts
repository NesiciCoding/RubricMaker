import { Rubric, Student, StudentRubric } from '../types';
import { calcEntryPoints } from './gradeCalc';

export interface ModerationCriterionDelta {
    criterionId: string;
    title: string;
    baselinePoints: number;
    secondMarkerPoints: number;
    delta: number;
}

export interface ModerationQueueItem {
    rubricId: string;
    studentId: string;
    secondMarkerId: string;
    round: number;
    baseline: StudentRubric;
    secondMarkerEntry: StudentRubric;
    criteria: ModerationCriterionDelta[];
    totalAbsDelta: number;
}

/**
 * A second-marker grade is stored as a StudentRubric with isPeerReview=true (reusing the
 * peer-review model end to end), distinguished from a real student peer review only by
 * `gradedBy` — there is no dedicated field for this.
 *
 * `gradedBy` is a colleague profile id (UUID, picked from the school directory) when one is
 * available, or free text (legacy entries / offline mode without a Supabase school) otherwise.
 * `colleagueIds`, when provided, lets callers do exact matching against the known directory
 * instead of the student-id heuristic. Without it (e.g. no Supabase session) this falls back
 * to "not a known student id", same as before.
 */
export function isSecondMarkerEntry(entry: StudentRubric, students: Student[], colleagueIds?: string[]): boolean {
    if (!entry.isPeerReview || !entry.gradedBy) return false;
    if (colleagueIds) return colleagueIds.includes(entry.gradedBy);
    return !students.some((s) => s.id === entry.gradedBy);
}

export function getModerationQueue(
    rubrics: Rubric[],
    studentRubrics: StudentRubric[],
    peerReviews: StudentRubric[],
    students: Student[],
    thresholdPoints: number,
    colleagueIds?: string[]
): ModerationQueueItem[] {
    const queue: ModerationQueueItem[] = [];

    for (const secondMarkerEntry of peerReviews) {
        if (!isSecondMarkerEntry(secondMarkerEntry, students, colleagueIds)) continue;
        const rubric = rubrics.find((r) => r.id === secondMarkerEntry.rubricId);
        if (!rubric) continue;
        const baseline = studentRubrics.find(
            (sr) =>
                !sr.isPeerReview &&
                sr.rubricId === secondMarkerEntry.rubricId &&
                sr.studentId === secondMarkerEntry.studentId
        );
        if (!baseline) continue;

        const criteria: ModerationCriterionDelta[] = [];
        let totalAbsDelta = 0;
        for (const criterion of rubric.criteria) {
            const baselineEntry = baseline.entries.find((e) => e.criterionId === criterion.id);
            const secondEntry = secondMarkerEntry.entries.find((e) => e.criterionId === criterion.id);
            if (!baselineEntry || !secondEntry) continue;
            const baselinePoints = calcEntryPoints(baselineEntry, criterion);
            const secondMarkerPoints = calcEntryPoints(secondEntry, criterion);
            const delta = secondMarkerPoints - baselinePoints;
            totalAbsDelta += Math.abs(delta);
            criteria.push({
                criterionId: criterion.id,
                title: criterion.title,
                baselinePoints,
                secondMarkerPoints,
                delta,
            });
        }

        if (totalAbsDelta >= thresholdPoints) {
            queue.push({
                rubricId: secondMarkerEntry.rubricId,
                studentId: secondMarkerEntry.studentId,
                secondMarkerId: secondMarkerEntry.gradedBy!,
                round: secondMarkerEntry.round ?? 1,
                baseline,
                secondMarkerEntry,
                criteria,
                totalAbsDelta,
            });
        }
    }

    return queue.sort((a, b) => b.totalAbsDelta - a.totalAbsDelta);
}
