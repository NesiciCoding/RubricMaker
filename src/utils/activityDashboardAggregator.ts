import type {
    Rubric,
    Test,
    EssayAssignment,
    Student,
    StudentRubric,
    StudentTest,
    Class,
    ActivityKind,
    ActivityRow,
    CellData,
    CefrLevel,
    GradeScale,
} from '../types';
import { sortByDisplayOrder } from './displayOrder';
import { calcGradeSummary } from './gradeCalc';
import { scoreTestAnswer } from './testCalc';
import { scoreStudentTest } from './studentTestScore';
import { estimatePlacement } from './placementResult';
import { CEFR_LEVELS } from '../data/cefrDescriptors';

export interface ActivityDashboardSummary {
    /** Graded pieces of work across every linked rubric/test cell and assigned essay cell. */
    graded: number;
    /** Pieces the visible grid currently expects: class size for linked work, assigned for essays. */
    expected: number;
    averageScore?: number;
    mostCommonCefrLevel?: CefrLevel;
    cefrLevelCounts: Record<CefrLevel, number>;
    byClass: Array<{
        classId: string;
        graded: number;
        expected: number;
        averageScore?: number;
    }>;
}

export function getActivityRows(rubrics: Rubric[], tests: Test[], essayAssignments: EssayAssignment[]): ActivityRow[] {
    const rubricRows: ActivityRow[] = sortByDisplayOrder(rubrics.filter((r) => !r.archivedAt)).map((r) => ({
        kind: 'rubric',
        id: r.id,
        name: r.name,
    }));
    const testRows: ActivityRow[] = sortByDisplayOrder(tests.filter((t) => !t.archivedAt)).map((t) => ({
        kind: 'test',
        id: t.id,
        name: t.name,
    }));

    const essayGroups = new Map<string, EssayAssignment>();
    for (const a of essayAssignments) {
        if (a.archivedAt || essayGroups.has(a.teacherKey)) continue;
        essayGroups.set(a.teacherKey, a);
    }
    const essayRows: ActivityRow[] = sortByDisplayOrder(Array.from(essayGroups.values())).map((a) => ({
        kind: 'essay' as ActivityKind,
        id: a.teacherKey,
        name: a.title,
    }));

    return [...rubricRows, ...testRows, ...essayRows];
}

/** Most common level, with ties broken toward the higher CEFR level (same convention as student CEFR). */
export function mostCommonCefrLevel(counts: Partial<Record<CefrLevel, number>>): CefrLevel | undefined {
    let winner: CefrLevel | undefined;
    let best = 0;
    for (const level of CEFR_LEVELS) {
        const count = counts[level] ?? 0;
        if (count >= best && count > 0) {
            winner = level;
            best = count;
        }
    }
    return winner;
}

