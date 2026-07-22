import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceArea, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS, CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import { LEVEL_TO_ELO, cefrEloRange } from '../../utils/placementStaircase';
import type { EloProgressPoint } from '../../utils/eloProgressAggregator';

interface Props {
    points: EloProgressPoint[];
}

const ANCHOR_TO_LEVEL = new Map(CEFR_LEVELS.map((lvl) => [LEVEL_TO_ELO[lvl], lvl]));
const Y_DOMAIN: [number, number] = [cefrEloRange('A1').min, cefrEloRange('C2').max];

export default function EloProgressChart({ points }: Props) {
    const { t } = useTranslation();

    if (points.length === 0) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '20px 0' }}>
                {t('statistics.elo_chart_empty')}
            </p>
        );
    }

    return (
        <div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                {t('statistics.elo_chart_title')}
            </div>
            <div role="img" aria-label={t('statistics.elo_chart_aria_label')}>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={points} margin={{ top: 10, right: 24, bottom: 20, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
                        {CEFR_LEVELS.map((lvl) => {
                            const range = cefrEloRange(lvl);
                            return (
                                <ReferenceArea
                                    key={lvl}
                                    y1={range.min}
                                    y2={range.max}
                                    fill={CEFR_LEVEL_COLORS[lvl]}
                                    fillOpacity={0.12}
                                    stroke="none"
                                    label={{
                                        value: lvl,
                                        position: 'insideTopLeft',
                                        fill: CEFR_LEVEL_COLORS[lvl],
                                        fontSize: 11,
                                        fontWeight: 700,
                                    }}
                                />
                            );
                        })}
                        <XAxis
                            dataKey="attemptIndex"
                            allowDecimals={false}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            label={{
                                value: t('statistics.elo_chart_x_label'),
                                position: 'insideBottom',
                                offset: -8,
                                fill: 'var(--text-muted)',
                                fontSize: 11,
                            }}
                        />
                        <YAxis
                            domain={Y_DOMAIN}
                            ticks={CEFR_LEVELS.map((lvl) => LEVEL_TO_ELO[lvl])}
                            tickFormatter={(v: number) => ANCHOR_TO_LEVEL.get(v) ?? String(v)}
                            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            width={36}
                        />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}
                            labelFormatter={(attemptIndex: React.ReactNode) =>
                                t('statistics.elo_chart_tooltip_attempt', { number: attemptIndex })
                            }
                            formatter={(_value: unknown, _name: unknown, item: { payload?: EloProgressPoint }) => {
                                const point = item?.payload;
                                if (!point) return ['', ''];
                                return [
                                    `${point.level} · ${new Date(point.date).toLocaleDateString()}`,
                                    point.testName,
                                ];
                            }}
                        />
                        <Line
                            type="linear"
                            dataKey="eloValue"
                            name={t('statistics.elo_chart_series_name')}
                            stroke="var(--accent)"
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            animationDuration={400}
                            isAnimationActive={points.length > 1}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <table className="sr-only">
                <caption>{t('statistics.elo_chart_aria_label')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('statistics.elo_chart_table_attempt')}</th>
                        <th scope="col">{t('statistics.label_test')}</th>
                        <th scope="col">{t('statistics.elo_chart_table_date')}</th>
                        <th scope="col">{t('statistics.elo_chart_table_level')}</th>
                    </tr>
                </thead>
                <tbody>
                    {points.map((p) => (
                        <tr key={p.studentTestId}>
                            <td>{p.attemptIndex}</td>
                            <td>{p.testName}</td>
                            <td>{new Date(p.date).toLocaleDateString()}</td>
                            <td>{p.level}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
