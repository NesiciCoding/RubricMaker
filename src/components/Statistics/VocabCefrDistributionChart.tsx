import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';
import { CEFR_LEVELS, CEFR_LEVEL_COLORS } from '../../data/cefrDescriptors';
import type { CefrLevel } from '../../types';

export interface VocabDistributionEntry {
    /** Display label for this row (student or class name) */
    name: string;
    levelCounts: Record<CefrLevel, number>;
    totalWords: number;
}

interface Props {
    entries: VocabDistributionEntry[];
    height?: number;
}

export default function VocabCefrDistributionChart({ entries, height = 320 }: Props) {
    const { t } = useTranslation();

    const visibleEntries = entries.filter((e) => e.totalWords > 0);

    if (visibleEntries.length === 0) {
        return (
            <div className="empty-state">
                <p>{t('vocabProfile.empty_chart')}</p>
            </div>
        );
    }

    const data = visibleEntries.map((entry) => {
        const point: Record<string, string | number> = { name: entry.name };
        CEFR_LEVELS.forEach((lvl) => {
            point[lvl] = entry.levelCounts[lvl];
        });
        return point;
    });

    return (
        <div>
            <div role="img" aria-label={t('vocabProfile.chart_aria_label')}>
                <ResponsiveContainer width="100%" height={height}>
                    <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: -8 }}>
                        <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}
                        />
                        <Legend />
                        {CEFR_LEVELS.map((lvl) => (
                            <Bar key={lvl} dataKey={lvl} stackId="vocab" fill={CEFR_LEVEL_COLORS[lvl]} name={lvl} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <table className="sr-only">
                <caption>{t('vocabProfile.chart_aria_label')}</caption>
                <thead>
                    <tr>
                        <th scope="col">{t('vocabProfile.table_header_name')}</th>
                        {CEFR_LEVELS.map((lvl) => (
                            <th key={lvl} scope="col">
                                {lvl}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {visibleEntries.map((entry) => (
                        <tr key={entry.name}>
                            <td>{entry.name}</td>
                            {CEFR_LEVELS.map((lvl) => (
                                <td key={lvl}>{entry.levelCounts[lvl]}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
