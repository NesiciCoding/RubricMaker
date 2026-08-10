import React, { useState, useMemo } from 'react';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Cell,
    ReferenceLine,
    ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import type { LearningGoalAggregate } from '../../utils/learningGoalsAggregator';
import { PROGRESS_STATUS_COLOR, progressStatusLabelKey } from '../../utils/cefrOrdinal';
import { formatShortDate } from '../../utils/dateInput';

interface Props {
    goals: LearningGoalAggregate[];
    className?: string; // Optional className from caller
}

/** Colour a per-rubric bar by how its score sits against the goal's target percentage. */
function barColor(pct: number, target: number | undefined): string {
    if (target === undefined) return 'var(--accent)';
    if (pct >= target) return 'var(--green)';
    if (pct >= target * 0.8) return 'var(--yellow)';
    return 'var(--red)';
}

export default function LearningGoalChart({ goals, className }: Props) {
    const { t, i18n } = useTranslation();
    const [selectedGoalId, setSelectedGoalId] = useState<string>(goals[0]?.guid || '');
    const [displayMode, setDisplayMode] = useState<'percentage' | 'points'>('percentage');

    // Update selection if the goals change and selected isn't there
    React.useEffect(() => {
        if (goals.length > 0 && (!selectedGoalId || !goals.find((g) => g.guid === selectedGoalId))) {
            setSelectedGoalId(goals[0].guid);
        }
    }, [goals, selectedGoalId]);

    const activeGoal = useMemo(() => goals.find((g) => g.guid === selectedGoalId), [goals, selectedGoalId]);

    const chartData = useMemo(() => {
        if (!activeGoal) return [];
        return activeGoal.history.map((h, i) => ({
            // Label each bar by its rubric — a labelled, meaningful axis instead of near-duplicate graded dates.
            label: h.rubricName || `#${i + 1}`,
            date: formatShortDate(h.gradedAt, i18n.language),
            percentage: Number(h.percentage.toFixed(1)),
            earned: h.earnedPoints,
            max: h.maxPoints,
        }));
    }, [activeGoal, i18n.language]);

    if (!goals || goals.length === 0) {
        return (
            <div
                className={`card ${className || ''}`}
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}
            >
                <p className="text-secondary">{t('statistics.lg_empty')}</p>
            </div>
        );
    }

    const target = activeGoal?.targetPercentage;
    const chartHeight = Math.max(220, chartData.length * 34 + 48);

    return (
        <div className={`card ${className || ''}`} style={{ marginBottom: 24 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 16,
                    marginBottom: 20,
                }}
            >
                <h3 style={{ margin: 0 }}>{t('statistics.lg_title')}</h3>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select
                        className="form-input"
                        value={selectedGoalId}
                        onChange={(e) => setSelectedGoalId(e.target.value)}
                        style={{ minWidth: 200, maxWidth: 350 }}
                    >
                        {goals.map((g) => (
                            <option key={g.guid} value={g.guid}>
                                {g.title} {t('statistics.lg_option_suffix', { earned: g.totalEarned, max: g.totalMax })}
                            </option>
                        ))}
                    </select>

                    <div className="toggle-group">
                        <button
                            className={`btn ${displayMode === 'percentage' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 12px', fontSize: '0.9em' }}
                            onClick={() => setDisplayMode('percentage')}
                        >
                            %
                        </button>
                        <button
                            className={`btn ${displayMode === 'points' ? 'btn-primary' : 'btn-ghost'}`}
                            style={{ padding: '6px 12px', fontSize: '0.9em' }}
                            onClick={() => setDisplayMode('points')}
                        >
                            {t('statistics.lg_pts_short')}
                        </button>
                    </div>
                </div>
            </div>

            {activeGoal && (
                <div style={{ marginBottom: 16 }}>
                    <p style={{ margin: 0, fontSize: '0.9em' }} className="text-secondary">
                        {activeGoal.description}
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontWeight: 600, color: 'var(--accent)' }}>
                        {t('statistics.lg_average', {
                            pct: activeGoal.averagePercentage.toFixed(1),
                            earned: activeGoal.totalEarned,
                            max: activeGoal.totalMax,
                        })}
                    </p>
                    {activeGoal.status && (
                        <p
                            style={{
                                margin: '4px 0 0 0',
                                fontWeight: 700,
                                fontSize: '0.85rem',
                                color: PROGRESS_STATUS_COLOR[activeGoal.status],
                            }}
                        >
                            {t(progressStatusLabelKey(activeGoal.status))}
                            {activeGoal.targetPercentage !== undefined &&
                                ` (${t('settings.mastery_target_percentage_label')}: ${activeGoal.targetPercentage}%)`}
                        </p>
                    )}
                </div>
            )}

            <div style={{ width: '100%', maxHeight: 440, overflowY: 'auto' }}>
                <div style={{ width: '100%', height: chartHeight }}>
                    <ResponsiveContainer>
                        <BarChart
                            data={chartData}
                            layout="vertical"
                            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                            barCategoryGap="20%"
                        >
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} horizontal={false} />
                            <XAxis
                                type="number"
                                domain={displayMode === 'percentage' ? [0, 100] : [0, 'dataMax']}
                                tick={{ fill: 'var(--text-secondary)' }}
                                strokeOpacity={0.2}
                                tickFormatter={(val) => (displayMode === 'percentage' ? `${val}%` : `${val}`)}
                            />
                            <YAxis
                                type="category"
                                dataKey="label"
                                width={150}
                                tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
                                strokeOpacity={0.2}
                            />
                            <Tooltip
                                cursor={{ fill: 'var(--accent)', fillOpacity: 0.06 }}
                                contentStyle={{
                                    backgroundColor: 'var(--surface)',
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-main)',
                                    borderRadius: 8,
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                }}
                                formatter={(value: unknown, _name: unknown, item: unknown) => {
                                    const payload = (item as { payload?: (typeof chartData)[number] })?.payload;
                                    if (displayMode === 'percentage') {
                                        return [`${value}%`, t('statistics.lg_series_percentage')];
                                    }
                                    return [
                                        `${payload?.earned ?? value} / ${payload?.max ?? '?'}`,
                                        t('statistics.lg_series_points'),
                                    ];
                                }}
                                labelFormatter={(label, payload) => {
                                    const date = payload && payload.length > 0 ? payload[0].payload.date : '';
                                    return date ? `${label} · ${date}` : String(label);
                                }}
                            />
                            {displayMode === 'percentage' && target !== undefined && (
                                <ReferenceLine
                                    x={target}
                                    stroke="var(--text-muted)"
                                    strokeDasharray="4 4"
                                    label={{
                                        value: t('statistics.lg_target', { pct: target }),
                                        position: 'top',
                                        fill: 'var(--text-muted)',
                                        fontSize: 11,
                                    }}
                                />
                            )}
                            <Bar
                                dataKey={displayMode === 'percentage' ? 'percentage' : 'earned'}
                                radius={[0, 4, 4, 0]}
                                animationDuration={400}
                            >
                                {chartData.map((d, i) => (
                                    <Cell
                                        key={i}
                                        fill={
                                            displayMode === 'percentage'
                                                ? barColor(d.percentage, target)
                                                : 'var(--accent)'
                                        }
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
