import type { StudentRubric } from '../types';

/** True when the teacher scored anything: a level, a single-point outcome, an override, or a sub-item. */
export function hasAnyScore(sr: Pick<StudentRubric, 'entries'>): boolean {
    return sr.entries.some(
        (e) =>
            e.levelId != null ||
            e.singlePointOutcome != null ||
            e.overridePoints != null ||
            Object.keys(e.subItemScores ?? {}).length > 0 ||
            (e.checkedSubItems?.length ?? 0) > 0
    );
}

const plain = (html: string) =>
    html
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Whether the overall comment is just the canned "Not handed in" text (any markup ignored). */
export function isCannedNotHandedInComment(comment: string, canned: string): boolean {
    return plain(comment) === plain(canned);
}

/** Marks the work not handed in, keeping a real overall comment and only filling an empty one. */
export function markNotHandedIn(sr: StudentRubric, canned: string): StudentRubric {
    return { ...sr, notHandedIn: true, overallComment: plain(sr.overallComment) ? sr.overallComment : canned };
}

/** Clears the not-handed-in mark and the canned comment it added. */
export function clearNotHandedIn(sr: StudentRubric, canned: string): StudentRubric {
    return {
        ...sr,
        notHandedIn: false,
        overallComment: isCannedNotHandedInComment(sr.overallComment, canned) ? '' : sr.overallComment,
    };
}

function scoreSignature(sr: Pick<StudentRubric, 'entries'>): string {
    return JSON.stringify(
        sr.entries.map((e) => [
            e.criterionId,
            e.levelId ?? null,
            e.singlePointOutcome ?? null,
            e.overridePoints ?? null,
            e.selectedPoints ?? null,
            Object.entries(e.subItemScores ?? {}).sort(([a], [b]) => a.localeCompare(b)),
            [...(e.checkedSubItems ?? [])].sort(),
        ])
    );
}

/**
 * On save: work scored after it was marked means it was handed in after all, so the mark goes.
 * Scores the record already had when it was saved as not handed in (`saved`) don't count, so
 * saving feedback on a confirmed mark keeps it.
 */
export function clearNotHandedInIfScored(sr: StudentRubric, canned: string, saved?: StudentRubric): StudentRubric {
    if (!sr.notHandedIn || !hasAnyScore(sr)) return sr;
    if (saved?.notHandedIn && scoreSignature(saved) === scoreSignature(sr)) return sr;
    return clearNotHandedIn(sr, canned);
}
