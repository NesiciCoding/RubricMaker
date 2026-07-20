import type {
    RubricCriterion,
    RubricLevel,
    RubricFormat,
    ScoreEntry,
    GradeScale,
    GradeRange,
    StudentRubric,
    Modifier,
    Rubric,
} from '../types';

// ─── Score Calculation ─────────────────────────────────────────────────────────

/** A criterion's levels in display order — reversed when the rubric format is 'worst-first'. */
export function orderedLevels(criterion: RubricCriterion, format: Pick<RubricFormat, 'levelOrder'>): RubricLevel[] {
    return format.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;
}

/**
 * Points earned for a single criterion entry.
 * Priority: overridePoints > sub-items sum + selected range points > level midpoint
 */
export function calcEntryPoints(entry: ScoreEntry, criterion: RubricCriterion): number {
    if (entry.overridePoints !== undefined) return entry.overridePoints;
    // Single-point rubric outcome: meets/exceeds = full points, not-yet = 0
    if (entry.singlePointOutcome !== undefined) {
        if (entry.singlePointOutcome === 'not-yet') return 0;
        const maxPts = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
        return maxPts;
    }
    if (!entry.levelId) return 0;

    const level = criterion.levels.find((l) => l.id === entry.levelId);
    if (!level) return 0;

    // Sub-items: only count scores for the SELECTED level's sub-items.
    // Iterating all levels would inflate the score with stale subItemScores
    // left over from previously selected levels (e.g. after comparative grading
    // changes a student's level, old scores must not carry over).
    const subItemTotal = level.subItems.reduce((sum, si) => {
        if (entry.subItemScores && entry.subItemScores[si.id] !== undefined) {
            return sum + entry.subItemScores[si.id];
        }
        // Fallback for older rubrics/entries that used strict checkboxes
        if (entry.checkedSubItems.includes(si.id)) {
            return sum + (si.maxPoints ?? si.points ?? 0);
        }
        return sum;
    }, 0);

    // selectedPoints: teacher chosen value within [min, max] range
    const rangePoints = entry.selectedPoints ?? level.minPoints;

    const hasAnySubItems = criterion.levels.some((l) => l.subItems.length > 0);

    // If criterion has sub-items: combined sub-item total + range points, capped at selected level's maxPoints
    // If no sub-items at all: just range points (bounded by the level range)
    if (hasAnySubItems) {
        return Math.min(subItemTotal + rangePoints, level.maxPoints);
    }
    return Math.max(level.minPoints, Math.min(level.maxPoints, rangePoints));
}

/** Raw sum of selected level points (honouring sub-items and ranges) */
export function calcRawScore(entries: ScoreEntry[], criteria: RubricCriterion[]): number {
    let total = 0;
    for (const entry of entries) {
        const criterion = criteria.find((c) => c.id === entry.criterionId);
        if (!criterion) continue;
        total += calcEntryPoints(entry, criterion);
    }
    return total;
}

/** Maximum possible raw score (uses maxPoints per level) */
export function calcMaxRawScore(criteria: RubricCriterion[]): number {
    return criteria.reduce((sum, c) => {
        const max = Math.max(...c.levels.map((l) => l.maxPoints), 0);
        return sum + max;
    }, 0);
}

/** Maximum points for a single criterion (uses maxPoints per level) */
export function criterionMaxPoints(criterion: RubricCriterion): number {
    return Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
}

/** Percentage 0–100 a single scored entry earned against its criterion's max points */
export function criterionPercentage(entry: ScoreEntry | undefined, criterion: RubricCriterion): number {
    const max = criterionMaxPoints(criterion);
    if (max === 0) return 0;
    if (!entry) return 0;
    return (calcEntryPoints(entry, criterion) / max) * 100;
}

/** Weighted score as percentage 0–100 */
export function calcWeightedScore(entries: ScoreEntry[], criteria: RubricCriterion[]): number {
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
    if (totalWeight === 0) return calcPercentage(entries, criteria);

    let weightedSum = 0;
    for (const criterion of criteria) {
        const entry = entries.find((e) => e.criterionId === criterion.id);
        const maxPoints = Math.max(...criterion.levels.map((l) => l.maxPoints), 0);
        if (maxPoints === 0) continue;

        const pts = entry ? calcEntryPoints(entry, criterion) : 0;
        weightedSum += (pts / maxPoints) * criterion.weight;
    }
    return (weightedSum / totalWeight) * 100;
}

/** Percentage of raw score over maximum */
export function calcPercentage(entries: ScoreEntry[], criteria: RubricCriterion[]): number {
    const max = calcMaxRawScore(criteria);
    if (max === 0) return 0;
    return (calcRawScore(entries, criteria) / max) * 100;
}

