import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, BookOpen, Users } from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import VocabCefrDistributionChart from '../components/Statistics/VocabCefrDistributionChart';
import { useApp } from '../context/AppContext';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { getAllClassVocabProfiles, collectVocabExportRows } from '../utils/vocabProfileAggregator';
import type { CefrLevel } from '../types';

export default function VocabularyDashboardPage() {
    const { classes, students, rubrics, analysisResults } = useApp();
    const { t } = useTranslation();

    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [exportBand, setExportBand] = useState<'all' | CefrLevel>('all');

    const classProfiles = useMemo(
        () => getAllClassVocabProfiles(classes, students, analysisResults),
        [classes, students, analysisResults]
    );

    const visibleClassProfiles = useMemo(
        () => (selectedClassId === 'all' ? classProfiles : classProfiles.filter((p) => p.classId === selectedClassId)),
        [classProfiles, selectedClassId]
    );

    const classChartEntries = useMemo(
        () =>
            visibleClassProfiles.map((p) => ({
                name: p.className,
                levelCounts: p.levelCounts,
                totalWords: p.totalWords,
            })),
        [visibleClassProfiles]
    );

    const studentChartEntries = useMemo(() => {
        const profile = selectedClassId === 'all' ? null : classProfiles.find((p) => p.classId === selectedClassId);
        if (!profile) return [];
        return profile.studentProfiles.map((sp) => ({
            name: sp.studentName,
            levelCounts: sp.levelCounts,
            totalWords: sp.totalWords,
        }));
    }, [classProfiles, selectedClassId]);

    const studentProfilesForDrillDown = useMemo(() => {
        const profile = selectedClassId === 'all' ? null : classProfiles.find((p) => p.classId === selectedClassId);
        return profile?.studentProfiles ?? [];
    }, [classProfiles, selectedClassId]);

    function handleExportCsv() {
        const band = exportBand === 'all' ? undefined : exportBand;
        const rows = collectVocabExportRows(rubrics, analysisResults, band);
        const csvRows = rows.map((r) => ({
            [t('vocabProfile.csv_column_word')]: r.word,
            [t('vocabProfile.csv_column_level')]: r.level,
            [t('vocabProfile.csv_column_definition')]: r.definition,
            [t('vocabProfile.csv_column_source')]: t(`vocabProfile.csv_source_${r.source}`),
        }));
        const csv = Papa.unparse(csvRows);
        const suffix = band ?? t('vocabProfile.csv_band_all');
        const filename = `${t('vocabProfile.csv_filename')}_${suffix}.csv`;
        saveAs(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
    }

    return (
        <>
            <Topbar title={t('vocabProfile.page_title')} />
            <div className="page-content fade-in">
                <p className="text-muted text-sm" style={{ marginTop: 0, marginBottom: 20 }}>
                    {t('vocabProfile.page_subtitle')}
                </p>

                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '0 0 auto', minWidth: 200, marginBottom: 0 }}>
                        <label htmlFor="vocab-class-filter">{t('vocabProfile.label_class_filter')}</label>
                        <select
                            id="vocab-class-filter"
                            aria-label={t('vocabProfile.label_class_filter')}
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                        >
                            <option value="all">{t('vocabProfile.all_classes')}</option>
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ flex: '0 0 auto', minWidth: 160, marginBottom: 0 }}>
                        <label htmlFor="vocab-export-band">{t('vocabProfile.label_export_band')}</label>
                        <select
                            id="vocab-export-band"
                            aria-label={t('vocabProfile.label_export_band')}
                            value={exportBand}
                            onChange={(e) => setExportBand(e.target.value as 'all' | CefrLevel)}
                        >
                            <option value="all">{t('vocabProfile.csv_band_all')}</option>
                            {CEFR_LEVELS.map((lvl) => (
                                <option key={lvl} value={lvl}>
                                    {lvl}
                                </option>
                            ))}
                        </select>
                    </div>

                    <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
                        <Download size={14} /> {t('vocabProfile.export_csv')}
                    </button>
                </div>

                <div className="card" style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                        <Users size={16} style={{ color: 'var(--text-muted)' }} />
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                            {selectedClassId === 'all'
                                ? t('vocabProfile.class_distribution_title')
                                : t('vocabProfile.class_distribution_title_single')}
                        </h3>
                    </div>
                    <VocabCefrDistributionChart entries={classChartEntries} />
                </div>

                {selectedClassId !== 'all' && (
                    <div className="card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            <BookOpen size={16} style={{ color: 'var(--text-muted)' }} />
                            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                                {t('vocabProfile.student_drilldown_title')}
                            </h3>
                        </div>
                        <VocabCefrDistributionChart entries={studentChartEntries} />

                        {studentProfilesForDrillDown.length > 0 && (
                            <div style={{ overflowX: 'auto', marginTop: 16 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'left',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_student')}
                                            </th>
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_estimated_level')}
                                            </th>
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_total_words')}
                                            </th>
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_analyses')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentProfilesForDrillDown.map((sp) => (
                                            <tr key={sp.studentId} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td style={{ padding: '8px 10px' }}>{sp.studentName}</td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <CefrBadge level={sp.estimatedLevel} size="sm" />
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    {sp.totalWords}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    {sp.analysisCount}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </>
    );
}
