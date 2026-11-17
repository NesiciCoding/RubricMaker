import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Users } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import Avatar from '../components/ui/Avatar';
import GrammarBandFilter from '../components/Grammar/GrammarBandFilter';
import GrammarCategoryAccordion from '../components/Grammar/GrammarCategoryAccordion';
import { EmptyState } from '../components/ui/EmptyState';
import { useStoreSelector } from '../context/useStore';
import type { StoreData } from '../store/storage';
import {
    GRAMMAR_STANDARD_COUNT,
    getStudentGrammarOverview,
    grammarBandForTrack,
    type GrammarLevelBand,
} from '../utils/grammarStandardAggregator';
import { VO_TRACK_DEFAULT_CEFR, VO_TRACK_LABELS, getEffectiveVoTrack, getTrackBadgeColor } from '../data/voTracks';

const selectGrammarOverviewData = (s: StoreData) => ({
    students: s.students,
    classes: s.classes,
    rubrics: s.rubrics,
    studentRubrics: s.studentRubrics,
    tests: s.tests,
    studentTests: s.studentTests,
});

export default function StudentGrammarOverviewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const {
        students: allStudents,
        classes,
        rubrics,
        studentRubrics: allStudentRubrics,
        tests,
        studentTests,
    } = useStoreSelector(selectGrammarOverviewData);

    // Match the roster domain's filtering: archived students and soft-deleted grades never count.
    const students = useMemo(() => allStudents.filter((candidate) => !candidate.archivedAt), [allStudents]);
    const studentRubrics = useMemo(() => allStudentRubrics.filter((sr) => !sr.deletedAt), [allStudentRubrics]);

    const student = students.find((candidate) => candidate.id === id);
    const studentId = student?.id;
    const cls = classes.find((candidate) => candidate.id === student?.classId);
    const effectiveTrack = getEffectiveVoTrack(student, cls);
    const targetLevel = effectiveTrack ? VO_TRACK_DEFAULT_CEFR[effectiveTrack] : undefined;
    const defaultBand = grammarBandForTrack(effectiveTrack);

    // Remembered per student, so navigating between profiles keeps each one's band choice.
    const [bandByStudent, setBandByStudent] = useState<Record<string, GrammarLevelBand>>({});
    const band = (student && bandByStudent[student.id]) ?? defaultBand;

    const overview = useMemo(
        () =>
            studentId
                ? getStudentGrammarOverview(
                      studentId,
                      { tests, studentTests, rubrics, studentRubrics },
                      { band, targetLevel: effectiveTrack ? VO_TRACK_DEFAULT_CEFR[effectiveTrack] : undefined }
                  )
                : null,
        [studentId, effectiveTrack, tests, studentTests, rubrics, studentRubrics, band]
    );

    const sortedCategories = useMemo(() => {
        if (!overview) return [];
        const score = (pct: number | null) => (pct === null ? 101 : pct);
        return [...overview.categories].sort((a, b) => score(a.combinedPct) - score(b.combinedPct));
    }, [overview]);

    if (!student || !overview) {
        return (
            <>
                <Topbar
                    title={t('grammarOverview.student_page_title')}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/students')}>
                            <ArrowLeft size={14} /> {t('grammarOverview.back_to_class')}
                        </button>
                    }
                />
                <div className="page-content fade-in">
                    <EmptyState icon={Users} description={t('grammarOverview.student_not_found')}>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/students')}>
                            {t('grammarOverview.back_to_class')}
                        </button>
                    </EmptyState>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('grammarOverview.student_page_title')}
                actions={
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/grammar-overview')}>
                            <ArrowLeft size={14} /> {t('grammarOverview.back_to_class')}
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/students/${student.id}/cefr-overview`)}
                        >
                            {t('grammarOverview.open_cefr')}
                        </button>
                    </div>
                }
            />
            <div className="page-content fade-in">
                <div className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Avatar name={student.name} size={44} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                        <h2 style={{ margin: '0 0 3px', fontSize: '1.1rem' }}>{student.name}</h2>
                        <div
                            style={{
                                display: 'flex',
                                gap: 8,
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                fontSize: '0.78rem',
                                color: 'var(--text-muted)',
                            }}
                        >
                            {cls && <span>{cls.name}</span>}
                            {effectiveTrack && (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: getTrackBadgeColor({ voTrack: effectiveTrack }),
                                        color: '#fff',
                                    }}
                                >
                                    {VO_TRACK_LABELS[effectiveTrack]}
                                </span>
                            )}
                            {targetLevel && <span>{t('grammarOverview.student_target', { level: targetLevel })}</span>}
                        </div>
                    </div>
                    <div>
                        <span className="label" style={{ marginBottom: 4, display: 'block', fontSize: '0.7rem' }}>
                            {t('grammarOverview.band_label')}
                        </span>
                        <GrammarBandFilter
                            value={band}
                            onChange={(next) => setBandByStudent((previous) => ({ ...previous, [student.id]: next }))}
                            ariaLabel={t('grammarOverview.band_label')}
                        />
                    </div>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: 12,
                        marginTop: 16,
                    }}
                >
                    <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-text)' }}>
                            {overview.assessedCount}
                            <span className="text-muted" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                {' '}
                                / {GRAMMAR_STANDARD_COUNT}
                            </span>
                        </div>
                        <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                            {t('grammarOverview.card_assessed')}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            {t('grammarOverview.card_assessed_hint')}
                        </div>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid var(--green)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--green-text)' }}>
                            {overview.combinedPct === null ? '—' : `${Math.round(overview.combinedPct)}%`}
                        </div>
                        <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                            {t('grammarOverview.student_stat_mastery')}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            {t('grammarOverview.student_stat_mastery_hint')}
                        </div>
                    </div>
                    <div className="card" style={{ borderTop: '3px solid var(--purple)' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--purple-text)' }}>
                            {overview.atTarget
                                ? `${overview.atTarget.secure} / ${overview.atTarget.total}`
                                : t('grammarOverview.no_data')}
                        </div>
                        <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                            {t('grammarOverview.student_stat_target')}
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                            {overview.atTarget
                                ? t('grammarOverview.student_stat_target_hint', {
                                      level: overview.atTarget.targetLevel,
                                  })
                                : t('grammarOverview.no_data')}
                        </div>
                    </div>
                </div>

                <div className="card" style={{ marginTop: 16 }}>
                    <h2 style={{ margin: 0, fontSize: '0.95rem' }}>{t('grammarOverview.by_category_title')}</h2>
                    <p className="text-muted text-sm" style={{ margin: '3px 0 8px' }}>
                        {t('grammarOverview.by_category_subtitle')}
                    </p>
                    {overview.assessedCount === 0 ? (
                        <p className="text-muted text-sm" style={{ marginTop: 8 }}>
                            {t('grammarOverview.student_empty')}
                        </p>
                    ) : (
                        <GrammarCategoryAccordion categories={sortedCategories} lang={lang} />
                    )}
                </div>

                <div
                    style={{
                        marginTop: 16,
                        border: '1px dashed var(--border-light)',
                        borderRadius: 10,
                        padding: '11px 13px',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        fontSize: '0.78rem',
                    }}
                >
                    {t('grammarOverview.how_it_works')}
                </div>
            </div>
        </>
    );
}
