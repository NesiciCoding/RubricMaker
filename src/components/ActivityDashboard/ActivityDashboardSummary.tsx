import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import type { ActivityDashboardSummary as Summary } from '../../utils/activityDashboardAggregator';
import { CEFR_LEVELS } from '../../data/cefrDescriptors';

interface Props {
    summary: Summary;
    classNames: Record<string, string>;
}

/** Format an optional percentage; an em dash keeps "not scored" distinct from zero. */
function rounded(value: number | undefined): string {
    return value === undefined ? '—' : `${Math.round(value)}%`;
}

/** Collapsible year summary over the cells currently visible in the dashboard. */
export default function ActivityDashboardSummary({ summary, classNames }: Props) {
    const { t } = useTranslation();
    const gradedPct = summary.expected > 0 ? (summary.graded / summary.expected) * 100 : 0;
    const toGrade = Math.max(0, summary.expected - summary.graded);
    const totalLevels = CEFR_LEVELS.reduce((sum, level) => sum + summary.cefrLevelCounts[level], 0);
    const rankedClasses = summary.byClass
        .filter((cls) => cls.expected > 0)
        .sort((a, b) => {
            const aPct = a.expected > 0 ? a.graded / a.expected : 0;
            const bPct = b.expected > 0 ? b.graded / b.expected : 0;
            return bPct - aPct;
        });

    return (
        <details className="card ad-summary" data-tour="ad-summary">
            <summary className="ad-summary-summary">
                <span className="ad-summary-heading">
                    <ChevronDown size={15} className="ad-summary-chevron" aria-hidden />
                    {t('activityDashboard.summary_title')}
                </span>
                <span className="ad-summary-glance">
                    <span>
                        <strong>{Math.round(gradedPct)}%</strong> {t('activityDashboard.summary_graded_short')}
                    </span>
                    <span>
                        <strong>{rounded(summary.averageScore)}</strong> {t('activityDashboard.summary_average_short')}
                    </span>
                    <span>
                        <strong>{summary.mostCommonCefrLevel ?? '—'}</strong>{' '}
                        {t('activityDashboard.summary_cefr_short')}
                    </span>
                </span>
            </summary>

            <div className="ad-summary-body">
                <div className="ad-kpi-grid">
                    <div className="ad-kpi">
                        <span className="ad-kpi-value">{Math.round(gradedPct)}%</span>
                        <span className="ad-kpi-label">{t('activityDashboard.summary_graded')}</span>
                        <span className="ad-kpi-note">
                            {t('activityDashboard.graded_of_total', {
                                graded: summary.graded,
                                total: summary.expected,
                            })}
                        </span>
                    </div>
                    <div className="ad-kpi">
                        <span className="ad-kpi-value">{rounded(summary.averageScore)}</span>
                        <span className="ad-kpi-label">{t('activityDashboard.average_score')}</span>
                        <span className="ad-kpi-note">{t('activityDashboard.summary_average_note')}</span>
                    </div>
                    <div className="ad-kpi">
                        <span className="ad-kpi-value">{summary.mostCommonCefrLevel ?? '—'}</span>
                        <span className="ad-kpi-label">{t('activityDashboard.most_common_cefr')}</span>
                        <span className="ad-kpi-note">{t('activityDashboard.most_common_level')}</span>
                    </div>
                    <div className="ad-kpi">
                        <span className="ad-kpi-value">{toGrade}</span>
                        <span className="ad-kpi-label">{t('activityDashboard.summary_to_grade')}</span>
                        <span className="ad-kpi-note">{t('activityDashboard.summary_scope')}</span>
                    </div>
                </div>

                <div className="ad-summary-columns">
                    <div>
                        <h3 className="ad-subheading">{t('activityDashboard.cefr_distribution')}</h3>
                        <div className="ad-cefr-bars" title={t('activityDashboard.cefr_help')}>
                            {CEFR_LEVELS.map((level) => {
                                const count = summary.cefrLevelCounts[level];
                                const pct = totalLevels > 0 ? (count / totalLevels) * 100 : 0;
                                return (
                                    <div className="ad-cefr-bar-row" key={level}>
                                        <span className={`ad-cefr ad-cefr-${level.toLowerCase()}`}>{level}</span>
                                        <div className="ad-cefr-bar">
                                            <span
                                                className={`ad-cefr-bar-fill ad-cefr-fill-${level.toLowerCase()}`}
                                                style={{ width: `${pct}%` }}
                                            />
                                        </div>
                                        <span className="ad-cefr-bar-count">{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h3 className="ad-subheading">{t('activityDashboard.class_progress')}</h3>
                        {rankedClasses.length === 0 ? (
                            <p className="ad-muted">{t('activityDashboard.no_classes_visible')}</p>
                        ) : (
                            <div className="ad-class-list">
                                {rankedClasses.slice(0, 5).map((cls) => {
                                    const pct = cls.expected > 0 ? (cls.graded / cls.expected) * 100 : 0;
                                    return (
                                        <div className="ad-class-row" key={cls.classId}>
                                            <span className="ad-class-name">
                                                {classNames[cls.classId] ?? cls.classId}
                                            </span>
                                            <div className="ad-progress ad-class-progress">
                                                <span
                                                    className="ad-progress-fill"
                                                    style={{ width: `${Math.min(100, pct)}%` }}
                                                />
                                            </div>
                                            <span className="ad-class-pct">{Math.round(pct)}%</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </details>
    );
}
