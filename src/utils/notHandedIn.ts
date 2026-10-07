import type { StudentRubric } from '../types';

/** True when the teacher scored anything: a level, an override, or a sub-item. */
export function hasAnyScore(sr: Pick<StudentRubric, 'entries'>): boolean {
    return sr.entries.some(
        (e) =>
            e.levelId != null ||
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

/** On save: a scored grade means the work was handed in after all, so the mark goes. */
export function clearNotHandedInIfScored(sr: StudentRubric, canned: string): StudentRubric {
    return sr.notHandedIn && hasAnyScore(sr) ? clearNotHandedIn(sr, canned) : sr;
}
