import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatShortDate } from '../../utils/dateInput';

export interface TrendPoint {
    rubricName: string;
    date: string;
    avg: number;
    median: number;
}

interface Props {
    data: TrendPoint[];
}

export default function ClassTrendChart({ data }: Props) {
    const { t, i18n } = useTranslation();
    if (data.length < 2) return null;

    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 10, right: 24, bottom: 40, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} vertical={false} />
                <XAxis
                    dataKey="rubricName"
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
    );
}
