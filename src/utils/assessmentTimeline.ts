import type { GradeScale, Rubric, StudentRubric, StudentTest, Test } from '../types';
import { calcGradeSummary } from './gradeCalc';
import { scoreStudentTest } from './studentTestScore';

export type AssessmentKind = 'rubric' | 'test';

export interface ScoredTestResult {
    studentTest: StudentTest;
    test: Test;
    percentage: number;
    totalPoints: number;
    maxPoints: number;
    /** When the result was produced: graded, else submitted, else started. */
    date: string;
}

export interface AssessmentTrendPoint {
    id: string;
    kind: AssessmentKind;
    name: string;
    date: string;
    avg: number;
    median: number;
}

/** Practice runs are ungraded and placement runs yield a CEFR estimate, so neither is a progress grade. */
export function countsTowardsProgress(test: Test): boolean {
    return !test.mode || test.mode === 'assessment';
}

export function isScoredTestResult(studentTest: StudentTest): boolean {
    return (studentTest.status === 'submitted' || studentTest.status === 'graded') && !studentTest.absent;
}

export function testResultDate(studentTest: StudentTest): string {
    return studentTest.gradedAt ?? studentTest.submittedAt ?? studentTest.startedAt;
}

/** Graded test results that count towards progress, scored exactly as TestResultsPage shows them. */
export function scoredTestResults(studentTests: StudentTest[], tests: Test[]): ScoredTestResult[] {
    const testsById = new Map(tests.map((test) => [test.id, test]));
    const results: ScoredTestResult[] = [];
    for (const studentTest of studentTests) {
        if (!isScoredTestResult(studentTest)) continue;
        const test = testsById.get(studentTest.testId);
        if (!test || !countsTowardsProgress(test)) continue;
        const score = scoreStudentTest(test, studentTest);
        // A test without any points has no meaningful percentage and would drag averages to 0.
        if (score.maxPoints <= 0) continue;
        results.push({
            studentTest,
            test,
            percentage: score.percentage,
            totalPoints: score.totalPoints,
            maxPoints: score.maxPoints,
            date: testResultDate(studentTest),
        });
    }
    return results;
}

function round1(n: number): number {
    return parseFloat(n.toFixed(1));
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function scaleForRubric(rubric: Rubric, gradeScales: GradeScale[]): GradeScale | null {
    return rubric.gradeScaleId === 'none'
        ? null
        : (gradeScales.find((g) => g.id === rubric.gradeScaleId) ?? gradeScales[0]);
}

export interface AssessmentTrendInput {
    studentRubrics: StudentRubric[];
    rubrics: Rubric[];
    gradeScales: GradeScale[];
    studentTests: StudentTest[];
    tests: Test[];
}

/**
 * One point per rubric and per test with at least one score among `inScope` students, in the order the
 * assessments were created — the average/median percentage of those students on each.
 */
export function buildAssessmentTrend(
    inScope: (studentId: string) => boolean,
    { studentRubrics, rubrics, gradeScales, studentTests, tests }: AssessmentTrendInput
): AssessmentTrendPoint[] {
    const points: AssessmentTrendPoint[] = [];

    for (const rubric of rubrics) {
        const scores = studentRubrics
            .filter((sr) => sr.rubricId === rubric.id && inScope(sr.studentId))
            .map((sr) => {
                // Score each grade against the rubric as it was when graded, as the rubric table does.
                const graded = sr.rubricSnapshot ?? rubric;
                return calcGradeSummary(sr, graded.criteria, scaleForRubric(graded, gradeScales), graded)
                    .modifiedPercentage;
            });
        if (scores.length === 0) continue;
        points.push({
            id: rubric.id,
            kind: 'rubric',
            name: rubric.name,
            date: rubric.createdAt,
            avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
            median: round1(median(scores)),
        });
    }

    const resultsByTest = new Map<string, number[]>();
    for (const result of scoredTestResults(
        studentTests.filter((st) => inScope(st.studentId)),
        tests
    )) {
        const list = resultsByTest.get(result.test.id) ?? [];
        list.push(result.percentage);
        resultsByTest.set(result.test.id, list);
    }
    for (const test of tests) {
        const scores = resultsByTest.get(test.id);
        if (!scores) continue;
        points.push({
            id: test.id,
            kind: 'test',
            name: test.name,
            date: test.createdAt,
            avg: round1(scores.reduce((a, b) => a + b, 0) / scores.length),
            median: round1(median(scores)),
        });
    }

    return points.sort((a, b) => a.date.localeCompare(b.date));
}

export interface StudentTimelineEntry {
    id: string;
    kind: AssessmentKind;
    name: string;
    date: string;
    score: number;
}

/** A student's rubric grades and test results merged into one chronological list of percentages. */
export function buildStudentTimeline(
    rubricEntries: { id: string; name: string; date: string; score: number }[],
    testResults: ScoredTestResult[]
): StudentTimelineEntry[] {
    return [
        ...rubricEntries.map((e) => ({ ...e, kind: 'rubric' as const })),
        ...testResults.map((r) => ({
            id: r.studentTest.id,
            kind: 'test' as const,
            name: r.test.name,
            date: r.date,
            score: round1(r.percentage),
        })),
    ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