// ─── Modifier ─────────────────────────────────────────────────────────────────

export function applyModifier(score: number, modifier?: Modifier): number {
    if (!modifier) return score;
    switch (modifier.type) {
        case 'percentage':
            return Math.min(100, Math.max(0, score + modifier.value));
        case 'points':
            return Math.min(100, Math.max(0, score + modifier.value));
        case 'level':
            return Math.min(100, Math.max(0, score + modifier.value * 10));
        default:
            return score;
    }
}

// ─── Letter Grade ─────────────────────────────────────────────────────────────

// Sorted descending by min, first range where score >= range.min wins.
// Using >= min only (no upper bound) prevents float scores like 89.7% from
// falling in the gap between integer-bounded ranges (e.g. B: 80–89, A: 90–100).
function matchRange(percentage: number, scale: GradeScale): GradeRange | undefined {
    const sorted = [...scale.ranges].sort((a, b) => b.min - a.min);
    return sorted.find((r) => percentage >= r.min);
}

export function calcLetterGrade(percentage: number, scale: GradeScale): string {
    return matchRange(percentage, scale)?.label ?? '—';
}

export function calcGradeColor(percentage: number, scale: GradeScale): string {
    return matchRange(percentage, scale)?.color ?? '#6b7280';
}

// ─── Student Rubric Summary ───────────────────────────────────────────────────

export interface GradeSummary {
    rawScore: number;
    maxRawScore: number;
    configuredMaxPoints: number; // rubric.totalMaxPoints or calcMaxRawScore
    percentage: number;
    modifiedPercentage: number;
    letterGrade: string;
    gradeColor: string;
    gradedCount: number;
    totalCriteria: number;
}

export function calcGradeSummary(
    sr: StudentRubric,
    criteria: RubricCriterion[],
    scale: GradeScale | null,
    rubric?: Pick<Rubric, 'scoringMode' | 'totalMaxPoints'>
): GradeSummary {
    const raw = calcRawScore(sr.entries, criteria);
    const calculatedMax = calcMaxRawScore(criteria);

    // In 'total-points' mode use the teacher-configured max; otherwise use calc max
    const configuredMax =
        rubric?.scoringMode === 'total-points' && rubric.totalMaxPoints > 0 ? rubric.totalMaxPoints : calculatedMax;

    const pct =
        rubric?.scoringMode === 'total-points'
            ? configuredMax > 0
                ? (raw / configuredMax) * 100
                : 0
            : calcWeightedScore(sr.entries, criteria);

    const modified = applyModifier(pct, sr.globalModifier);
    const gradedCount = sr.entries.filter(
        (e) => e.levelId !== null || e.overridePoints !== undefined || e.singlePointOutcome !== undefined
    ).length;

    return {
        rawScore: raw,
        maxRawScore: calculatedMax,
        configuredMaxPoints: configuredMax,
        percentage: pct,
        modifiedPercentage: modified,
        letterGrade: scale ? calcLetterGrade(modified, scale) : '—',
        gradeColor: scale ? calcGradeColor(modified, scale) : '#6b7280',
        gradedCount,
        totalCriteria: criteria.length,
    };
}

// ─── Class Statistics ─────────────────────────────────────────────────────────

export interface ClassStats {
    average: number;
    median: number;
    highest: number;
    lowest: number;
    distribution: { label: string; count: number; color: string }[];
}

export function calcClassStats(summaries: GradeSummary[], scale: GradeScale | null): ClassStats {
    if (summaries.length === 0) {
        return { average: 0, median: 0, highest: 0, lowest: 0, distribution: [] };
    }
    const scores = summaries.map((s) => s.modifiedPercentage).sort((a, b) => a - b);
    const average = scores.reduce((s, v) => s + v, 0) / scores.length;
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 === 0 ? (scores[mid - 1] + scores[mid]) / 2 : scores[mid];

    const distribution = scale
        ? (() => {
              // Count each summary into exactly one bucket using the same boundary logic
              // as calcLetterGrade (sorted descending, first >= min wins).
              const counts = new Map<string, number>(scale.ranges.map((r) => [r.label, 0]));
              for (const s of summaries) {
                  const match = matchRange(s.modifiedPercentage, scale);
                  if (match) counts.set(match.label, (counts.get(match.label) ?? 0) + 1);
              }
              return [...scale.ranges]
                  .sort((a, b) => b.min - a.min)
                  .map((r) => ({ label: r.label, color: r.color, count: counts.get(r.label) ?? 0 }));
          })()
        : [];

    return { average, median, highest: scores[scores.length - 1], lowest: scores[0], distribution };
}
