import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';

/** Grade-history line chart on the student portal. Split out so recharts loads lazily. */
export default function PortalGradeHistoryChart({ history }: { history: Array<{ dateStr: string; score: number }> }) {
    const { t, i18n } = useTranslation();
    // nl/fr/de use a comma decimal separator — a raw `${value}%` always rendered a dot (#705).
    const percentFormat = new Intl.NumberFormat(i18n.language, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return (
        <div>
            <div role="img" aria-label={t('studentPortal.grade_history')}>
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
                            formatter={(value: unknown) => [
                                `${percentFormat.format(Number(value))}%`,
                                t('studentPortal.score'),
                            ]}
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
            </div>
            <table className="sr-only">
                <caption>{t('studentPortal.grade_history')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('studentPortal.grade_history_table_date')}</th>
                        <th scope="col">{t('studentPortal.score')}</th>
                    </tr>
                </thead>
                <tbody>
                    {history.map((h, i) => (
                        <tr key={`${h.dateStr}-${i}`}>
                            <th scope="row">{h.dateStr}</th>
                            <td>{percentFormat.format(h.score)}%</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
