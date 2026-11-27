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
export const TEACHER_AUTHORED_TEST_FIELDS = [
    'reviewFlags',
    'adjustment',
    'adjustmentPoints',
    'adjustmentRevertedAt',
    'lastEditedBy',
] as const;

/** What a class-average adjustment writes; a recorded revert blocks both. */
const ADJUSTMENT_FIELDS: readonly string[] = ['adjustment', 'adjustmentPoints'];

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
    const merged: Record<string, unknown> = { ...target };

    // The revert marker travels before the fields it governs, so a clear recorded on the copy being
    // replaced still blocks the adjustment it removed.
    if (merged.adjustmentRevertedAt === undefined && source.adjustmentRevertedAt !== undefined) {
        merged.adjustmentRevertedAt = source.adjustmentRevertedAt;
    }

    for (const field of TEACHER_AUTHORED_TEST_FIELDS) {
        if (merged[field] !== undefined || source[field] === undefined) continue;
        if (ADJUSTMENT_FIELDS.includes(field) && adjustmentWasCleared(merged)) continue;
        merged[field] = source[field];
    }
    return merged as T;
}

/**
 * Whether an adjustment was deliberately removed rather than never authored.
 *
 * Only the revert marker can say so. A newer copy that merely lacks the fields is exactly the
 * hand-in/retake case these fields exist to survive, and a row whose adjustment was reverted before
 * the marker existed is indistinguishable from one that never had an adjustment, so it keeps the
 * old behaviour — the carry could put that adjustment back. Every revert written from now on
 * records the marker, which makes the clear an edit a stale copy cannot undo.
 */
function adjustmentWasCleared(target: Record<string, unknown>): boolean {
    return target.adjustmentRevertedAt !== undefined;
}
