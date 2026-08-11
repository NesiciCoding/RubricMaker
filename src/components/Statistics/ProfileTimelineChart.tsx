import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import type { TooltipPayloadEntry } from 'recharts';

type TimelinePoint = { dateStr: string; score: number; rubric: { name: string } };

/** Performance-timeline line chart on the student profile. Split out so recharts loads lazily. */
export default function ProfileTimelineChart({ history }: { history: TimelinePoint[] }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={history} margin={{ top: 10, right: 10, bottom: 20, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="dateStr" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} tickMargin={12} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                <Tooltip
                    contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        fontSize: '0.85rem',
                    }}
                    labelStyle={{ color: 'var(--text)', fontWeight: 600, marginBottom: 4 }}
                    itemStyle={{ color: 'var(--accent)', fontWeight: 600 }}
                    formatter={(val: unknown, _name: unknown, props: TooltipPayloadEntry) => [
                        `${typeof val === 'number' ? val : 0}%`,
                        (props.payload as TimelinePoint).rubric.name,
                    ]}
                />
                <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--accent)"
                    strokeWidth={3}
                    dot={{ fill: 'var(--bg-card)', stroke: 'var(--accent)', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: 'var(--accent)' }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
