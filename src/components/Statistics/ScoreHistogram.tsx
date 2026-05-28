import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
    scores: number[];
}

const BUCKETS = ['0–10', '10–20', '20–30', '30–40', '40–50', '50–60', '60–70', '70–80', '80–90', '90–100'];

export function buildHistogramData(scores: number[]) {
    const counts = new Array(10).fill(0);
    for (const s of scores) {
        const idx = Math.min(Math.floor(s / 10), 9);
        counts[idx]++;
    }
    return BUCKETS.map((range, i) => ({ range, count: counts[i] }));
}

export default function ScoreHistogram({ scores }: Props) {
    const data = useMemo(() => buildHistogramData(scores), [scores]);
    const total = scores.length;

    if (total === 0) {
        return (
            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '24px 0' }}>
                No scores to display.
            </p>
        );
    }

    return (
        <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <XAxis dataKey="range" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                    contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                    }}
                    formatter={(count: unknown) => {
                        const c = typeof count === 'number' ? count : 0;
                        return [`${c} student${c !== 1 ? 's' : ''} (${total > 0 ? ((c / total) * 100).toFixed(0) : 0}%)`, 'Count'];
                    }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {data.map((_, i) => (
                        <Cell key={i} fill="var(--accent)" fillOpacity={0.75} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
