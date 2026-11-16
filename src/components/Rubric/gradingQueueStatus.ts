import type { StudentRubric } from '../../types';
import { countScoredEntries } from '../../utils/gradeCalc';

export type QueueStudentStatus = 'graded' | 'inProgress' | 'ungraded' | 'notHandedIn';

/** Badge class for each queue status, shared by the card and list views. */
export const QUEUE_STATUS_BADGE: Record<QueueStudentStatus, string> = {
    graded: 'badge-green',
    inProgress: 'badge-purple',
    ungraded: 'badge-blue',
    notHandedIn: 'badge-yellow',
};

/** Translation key for each queue status. */
export const QUEUE_STATUS_LABEL: Record<QueueStudentStatus, string> = {
    graded: 'rubricQueue.graded',
    inProgress: 'rubricQueue.in_progress',
    ungraded: 'rubricQueue.not_graded',
    notHandedIn: 'rubricQueue.not_handed_in',
};

export interface QueueProgress {
    scored: number;
    total: number;
}

export function queueProgress(
    studentRubric: Pick<StudentRubric, 'entries' | 'rubricSnapshot'> | undefined,
    totalCriteria: number
): QueueProgress {
    // A record is graded against the rubric version saved with it, so it is judged against that.
    const snapshotTotal = studentRubric?.rubricSnapshot?.criteria.length;
    return { scored: studentRubric ? countScoredEntries(studentRubric) : 0, total: snapshotTotal ?? totalCriteria };
}

/**
 * One status per roster student. "Graded" uses the grading screen's completion rule (every
 * criterion scored), so a half-scored record reads as in progress on both surfaces. "Not handed
 * in" always wins because it is set deliberately. A saved record with no complete score set,
 * feedback-only ones included, is in progress: it never silently counts as finished.
 */
export function queueStatus(studentRubric: StudentRubric | undefined, totalCriteria: number): QueueStudentStatus {
    if (!studentRubric) return 'ungraded';
    if (studentRubric.notHandedIn) return 'notHandedIn';
    const { scored, total } = queueProgress(studentRubric, totalCriteria);
    if (total > 0 && scored === total && !studentRubric.feedbackOnly) return 'graded';
    if (total === 0 && studentRubric.gradedAt) return 'graded';
    if (scored > 0 || studentRubric.gradedAt) return 'inProgress';
    return 'ungraded';
}
