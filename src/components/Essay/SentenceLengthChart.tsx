import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useTranslation } from 'react-i18next';

export type SentenceLengthChartShape = 'bar' | 'line' | 'area';

const AXIS_TICK = { fill: 'var(--text-muted)', fontSize: 11 };
const TOOLTIP_STYLE = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8 };

/** Words per sentence in text order; `shape` swaps the mark without touching the data or axes. */
export default function SentenceLengthChart({
    lengths,
    shape = 'bar',
}: {
    lengths: number[];
    shape?: SentenceLengthChartShape;
}) {
    const { t } = useTranslation();
    const data = useMemo(() => lengths.map((words, i) => ({ sentence: i + 1, words })), [lengths]);
    if (data.length === 0) return null;

    const common = { data, margin: { top: 4, right: 8, bottom: 0, left: -16 } };
    const axes = [
        <XAxis key="x" dataKey="sentence" tick={AXIS_TICK} />,
        <YAxis key="y" allowDecimals={false} tick={AXIS_TICK} />,
        <Tooltip
            key="tip"
            contentStyle={TOOLTIP_STYLE}
            formatter={(value: unknown) => [String(value), t('writingStats.words')]}
            labelFormatter={(label: unknown) => `#${label}`}
        />,
    ];

    return (
        <div role="img" aria-label={`${t('writingStats.sentenceLengths')}: ${lengths.join(', ')}`}>
            <ResponsiveContainer width="100%" height={120}>
                {shape === 'line' ? (
                    <LineChart {...common}>
                        {axes}
                        <Line dataKey="words" stroke="var(--accent)" strokeWidth={2} dot={false} />
                    </LineChart>
                ) : shape === 'area' ? (
                    <AreaChart {...common}>
                        {axes}
                        <Area dataKey="words" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} />
                    </AreaChart>
                ) : (
                    <BarChart {...common}>
                        {axes}
                        <Bar dataKey="words" fill="var(--accent)" fillOpacity={0.75} radius={[3, 3, 0, 0]} />
                    </BarChart>
                )}
            </ResponsiveContainer>
        </div>
    );
}
