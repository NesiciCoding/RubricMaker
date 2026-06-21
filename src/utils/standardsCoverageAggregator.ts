import type { Class, LinkedStandard, Rubric, Student, StudentRubric } from '../types';
import { getClassGoalScores } from './learningGoalsAggregator';

export interface StandardCoverageEntry {
    guid: string;
    statementNotation?: string;
    description: string;
    standardSetTitle: string;
    jurisdictionTitle: string;
    assessed: boolean;
    rubricCount: number;
    averagePercentage: number;
}

export interface ClassStandardsCoverage {
    covered: StandardCoverageEntry[];
    gap: StandardCoverageEntry[];
}

/** Rubrics considered "in scope" for a class: explicitly linked ones, or all rubrics if none are linked. */
function getRubricsForClass(cls: Class | undefined, rubrics: Rubric[]): Rubric[] {
    if (!cls?.rubricIds || cls.rubricIds.length === 0) return rubrics;
    const ids = new Set(cls.rubricIds);
    return rubrics.filter((r) => ids.has(r.id));
}

function collectLinkedStandards(rubrics: Rubric[]): Map<string, LinkedStandard> {
    const roster = new Map<string, LinkedStandard>();
    for (const rubric of rubrics) {
        for (const criterion of rubric.criteria) {
            if (criterion.linkedStandard) roster.set(criterion.linkedStandard.guid, criterion.linkedStandard);
            criterion.linkedStandards?.forEach((s) => roster.set(s.guid, s));
            for (const level of criterion.levels) {
                for (const subItem of level.subItems) {
                    subItem.linkedStandards?.forEach((s) => roster.set(s.guid, s));
                }
            }
        }
    }
    return roster;
}

/**
 * Cross-references every standard linked anywhere in a class's rubrics (the roster) against the
 * standards that class has actually been graded on (via getClassGoalScores), splitting the roster
 * into covered (assessed at least once) and gap (never assessed) standards.
 */
export function getClassStandardsCoverage(
    classId: string,
    classes: Class[],
    students: Student[],
    studentRubrics: StudentRubric[],
    rubrics: Rubric[]
): ClassStandardsCoverage {
    const cls = classes.find((c) => c.id === classId);
    const roster = collectLinkedStandards(getRubricsForClass(cls, rubrics));
    const assessed = new Map(getClassGoalScores(classId, students, studentRubrics, rubrics).map((a) => [a.guid, a]));

    const covered: StandardCoverageEntry[] = [];
    const gap: StandardCoverageEntry[] = [];

    for (const std of roster.values()) {
        const agg = assessed.get(std.guid);
        const entry: StandardCoverageEntry = {
            guid: std.guid,
            statementNotation: std.statementNotation,
            description: std.description,
            standardSetTitle: std.standardSetTitle,
            jurisdictionTitle: std.jurisdictionTitle,
            assessed: !!agg,
            rubricCount: agg ? new Set(agg.history.map((h) => h.rubricId)).size : 0,
            averagePercentage: agg?.averagePercentage ?? 0,
        };
        (agg ? covered : gap).push(entry);
    }

    const byNotation = (a: StandardCoverageEntry, b: StandardCoverageEntry) =>
        (a.statementNotation ?? a.description).localeCompare(b.statementNotation ?? b.description);
    covered.sort(byNotation);
    gap.sort(byNotation);

    return { covered, gap };
}
