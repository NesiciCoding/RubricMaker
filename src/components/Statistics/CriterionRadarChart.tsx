import React from 'react';
import {
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export interface CriterionRadarDataPoint {
    name: string;
    avg: number;
    [studentId: string]: number | string;
}

export interface SelectedStudent {
    id: string;
    name: string;
    color: string;
}

interface Props {
    data: CriterionRadarDataPoint[];
    accentColor: string;
    selectedStudents?: SelectedStudent[];
}

export default function CriterionRadarChart({ data, accentColor, selectedStudents }: Props) {
    if (data.length < 3) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '40px 0' }}>
                At least 3 criteria are needed to display the radar chart.
            </p>
        );
    }

    const hasStudents = selectedStudents && selectedStudents.length > 0;

    return (
        <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid strokeOpacity={0.3} />
                <PolarAngleAxis
                    dataKey="name"
                    tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                />
                <PolarRadiusAxis
                    domain={[0, 100]}
                    tick={{ fill: 'var(--text-dim)', fontSize: 10 }}
                    tickCount={5}
                    tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                    contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                    }}
                    formatter={(value: number) => `${value}%`}
                />
                <Radar
                    name="Class Average"
                    dataKey="avg"
                    stroke={accentColor}
                    fill={accentColor}
                    fillOpacity={0.25}
                />
                {hasStudents && selectedStudents!.map(s => (
                    <Radar
                        key={s.id}
                        name={s.name}
                        dataKey={s.id}
                        stroke={s.color}
                        fill={s.color}
                        fillOpacity={0.18}
                    />
                ))}
                {hasStudents && <Legend />}
            </RadarChart>
        </ResponsiveContainer>
    );
}
