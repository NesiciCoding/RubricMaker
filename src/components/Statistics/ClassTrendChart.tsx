import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatShortDate } from '../../utils/dateInput';
import type { AssessmentTrendPoint } from '../../utils/assessmentTimeline';

/** Trend points carry the assessment identity from the producer — the table rows
 *  are keyed by kind+id so same-named assessments never collide. */
export type TrendPoint = AssessmentTrendPoint;

interface Props {
    data: TrendPoint[];
}

export default function ClassTrendChart({ data }: Props) {
    const { t, i18n } = useTranslation();
    if (data.length < 2) return null;
    const labelled = data.map((p) => ({
        ...p,
        label: p.kind === 'test' ? t('statistics.trend_test_label', { name: p.name }) : p.name,
    }));

    return (
        <div>
            <div role="img" aria-label={t('statistics.class_trend_aria_label')}>
                <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={labelled} margin={{ top: 10, right: 24, bottom: 40, left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
                        <XAxis
                            dataKey="label"
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            angle={-30}
                            textAnchor="end"
                            interval={0}
                        />
                        <YAxis
                            domain={[0, 100]}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            tickFormatter={(v: number) => `${v}%`}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}
                            formatter={(value: unknown, name: unknown) => [`${value ?? 0}%`, String(name)]}
                            labelFormatter={(label, payload) => {
                                const d = payload && payload.length > 0 ? payload[0].payload?.date : undefined;
                                return d ? `${label} · ${formatShortDate(d, i18n.language)}` : String(label);
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: 8 }} />
                        <Line
                            type="monotone"
                            dataKey="avg"
                            name={t('statistics.stat_average')}
                            stroke="var(--accent)"
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            animationDuration={400}
                        />
                        <Line
                            type="monotone"
                            dataKey="median"
                            name={t('statistics.stat_median')}
                            stroke="var(--teal, #14b8a6)"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            dot={{ r: 3 }}
                            animationDuration={400}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <table className="sr-only">
                <caption>{t('statistics.class_trend_aria_label')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('statistics.class_trend_table_assessment')}</th>
                        <th scope="col">{t('statistics.class_trend_table_date')}</th>
                        <th scope="col">{t('statistics.stat_average')}</th>
                        <th scope="col">{t('statistics.stat_median')}</th>
                    </tr>
                </thead>
                <tbody>
                    {labelled.map((p) => (
                        <tr key={`${p.kind}-${p.id}`}>
                            <td>{p.label}</td>
                            <td>{formatShortDate(p.date, i18n.language)}</td>
                            <td>{p.avg}%</td>
                            <td>{p.median}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
