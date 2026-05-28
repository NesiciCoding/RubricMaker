import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
                    formatter={(value: unknown, name: string) => [`${value ?? 0}%`, name]}
                />
                <Legend wrapperStyle={{ paddingTop: 8 }} />
                <Line
                    type="monotone"
                    dataKey="avg"
                    name="Average"
                    stroke="var(--accent)"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    animationDuration={400}
                />
                <Line
                    type="monotone"
                    dataKey="median"
                    name="Median"
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
