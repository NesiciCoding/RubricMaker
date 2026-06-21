import type {
    Student,
    Rubric,
    StudentRubric,
    SelfAssessment,
    DocumentAnalysisResult,
    ReportCardConfig,
    ReportCardData,
    ReportCardSection,
    Test,
    StudentTest,
} from '../types';
import { getCefrStudentOverview } from './cefrStudentAggregator';
import { getStudentGoalScores } from './learningGoalsAggregator';
import { calcTestStrongWeakSummary, mergeTestStrongWeakSummaries } from './testSummaryAggregator';
import type { PeriodReportEntry } from './periodReportExport';

export interface BuildReportCardDataInput {
    student: Student;
    className: string;
    periodLabel?: string;
    entries: PeriodReportEntry[];
    rubrics: Rubric[];
    studentRubrics: StudentRubric[];
    selfAssessments: SelfAssessment[];
    analysisResults?: DocumentAnalysisResult[];
    /** Tests + submissions in scope for the report period, used for the testSummary section */
    tests?: Test[];
    studentTests?: StudentTest[];
}

export function buildReportCardData(
    studentId: string,
    config: ReportCardConfig,
    input: BuildReportCardDataInput
): ReportCardData {
    const sections: ReportCardSection[] = [];

    if (config.includeRubrics) {
        sections.push({ type: 'rubrics', entries: input.entries });
    }

    let cefrOverview: ReturnType<typeof getCefrStudentOverview> | null = null;
    const needsCefrOverview = config.includeCefr || config.includeStandards;
    if (needsCefrOverview) {
        cefrOverview = getCefrStudentOverview(
            studentId,
            input.studentRubrics,
            input.rubrics,
            input.selfAssessments,
            input.analysisResults
        );
    }

    if (config.includeStandards && cefrOverview) {
        sections.push({ type: 'standards', standardSets: cefrOverview.standardSets });
    }

    if (config.includeLearningGoals) {
        const goals = getStudentGoalScores(studentId, input.studentRubrics, input.rubrics);
        sections.push({ type: 'learningGoals', goals });
    }

    if (config.includeCefr && cefrOverview) {
        sections.push({ type: 'cefr', overview: cefrOverview });
    }

    if (config.includeTestSummary) {
        const tests = input.tests ?? [];
        const studentTests = input.studentTests ?? [];
        const summaries = tests
            .filter((test) => studentTests.some((st) => st.testId === test.id && st.studentId === studentId))
            .map((test) => calcTestStrongWeakSummary(studentId, studentTests, test));
        const overview = mergeTestStrongWeakSummaries(summaries);
        sections.push({ type: 'testSummary', overview: { ...overview, studentId } });
    }

    return {
        studentId,
        studentName: input.student.name,
        className: input.className,
        periodLabel: input.periodLabel,
        sections,
    };
}
