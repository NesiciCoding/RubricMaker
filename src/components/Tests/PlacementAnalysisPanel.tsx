import React, { useMemo } from 'react';
import { BarChart2, Users, Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CefrBadge from '../CEFR/CefrBadge';
import HelpPopover from './HelpPopover';
import {
    placementLevelDistribution,
    placementItemAnalysis,
    placementSummaryRows,
    placementSummaryCsv,
} from '../../utils/placementAnalysis';
import type { Test, Student, StudentTest } from '../../types';

interface Props {
    test: Test;
    studentTests: StudentTest[];
    students: Student[];
}

/**
 * Class-level placement analytics — the placement-mode counterparts of ClassAverageAdjuster,
 * ItemAnalysisPanel, and the summary export (all point-based, so meaningless for a provisional
 * CEFR estimate). Renders a CEFR level distribution, per-item difficulty, and a CSV export.
 */
export default function PlacementAnalysisPanel({ test, studentTests, students }: Props) {
    const { t } = useTranslation();

    const nameById = useMemo(() => new Map(students.map((s) => [s.id, s.name])), [students]);
    const distribution = useMemo(
        () => placementLevelDistribution(test, studentTests, nameById),
        [test, studentTests, nameById]
    );
    const items = useMemo(() => placementItemAnalysis(test, studentTests), [test, studentTests]);
    const summaryRows = useMemo(
        () => placementSummaryRows(test, studentTests, nameById),
        [test, studentTests, nameById]
    );

    const maxCount = Math.max(1, ...distribution.buckets.map((b) => b.count));

    async function handleExportCsv() {
        const header = [
            t('tests.results.placement_csv_student'),
            t('tests.results.placement_csv_level'),
            t('tests.results.placement_csv_questions'),
            t('tests.results.placement_csv_assessed'),
        ];
        const csv = placementSummaryCsv(summaryRows, header);
        const { saveAs } = await import('file-saver');
        const { sanitizeFilename } = await import('../../utils/exportDataPrep');
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${sanitizeFilename(test.name)}_placement.csv`);
    }

    if (distribution.assessed === 0) {
        return (
            <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>
                    <Users size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('tests.results.placement_title')}
                </h3>
                <p className="text-muted text-sm">{t('tests.results.placement_no_results')}</p>
            </div>
        );
    }

    return (
        <>
            {/* Level distribution — the class-average equivalent for a provisional CEFR result */}
            <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>
                    <Users size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('tests.results.placement_distribution_title')}
                    <HelpPopover title={t('tests.results.placement_distribution_title')}>
                        {t('tests.results.placement_distribution_help')}
                    </HelpPopover>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {distribution.buckets.map((bucket) => (
                        <div key={bucket.level} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 44, flexShrink: 0 }}>
                                <CefrBadge level={bucket.level} size="sm" />
                            </div>
                            <div
                                style={{
                                    flex: 1,
                                    height: 18,
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 4,
                                    overflow: 'hidden',
                                }}
                            >
                                <div
                                    style={{
                                        width: `${(bucket.count / maxCount) * 100}%`,
                                        height: '100%',
                                        background: 'var(--accent)',
                                        minWidth: bucket.count > 0 ? 2 : 0,
                                    }}
                                    title={bucket.studentNames.join(', ')}
                                />
                            </div>
                            <div style={{ width: 28, textAlign: 'right', fontSize: '0.85rem', color: 'var(--text)' }}>
                                {bucket.count}
                            </div>
                        </div>
                    ))}
                </div>
                <p className="text-muted text-sm" style={{ marginTop: 8 }}>
                    {t('tests.results.placement_assessed_count', { count: distribution.assessed })}
                    {distribution.unplaced > 0
                        ? ` · ${t('tests.results.placement_unplaced_count', { count: distribution.unplaced })}`
                        : ''}
                </p>
            </div>

            {/* Per-item difficulty */}
            <div className="card">
                <h3 style={{ margin: '0 0 8px' }}>
                    <BarChart2 size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {t('tests.results.placement_item_title')}
                    <HelpPopover title={t('tests.results.placement_item_title')}>
                        {t('tests.results.placement_item_help')}
                    </HelpPopover>
                </h3>
                {items.length === 0 ? (
                    <p className="text-muted text-sm">{t('tests.results.placement_item_none')}</p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ textAlign: 'left', padding: '6px 8px' }}>
                                        {t('tests.results.placement_item_question')}
                                    </th>
                                    <th style={{ textAlign: 'center', padding: '6px 8px' }}>
                                        {t('tests.results.placement_item_level')}
                                    </th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                        {t('tests.results.placement_item_seen')}
                                    </th>
                                    <th style={{ textAlign: 'right', padding: '6px 8px' }}>
                                        {t('tests.results.placement_item_correct_pct')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.questionId} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px 8px', maxWidth: 320 }}>
                                            <span
                                                style={{
                                                    display: 'block',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={item.prompt}
                                            >
                                                {item.prompt}
                                            </span>
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                            {item.level ? <CefrBadge level={item.level} size="sm" /> : '—'}
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.asked}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                                            {Math.round(item.pct)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Summary export */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleExportCsv}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                    <Download size={14} />
                    {t('tests.results.placement_export_csv')}
                </button>
            </div>
        </>
    );
}
