import type { RubricCriterion, RubricLevel, ScoreEntry, SubItem, SubItemMode } from '../types';
import { nanoid } from './nanoid';

type SubItemState = Pick<ScoreEntry, 'subItemScores' | 'checkedSubItems'>;

/** Anything but 'checklist' — including an unknown value from an imported file — scores as points. */
export function subItemMode(criterion: Pick<RubricCriterion, 'subItemMode'>): SubItemMode {
    return criterion.subItemMode === 'checklist' ? 'checklist' : 'points';
}

/**
 * Whether a criterion's sub-items feed its score: points mode with at least one sub-item on any level.
 * Records saved by older versions can lack `subItems` on a level.
 */
export function scoresSubItems(criterion: Pick<RubricCriterion, 'subItemMode' | 'levels'>): boolean {
    return subItemMode(criterion) === 'points' && criterion.levels.some((l) => (l.subItems?.length ?? 0) > 0);
}

/** A blank sub-item; checklist items carry no points. */
export function createSubItem(mode: SubItemMode, label = ''): SubItem {
    return mode === 'points' ? { id: nanoid(), label, points: 1, minPoints: 0, maxPoints: 1 } : { id: nanoid(), label };
}

/** Point range of a points-mode sub-item; `points` is the pre-range single value older records carry. */
export function subItemRange(si: SubItem): { min: number; max: number } {
    return { min: si.minPoints ?? 0, max: si.maxPoints ?? si.points ?? 0 };
}

/** A points-mode sub-item's explicit score, or a legacy tick worth its maximum; undefined when it was never scored. */
export function subItemScore(entry: SubItemState, si: SubItem): number | undefined {
    const score = entry.subItemScores?.[si.id];
    if (score !== undefined) return score;
    return (entry.checkedSubItems ?? []).includes(si.id) ? subItemRange(si).max : undefined;
}

/** Points a sub-item contributes to calcEntryPoints: an unscored item counts 0, not its minimum. */
export function subItemEarned(entry: SubItemState, si: SubItem): number {
    return subItemScore(entry, si) ?? 0;
}

export function isTicked(entry: Pick<ScoreEntry, 'checkedSubItems'>, subItemId: string): boolean {
    return (entry.checkedSubItems ?? []).includes(subItemId);
}

export function toggleTick(entry: Pick<ScoreEntry, 'checkedSubItems'>, subItemId: string): string[] {
    const ticks = entry.checkedSubItems ?? [];
    return ticks.includes(subItemId) ? ticks.filter((id) => id !== subItemId) : [...ticks, subItemId];
}

export interface SubItemBreakdown {
    base: number;
    items: number;
    total: number;
    /** The level's range cut base + items down (or up) to `total`. */
    clamped: boolean;
}

/** How calcEntryPoints arrives at a points-mode level's score, for showing the sum to the teacher. */
export function subItemBreakdown(entry: ScoreEntry, level: RubricLevel): SubItemBreakdown {
    const base = entry.selectedPoints ?? level.minPoints;
    const items = level.subItems.reduce((sum, si) => sum + subItemEarned(entry, si), 0);
    const total = Math.max(level.minPoints, Math.min(base + items, level.maxPoints));
    return { base, items, total, clamped: total !== base + items };
}

/**
 * The level whose checklist best describes the work: the highest share of its sub-items ticked. Ties go to the
 * lower-scoring level, so an even split never rounds a student up. Null until something is ticked.
 */
export function bestFitLevel(
    criterion: Pick<RubricCriterion, 'levels'>,
    entry: Pick<ScoreEntry, 'checkedSubItems'>,
    visible: (si: SubItem) => boolean = () => true
): RubricLevel | null {
    let best: { level: RubricLevel; share: number } | null = null;
    const byPointsAsc = [...criterion.levels].sort((a, b) => a.minPoints - b.minPoints);
    for (const level of byPointsAsc) {
        const items = level.subItems.filter(visible);
        if (items.length === 0) continue;
        const share = items.filter((si) => isTicked(entry, si.id)).length / items.length;
        if (share > 0 && (!best || share > best.share)) best = { level, share };
    }
    return best?.level ?? null;
}

/** Ticked / total for a level's checklist, for compact displays such as grid cells. */
export function tickCount(
    level: RubricLevel,
    entry: Pick<ScoreEntry, 'checkedSubItems'>
): { ticked: number; total: number } {
    return {
        ticked: level.subItems.filter((si) => isTicked(entry, si.id)).length,
        total: level.subItems.length,
    };
}

/** Ticks that still point at a sub-item somewhere in the criterion — checklist ticks span every level. */
export function keepExistingTicks(criterion: Pick<RubricCriterion, 'levels'>, ticks: string[]): string[] {
    const ids = new Set(criterion.levels.flatMap((l) => l.subItems.map((si) => si.id)));
    return ticks.filter((id) => ids.has(id));
}

const LIST_MARKER = /^\s*(?:[☐☑☒□■▪◦•‣·*–—-]|\(?(?:\d{1,2}|[a-zA-Z])[.)])\s+/u;

/** A pasted or typed line without its bullet, checkbox or numbering. */
export function stripListMarker(line: string): string {
    return line.replace(LIST_MARKER, '').trim();
}

/** One sub-item label per non-empty line of a pasted list or level description. */
export function splitIntoSubItemLabels(text: string): string[] {
    return text
        .split(/\r?\n/)
        .map(stripListMarker)
        .filter((line) => line.length > 0);
}
