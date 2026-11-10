import React from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import HelpPopover from '../HelpPopover';
import { discriminationColor, pValueColor } from '../ItemAnalysisPanel';
import { formatPoints } from '../../../utils/scoreSheet';
import type { ItemQualityFlag, ItemQualityReport } from '../../../utils/testQualityMetrics';
import { asTextColor, ritColor } from './qualityColors';

interface Props {
    report: ItemQualityReport;
    /** Label for the item at `index` — a question number or a criterion title. */
    itemLabel: (index: number) => string;
    /** Header of the first column ("Question" for a test, "Criterion" for a rubric). */
    firstColumn: string;
    heading: React.ReactNode;
    help: string;
    /** Shown under the table, e.g. the small-sample caveat. */
    footer?: React.ReactNode;
}

function fmt(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
}

/**
 * P-value chart plus the per-item table, shared by the test score sheet and the rubric statistics
 * view so both read the same columns off the same report.
 */
export default function ItemQualityTable({ report, itemLabel, firstColumn, heading, help, footer }: Props) {
    const { t, i18n } = useTranslation();
    const { items } = report;

    return (
        <section className="card" aria-labelledby="quality-items-title">
            <h3 id="quality-items-title" style={{ margin: '0 0 8px' }}>
                {heading}
                <HelpPopover title={typeof heading === 'string' ? heading : firstColumn}>{help}</HelpPopover>
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                {t('tests.results.item_analysis_pvalue_chart_title')}
            </div>
            <ResponsiveContainer width="100%" height={160}>
                <BarChart
                    data={items.map((it, i) => ({ label: itemLabel(i), p: it.pValue }))}
                    margin={{ top: 4, right: 8, bottom: 0, left: -16 }}
                >
                    <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <YAxis domain={[0, 1]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <Tooltip
                        contentStyle={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                        }}
                        formatter={(value: unknown) => [
                            typeof value === 'number' ? value.toFixed(2) : '—',
                            t('tests.quality.p_value'),
                        ]}
                    />
                    <Bar dataKey="p" radius={[4, 4, 0, 0]}>
                        {items.map((it, i) => (
                            <Cell key={i} fill={pValueColor(it.pValue)} fillOpacity={0.8} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                            {(
                                [
                                    [firstColumn, 'left'],
                                    [t('tests.quality.max'), 'right'],
                                    [t('tests.quality.item_mean'), 'right'],
                                    [t('tests.quality.p_value'), 'right'],
                                    [t('tests.quality.rit'), 'right'],
                                    [t('tests.quality.rir'), 'right'],
                                    [t('tests.quality.discrimination'), 'right'],
                                    [t('tests.quality.alpha_if_deleted'), 'right'],
                                    [t('tests.quality.flags'), 'left'],
                                ] as const
                            ).map(([label, align]) => (
                                <th
                                    key={label}
                                    scope="col"
                                    style={{ textAlign: align, padding: '6px 8px', whiteSpace: 'nowrap' }}
                                >
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((it, i) => (
                            <tr key={it.itemId} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td style={{ padding: '6px 8px' }}>{itemLabel(i)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                                    {formatPoints(it.maxPoints, i18n.language)}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmt(it.mean, 1)}</td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: asTextColor(pValueColor(it.pValue)),
                                    }}
                                >
                                    {fmt(it.pValue)}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: ritColor(it.rit),
                                    }}
                                >
                                    {fmt(it.rit)}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: ritColor(it.rir),
                                    }}
                                >
                                    {fmt(it.rir)}
                                </td>
                                <td
                                    style={{
                                        textAlign: 'right',
                                        padding: '6px 8px',
                                        fontWeight: 700,
                                        color: asTextColor(discriminationColor(it.discrimination)),
                                    }}
                                >
                                    {it.discrimination === null
                                        ? '—'
                                        : `${it.discrimination >= 0 ? '+' : ''}${it.discrimination.toFixed(2)}`}
                                </td>
                                <td style={{ textAlign: 'right', padding: '6px 8px' }}>
                                    {fmt(it.alphaIfDeleted)}
                                    {it.flags.includes('alpha_rises') && <span aria-hidden> ▲</span>}
                                </td>
                                <td style={{ padding: '6px 8px' }}>
                                    {it.flags.length === 0
                                        ? '—'
                                        : it.flags.map((f: ItemQualityFlag) => (
                                              <span key={f} className="badge badge-yellow" style={{ marginRight: 4 }}>
                                                  {t(`tests.quality.flag_${f}`)}
                                              </span>
                                          ))}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {footer}
        </section>
    );
}
