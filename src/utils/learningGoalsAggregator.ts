export interface GoalScoreInfo {
    studentId: string;
    rubricId: string;
    rubricName: string;
    gradedAt: string; // ISO date string
    earnedPoints: number;
    maxPoints: number;
    percentage: number;
    guid: string;
    title: string;
    description: string;
}

export interface LearningGoalAggregate {
    guid: string;
    title: string;
    description: string;
    history: GoalScoreInfo[];
    averagePercentage: number;
    totalEarned: number;
    totalMax: number;
}

import { Rubric, StudentRubric, LinkedStandard } from '../types';

export function getStudentGoalScores(
    studentId: string,
    studentRubrics: StudentRubric[],
    rubrics: Rubric[]
): LearningGoalAggregate[] {
    const goalMap = new Map<string, LearningGoalAggregate>();

    const studentSubmissions = studentRubrics.filter(sr => sr.studentId === studentId && sr.gradedAt);

    // Sort submissions by date
    studentSubmissions.sort((a, b) => new Date(a.gradedAt!).getTime() - new Date(b.gradedAt!).getTime());

    for (const submission of studentSubmissions) {
        const rubric = rubrics.find(r => r.id === submission.rubricId);
        if (!rubric) continue;

        // For each submission, we need to track points earned per standard
        const pointsEarnedPerStandard = new Map<string, number>();
        const maxPointsPerStandard = new Map<string, number>();
        const standardInfo = new Map<string, { title: string, description: string }>();

        // Go through each entry
        for (const entry of submission.entries) {
            const criterion = rubric.criteria.find(c => c.id === entry.criterionId);
            if (!criterion) continue;

            // Collect all standards tied to this entry (from criterion or sub-items)
            const activeStandards = new Map<string, LinkedStandard>();

            // Criterion-level standards
            if (criterion.linkedStandard) activeStandards.set(criterion.linkedStandard.guid, criterion.linkedStandard);
            if (criterion.linkedStandards) {
                criterion.linkedStandards.forEach(std => activeStandards.set(std.guid, std));
            }

            // Also check sub-items if they are checked
            let criterionEarned = 0;
            let criterionMax = 0;

            const selectedLevel = criterion.levels.find(l => l.id === entry.levelId);

            if (entry.overridePoints !== undefined) {
                // If there's an override, we just have the override points vs max points of the criterion
                criterionEarned = entry.overridePoints;
                criterionMax = Math.max(...criterion.levels.map(l => l.maxPoints));

                // Track standard scores for criterion-level
                activeStandards.forEach(std => {
                    standardInfo.set(std.guid, { title: std.statementNotation || std.guid, description: std.description });
                    pointsEarnedPerStandard.set(std.guid, (pointsEarnedPerStandard.get(std.guid) || 0) + criterionEarned);
                    maxPointsPerStandard.set(std.guid, (maxPointsPerStandard.get(std.guid) || 0) + criterionMax);
                });
            } else if (selectedLevel && selectedLevel.subItems && selectedLevel.subItems.length > 0) {
                // Sub-items based scoring
                let levelPoints = 0;
                let levelMaxPoints = 0;

                selectedLevel.subItems.forEach((si) => {
                    // Check if this sub-item is active
                    const isChecked = entry.checkedSubItems.includes(si.id);
                    const granularScore = entry.subItemScores?.[si.id];
                    let earned = 0;

                    // We need a fallback max points, try granular first, then sub item static points
                    let max = si.maxPoints ?? si.points ?? 0;
                    if (max === 0 && si.minPoints !== undefined) max = si.maxPoints || 0;

                    if (granularScore !== undefined) {
                        earned = granularScore;
                    } else if (isChecked) {
                        earned = si.points ?? max;
                    }

                    // Assign points directly to sub-item standards if any exist
                    let hasSubItemStandard = false;
                    if (si.linkedStandards && si.linkedStandards.length > 0) {
                        hasSubItemStandard = true;
                        si.linkedStandards.forEach(std => {
                            standardInfo.set(std.guid, { title: std.statementNotation || std.guid, description: std.description });
                            pointsEarnedPerStandard.set(std.guid, (pointsEarnedPerStandard.get(std.guid) || 0) + earned);
                            maxPointsPerStandard.set(std.guid, (maxPointsPerStandard.get(std.guid) || 0) + max);
                        });
                    }

                    // Add to criterion total
                    levelPoints += earned;
                    levelMaxPoints += max;

                    // If the sub-item didn't have its own standard, let the criterion standard absorb the score
                    if (!hasSubItemStandard && activeStandards.size > 0) {
                        activeStandards.forEach(std => {
                            standardInfo.set(std.guid, { title: std.statementNotation || std.guid, description: std.description });
                            pointsEarnedPerStandard.set(std.guid, (pointsEarnedPerStandard.get(std.guid) || 0) + earned);
                            maxPointsPerStandard.set(std.guid, (maxPointsPerStandard.get(std.guid) || 0) + max);
                        });
                    }
                });
            } else if (selectedLevel) {
                // Just level based scoring points
                criterionEarned = entry.selectedPoints !== undefined ? entry.selectedPoints : selectedLevel.minPoints; // use min points as fallback if no precision selected
                criterionMax = Math.max(...criterion.levels.map(l => l.maxPoints));

                activeStandards.forEach(std => {
                    standardInfo.set(std.guid, { title: std.statementNotation || std.guid, description: std.description });
                    pointsEarnedPerStandard.set(std.guid, (pointsEarnedPerStandard.get(std.guid) || 0) + criterionEarned);
                    maxPointsPerStandard.set(std.guid, (maxPointsPerStandard.get(std.guid) || 0) + criterionMax);
                });
            }
        }

        // Apply to the aggregates
        pointsEarnedPerStandard.forEach((earned, guid) => {
            const max = maxPointsPerStandard.get(guid) || 0;
            if (max === 0) return; // avoid division by zero

            const info = standardInfo.get(guid)!;
            const pct = max > 0 ? (earned / max) * 100 : 0;

            const scoreInfo: GoalScoreInfo = {
                studentId,
                rubricId: rubric.id,
                rubricName: rubric.name,
                gradedAt: submission.gradedAt!,
                earnedPoints: earned,
                maxPoints: max,
                percentage: pct,
                guid,
                title: info.title,
                description: info.description
            };

            if (!goalMap.has(guid)) {
                goalMap.set(guid, {
                    guid,
                    title: info.title,
                    description: info.description,
                    history: [],
                    averagePercentage: 0,
                    totalEarned: 0,
                    totalMax: 0
                });
            }
            const agg = goalMap.get(guid)!;
            agg.history.push(scoreInfo);
            agg.totalEarned += earned;
            agg.totalMax += max;
            agg.averagePercentage = (agg.totalEarned / agg.totalMax) * 100;
        });
    }

    return Array.from(goalMap.values());
}

