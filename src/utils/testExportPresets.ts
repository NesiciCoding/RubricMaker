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

/** Picks the latest attempt (by attemptNumber, then by submission/start time) to represent a student with multiple practice attempts. */
function latestAttempt(attempts: StudentTest[]): StudentTest {
    return attempts.reduce((latest, candidate) => {
        const latestAttemptNumber = latest.attemptNumber ?? 1;
        const candidateAttemptNumber = candidate.attemptNumber ?? 1;
        if (candidateAttemptNumber !== latestAttemptNumber) {
            return candidateAttemptNumber > latestAttemptNumber ? candidate : latest;
        }
        const latestTime = Date.parse(latest.submittedAt ?? latest.startedAt);
        const candidateTime = Date.parse(candidate.submittedAt ?? candidate.startedAt);
        return candidateTime > latestTime ? candidate : latest;
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
export function buildTestResultsCsv(test: Test, studentTests: StudentTest[], students: Student[]): string {
    const maxPoints = calcTestMaxPoints(test);
    const relevant = studentTests.filter((st) => st.testId === test.id);

    const attemptsByStudent = new Map<string, StudentTest[]>();
    for (const st of relevant) {
        const attempts = attemptsByStudent.get(st.studentId) ?? [];
        attempts.push(st);
        attemptsByStudent.set(st.studentId, attempts);
    }

    const rows = Array.from(attemptsByStudent.values()).map((attempts) => {
        const studentTest = latestAttempt(attempts);
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
