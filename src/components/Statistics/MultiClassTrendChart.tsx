import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import type { MultiTrendPoint } from '../../utils/classComparisonAggregator';

const CLASS_COLORS = [
    'var(--accent)',
    'var(--purple, #a855f7)',
    'var(--green, #22c55e)',
    'var(--yellow, #eab308)',
];

interface Props {
    data: MultiTrendPoint[];
    classIds: string[];
    classNames: Record<string, string>; // classId → name
}

export default function MultiClassTrendChart({ data, classIds, classNames }: Props) {
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
                    formatter={(value: unknown, name: unknown) => [
                        `${value ?? 0}%`,
                        classNames[String(name)] ?? String(name),
                    ]}
                />
                <Legend
                    wrapperStyle={{ paddingTop: 8 }}
                    formatter={(value) => classNames[value] ?? value}
                />
                {classIds.map((classId, i) => (
                    <Line
                        key={classId}
                        type="monotone"
                        dataKey={classId}
                        name={classId}
                        stroke={CLASS_COLORS[i % CLASS_COLORS.length]}
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        animationDuration={400}
                        connectNulls={false}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}
