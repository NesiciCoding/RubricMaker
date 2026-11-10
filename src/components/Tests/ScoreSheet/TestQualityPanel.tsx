import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { alphaBand, MIN_STUDENTS_FOR_CORRELATION, type ItemQualityReport } from '../../../utils/testQualityMetrics';
import { formatPoints } from '../../../utils/scoreSheet';
import type { Test } from '../../../types';
import type { LabelCount } from '../../../utils/testGradingNorm';
import QualityStat from './QualityStat';
import ItemQualityTable from './ItemQualityTable';

interface Props {
    test: Test;
    report: ItemQualityReport;
    /** Grade per student (numeric norms) for the distribution; percentages are binned otherwise. */
    grades: (number | null)[];
    percentages: number[];
    passGrade: number;
    passRate: number | null;
    meanGrade: number | null;
    /** Students per norm-table label (IO, B, E…), lowest first; empty when no label grades were given. */
    labelCounts?: LabelCount[];
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
    const { summary } = report;
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

    if (summary.n === 0 && report.items.every((i) => i.sampleSize === 0)) {
        return <p className="text-muted text-sm">{t('tests.quality.no_data')}</p>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="card" aria-labelledby="quality-summary-title">
                <h3 id="quality-summary-title" style={{ margin: '0 0 10px' }}>
                    {t('tests.quality.summary_title')}
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <QualityStat
                        label={t('tests.quality.n')}
                        value={String(summary.n)}
                        help={t('tests.quality.n_help')}
                    />
                    <QualityStat
                        label={t('tests.quality.mean')}
                        value={
                            summary.mean === null
                                ? '—'
                                : `${formatPoints(Math.round(summary.mean * 10) / 10, i18n.language)} / ${formatPoints(summary.maxPoints, i18n.language)}`
                        }
                    />
                    <QualityStat
                        label={t('tests.quality.sd')}
                        value={summary.sd === null ? '—' : summary.sd.toFixed(1)}
                    />
                    <QualityStat
                        label={t('tests.quality.median')}
                        value={summary.median === null ? '—' : formatPoints(summary.median, i18n.language)}
                    />
                    <QualityStat
                        label={t('tests.quality.range')}
                        value={
                            summary.min === null
                                ? '—'
                                : `${formatPoints(summary.min, i18n.language)}–${formatPoints(summary.max!, i18n.language)}`
                        }
                    />
                    <QualityStat
                        label={t('tests.quality.alpha')}
                        value={
                            summary.alpha === null
                                ? '—'
                                : `${summary.alpha.toFixed(2)} · ${t(`tests.quality.alpha_${band}`)}`
                        }
                        help={t('tests.quality.alpha_help')}
                    />
                    <QualityStat
                        label={t('tests.quality.sem')}
                        value={summary.sem === null ? '—' : summary.sem.toFixed(1)}
                        help={t('tests.quality.sem_help')}
                    />
                    {passRate !== null && (
                        <QualityStat label={t('tests.quality.pass_rate')} value={`${Math.round(passRate * 100)}%`} />
                    )}
                    {meanGrade !== null && (
                        <QualityStat label={t('tests.quality.mean_grade')} value={meanGrade.toFixed(1)} />
                    )}
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

            <ItemQualityTable
                report={report}
                itemLabel={questionLabel}
                firstColumn={t('tests.quality.question')}
                heading={t('tests.quality.items_title')}
                help={t('tests.quality.items_help')}
                footer={
                    summary.n < MIN_STUDENTS_FOR_CORRELATION ? (
                        <p className="text-muted text-xs" style={{ marginTop: 8 }}>
                            {t('tests.quality.small_sample')}
                        </p>
                    ) : undefined
                }
            />
        </div>
    );
}
