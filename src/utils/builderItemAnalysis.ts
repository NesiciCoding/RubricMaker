import type { Class, Student, StudentTest, Test } from '../types';
import { calcTestQuality, MIN_STUDENTS_FOR_CORRELATION } from './testQualityMetrics';

/** Difficulty below this reads as an item almost nobody could do. */
export const INSIGHT_TOO_HARD = 0.3;
/** Difficulty above this reads as an item that told you nothing. */
export const INSIGHT_TOO_EASY = 0.9;
/** Upper-minus-lower-27% gap below which an item barely separates strong from weak students. */
export const INSIGHT_WEAK_DISCRIMINATION = 0.2;

export type ItemReading = 'too_hard' | 'too_easy' | 'weak_discrimination';

export interface BuilderItemInsight {
    questionId: string;
    sampleSize: number;
    pValue: number | null;
    discrimination: number | null;
    readings: ItemReading[];
}

export interface BuilderInsights {
    byQuestion: Map<string, BuilderItemInsight>;
    /** Questions with at least one reading, for the outline's needs-review filter. */
    needsReviewIds: Set<string>;
    /** Names of the classes the sittings came from, sorted. */
    classes: string[];
    /** Complete score rows the metrics rest on. */
    sample: number;
    minSample: number;
    /** False when the test does not have enough complete sittings to say anything. */
    hasData: boolean;
}

interface InsightsInput {
    test: Test;
    studentTests: StudentTest[];
    students: Pick<Student, 'id' | 'classId'>[];
    classes: Pick<Class, 'id' | 'name'>[];
}

function classNamesOf(
    test: Test,
    studentTests: StudentTest[],
    students: Pick<Student, 'id' | 'classId'>[],
    classes: Pick<Class, 'id' | 'name'>[]
): string[] {
    const classIdByStudent = new Map(students.map((s) => [s.id, s.classId]));
    const nameById = new Map(classes.map((c) => [c.id, c.name]));
    const names = new Set<string>();
    for (const st of studentTests) {
        if (st.testId !== test.id || st.absent || st.answers.length === 0) continue;
        const name = nameById.get(classIdByStudent.get(st.studentId) ?? '');
        if (name) names.add(name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Reads the item-quality engine's own output back into the builder, so a question keeps the numbers
 * of the question with its id — reordering, hiding or renaming never moves a metric onto a neighbour,
 * and a question added after the last sitting simply has no insight.
 */
export function builderItemInsights({ test, studentTests, students, classes }: InsightsInput): BuilderInsights {
    // A question added after the last sitting has no answers. Left in the matrix it would make every
    // student's row incomplete and hide the results of the whole test.
    const answeredIds = new Set(
        studentTests
            .filter((st) => st.testId === test.id && !st.absent)
            .flatMap((st) => st.answers.map((answer) => answer.questionId))
    );
    const gradedTest: Test = { ...test, questions: test.questions.filter((q) => answeredIds.has(q.id)) };
    const report = calcTestQuality(gradedTest, studentTests);
    const classNames = classNamesOf(test, studentTests, students, classes);
    const hasData = report.summary.n >= MIN_STUDENTS_FOR_CORRELATION;
    const byQuestion = new Map<string, BuilderItemInsight>();
    const needsReviewIds = new Set<string>();

    if (hasData) {
        for (const item of report.items) {
            if (item.sampleSize === 0) continue;
            const readings: ItemReading[] = [];
            if (item.pValue !== null && item.pValue < INSIGHT_TOO_HARD) readings.push('too_hard');
            if (item.pValue !== null && item.pValue > INSIGHT_TOO_EASY) readings.push('too_easy');
            if (item.discrimination !== null && item.discrimination < INSIGHT_WEAK_DISCRIMINATION) {
                readings.push('weak_discrimination');
            }
            byQuestion.set(item.itemId, {
                questionId: item.itemId,
                sampleSize: item.sampleSize,
                pValue: item.pValue,
                discrimination: item.discrimination,
                readings,
            });
            if (readings.length > 0) needsReviewIds.add(item.itemId);
        }
    }

    return {
        byQuestion,
        needsReviewIds,
        classes: classNames,
        sample: report.summary.n,
        minSample: MIN_STUDENTS_FOR_CORRELATION,
        hasData,
    };
}
