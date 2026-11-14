import type { StudentRubric } from '../../types';

export type QueueStudentStatus = 'graded' | 'ungraded' | 'notHandedIn';

/** Badge class for each queue status, shared by the card and list views. */
export const QUEUE_STATUS_BADGE: Record<QueueStudentStatus, string> = {
    graded: 'badge-green',
    ungraded: 'badge-blue',
    notHandedIn: 'badge-yellow',
};

/** Translation key for each queue status. */
export const QUEUE_STATUS_LABEL: Record<QueueStudentStatus, string> = {
    graded: 'rubricQueue.graded',
    ungraded: 'rubricQueue.not_graded',
    notHandedIn: 'rubricQueue.not_handed_in',
};

/**
 * One status per roster student. A student counts as graded as soon as any criterion has a level,
 * matching the rest of the app; "not handed in" always wins because it is set deliberately.
 */
export function queueStatus(studentRubric: StudentRubric | undefined): QueueStudentStatus {
    if (studentRubric?.notHandedIn) return 'notHandedIn';
    if (studentRubric && (studentRubric.gradedAt || studentRubric.entries.some((e) => e.levelId !== null))) {
        return 'graded';
    }
    return 'ungraded';
}
