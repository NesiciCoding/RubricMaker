import type {
    Student,
    Rubric,
    StudentRubric,
    SelfAssessment,
    DocumentAnalysisResult,
    ReportCardConfig,
    ReportCardData,
    ReportCardSection,
} from '../types';
import { getCefrStudentOverview } from './cefrStudentAggregator';
import { getStudentGoalScores } from './learningGoalsAggregator';
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
        // ponytail: testSummaryAggregator.ts doesn't exist yet (Task 6.5 is parallel to it).
        // Once it lands, replace this empty placeholder with a real call into its aggregator
        // and drop the local TestSummaryOverview shape in favor of its exported type.
        sections.push({ type: 'testSummary', overview: { strong: [], weak: [] } });
    }

    return {
        studentId,
        studentName: input.student.name,
        className: input.className,
        periodLabel: input.periodLabel,
        sections,
    };
}
