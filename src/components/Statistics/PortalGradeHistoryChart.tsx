import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';

/** Grade-history line chart on the student portal. Split out so recharts loads lazily. */
export default function PortalGradeHistoryChart({ history }: { history: Array<{ dateStr: string; score: number }> }) {
    const { t } = useTranslation();
    return (
        <ResponsiveContainer width="100%" height={200}>
            <LineChart data={history} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                    dataKey="dateStr"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    interval="preserveStartEnd"
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} unit="%" />
                <Tooltip
                    contentStyle={{
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                    }}
                    formatter={(value: unknown) => [`${value}%`, t('studentPortal.score')]}
                />
                <Line
                    type="monotone"
                    dataKey="score"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}
