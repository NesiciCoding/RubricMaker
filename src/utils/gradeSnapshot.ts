import type { GradeScale, Rubric, ScoreEntry } from '../types';

export function sameGradeScale(a: GradeScale | null | undefined, b: GradeScale | null | undefined): boolean {
    if (!a || !b) return !a && !b;
    if (a.id !== b.id || a.ranges.length !== b.ranges.length) return false;
    return a.ranges.every((r, i) => {
        const o = b.ranges[i];
        return r.min === o.min && r.max === o.max && r.label === o.label && r.color === o.color;
    });
}

/**
 * Carries a grade's entries over to another version of its rubric. Scores survive where the
 * criterion and level still exist; a removed level is cleared (its points no longer mean
 * anything), points are clamped into the level's new range, and new criteria start ungraded.
 * Comments and evidence stay with their criterion.
 */
export function remapEntriesToRubric(
    entries: ScoreEntry[],
    rubric: Rubric
): { entries: ScoreEntry[]; clearedCount: number } {
    let clearedCount = 0;
    const remapped = rubric.criteria.map((criterion): ScoreEntry => {
        const entry = entries.find((e) => e.criterionId === criterion.id);
        if (!entry) return { criterionId: criterion.id, levelId: null, comment: '', checkedSubItems: [] };
        if (!entry.levelId) return entry;
        const level = criterion.levels.find((l) => l.id === entry.levelId);
        if (!level) {
            clearedCount++;
            return {
                ...entry,
                levelId: null,
                selectedPoints: undefined,
                checkedSubItems: [],
                subItemScores: undefined,
            };
        }
        const subItemIds = new Set(level.subItems.map((s) => s.id));
        const subItemScores = entry.subItemScores
            ? Object.fromEntries(Object.entries(entry.subItemScores).filter(([id]) => subItemIds.has(id)))
            : undefined;
        return {
            ...entry,
            selectedPoints:
                entry.selectedPoints === undefined
                    ? undefined
                    : Math.min(level.maxPoints, Math.max(level.minPoints, entry.selectedPoints)),
            checkedSubItems: entry.checkedSubItems.filter((id) => subItemIds.has(id)),
            subItemScores,
        };
    });
    return { entries: remapped, clearedCount };
}
