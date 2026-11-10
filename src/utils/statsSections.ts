export type StatsView = 'rubric' | 'student' | 'compare';

export interface StatsSection {
    id: string;
    view: StatsView;
    /** Translation key of the card's own title, reused as its label in the Customise panel */
    titleKey: string;
}

/** Every card the Statistics page can show; the teacher can switch each off in the Customise panel. */
export const STATS_SECTIONS: StatsSection[] = [
    { id: 'learningGoals', view: 'rubric', titleKey: 'statistics.sections.learning_goals' },
    { id: 'writingTrends', view: 'rubric', titleKey: 'statistics.sections.writing_trends' },
    { id: 'classTrend', view: 'rubric', titleKey: 'statistics.class_trend' },
    { id: 'classTestAverages', view: 'rubric', titleKey: 'statistics.class_test_averages' },
    { id: 'summaryCards', view: 'rubric', titleKey: 'statistics.sections.summary_cards' },
    { id: 'gradeDistribution', view: 'rubric', titleKey: 'statistics.grade_distribution' },
    { id: 'criterionChart', view: 'rubric', titleKey: 'statistics.criterion_avg' },
    { id: 'rubricQuality', view: 'rubric', titleKey: 'statistics.rubric_quality.title' },
    { id: 'frameworks', view: 'rubric', titleKey: 'statistics.sections.frameworks' },
    { id: 'customViews', view: 'rubric', titleKey: 'statistics.custom_views_title' },
    { id: 'heatmap', view: 'rubric', titleKey: 'statistics.heatmap' },
    { id: 'gradedRubrics', view: 'student', titleKey: 'statistics.graded_rubrics' },
    { id: 'testResults', view: 'student', titleKey: 'statistics.test_results' },
    { id: 'studentProgress', view: 'student', titleKey: 'statistics.student_progress_title' },
    { id: 'eloProgress', view: 'student', titleKey: 'statistics.sections.elo_progress' },
    { id: 'criterionRadar', view: 'student', titleKey: 'statistics.sections.criterion_radar' },
    { id: 'compareAverages', view: 'compare', titleKey: 'statistics.compare.avg_title' },
    { id: 'criterionGap', view: 'compare', titleKey: 'statistics.compare.criterion_gap' },
    { id: 'compareTrend', view: 'compare', titleKey: 'statistics.compare.trend_title' },
    { id: 'insights', view: 'compare', titleKey: 'statistics.sections.insights' },
];

export function isSectionVisible(hidden: string[] | undefined, id: string): boolean {
    return !hidden?.includes(id);
}

export function toggleSection(hidden: string[] | undefined, id: string): string[] {
    const list = hidden ?? [];
    return list.includes(id) ? list.filter((s) => s !== id) : [...list, id];
}
