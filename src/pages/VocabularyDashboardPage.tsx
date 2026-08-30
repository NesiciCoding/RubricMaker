import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Download, BookOpen, Users, Gauge, Map, Layers } from 'lucide-react';
import Papa from 'papaparse';
import { saveAs } from 'file-saver';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import VocabCefrDistributionChart from '../components/Statistics/VocabCefrDistributionChart';
import { useAssessment, useAuthoring, useClasses, useFlashcards, useStudents } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { getAllClassVocabProfiles, collectVocabExportRows } from '../utils/vocabProfileAggregator';
import { computeTargetVerdictFromCounts } from '../utils/textLevelVerdict';
import { nanoid } from '../utils/nanoid';
import type { CefrLevel } from '../types';

export default function VocabularyDashboardPage() {
    const { students } = useStudents();
    const { classes } = useClasses();

    const { rubrics } = useAuthoring();
    const { analysisResults } = useAssessment();
    const { addFlashcardDeck } = useFlashcards();

    const { t } = useTranslation();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [exportBand, setExportBand] = useState<'all' | CefrLevel>('all');
    const [targetLevel, setTargetLevel] = useState<CefrLevel>('B1');

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

    const pooledLevelCounts = useMemo(() => {
        const acc: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0, C2: 0 };
        for (const p of visibleClassProfiles) {
            for (const lvl of CEFR_LEVELS) acc[lvl] += p.levelCounts[lvl];
        }
        return acc;
    }, [visibleClassProfiles]);

    const pooledTotal = useMemo(
        () => CEFR_LEVELS.reduce((sum, lvl) => sum + pooledLevelCounts[lvl], 0),
        [pooledLevelCounts]
    );

    const verdict = useMemo(
        () => computeTargetVerdictFromCounts(pooledLevelCounts, targetLevel),
        [pooledLevelCounts, targetLevel]
    );

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

    function handleSeedDeck() {
        const band = exportBand === 'all' ? undefined : exportBand;
        const rows = collectVocabExportRows(rubrics, analysisResults, band);
        if (rows.length === 0) {
            showToast(t('vocabProfile.seed_deck_empty'), 'info');
            return;
        }
        const bandLabel = band ?? t('vocabProfile.csv_band_all');
        const deck = addFlashcardDeck({
            name: t('vocabProfile.seed_deck_name', { band: bandLabel }),
            deckKind: 'vocabulary',
            cards: rows.map((r) => ({ id: nanoid(), front: r.word, back: r.definition, cefrLevel: r.level })),
        });
        showToast(t('vocabProfile.seed_deck_created', { name: deck.name, count: rows.length }), 'success');
        navigate(`/flashcards/${deck.id}`);
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

                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleSeedDeck}
                        title={t('vocabProfile.seed_deck_hint', 'Create a flashcard deck from these words')}
                    >
                        <Layers size={14} /> {t('vocabProfile.seed_deck', 'Seed flashcard deck')}
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

                    {pooledTotal > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                flexWrap: 'wrap',
                                marginTop: 14,
                                paddingTop: 12,
                                borderTop: '1px solid var(--border)',
                            }}
                        >
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                {t('vocabProfile.target_level_label', 'Reading level for a class at')}
                            </span>
                            <select
                                aria-label={t('vocabProfile.target_level_label', 'Reading level for a class at')}
                                value={targetLevel}
                                onChange={(e) => setTargetLevel(e.target.value as CefrLevel)}
                                style={{ padding: '2px 6px', fontSize: '0.8rem' }}
                            >
                                {CEFR_LEVELS.map((lvl) => (
                                    <option key={lvl} value={lvl}>
                                        {lvl}
                                    </option>
                                ))}
                            </select>
                            <span
                                style={{
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    color:
                                        verdict.verdict === 'suitable'
                                            ? 'var(--green)'
                                            : verdict.verdict === 'slightly_above'
                                              ? 'var(--yellow)'
                                              : 'var(--red)',
                                }}
                            >
                                {t(`analysis.verdict_${verdict.verdict}`)}
                            </span>
                            <span className="text-xs text-muted">
                                {t('vocabProfile.coverage_known', {
                                    pct: verdict.coveragePercent.toFixed(0),
                                    defaultValue: '~{{pct}}% of recognised words already known',
                                })}
                            </span>
                        </div>
                    )}
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
                                                {t('vocabProfile.table_header_off_list', 'Off-list %')}
                                            </th>
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_academic', 'Academic %')}
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
                                            <th
                                                style={{
                                                    padding: '8px 10px',
                                                    textAlign: 'center',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('vocabProfile.table_header_links')}
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
                                                    {sp.offListPercent.toFixed(0)}%
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    {(sp.awlPercent + sp.nawlPercent).toFixed(0)}%
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    {sp.analysisCount}
                                                </td>
                                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            gap: 6,
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Link
                                                            to={`/students/${sp.studentId}/cefr-overview`}
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('vocabProfile.link_cefr_overview')}
                                                        >
                                                            <Gauge size={14} />
                                                        </Link>
                                                        <Link
                                                            to={`/students/${sp.studentId}/learning-path`}
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('vocabProfile.link_learning_path')}
                                                        >
                                                            <Map size={14} />
                                                        </Link>
                                                    </div>
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
