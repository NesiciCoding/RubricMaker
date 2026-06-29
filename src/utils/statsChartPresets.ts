export interface StatsPreset {
    id: string;
    titleKey: string;
    defaultColor: string;
}

/** Recommended chart presets for the Statistics "Custom Views" gallery, each backed by data StatisticsPage already computes. */
export const STATS_PRESETS: StatsPreset[] = [
    { id: 'criterionAverages', titleKey: 'statistics.preset_criterion_averages', defaultColor: '#6366f1' },
    { id: 'gradeDistribution', titleKey: 'statistics.preset_grade_distribution', defaultColor: '#10b981' },
    { id: 'testAverages', titleKey: 'statistics.preset_test_averages', defaultColor: '#f59e0b' },
];

export interface PresetChartPoint {
    name: string;
    value: number;
}
