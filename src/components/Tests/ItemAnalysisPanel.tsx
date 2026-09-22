import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import HelpPopover from './HelpPopover';
import { calcTestItemAnalysis } from '../../utils/testSummaryAggregator';
import type { Test, StudentTest } from '../../types';

interface Props {
    test: Test;
    studentTests: StudentTest[];
}

export function discriminationColor(value: number | null): string {
    if (value === null) return 'var(--text-muted)';
    if (value < 0.1) return 'var(--red)';
    if (value < 0.3) return 'var(--yellow)';
    return 'var(--green)';
}

/** p-value (difficulty): low = hard, high = easy; the extremes are the ones worth a second look. */
export function pValueColor(value: number | null): string {
    if (value === null) return 'var(--text-muted)';
    if (value < 0.3 || value > 0.9) return 'var(--red)';
    if (value < 0.5) return 'var(--yellow)';
    return 'var(--green)';
}

export default function ItemAnalysisPanel({ test, studentTests }: Props) {
    const { t } = useTranslation();

    if (studentTests.filter((st) => st.answers.length > 0).length === 0) {
        return (
            <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>
                    <BarChart2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('tests.results.item_analysis_title')}
                </h3>
                <p className="text-muted text-sm">{t('tests.results.adjuster_no_submissions')}</p>
            </div>
        );
    }

    const analysis = calcTestItemAnalysis(studentTests, test);
    const chartData = analysis.map((row, index) => ({
        label: `Q${index + 1}`,
        // Keep the raw (nullable) p-value for tooltip/color; a null renders no bar rather than a
        // misleading zero-height "hard" bar.
        pValue: row.pValue,
    }));

    return (
        <div className="card">
            <h3 style={{ margin: '0 0 8px' }}>
                <BarChart2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('tests.results.item_analysis_title')}
                <HelpPopover title={t('tests.results.item_analysis_title')}>
                    {t('tests.results.item_analysis_help')}
                </HelpPopover>
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                {t('tests.results.item_analysis_pvalue_chart_title')}
            </div>
            <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis domain={[0, 1]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                        }}
                        formatter={(value: unknown) => {
                            const label = typeof value === 'number' ? value.toFixed(2) : '—';
                            return [label, t('tests.results.item_analysis_pvalue')];
                        }}
                    />
                    <Bar dataKey="pValue" radius={[4, 4, 0, 0]}>
                        {chartData.map((row, i) => (
                            <Cell key={i} fill={pValueColor(row.pValue)} fillOpacity={0.8} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('tests.results.item_analysis_question')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.item_analysis_pvalue')}
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                {t('tests.results.item_analysis_discrimination')}
                            </th>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('tests.results.item_analysis_distractor')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {analysis.map((row, index) => (
                            <tr key={row.questionId} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px' }}>
                                    {t('tests.question_number', { number: index + 1 })}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: pValueColor(row.pValue),
                                    }}
                                >
                                    {row.pValue === null ? '—' : row.pValue.toFixed(2)}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: discriminationColor(row.discrimination),
                                    }}
                                >
                                    {row.discrimination === null
                                        ? t('tests.results.item_analysis_insufficient_data')
                                        : `${row.discrimination >= 0 ? '+' : ''}${row.discrimination.toFixed(2)}`}
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                    {row.topDistractor
                                        ? t('tests.results.item_analysis_distractor_value', {
                                              text: row.topDistractor.text,
                                              count: row.topDistractor.count,
                                          })
                                        : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
