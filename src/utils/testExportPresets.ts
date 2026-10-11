import Papa from 'papaparse';
import { CSV_UNPARSE_OPTIONS } from './csvOptions';
import type { GradeScale, Student, StudentTest, Test } from '../types';
import type { GradebookExportRow } from './gradebookExportPresets';
import { calcLetterGrade } from './gradeCalc';
import { calcQuestionBreakdowns, calcSkillBreakdowns } from './testSummaryAggregator';
import { calcStudentTestRawPoints, calcTestMaxPoints, calcTestPercentage } from './testCalc';
import { describeTestCefr, pickLatestAttempt } from './testAnswerText';

/** The rawPoints + adjustmentPoints TestResultsPage.tsx shows as a student's score. */
function studentPoints(test: Test, studentTest: StudentTest): number {
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    return rawPoints + (studentTest.adjustmentPoints ?? 0);
}

/** Mirrors the points → percentage formula TestResultsPage.tsx uses for a student's displayed score. */
function studentPercentage(test: Test, studentTest: StudentTest, maxPoints: number): number {
    return calcTestPercentage(studentPoints(test, studentTest), maxPoints);
}

const STATUS_LABELS: Record<StudentTest['status'], string> = {
    in_progress: 'In progress',
    submitted: 'Submitted',
    graded: 'Graded',
};

/** One canonical attempt per student: the latest, so a practice test with several attempts yields one row. */
function latestAttempts(test: Test, studentTests: StudentTest[]): StudentTest[] {
    const attemptsByStudent = new Map<string, StudentTest[]>();
    for (const st of studentTests) {
        if (st.testId !== test.id) continue;
        const attempts = attemptsByStudent.get(st.studentId) ?? [];
        attempts.push(st);
        attemptsByStudent.set(st.studentId, attempts);
    }
    // attemptsByStudent groups only this test's submissions, so each list is non-empty.
    return Array.from(attemptsByStudent.values()).map((attempts) => pickLatestAttempt(attempts)!);
}

/** Rows for the Magister/SOMtoday gradebook presets, graded with the scale the results page uses. */
export function buildTestGradebookRows(
    test: Test,
    studentTests: StudentTest[],
    students: Student[],
    scale: GradeScale | null
): GradebookExportRow[] {
    const maxPoints = calcTestMaxPoints(test);
    return latestAttempts(test, studentTests).map((studentTest) => {
        const student = students.find((s) => s.id === studentTest.studentId);
        const percentage = studentPercentage(test, studentTest, maxPoints);
        return {
            studentName: student?.name ?? '',
            studentNumber: student?.studentNumber ?? '',
            percentage,
            grade: scale ? calcLetterGrade(percentage, scale) : '',
        };
    });
}

/**
 * Whole-class CSV of test results: one row per student, with overall score plus per-question
 * and per-skill (linked standard/CEFR descriptor) accuracy columns — mirrors ExportPage.tsx's
 * generic full-column rubric gradebook CSV, using the same aggregation helpers
 * (calcQuestionBreakdowns/calcSkillBreakdowns) the PDF/DOCX test summaries already use. A
 * student with multiple practice attempts (Test.allowMultipleAttempts) still gets exactly one
 * row, scored from their latest attempt.
 */
export function buildTestResultsCsv(
    test: Test,
    studentTests: StudentTest[],
    students: Student[],
    achieveThreshold?: number,
    scale: GradeScale | null = null
): string {
    const maxPoints = calcTestMaxPoints(test);
    const hasCefr = !!test.cefrTargetLevel || test.mode === 'placement';

    const rows = latestAttempts(test, studentTests).map((studentTest) => {
        const student = students.find((s) => s.id === studentTest.studentId);
        // Scope the breakdowns to just the canonical attempt's own answers — passing the full
        // studentTests array here would blend earlier attempts' answers into the accuracy
        // columns while Score % reflects only the latest attempt, an inconsistent row.
        const questionBreakdowns = calcQuestionBreakdowns(studentTest.studentId, [studentTest], test);
        const skillBreakdowns = calcSkillBreakdowns(studentTest.studentId, [studentTest], test);

        const row: Record<string, string | number> = {
            'Student Name': student?.name ?? '',
            'Student Number': student?.studentNumber ?? '',
            'Score %': studentPercentage(test, studentTest, maxPoints).toFixed(1),
            Points: studentPoints(test, studentTest),
            'Max Points': maxPoints,
        };
        if (scale) row['Grade'] = calcLetterGrade(studentPercentage(test, studentTest, maxPoints), scale);
        row['Status'] = STATUS_LABELS[studentTest.status];

        if (hasCefr) {
            row['CEFR'] = describeTestCefr(test, studentTest, achieveThreshold) ?? '';
        }

        test.questions.forEach((question, index) => {
            const breakdown = questionBreakdowns.find((b) => b.questionId === question.id);
            // calcQuestionBreakdowns always emits one entry per test question, so the empty fallback is
            // unreachable — kept defensive, but excluded from coverage.
            /* v8 ignore next 1 */
            row[`Q${index + 1} Accuracy %`] = breakdown ? breakdown.accuracyPct.toFixed(0) : '';
        });

        skillBreakdowns.forEach((skill) => {
            row[`${skill.label} %`] = skill.accuracyPct.toFixed(0);
        });

        return row;
    });

    return Papa.unparse(rows, CSV_UNPARSE_OPTIONS);
}