export function getClassGoalScores(
    classId: string,
    students: { id: string, classId: string }[],
    studentRubrics: StudentRubric[],
    rubrics: Rubric[]
): LearningGoalAggregate[] {
    const classStudentIds = new Set(students.filter(s => s.classId === classId).map(s => s.id));
    const allAggregates = new Map<string, LearningGoalAggregate>();

    for (const studentId of classStudentIds) {
        const studentAggs = getStudentGoalScores(studentId, studentRubrics, rubrics);
        for (const agg of studentAggs) {
            if (!allAggregates.has(agg.guid)) {
                allAggregates.set(agg.guid, {
                    guid: agg.guid,
                    title: agg.title,
                    description: agg.description,
                    history: [],
                    averagePercentage: 0,
                    totalEarned: 0,
                    totalMax: 0
                });
            }
            const masterAgg = allAggregates.get(agg.guid)!;

            // Push all history points and re-sort
            masterAgg.history.push(...agg.history);
            masterAgg.history.sort((a, b) => new Date(a.gradedAt).getTime() - new Date(b.gradedAt).getTime());

            masterAgg.totalEarned += agg.totalEarned;
            masterAgg.totalMax += agg.totalMax;
            masterAgg.averagePercentage = (masterAgg.totalEarned / masterAgg.totalMax) * 100;
        }
    }

    return Array.from(allAggregates.values());
}
