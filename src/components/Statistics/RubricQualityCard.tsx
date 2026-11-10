import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import HelpPopover from '../Tests/HelpPopover';
import QualityStat from '../Tests/ScoreSheet/QualityStat';
import ItemQualityTable from '../Tests/ScoreSheet/ItemQualityTable';
import { alphaBand, MIN_STUDENTS_FOR_CORRELATION } from '../../utils/testQualityMetrics';
import { calcRubricQuality } from '../../utils/rubricQualityMetrics';
import { tierLabel } from '../../utils/tieredRubric';
import { formatPoints } from '../../utils/scoreSheet';
import type { Class, Rubric, Student, StudentRubric } from '../../types';

interface Props {
    rubric: Rubric;
    studentRubrics: StudentRubric[];
    students: Student[];
    classes: Class[];
    /** Scope to one class; every class when omitted. */
    classId?: string;
}

/**
 * Classical item-quality analysis for rubric-graded work: each criterion is an item, so teachers
 * get the same P-value / Rit / Rir / α read on a rubric's descriptors as on a test's questions.
 * Tiered rubrics are analysed one tier at a time — teaching levels have different descriptors, so
 * comparing across them would measure the tiers rather than the rubric.
 */
export default function RubricQualityCard({ rubric, studentRubrics, students, classes, classId }: Props) {
    const { t, i18n } = useTranslation();
    const [tierId, setTierId] = useState<string | undefined>(undefined);

    const report = useMemo(
        () => calcRubricQuality(rubric, studentRubrics, students, classes, { classId, tierId }),
        [rubric, studentRubrics, students, classes, classId, tierId]
    );
    const { summary } = report;
    const band = alphaBand(summary.alpha);

    return (
        <section className="card" style={{ marginBottom: 20 }} aria-labelledby="rubric-quality-title">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 12,
                }}
            >
                <h2 className="card-heading" style={{ margin: 0 }} id="rubric-quality-title">
                    {t('statistics.rubric_quality.title')}
                    <HelpPopover title={t('statistics.rubric_quality.title')}>
                        {t('statistics.rubric_quality.help')}
                    </HelpPopover>
                </h2>
                {rubric.tiered && report.tiers.length > 1 && (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
                        {t('statistics.rubric_quality.tier_label')}
                        <select
                            className="input"
                            value={report.tierId ?? ''}
                            onChange={(e) => setTierId(e.target.value)}
                        >
                            {report.tiers.map((tier) => {
                                const definition = rubric.tiered?.tiers.find((candidate) => candidate.id === tier.id);
                                return (
                                    <option key={tier.id} value={tier.id}>
                                        {definition ? tierLabel(definition) : tier.id} ({tier.count})
                                    </option>
                                );
                            })}
                        </select>
                    </label>
                )}
            </div>

            {summary.n === 0 ? (
                <p className="text-muted text-sm">{t('statistics.rubric_quality.no_data')}</p>
            ) : (
                <>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                        <QualityStat
                            label={t('tests.quality.n')}
                            value={String(summary.n)}
                            help={t('tests.quality.n_help')}
                        />
                        <QualityStat
                            label={t('tests.quality.mean')}
                            value={`${formatPoints(Math.round((summary.mean ?? 0) * 10) / 10, i18n.language)} / ${formatPoints(summary.maxPoints, i18n.language)}`}
                        />
                        <QualityStat
                            label={t('tests.quality.sd')}
                            value={summary.sd === null ? '—' : summary.sd.toFixed(1)}
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
                    </div>
                    <ItemQualityTable
                        report={report}
                        itemLabel={(index) => rubric.criteria[index]?.title || `#${index + 1}`}
                        firstColumn={t('statistics.rubric_quality.criterion')}
                        heading={t('statistics.rubric_quality.items_title')}
                        help={t('statistics.rubric_quality.items_help')}
                        footer={
                            <>
                                {summary.n < MIN_STUDENTS_FOR_CORRELATION && (
                                    <p className="text-muted text-xs" style={{ marginTop: 8 }}>
                                        {t('statistics.rubric_quality.small_sample')}
                                    </p>
                                )}
                                {report.groupedRows > 0 && (
                                    <p className="text-muted text-xs" style={{ marginTop: 4 }}>
                                        {t('statistics.rubric_quality.grouped_note')}
                                    </p>
                                )}
                            </>
                        }
                    />
                </>
            )}
        </section>
    );
}
