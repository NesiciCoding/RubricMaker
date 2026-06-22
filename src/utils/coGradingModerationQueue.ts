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
 * `gradedBy` not matching any known student id — there is no dedicated field for this.
 * ponytail: heuristic ceiling — if a colleague's chosen id ever collides with a student id
 * this misclassifies; add a dedicated `isCoGrade` flag if that becomes a real risk.
 */
export function isSecondMarkerEntry(entry: StudentRubric, students: Student[]): boolean {
    return entry.isPeerReview && !!entry.gradedBy && !students.some((s) => s.id === entry.gradedBy);
}

export function getModerationQueue(
    rubrics: Rubric[],
    studentRubrics: StudentRubric[],
    peerReviews: StudentRubric[],
    students: Student[],
    thresholdPoints: number
): ModerationQueueItem[] {
    const queue: ModerationQueueItem[] = [];

    for (const secondMarkerEntry of peerReviews) {
        if (!isSecondMarkerEntry(secondMarkerEntry, students)) continue;
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
