import type { GradeScale, Rubric, ScoreEntry } from '../types';
import { keepExistingTicks, subItemMode } from './subItems';

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
 * Comments and evidence stay with their criterion. Entries for criteria the new version drops are
 * kept as historical data rather than deleted, so their feedback/evidence survives the regrade.
 */
export function remapEntriesToRubric(
    entries: ScoreEntry[],
    rubric: Rubric
): { entries: ScoreEntry[]; clearedCount: number; removedCount: number } {
    const isSinglePoint = rubric.scoringMode === 'single-point';
    const currentIds = new Set(rubric.criteria.map((c) => c.id));
    let clearedCount = 0;
    const remapped = rubric.criteria.map((criterion): ScoreEntry => {
        const found = entries.find((e) => e.criterionId === criterion.id);
        if (!found) return { criterionId: criterion.id, levelId: null, comment: '', checkedSubItems: [] };
        const isChecklist = subItemMode(criterion) === 'checklist';
        // A single-point outcome only scores while the destination rubric is still single-point.
        const entry =
            !isSinglePoint && found.singlePointOutcome !== undefined
                ? { ...found, singlePointOutcome: undefined }
                : found;
        if (!entry.levelId) {
            return isChecklist
                ? { ...entry, checkedSubItems: keepExistingTicks(criterion, entry.checkedSubItems ?? []) }
                : entry;
        }
        const level = criterion.levels.find((l) => l.id === entry.levelId);
        if (!level) {
            clearedCount++;
            return {
                ...entry,
                levelId: null,
                selectedPoints: undefined,
                // A cleared level must not stay scored through a manual override.
                overridePoints: undefined,
                checkedSubItems: isChecklist ? keepExistingTicks(criterion, entry.checkedSubItems ?? []) : [],
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
            checkedSubItems: isChecklist
                ? keepExistingTicks(criterion, entry.checkedSubItems ?? [])
                : entry.checkedSubItems.filter((id) => subItemIds.has(id)),
            subItemScores,
        };
    });
    // Keep entries whose criterion the new rubric no longer has: scoring ignores them (it walks the
    // rubric's criteria), but their comment, evidence and audio are not destroyed by the regrade.
    const removed = entries.filter((e) => !currentIds.has(e.criterionId));
    return { entries: [...remapped, ...removed], clearedCount, removedCount: removed.length };
}