/** A full CEFR tally so callers can add counts without undefined checks. */
function emptyLevelCounts(): Record<CefrLevel, number> {
    return { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
}

/** Average of the available scores; undefined keeps "not scored" distinct from zero. */
function mean(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Keep one record per student. A regrade replaces the earlier attempt rather than counting the
 * student twice in class totals.
 */
function latestGradedByStudent<T extends { studentId: string; gradedAt?: string; updatedAt?: string }>(rows: T[]): T[] {
    const latest = new Map<string, T>();
    for (const row of rows) {
        const previous = latest.get(row.studentId);
        if (!previous) {
            latest.set(row.studentId, row);
            continue;
        }
        const previousAt = previous.gradedAt ?? previous.updatedAt ?? '';
        const rowAt = row.gradedAt ?? row.updatedAt ?? '';
        if (rowAt >= previousAt) latest.set(row.studentId, row);
    }
    return Array.from(latest.values());
}

/** Count achieved levels from the rubric version the grade was recorded against. */
function rubricLevelCounts(sr: StudentRubric, rubric: Rubric | undefined): Partial<Record<CefrLevel, number>> {
    const source = rubric ?? sr.rubricSnapshot;
    if (!source) return {};
    const levelsByCriterion = new Map(source.criteria.map((criterion) => [criterion.id, criterion.levels]));
    const counts: Partial<Record<CefrLevel, number>> = {};
    for (const entry of sr.entries) {
        const level = levelsByCriterion.get(entry.criterionId)?.find((candidate) => candidate.id === entry.levelId);
        if (!level?.cefrLevel) continue;
        counts[level.cefrLevel] = (counts[level.cefrLevel] ?? 0) + 1;
    }
    return counts;
}

/** Count graded CEFR evidence; placement uses its routed estimate and regular tests only scored answers. */
function testLevelCounts(
    st: StudentTest,
    test: Test,
    score: ReturnType<typeof scoreStudentTest> = scoreStudentTest(test, st)
): Partial<Record<CefrLevel, number>> {
    if (test.mode === 'placement') {
        const estimate = estimatePlacement(test, st);
        return estimate ? { [estimate.level]: 1 } : {};
    }

    const sectionsById = new Map((score.scoredTest.sections ?? []).map((section) => [section.id, section]));
    const levelByQuestionId = new Map((st.levelPath ?? []).map((step) => [step.questionId, step.level]));
    const latestAnswers = new Map<string, (typeof st.answers)[number]>();
    for (const answer of st.answers) latestAnswers.set(answer.questionId, answer);

    const counts: Partial<Record<CefrLevel, number>> = {};
    for (const question of score.pathQuestions) {
        const answer = latestAnswers.get(question.id);
        if (!answer || scoreTestAnswer(question, answer) <= 0) continue;
        const level =
            levelByQuestionId.get(question.id) ??
            (question.sectionId ? sectionsById.get(question.sectionId)?.cefrLevel : undefined);
        if (!level) continue;
        counts[level] = (counts[level] ?? 0) + 1;
    }
    return counts;
}

/** Merge one record's CEFR evidence into a class tally. */
function addLevelCounts(target: Partial<Record<CefrLevel, number>>, source: Partial<Record<CefrLevel, number>>): void {
    for (const level of CEFR_LEVELS) {
        const count = source[level] ?? 0;
        if (count > 0) target[level] = (target[level] ?? 0) + count;
    }
}

/** Build the class-by-activity cells from records scoped to each class. */
export function buildDashboardMatrix(
    activities: ActivityRow[],
    classes: Class[],
    students: Student[],
    studentRubrics: StudentRubric[],
    studentTests: StudentTest[],
    essayAssignments: EssayAssignment[],
    rubrics: Rubric[] = [],
    tests: Test[] = [],
    gradeScales: GradeScale[] = [],
    defaultGradeScaleId = ''
): Record<string, Record<string, CellData>> {
    // Precompute once, outside the activity×class loops, instead of re-scanning the full source
    // arrays per cell: each student's class, per-class totals, and each source record bucketed by
    // the activity id it belongs to. A cell is then a lookup + a tally over one small bucket.
    const studentClass = new Map<string, string>();
    const totalStudentsByClass = new Map<string, number>();
    for (const cls of classes) totalStudentsByClass.set(cls.id, 0);
    for (const s of students) {
        studentClass.set(s.id, s.classId);
        const n = totalStudentsByClass.get(s.classId);
        if (n !== undefined) totalStudentsByClass.set(s.classId, n + 1);
    }
    /* v8 ignore next -- totalFor is only ever called with cls.id from `classes`, which seeds the map */
    const totalFor = (classId: string) => totalStudentsByClass.get(classId) ?? 0;

    const bucket = <T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
        const map = new Map<string, T[]>();
        for (const row of rows) {
            const key = keyOf(row);
            const list = map.get(key);
            if (list) list.push(row);
            else map.set(key, [row]);
        }
        return map;
    };
    const srByRubric = bucket(studentRubrics, (sr) => sr.rubricId);
    const stByTest = bucket(studentTests, (st) => st.testId);
    const eaByKey = bucket(essayAssignments, (a) => a.teacherKey);
    const rubricById = new Map(rubrics.map((rubric) => [rubric.id, rubric]));
    const testById = new Map(tests.map((test) => [test.id, test]));

    // Count member studentIds per class (skipping students whose class isn't in `classes`).
    const tallyByClass = (studentIds: string[]): Map<string, number> => {
        const counts = new Map<string, number>();
        for (const sid of studentIds) {
            const cls = studentClass.get(sid);
            if (cls === undefined) continue;
            counts.set(cls, (counts.get(cls) ?? 0) + 1);
        }
        return counts;
    };

    /** Resolve the scale stored on the rubric, falling back to the account default. */
    const gradeScaleFor = (rubric: Rubric | undefined): GradeScale | null => {
        if (!rubric) return null;
        return gradeScales.find((scale) => scale.id === (rubric.gradeScaleId || defaultGradeScaleId)) ?? null;
    };

    const matrix: Record<string, Record<string, CellData>> = {};
    for (const activity of activities) {
        const row: Record<string, CellData> = {};

        if (activity.kind === 'rubric') {
            const rubric = rubricById.get(activity.id);
            const submitted = tallyByClass((srByRubric.get(activity.id) ?? []).map((sr) => sr.studentId));
            const gradedByClass = new Map<string, StudentRubric[]>();
            for (const sr of srByRubric.get(activity.id) ?? []) {
                if (!sr.gradedAt || sr.notHandedIn || sr.isPeerReview) continue;
                const cls = studentClass.get(sr.studentId);
                if (cls === undefined) continue;
                const list = gradedByClass.get(cls);
                if (list) list.push(sr);
                else gradedByClass.set(cls, [sr]);
            }

            for (const cls of classes) {
                const gradedRecords = latestGradedByStudent(gradedByClass.get(cls.id) ?? []);
                const scores: number[] = [];
                const levelCounts: Partial<Record<CefrLevel, number>> = {};
                for (const sr of gradedRecords) {
                    const sourceRubric = sr.rubricSnapshot ?? rubric;
                    if (!sourceRubric) continue;
                    scores.push(
                        calcGradeSummary(sr, sourceRubric.criteria, gradeScaleFor(sourceRubric), sourceRubric)
                            .modifiedPercentage
                    );
                    const achieved = rubricLevelCounts(sr, sourceRubric);
                    const targetLevel = (rubric ?? sourceRubric).cefrTargetLevel;
                    if (Object.keys(achieved).length === 0 && targetLevel) {
                        achieved[targetLevel] = 1;
                    }
                    addLevelCounts(levelCounts, achieved);
                }

                row[cls.id] = {
                    isLinked: (cls.rubricIds ?? []).includes(activity.id),
                    submittedCount: submitted.get(cls.id) ?? 0,
                    gradedCount: gradedRecords.length,
                    averageScore: mean(scores),
                    mostCommonCefrLevel: mostCommonCefrLevel(levelCounts),
                    cefrLevelCounts: levelCounts,
                    setCefrLevel: rubric?.cefrTargetLevel,
                    totalStudents: totalFor(cls.id),
                };
            }
        } else if (activity.kind === 'test') {
            const test = testById.get(activity.id);
            const submitted = new Map<string, number>();
            const graded = new Map<string, StudentTest[]>();
            const anyByClass = new Set<string>();
            for (const st of stByTest.get(activity.id) ?? []) {
                const cls = studentClass.get(st.studentId);
                if (cls === undefined) continue;
                anyByClass.add(cls);
                if (st.status === 'submitted' || st.status === 'graded')
                    submitted.set(cls, (submitted.get(cls) ?? 0) + 1);
                if (st.absent) continue;
                if (st.status === 'graded' || st.gradedAt) {
                    const list = graded.get(cls);
                    if (list) list.push(st);
                    else graded.set(cls, [st]);
                }
            }
            for (const cls of classes) {
                const gradedRecords = latestGradedByStudent(graded.get(cls.id) ?? []);
                const scores: number[] = [];
                const levelCounts: Partial<Record<CefrLevel, number>> = {};
                if (test) {
                    for (const st of gradedRecords) {
                        const score = scoreStudentTest(test, st);
                        if (score.maxPoints > 0) scores.push(score.percentage);
                        addLevelCounts(levelCounts, testLevelCounts(st, test, score));
                    }
                }

                row[cls.id] = {
                    submittedCount: submitted.get(cls.id) ?? 0,
                    gradedCount: gradedRecords.length,
                    isLinked: anyByClass.has(cls.id),
                    averageScore: mean(scores),
                    mostCommonCefrLevel: mostCommonCefrLevel(levelCounts),
                    cefrLevelCounts: levelCounts,
                    setCefrLevel: test?.cefrTargetLevel,
                    totalStudents: totalFor(cls.id),
                };
            }
        } else {
            const assignments = eaByKey.get(activity.id) ?? [];
            const counts = tallyByClass(assignments.map((a) => a.studentId));
            const rubricId = assignments[0]?.rubricId;
            const rubric = rubricId ? rubricById.get(rubricId) : undefined;
            const assignedIdsByClass = new Map<string, Set<string>>();
            for (const assignment of assignments) {
                const cls = studentClass.get(assignment.studentId);
                if (cls === undefined) continue;
                const ids = assignedIdsByClass.get(cls);
                if (ids) ids.add(assignment.studentId);
                else assignedIdsByClass.set(cls, new Set([assignment.studentId]));
            }
            const gradedByClass = new Map<string, StudentRubric[]>();
            for (const sr of rubricId ? (srByRubric.get(rubricId) ?? []) : []) {
                if (!sr.gradedAt || sr.notHandedIn || sr.isPeerReview) continue;
                const cls = studentClass.get(sr.studentId);
                if (cls === undefined || !assignedIdsByClass.get(cls)?.has(sr.studentId)) continue;
                const list = gradedByClass.get(cls);
                if (list) list.push(sr);
                else gradedByClass.set(cls, [sr]);
            }

            for (const cls of classes) {
                const c = counts.get(cls.id) ?? 0;
                const gradedRecords = latestGradedByStudent(gradedByClass.get(cls.id) ?? []);
                const scores: number[] = [];
                const levelCounts: Partial<Record<CefrLevel, number>> = {};
                for (const sr of gradedRecords) {
                    const sourceRubric = sr.rubricSnapshot ?? rubric;
                    if (!sourceRubric) continue;
                    scores.push(
                        calcGradeSummary(sr, sourceRubric.criteria, gradeScaleFor(sourceRubric), sourceRubric)
                            .modifiedPercentage
                    );
                    const achieved = rubricLevelCounts(sr, sourceRubric);
                    const targetLevel = (rubric ?? sourceRubric).cefrTargetLevel;
                    if (Object.keys(achieved).length === 0 && targetLevel) {
                        achieved[targetLevel] = 1;
                    }
                    addLevelCounts(levelCounts, achieved);
                }

                row[cls.id] = {
                    submittedCount: c,
                    gradedCount: gradedRecords.length,
                    averageScore: mean(scores),
                    isLinked: c > 0,
                    mostCommonCefrLevel: mostCommonCefrLevel(levelCounts),
                    cefrLevelCounts: levelCounts,
                    setCefrLevel: rubric?.cefrTargetLevel,
                    totalStudents: totalFor(cls.id),
                };
            }
        }

        matrix[`${activity.kind}:${activity.id}`] = row;
    }

    return matrix;
}

/**
 * Year summary over the cells currently visible in the matrix. A test or rubric only counts as
 * expected work when it is linked to that class; an essay counts its assigned students.
 */
export function summarizeDashboardMatrix(
    activities: ActivityRow[],
    classes: Class[],
    matrix: Record<string, Record<string, CellData>>
): ActivityDashboardSummary {
    const cefrLevelCounts = emptyLevelCounts();
    const byClass = new Map<string, { graded: number; expected: number; weighted: number; scored: number }>();
    for (const cls of classes) byClass.set(cls.id, { graded: 0, expected: 0, weighted: 0, scored: 0 });

    let graded = 0;
    let expected = 0;
    let weighted = 0;
    let scored = 0;

    for (const activity of activities) {
        const row = matrix[`${activity.kind}:${activity.id}`];
        if (!row) continue;
        for (const cls of classes) {
            const cell = row[cls.id];
            if (!cell) continue;
            // An unlinked rubric/test is not part of the visible matrix progress. Grades left over
            // from an earlier link must not inflate the summary or its CEFR distribution.
            const included = activity.kind === 'essay' ? cell.submittedCount > 0 : cell.isLinked;
            if (!included) continue;
            const cellExpected = activity.kind === 'essay' ? cell.submittedCount : cell.totalStudents;
            const classStats = byClass.get(cls.id)!;
            classStats.expected += cellExpected;
            classStats.graded += cell.gradedCount;
            expected += cellExpected;
            graded += cell.gradedCount;

            for (const level of CEFR_LEVELS) {
                cefrLevelCounts[level] += cell.cefrLevelCounts?.[level] ?? 0;
            }

            if (cell.averageScore !== undefined && cell.gradedCount > 0) {
                weighted += cell.averageScore * cell.gradedCount;
                scored += cell.gradedCount;
                classStats.weighted += cell.averageScore * cell.gradedCount;
                classStats.scored += cell.gradedCount;
            }
        }
    }

    return {
        graded,
        expected,
        averageScore: scored > 0 ? weighted / scored : undefined,
        mostCommonCefrLevel: mostCommonCefrLevel(cefrLevelCounts),
        cefrLevelCounts,
        byClass: classes.map((cls) => {
            const stats = byClass.get(cls.id)!;
            return {
                classId: cls.id,
                graded: stats.graded,
                expected: stats.expected,
                averageScore: stats.scored > 0 ? stats.weighted / stats.scored : undefined,
            };
        }),
    };
}
