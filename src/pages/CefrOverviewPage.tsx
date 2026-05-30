import React, { useMemo, useState } from 'react';
import { BookOpen, Award, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import CefrOverviewGrid from '../components/CEFR/CefrOverviewGrid';
import CefrProgressChart from '../components/Statistics/CefrProgressChart';
import StandardsCoveragePanel from '../components/Standards/StandardsCoveragePanel';
import { useApp } from '../context/AppContext';
import { getCefrStudentOverview } from '../utils/cefrStudentAggregator';
import { VO_TRACK_LABELS, VO_TRACK_COLORS, VO_TRACK_DEFAULT_CEFR } from '../data/voTracks';

export default function CefrOverviewPage() {
    const { students, classes, rubrics, studentRubrics, selfAssessments } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';

    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');

    const filteredStudents = useMemo(
        () =>
            [...students]
                .filter((s) => selectedClassId === 'all' || s.classId === selectedClassId)
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        [students, selectedClassId]
    );

    const student = students.find((s) => s.id === selectedStudentId);
    const cls = classes.find((c) => c.id === student?.classId);
    const targetLevel = cls?.voTrack ? VO_TRACK_DEFAULT_CEFR[cls.voTrack] : undefined;

    const overview = useMemo(
        () => (student ? getCefrStudentOverview(student.id, studentRubrics, rubrics, selfAssessments) : null),
        [student, studentRubrics, rubrics, selfAssessments]
    );

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

    const hasAnyData =
        overview &&
        (overview.cells.some((c) => c.rubricCount > 0 || c.totalDescriptors > 0) || overview.standardSets.length > 0);

    return (
        <>
            <Topbar title={t('cefrOverview.page_title')} />
            <div className="page-content fade-in">
                {/* Filter row */}
                <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: 1, maxWidth: 240, marginBottom: 0 }}>
                        <label htmlFor="cefr-class-filter">{t('statistics.label_class_filter')}</label>
                        <select
                            id="cefr-class-filter"
                            value={selectedClassId}
                            onChange={(e) => {
                                setSelectedClassId(e.target.value);
                                setSelectedStudentId('');
                            }}
                        >
                            <option value="all">{t('statistics.all_classes')}</option>
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: 1, maxWidth: 320, marginBottom: 0 }}>
                        <label htmlFor="cefr-student-filter">{t('statistics.label_student')}</label>
                        <select
                            id="cefr-student-filter"
                            value={selectedStudentId}
                            onChange={(e) => setSelectedStudentId(e.target.value)}
                        >
                            <option value="" disabled>
                                {t('statistics.select_student_placeholder')}
                            </option>
                            {filteredStudents.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {!selectedStudentId ? (
                    <div className="empty-state">
                        <Users size={36} />
                        <p>{t('cefrOverview.select_student_prompt')}</p>
                    </div>
                ) : (
                    <>
                        {/* Student header */}
                        {student && (
                            <div
                                className="card"
                                style={{ marginBottom: 24, display: 'flex', gap: 20, alignItems: 'center' }}
                            >
                                <div
                                    style={{
                                        width: 48,
                                        height: 48,
                                        borderRadius: '50%',
                                        background: 'var(--accent-soft)',
                                        color: 'var(--accent)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.2rem',
                                        fontWeight: 700,
                                        flexShrink: 0,
                                    }}
                                >
                                    {student.name.charAt(0).toUpperCase()}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <h2 style={{ margin: '0 0 4px', fontSize: '1.2rem' }}>{student.name}</h2>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                                        {cls && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                                {cls.name}
                                            </span>
                                        )}
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
                                                {t('cefrOverview.target_level_label')}:{' '}
                                                <CefrBadge level={targetLevel} size="sm" />
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Stat cards */}
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
                    </>
                )}
            </div>
        </>
    );
}
