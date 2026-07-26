import Papa from 'papaparse';
import type { Student, StudentTest, Test } from '../types';
import { calcQuestionBreakdowns, calcSkillBreakdowns } from './testSummaryAggregator';
import { calcStudentTestRawPoints, calcTestMaxPoints, calcTestPercentage } from './testCalc';

/** Mirrors the rawPoints + adjustmentPoints → percentage formula TestResultsPage.tsx uses for a student's displayed score. */
function studentPercentage(test: Test, studentTest: StudentTest, maxPoints: number): number {
    const rawPoints = studentTest.rawTotalPoints ?? calcStudentTestRawPoints(test, studentTest.answers);
    const adjustmentPoints = studentTest.adjustmentPoints ?? 0;
    return calcTestPercentage(rawPoints + adjustmentPoints, maxPoints);
}

/**
 * Whole-class CSV of test results: one row per student submission, with overall score plus
 * per-question and per-skill (linked standard/CEFR descriptor) accuracy columns — mirrors
 * ExportPage.tsx's generic full-column rubric gradebook CSV, using the same aggregation
 * helpers (calcQuestionBreakdowns/calcSkillBreakdowns) the PDF/DOCX test summaries already use.
 */
export function buildTestResultsCsv(test: Test, studentTests: StudentTest[], students: Student[]): string {
    const maxPoints = calcTestMaxPoints(test);
    const relevant = studentTests.filter((st) => st.testId === test.id);

    const rows = relevant.map((studentTest) => {
        const student = students.find((s) => s.id === studentTest.studentId);
        const questionBreakdowns = calcQuestionBreakdowns(studentTest.studentId, studentTests, test);
        const skillBreakdowns = calcSkillBreakdowns(studentTest.studentId, studentTests, test);

        const row: Record<string, string | number> = {
            'Student Name': student?.name ?? '',
            'Student Number': student?.studentNumber ?? '',
            'Score %': studentPercentage(test, studentTest, maxPoints).toFixed(1),
        };

        test.questions.forEach((question, index) => {
            const breakdown = questionBreakdowns.find((b) => b.questionId === question.id);
            row[`Q${index + 1} Accuracy %`] = breakdown ? breakdown.accuracyPct.toFixed(0) : '';
        });

        skillBreakdowns.forEach((skill) => {
            row[`${skill.label} %`] = skill.accuracyPct.toFixed(0);
        });

        return row;
    });

    return Papa.unparse(rows, { escapeFormulae: true });
}
