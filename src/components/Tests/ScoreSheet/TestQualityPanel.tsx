import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import HelpPopover from '../HelpPopover';
import { discriminationColor, pValueColor } from '../ItemAnalysisPanel';
import { alphaBand, type ItemQualityFlag, type TestQualityReport } from '../../../utils/testQualityMetrics';
import { formatPoints } from '../../../utils/scoreSheet';
import type { Test } from '../../../types';
import type { LabelCount } from '../../../utils/testGradingNorm';
import { asTextColor, ritColor } from './qualityColors';

interface Props {
    test: Test;
    report: TestQualityReport;
    /** Grade per student (numeric norms) for the distribution; percentages are binned otherwise. */
    grades: (number | null)[];
    percentages: number[];
    passGrade: number;
    passRate: number | null;
    meanGrade: number | null;
    /** Students per norm-table label (IO, B, E…), lowest first; empty when no label grades were given. */
    labelCounts?: LabelCount[];
}

function fmt(value: number | null, digits = 2): string {
    return value === null ? '—' : value.toFixed(digits);
}

function Stat({ label, value, help }: { label: string; value: string; help?: string }) {
    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '8px 12px',
                minWidth: 110,
            }}
        >
            <div className="text-xs text-muted">
                {label}
                {help && <HelpPopover title={label}>{help}</HelpPopover>}
            </div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{value}</div>
        </div>
    );
}

export default function TestQualityPanel({
    test,
    report,
    grades,
    percentages,
    passGrade,
    passRate,
    meanGrade,
    labelCounts = [],
}: Props) {
    const { t, i18n } = useTranslation();
    const { summary, items } = report;
    const numericGrades = grades.filter((g): g is number => g !== null);
    const useGrades = numericGrades.length > 0;

    const distribution = useGrades
        ? Array.from({ length: 10 }, (_, i) => ({
              label: String(i + 1),
              count: numericGrades.filter((g) => Math.min(10, Math.max(1, Math.round(g))) === i + 1).length,
          }))
        : Array.from({ length: 10 }, (_, i) => ({
              label: `${i * 10}`,
              count: percentages.filter((p) => Math.min(9, Math.floor(p / 10)) === i).length,
          }));

    const band = alphaBand(summary.alpha);
    const questionLabel = (index: number) =>
        test.scoreOnly ? test.questions[index]?.prompt : t('tests.question_number', { number: index + 1 });

    if (summary.n === 0 && items.every((i) => i.sampleSize === 0)) {
        return <p className="text-muted text-sm">{t('tests.quality.no_data')}</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="card" aria-labelledby="quality-summary-title">
                <h3 id="quality-summary-title" style={{ margin: '0 0 10px' }}>
                    {t('tests.quality.summary_title')}
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Stat label={t('tests.quality.n')} value={String(summary.n)} help={t('tests.quality.n_help')} />
                    <Stat
                        label={t('tests.quality.mean')}
                        value={
                            summary.mean === null
                                ? '—'
                                : `${formatPoints(Math.round(summary.mean * 10) / 10, i18n.language)} / ${formatPoints(summary.maxPoints, i18n.language)}`
                        }
                    />
                    <Stat label={t('tests.quality.sd')} value={fmt(summary.sd, 1)} />
                    <Stat
                        label={t('tests.quality.median')}
                        value={summary.median === null ? '—' : formatPoints(summary.median, i18n.language)}
                    />
                    <Stat
                        label={t('tests.quality.range')}
                        value={
                            summary.min === null
                                ? '—'
                                : `${formatPoints(summary.min, i18n.language)}–${formatPoints(summary.max!, i18n.language)}`
                        }
                    />
                    <Stat
                        label={t('tests.quality.alpha')}
                        value={
                            summary.alpha === null
                                ? '—'
                                : `${summary.alpha.toFixed(2)} · ${t(`tests.quality.alpha_${band}`)}`
                        }
                        help={t('tests.quality.alpha_help')}
                    />
                    <Stat
                        label={t('tests.quality.sem')}
                        value={fmt(summary.sem, 1)}
                        help={t('tests.quality.sem_help')}
                    />
                    {passRate !== null && (
                        <Stat label={t('tests.quality.pass_rate')} value={`${Math.round(passRate * 100)}%`} />
                    )}
                    {meanGrade !== null && <Stat label={t('tests.quality.mean_grade')} value={meanGrade.toFixed(1)} />}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '14px 0 4px' }}>
                    {useGrades ? t('tests.quality.distribution_grades') : t('tests.quality.distribution_percent')}
                </div>
                <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={distribution} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                        <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <Tooltip
                            contentStyle={{
                                background: 'var(--bg-card)',
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                            }}
                            formatter={(value: unknown) => [String(value), t('tests.quality.students')]}
                        />
                        {useGrades && (
                            <ReferenceLine
                                x={String(Math.round(passGrade))}
                                stroke="var(--text-muted)"
                                strokeDasharray="4 4"
                            />
                        )}
                        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {distribution.map((d, i) => (
                                <Cell
                                    key={i}
                                    fill={
                                        useGrades
                                            ? i + 1 >= passGrade
                                                ? 'var(--green)'
                                                : 'var(--red)'
                                            : 'var(--accent)'
                                    }
                                    fillOpacity={0.8}
                                />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
                {labelCounts.length > 0 && (
                    <>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '14px 0 4px' }}>
                            {t('tests.quality.distribution_labels')}
                        </div>
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={labelCounts} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                                <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <YAxis allowDecimals={false} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--bg-card)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                    }}
                                    formatter={(value: unknown) => [String(value), t('tests.quality.students')]}
                                />
                                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                    {labelCounts.map((d) => (
                                        <Cell
                                            key={`${d.label}-${String(d.passed)}`}
                                            fill={
                                                d.passed === null
                                                    ? 'var(--accent)'
                                                    : d.passed
                                                      ? 'var(--green)'
                                                      : 'var(--red)'
                                            }
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </>
                )}
            </section>

            <section className="card" aria-labelledby="quality-items-title">
                <h3 id="quality-items-title" style={{ margin: '0 0 8px' }}>
                    {t('tests.quality.items_title')}
                    <HelpPopover title={t('tests.quality.items_title')}>{t('tests.quality.items_help')}</HelpPopover>
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 4px' }}>
                    {t('tests.results.item_analysis_pvalue_chart_title')}
                </div>
                <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                        data={items.map((it, i) => ({ label: questionLabel(i), p: it.pValue }))}
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
                                        ['question', 'left'],
                                        ['max', 'right'],
                                        ['item_mean', 'right'],
                                        ['p_value', 'right'],
                                        ['rit', 'right'],
                                        ['rir', 'right'],
                                        ['discrimination', 'right'],
                                        ['alpha_if_deleted', 'right'],
                                        ['flags', 'left'],
                                    ] as const
                                ).map(([k, align]) => (
                                    <th
                                        key={k}
                                        scope="col"
                                        style={{ textAlign: align, padding: '6px 8px', whiteSpace: 'nowrap' }}
                                    >
                                        {t(`tests.quality.${k}`)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((it, i) => (
                                <tr key={it.questionId} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px 8px' }}>{questionLabel(i)}</td>
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
                                                  <span
                                                      key={f}
                                                      className="badge badge-yellow"
                                                      style={{ marginRight: 4 }}
                                                  >
                                                      {t(`tests.quality.flag_${f}`)}
                                                  </span>
                                              ))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {summary.n < 5 && (
                    <p className="text-muted text-xs" style={{ marginTop: 8 }}>
                        {t('tests.quality.small_sample')}
                    </p>
                )}
            </section>
        </div>
    );
}
