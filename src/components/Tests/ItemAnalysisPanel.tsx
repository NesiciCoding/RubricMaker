import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart2 } from 'lucide-react';
import HelpPopover from './HelpPopover';
import { calcTestItemAnalysis } from '../../utils/testSummaryAggregator';
import type { Test, StudentTest } from '../../types';

interface Props {
    test: Test;
    studentTests: StudentTest[];
}

function discriminationColor(value: number | null): string {
    if (value === null) return 'var(--text-muted)';
    if (value < 0.1) return 'var(--red)';
    if (value < 0.3) return 'var(--yellow)';
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

    return (
        <div className="card">
            <h3 style={{ margin: '0 0 8px' }}>
                <BarChart2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {t('tests.results.item_analysis_title')}
                <HelpPopover title={t('tests.results.item_analysis_title')}>
                    {t('tests.results.item_analysis_help')}
                </HelpPopover>
            </h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                {t('tests.results.item_analysis_question')}
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
