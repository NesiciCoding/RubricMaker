/**
 * Fields a teacher authors on a submission, which no student hand-in may erase.
 *
 * Everything else in the `student_tests` jsonb document describes the attempt itself (answers,
 * status, timings, placement trace), so whoever writes the attempt owns it. These fields do not
 * come from the attempt: a hand-in, a re-import or a retake that rebuilds the document field by
 * field does not know about a review flag or a class-wide adjustment, and must not drop one.
 *
 * Read by the client's sync merge (`utils/syncMerge.ts`) and by `submit-test`, which rebuilds
 * `data` from scratch for every new attempt.
 */
export const TEACHER_AUTHORED_TEST_FIELDS = ['reviewFlags', 'adjustment', 'adjustmentPoints', 'lastEditedBy'] as const;

/**
 * Copies teacher-authored fields that `target` lacks from `source` — a copy of the same row written
 * before the teacher's edit. A field the target already sets is never overwritten, and `undefined`
 * counts as not set, so a cleared-but-present value wins: `reviewFlags: []` blocks the carry of a
 * stale flag, while a source without the field can only ever add, never restore, a dismissal.
 */
export function carryTeacherAuthoredTestFields<T extends Record<string, unknown>>(
    target: T,
    source: Record<string, unknown> | null | undefined
): T {
    if (!source) return target;
    let merged = target;
    for (const field of TEACHER_AUTHORED_TEST_FIELDS) {
        if (merged[field] === undefined && source[field] !== undefined) {
            merged = { ...merged, [field]: source[field] } as T;
        }
    }
    return merged;
}
