import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Users, ChevronRight } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import Avatar from '../components/ui/Avatar';
import ClassFilterChips from '../components/ui/ClassFilterChips';
import { EmptyState } from '../components/ui/EmptyState';
import GrammarBandFilter from '../components/Grammar/GrammarBandFilter';
import GrammarOverviewMatrix, { type GrammarMatrixStudent } from '../components/Grammar/GrammarOverviewMatrix';
import { GrammarAccuracyBar } from '../components/Grammar/GrammarScoreBadge';
import { useAssessment, useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { getClassVoTracks, getEffectiveVoTrack, VO_TRACK_LABELS } from '../data/voTracks';
import {
    GRAMMAR_SECURE_PCT,
    GRAMMAR_STANDARD_COUNT,
    getClassGrammarOverview,
    grammarBandForClass,
    type ClassGrammarOverview,
    type GrammarLevelBand,
} from '../utils/grammarStandardAggregator';

const MAX_RETEACH_ROWS = 8;

function percent(pct: number | null): string {
    return pct === null ? '—' : `${Math.round(pct)}%`;
}

export default function GrammarOverviewPage() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
    const navigate = useNavigate();

    const { students } = useStudents();
    const { classes } = useClasses();
    const { studentRubrics } = useGrading();
    const { rubrics } = useAuthoring();
    const { tests, studentTests } = useAssessment();
    const { settings } = useSettings();

    // Follow the global Topbar class selector, like the CEFR overview does.
    const [selectedClassId, setSelectedClassId] = useState<string>(() =>
        settings.activeClassId && classes.some((c) => c.id === settings.activeClassId) ? settings.activeClassId : 'all'
    );
    useEffect(() => {
        if (!settings.activeClassId) setSelectedClassId('all');
        else if (classes.some((c) => c.id === settings.activeClassId)) setSelectedClassId(settings.activeClassId);
    }, [settings.activeClassId, classes]);

    const activeClass = classes.find((cls) => cls.id === selectedClassId);
    const classTracks = getClassVoTracks(activeClass);
    const defaultBand = activeClass ? grammarBandForClass(classTracks) : 'all';
    // A teacher's band choice is remembered per class, so switching back to a class restores it.
    const [bandByClass, setBandByClass] = useState<Record<string, GrammarLevelBand>>({});
    const band = bandByClass[selectedClassId] ?? defaultBand;

    const filteredStudents = useMemo(
        () =>
            [...students]
                .filter((student) => !student.archivedAt)
                .filter((student) => selectedClassId === 'all' || student.classId === selectedClassId)
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        [students, selectedClassId]
    );

    const overview: ClassGrammarOverview = useMemo(
        () =>
            getClassGrammarOverview(
                filteredStudents.map((student) => student.id),
                { tests, studentTests, rubrics, studentRubrics: studentRubrics.filter((sr) => !sr.deletedAt) },
                { band }
            ),
        [filteredStudents, tests, studentTests, rubrics, studentRubrics, band]
    );

    const classById = useMemo(() => new Map(classes.map((cls) => [cls.id, cls])), [classes]);

    const matrixStudents: GrammarMatrixStudent[] = useMemo(
        () =>
            overview.students.map((row) => {
                const student = filteredStudents.find((candidate) => candidate.id === row.studentId);
                const cls = classById.get(student?.classId ?? '');
                const track = getEffectiveVoTrack(student, cls);
                return {
                    studentId: row.studentId,
                    name: student?.name ?? row.studentId,
                    meta: [cls?.name, track ? VO_TRACK_LABELS[track] : null].filter(Boolean).join(' · '),
                    categoryPct: row.categoryPct,
                };
            }),
        [overview, filteredStudents, classById]
    );

    const { reteachRows, reteachCount } = useMemo(() => {
        const below = overview.categories
            .flatMap((category) => category.standards)
            .filter((row) => row.classPct !== null && row.classPct < GRAMMAR_SECURE_PCT)
            .sort((a, b) => a.classPct! - b.classPct!);

        const rows = below.slice(0, MAX_RETEACH_ROWS).map((row) => ({
            row,
            missed: overview.students
                .map((student) => {
                    const pct = student.standardPct.get(row.itemId);
                    const name = filteredStudents.find((candidate) => candidate.id === student.studentId)?.name;
                    return pct !== null && pct !== undefined && pct < GRAMMAR_SECURE_PCT
                        ? { studentId: student.studentId, name: name ?? student.studentId }
                        : null;
                })
                .filter((entry): entry is { studentId: string; name: string } => entry !== null),
        }));

        return { reteachRows: rows, reteachCount: below.length };
    }, [overview, filteredStudents]);

    const defaultHint = (() => {
        if (!activeClass) return null;
        if (classTracks.length === 1) {
            return t('grammarOverview.band_default_hint', { track: VO_TRACK_LABELS[classTracks[0]] });
        }
        return classTracks.length > 1 ? t('grammarOverview.band_default_mixed') : null;
    })();

    return (
        <>
            <Topbar
                title={t('grammarOverview.page_title')}
                actions={
                    <span className="text-muted text-sm">
                        {t('grammarOverview.assessed_of', {
                            assessed: overview.assessedStandardCount,
                            total: GRAMMAR_STANDARD_COUNT,
                        })}
                    </span>
                }
            />
            <div className="page-content fade-in">
                <div
                    style={{
                        display: 'flex',
                        gap: 12,
                        marginBottom: 20,
                        flexWrap: 'wrap',
                        alignItems: 'flex-end',
                    }}
                >
                    <div className="form-group" style={{ flex: '1 1 260px', marginBottom: 0 }}>
                        <label>{t('statistics.label_class_filter')}</label>
                        <ClassFilterChips
                            classes={classes}
                            selectedClassId={selectedClassId}
                            onChange={setSelectedClassId}
                            ariaLabel={t('statistics.label_class_filter')}
                            allLabel={t('statistics.all_classes')}
                        />
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>{t('grammarOverview.band_label')}</label>
                        <GrammarBandFilter
                            value={band}
                            onChange={(next) =>
                                setBandByClass((previous) => ({ ...previous, [selectedClassId]: next }))
                            }
                            ariaLabel={t('grammarOverview.band_label')}
                        />
                        {defaultHint && (
                            <div className="text-muted" style={{ fontSize: '0.7rem', marginTop: 4 }}>
                                {defaultHint}
                            </div>
                        )}
                    </div>

                    <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                        <label htmlFor="grammar-overview-student">{t('grammarOverview.open_student')}</label>
                        <select
                            id="grammar-overview-student"
                            value=""
                            onChange={(event) => navigate(`/students/${event.target.value}/grammar-overview`)}
                        >
                            <option value="" disabled>
                                {t('grammarOverview.select_student_placeholder')}
                            </option>
                            {filteredStudents.map((student) => (
                                <option key={student.id} value={student.id}>
                                    {student.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {filteredStudents.length === 0 ? (
                    <EmptyState icon={Users} description={t('cefr.empty_no_students')} />
                ) : (
                    <>
                        <div
                            className="grid-4"
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                                gap: 12,
                                marginBottom: 16,
                            }}
                        >
                            <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent-text)' }}>
                                    {overview.assessedStandardCount}
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
                                    {percent(overview.classAveragePct)}
                                </div>
                                <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                                    {t('grammarOverview.card_average')}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    {t('grammarOverview.card_average_hint', {
                                        count: overview.assessedStandardCount,
                                    })}
                                </div>
                            </div>
                            <div className="card" style={{ borderTop: '3px solid var(--red)' }}>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--red-text)' }}>
                                    {overview.belowSecureCount}
                                </div>
                                <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                                    {t('grammarOverview.card_below', { threshold: GRAMMAR_SECURE_PCT })}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    {t('grammarOverview.card_below_hint')}
                                </div>
                            </div>
                            <div className="card" style={{ borderTop: '3px solid var(--yellow)' }}>
                                <div
                                    style={{
                                        fontSize: '1.05rem',
                                        fontWeight: 800,
                                        color: 'var(--yellow-text)',
                                        lineHeight: 1.3,
                                    }}
                                >
                                    {overview.strongestCategory
                                        ? lang === 'nl'
                                            ? overview.strongestCategory.labelNl
                                            : overview.strongestCategory.labelEn
                                        : t('grammarOverview.no_data')}
                                </div>
                                <div style={{ fontWeight: 650, fontSize: '0.82rem', marginTop: 3 }}>
                                    {t('grammarOverview.card_strongest')}
                                </div>
                                <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    {overview.weakestCategory
                                        ? t('grammarOverview.card_weakest', {
                                              name:
                                                  lang === 'nl'
                                                      ? overview.weakestCategory.labelNl
                                                      : overview.weakestCategory.labelEn,
                                              pct: Math.round(overview.weakestCategory.pct),
                                          })
                                        : t('grammarOverview.no_data')}
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ padding: '14px 16px 12px' }}>
                                <h2 style={{ margin: 0, fontSize: '0.95rem' }}>{t('grammarOverview.matrix_title')}</h2>
                                <p className="text-muted text-sm" style={{ margin: '3px 0 0' }}>
                                    {t('grammarOverview.matrix_subtitle')}
                                </p>
                            </div>
                            <GrammarOverviewMatrix
                                categories={overview.categories}
                                students={matrixStudents}
                                lang={lang}
                                onOpenStudent={(studentId) => navigate(`/students/${studentId}/grammar-overview`)}
                            />
                            <div
                                style={{
                                    display: 'flex',
                                    gap: 16,
                                    flexWrap: 'wrap',
                                    padding: '10px 16px',
                                    borderTop: '1px solid var(--border)',
                                    fontSize: '0.72rem',
                                    color: 'var(--text-muted)',
                                }}
                            >
                                <span>{t('grammarOverview.legend_secure')}</span>
                                <span>{t('grammarOverview.legend_developing')}</span>
                                <span>{t('grammarOverview.legend_needs_work')}</span>
                                <span>{t('grammarOverview.legend_no_evidence')}</span>
                            </div>
                        </div>

                        <div className="card" style={{ marginTop: 16 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    justifyContent: 'space-between',
                                    gap: 12,
                                }}
                            >
                                <div>
                                    <h2 style={{ margin: 0, fontSize: '0.95rem' }}>
                                        {t('grammarOverview.reteach_title')}
                                    </h2>
                                    <p className="text-muted text-sm" style={{ margin: '3px 0 0' }}>
                                        {t('grammarOverview.reteach_subtitle')}
                                    </p>
                                </div>
                                <span className="badge">
                                    {t('grammarOverview.reteach_badge', { count: reteachCount })}
                                </span>
                            </div>

                            {reteachRows.length === 0 ? (
                                <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                                    {t('grammarOverview.reteach_empty', { threshold: GRAMMAR_SECURE_PCT })}
                                </p>
                            ) : (
                                <div style={{ marginTop: 10 }}>
                                    {reteachRows.map(({ row, missed }) => (
                                        <details key={row.itemId} style={{ borderTop: '1px solid var(--border)' }}>
                                            <summary
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns:
                                                        'minmax(210px, 1.6fr) minmax(120px, 0.9fr) minmax(100px, 0.7fr) 90px',
                                                    gap: 12,
                                                    alignItems: 'center',
                                                    padding: '9px 4px',
                                                    cursor: 'pointer',
                                                    listStyle: 'none',
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem' }}>
                                                        {lang === 'nl' ? row.labelNl : row.labelEn}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        <span
                                                            style={{
                                                                display: 'inline-block',
                                                                width: 7,
                                                                height: 7,
                                                                borderRadius: 2,
                                                                background: row.categoryColor,
                                                                marginRight: 4,
                                                                verticalAlign: 'middle',
                                                            }}
                                                            aria-hidden="true"
                                                        />
                                                        {lang === 'nl' ? row.categoryLabelNl : row.categoryLabelEn} ·{' '}
                                                        <span className="badge" style={{ fontSize: '0.6rem' }}>
                                                            {row.level}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <GrammarAccuracyBar pct={row.classPct} />
                                                    <div
                                                        style={{
                                                            fontSize: '0.7rem',
                                                            color: 'var(--text-muted)',
                                                            marginTop: 4,
                                                        }}
                                                    >
                                                        {percent(row.classPct)}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                    {row.testAttempts > 0
                                                        ? t('grammarOverview.test_value', {
                                                              correct: row.testCorrect,
                                                              attempts: row.testAttempts,
                                                          })
                                                        : t('grammarOverview.writing_value', {
                                                              count: row.writingInstances,
                                                          })}
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                                    <span className="badge" style={{ fontSize: '0.7rem' }}>
                                                        {missed.length} <ChevronRight size={11} />
                                                    </span>
                                                </div>
                                            </summary>
                                            <div style={{ padding: '2px 4px 12px 16px' }}>
                                                <div
                                                    style={{
                                                        fontSize: '0.7rem',
                                                        fontWeight: 700,
                                                        textTransform: 'uppercase',
                                                        letterSpacing: '0.03em',
                                                        color: 'var(--text-muted)',
                                                        marginBottom: 6,
                                                    }}
                                                >
                                                    {t('grammarOverview.missed_by')}
                                                </div>
                                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                                    {missed.map((entry) => (
                                                        <button
                                                            key={entry.studentId}
                                                            type="button"
                                                            className="badge"
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() =>
                                                                navigate(
                                                                    `/students/${entry.studentId}/grammar-overview`
                                                                )
                                                            }
                                                        >
                                                            <Avatar name={entry.name} size={16} fontSize="0.55rem" />
                                                            {entry.name}
                                                        </button>
                                                    ))}
                                                    {missed.length === 0 && (
                                                        <span className="text-muted text-xs">
                                                            {t('grammarOverview.no_data')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </details>
                                    ))}
                                </div>
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
                            {t('grammarOverview.coverage_hint')}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
