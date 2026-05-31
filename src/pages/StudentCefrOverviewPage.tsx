import React, { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Award, Users, Copy, Check, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import CefrOverviewGrid from '../components/CEFR/CefrOverviewGrid';
import CefrProgressChart from '../components/Statistics/CefrProgressChart';
import StandardsCoveragePanel from '../components/Standards/StandardsCoveragePanel';
import { useApp } from '../context/AppContext';
import { getCefrStudentOverview } from '../utils/cefrStudentAggregator';
import { VO_TRACK_LABELS, VO_TRACK_COLORS, VO_TRACK_DEFAULT_CEFR } from '../data/voTracks';

/**
 * Renders the CEFR overview page for the student identified by the current route `id`.
 *
 * Shows a header with navigation, a student summary card, summary statistics, an optional radar chart,
 * a CEFR can-do grid or empty state, standards coverage when available, and share/copy actions.
 *
 * @returns The React element representing the student's CEFR overview page, or an empty-state view if the student cannot be found.
 */
export default function StudentCefrOverviewPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { students, classes, rubrics, studentRubrics, selfAssessments, analysisResults } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
    const [copiedLink, setCopiedLink] = useState(false);

    const student = students.find((s) => s.id === id);
    const cls = classes.find((c) => c.id === student?.classId);
    const targetLevel = cls?.voTrack ? VO_TRACK_DEFAULT_CEFR[cls.voTrack] : undefined;

    const overview = useMemo(
        () => (student ? getCefrStudentOverview(student.id, studentRubrics, rubrics, selfAssessments, analysisResults) : null),
        [student, studentRubrics, rubrics, selfAssessments, analysisResults]
    );

    // Build CefrEntry[] for the radar (only cells with rubric data)
    const radarEntries = useMemo(
        () =>
            (overview?.cells ?? [])
                .filter((c) => c.rubricCount > 0)
                .map((c) => ({
                    level: c.level,
                    skill: c.skill,
                    avgScore: c.avgScore,
                    achieved: c.rubricAchieved,
                })),
        [overview]
    );

    function handleCopyLink() {
        navigator.clipboard.writeText(window.location.href);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
    }

    const hasAnyData =
        overview &&
        (overview.cells.some((c) => c.rubricCount > 0 || c.totalDescriptors > 0) || overview.standardSets.length > 0);

    if (!student) {
        return (
            <>
                <Topbar
                    title={t('cefrOverview.page_title')}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/students')}>
                            <ArrowLeft size={14} /> {t('cefrOverview.back_to_profile')}
                        </button>
                    }
                />
                <div className="page-content fade-in">
                    <div className="empty-state">
                        <Users size={32} />
                        <p>{t('cefrOverview.student_not_found')}</p>
                        <button className="btn btn-secondary btn-sm" onClick={() => navigate('/students')}>
                            {t('cefrOverview.back_to_profile')}
                        </button>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar
                title={t('cefrOverview.page_title')}
                actions={
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/students/${student.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <ArrowLeft size={14} /> {t('cefrOverview.back_to_profile')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                {/* Student header card */}
                <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center' }}>
                    <div
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: '50%',
                            background: 'var(--accent-soft)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.6rem',
                            fontWeight: 700,
                            flexShrink: 0,
                        }}
                    >
                        {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h2 style={{ margin: '0 0 6px', fontSize: '1.4rem' }}>{student.name}</h2>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                            {cls && <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{cls.name}</span>}
                            {cls?.voTrack && (
                                <span
                                    style={{
                                        fontSize: 10,
                                        fontWeight: 700,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: VO_TRACK_COLORS[cls.voTrack],
                                        color: '#fff',
                                    }}
                                >
                                    {VO_TRACK_LABELS[cls.voTrack]}
                                </span>
                            )}
                            {targetLevel && (
                                <span
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 5,
                                        fontSize: '0.82rem',
                                        color: 'var(--text-muted)',
                                    }}
                                >
                                    {t('cefrOverview.target_level_label')}:
                                    <CefrBadge level={targetLevel} size="sm" />
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyLink}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                    >
                        {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                        {copiedLink ? t('cefrOverview.share_copied') : t('cefrOverview.share_button')}
                    </button>
                </div>

                {/* Summary stat cards */}
                {overview && (
                    <div className="grid-3" style={{ marginBottom: 24 }}>
                        <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                            <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}>
                                {overview.skillsWithRubricData}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 4 }}>
                                {t('cefrOverview.stat_skills_assessed')}
                            </div>
                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                {t('cefrOverview.stat_skills_subtitle')}
                            </div>
                        </div>
                        <div className="card" style={{ borderTop: '3px solid var(--green, #22c55e)' }}>
                            <div
                                style={{
                                    fontSize: '1.6rem',
                                    fontWeight: 700,
                                    color: 'var(--green, #22c55e)',
                                }}
                            >
                                {Math.round(overview.overallConfidenceRate)}%
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 4 }}>
                                {t('cefrOverview.stat_confidence_rate')}
                            </div>
                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                {t('cefrOverview.stat_confidence_subtitle')}
                            </div>
                        </div>
                        <div className="card" style={{ borderTop: '3px solid var(--purple, #8b5cf6)' }}>
                            <div
                                style={{
                                    fontSize: '1.6rem',
                                    fontWeight: 700,
                                    color: 'var(--purple, #8b5cf6)',
                                }}
                            >
                                {overview.standardsCovered}
                            </div>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: 4 }}>
                                {t('cefrOverview.stat_standards_covered')}
                            </div>
                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                {t('cefrOverview.stat_standards_subtitle')}
                            </div>
                        </div>
                    </div>
                )}

                {/* Radar chart */}
                {radarEntries.length >= 3 && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <CefrProgressChart entries={radarEntries} />
                    </div>
                )}

                {/* CEFR Can-Do Grid */}
                {overview && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <h3
                            style={{
                                marginBottom: 6,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <BookOpen size={18} style={{ color: 'var(--accent)' }} />
                            {t('cefrOverview.grid_title')}
                        </h3>
                        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
                            {t('cefrOverview.grid_subtitle')}
                        </p>

                        {!hasAnyData ? (
                            <div className="empty-state" style={{ padding: '32px 20px' }}>
                                <BookOpen size={28} style={{ opacity: 0.4 }} />
                                <p>{t('cefrOverview.empty_no_cefr')}</p>
                            </div>
                        ) : (
                            <CefrOverviewGrid cells={overview.cells} targetLevel={targetLevel} lang={lang} />
                        )}
                    </div>
                )}

                {/* Standards coverage */}
                {overview && overview.standardSets.length > 0 && (
                    <div className="card" style={{ marginBottom: 24 }}>
                        <h3
                            style={{
                                marginBottom: 16,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <Award size={18} style={{ color: 'var(--accent)' }} />
                            {t('cefrOverview.standards_title')}
                        </h3>
                        <StandardsCoveragePanel standardSets={overview.standardSets} />
                    </div>
                )}

                {/* Bottom share / navigate action */}
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 12,
                        marginBottom: 8,
                    }}
                >
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => navigate(`/students/${student.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        <ArrowLeft size={14} /> {t('cefrOverview.back_to_profile')}
                    </button>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleCopyLink}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                        {copiedLink ? <Check size={14} /> : <ExternalLink size={14} />}
                        {copiedLink ? t('cefrOverview.share_copied') : t('cefrOverview.share_button')}
                    </button>
                </div>
            </div>
        </>
    );
}
