import React, { useMemo, useState } from 'react';
import { BookOpen, Award, Users, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { getCefrOverviewTourSteps } from '../data/TutorialSteps';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import CefrOverviewGrid from '../components/CEFR/CefrOverviewGrid';
import CefrProgressChart from '../components/Statistics/CefrProgressChart';
import StandardsCoveragePanel from '../components/Standards/StandardsCoveragePanel';
import { useApp } from '../context/AppContext';
import { getCefrStudentOverview, type CefrCellData } from '../utils/cefrStudentAggregator';
import { CEFR_LEVELS } from '../data/cefrDescriptors';
import { VO_TRACK_LABELS, VO_TRACK_COLORS, VO_TRACK_DEFAULT_CEFR } from '../data/voTracks';
import type { CefrSkill, CefrLevel } from '../types';

/** Highest level with data, preferring 'achieved' over 'developing' over 'not_started'. */
function highestLevelForSkill(cells: CefrCellData[], skill: CefrSkill): CefrLevel | null {
    const skillCells = cells.filter((c) => c.skill === skill && ((c.rubricCount ?? 0) > 0 || c.totalDescriptors > 0));
    if (skillCells.length === 0) return null;
    const achieved = skillCells.filter((c) => c.state === 'achieved');
    const pool = achieved.length > 0 ? achieved : skillCells;
    return pool.reduce<CefrLevel>(
        (best, c) => (CEFR_LEVELS.indexOf(c.level) > CEFR_LEVELS.indexOf(best) ? c.level : best),
        pool[0].level
    );
}

/** Lowest of each skill's highest achieved/developing level — surfaces the weakest skill first. */
function overallLevel(cells: CefrCellData[], skills: CefrSkill[]): CefrLevel | null {
    const perSkill = skills.map((sk) => highestLevelForSkill(cells, sk)).filter((l): l is CefrLevel => l !== null);
    if (perSkill.length === 0) return null;
    return perSkill.reduce<CefrLevel>(
        (worst, l) => (CEFR_LEVELS.indexOf(l) < CEFR_LEVELS.indexOf(worst) ? l : worst),
        perSkill[0]
    );
}

export default function CefrOverviewPage() {
    const { students, classes, rubrics, studentRubrics, selfAssessments, analysisResults } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
    const navigate = useNavigate();

    const SKILLS: { key: CefrSkill; label: string; short: string }[] = [
        { key: 'reading', label: t('cefr.skills.reading'), short: t('cefr.skills.reading_short') },
        { key: 'writing', label: t('cefr.skills.writing'), short: t('cefr.skills.writing_short') },
        {
            key: 'speaking_production',
            label: t('cefr.skills.speaking_production'),
            short: t('cefr.skills.speaking_production_short'),
        },
        {
            key: 'speaking_interaction',
            label: t('cefr.skills.speaking_interaction'),
            short: t('cefr.skills.speaking_interaction_short'),
        },
        { key: 'listening', label: t('cefr.skills.listening'), short: t('cefr.skills.listening_short') },
    ];

    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [viewMode, setViewMode] = useState<'class' | 'student'>('class');
    const [tourRun, setTourRun] = useState(false);
    const cefrTourSteps = useMemo(() => getCefrOverviewTourSteps(t), [t]);

    const filteredStudents = useMemo(
        () =>
            [...students]
                .filter((s) => selectedClassId === 'all' || s.classId === selectedClassId)
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        [students, selectedClassId]
    );

    const studentOverviews = useMemo(
        () =>
            filteredStudents.map((s) => ({
                student: s,
                overview: getCefrStudentOverview(s.id, studentRubrics, rubrics, selfAssessments, analysisResults),
                cls: classes.find((c) => c.id === s.classId),
            })),
        [filteredStudents, studentRubrics, rubrics, selfAssessments, analysisResults, classes]
    );

    const student = students.find((s) => s.id === selectedStudentId);
    const cls = classes.find((c) => c.id === student?.classId);
    const targetLevel = cls?.voTrack ? VO_TRACK_DEFAULT_CEFR[cls.voTrack] : undefined;

    const overview = useMemo(
        () =>
            student
                ? getCefrStudentOverview(student.id, studentRubrics, rubrics, selfAssessments, analysisResults)
                : null,
        [student, studentRubrics, rubrics, selfAssessments, analysisResults]
    );

    const radarEntries = useMemo(
        () =>
            (overview?.cells ?? [])
                .filter((c) => c.rubricCount > 0)
                .map((c) => ({ level: c.level, skill: c.skill, avgScore: c.avgScore, achieved: c.rubricAchieved })),
        [overview]
    );

    const hasAnyData =
        overview &&
        (overview.cells.some((c) => c.rubricCount > 0 || c.totalDescriptors > 0) || overview.standardSets.length > 0);

    return (
        <>
            <Joyride
                steps={cefrTourSteps}
                run={tourRun}
                continuous
                onEvent={(data: EventData) => {
                    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
                        setTourRun(false);
                    }
                }}
                options={{
                    showProgress: true,
                    primaryColor: 'var(--accent)',
                    backgroundColor: 'var(--bg-elevated)',
                    textColor: 'var(--text)',
                    arrowColor: 'var(--bg-elevated)',
                    overlayColor: 'rgba(0, 0, 0, 0.6)',
                }}
            />
            <Topbar
                title={t('cefrOverview.page_title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                        {t('tutorial.cefr_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <div
                    data-tour="cefr-controls"
                    style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}
                >
                    <div className="form-group" style={{ flex: '0 0 auto', minWidth: 180, marginBottom: 0 }}>
                        <label>{t('statistics.label_class_filter')}</label>
                        <select
                            aria-label={t('statistics.label_class_filter')}
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

                    <div
                        data-tour="cefr-view"
                        style={{
                            display: 'flex',
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: 2,
                        }}
                    >
                        <button
                            className={`btn btn-sm ${viewMode === 'class' ? 'btn-secondary' : 'btn-ghost'}`}
                            style={{ border: 'none' }}
                            onClick={() => setViewMode('class')}
                        >
                            <Users size={14} /> {t('cefr.view_class')}
                        </button>
                        <button
                            className={`btn btn-sm ${viewMode === 'student' ? 'btn-secondary' : 'btn-ghost'}`}
                            style={{ border: 'none' }}
                            onClick={() => setViewMode('student')}
                        >
                            <BookOpen size={14} /> {t('cefr.view_student')}
                        </button>
                    </div>
                </div>

                {viewMode === 'class' && (
                    <>
                        {filteredStudents.length === 0 ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>{t('cefr.empty_no_students')}</p>
                            </div>
                        ) : (
                            <div className="card" data-tour="cefr-heatmap" style={{ overflowX: 'auto', padding: 0 }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                            <th
                                                style={{
                                                    padding: '10px 14px',
                                                    textAlign: 'left',
                                                    fontWeight: 700,
                                                    color: 'var(--text-muted)',
                                                    whiteSpace: 'nowrap',
                                                    position: 'sticky',
                                                    left: 0,
                                                    background: 'var(--bg-card)',
                                                    zIndex: 1,
                                                }}
                                            >
                                                {t('cefr.table_header_student')}
                                            </th>
                                            {SKILLS.map((sk) => (
                                                <th
                                                    key={sk.key}
                                                    style={{
                                                        padding: '10px 10px',
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        color: 'var(--text-muted)',
                                                        borderLeft: '2px solid var(--border)',
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {sk.short}
                                                </th>
                                            ))}
                                            <th
                                                style={{
                                                    padding: '10px 10px',
                                                    textAlign: 'center',
                                                    fontWeight: 700,
                                                    color: 'var(--text-muted)',
                                                    borderLeft: '2px solid var(--border)',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {t('cefrOverview.table_header_overall')}
                                            </th>
                                            <th
                                                style={{
                                                    padding: '10px 14px',
                                                    textAlign: 'center',
                                                    fontWeight: 600,
                                                    color: 'var(--text-muted)',
                                                    borderLeft: '2px solid var(--border)',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {t('cefr.table_header_detail')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studentOverviews.map(({ student: s, overview: ov, cls: sc }, i) => {
                                            const rowTarget = sc?.voTrack
                                                ? VO_TRACK_DEFAULT_CEFR[sc.voTrack]
                                                : undefined;
                                            return (
                                                <tr
                                                    key={s.id}
                                                    style={{
                                                        borderBottom: '1px solid var(--border)',
                                                        background:
                                                            i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: '8px 14px',
                                                            fontWeight: 600,
                                                            whiteSpace: 'nowrap',
                                                            position: 'sticky',
                                                            left: 0,
                                                            background:
                                                                i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-elevated)',
                                                            zIndex: 1,
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div
                                                                style={{
                                                                    width: 26,
                                                                    height: 26,
                                                                    borderRadius: '50%',
                                                                    background: 'var(--accent-soft)',
                                                                    color: 'var(--accent)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: 700,
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {s.name.charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.85rem' }}>{s.name}</div>
                                                                {sc && (
                                                                    <div
                                                                        style={{
                                                                            fontSize: '0.7rem',
                                                                            color: 'var(--text-dim)',
                                                                        }}
                                                                    >
                                                                        {sc.name}
                                                                        {sc.voTrack && (
                                                                            <span
                                                                                style={{
                                                                                    marginLeft: 4,
                                                                                    padding: '0 4px',
                                                                                    borderRadius: 3,
                                                                                    background:
                                                                                        VO_TRACK_COLORS[sc.voTrack],
                                                                                    color: '#fff',
                                                                                    fontSize: '0.65rem',
                                                                                    fontWeight: 700,
                                                                                }}
                                                                            >
                                                                                {VO_TRACK_LABELS[sc.voTrack]}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {SKILLS.map((sk) => {
                                                        const skillLevel = highestLevelForSkill(ov.cells, sk.key);
                                                        const isTarget = !!rowTarget && skillLevel === rowTarget;
                                                        return (
                                                            <td
                                                                key={sk.key}
                                                                title={`${sk.label}: ${
                                                                    skillLevel
                                                                        ? CEFR_LEVELS.map((lvl) => {
                                                                              const c = ov.cells.find(
                                                                                  (cell) =>
                                                                                      cell.skill === sk.key &&
                                                                                      cell.level === lvl
                                                                              );
                                                                              return `${lvl} ${c?.state ?? 'not-started'}`;
                                                                          }).join(', ')
                                                                        : t('cefrOverview.cell_not_started')
                                                                }`}
                                                                style={{
                                                                    padding: '6px 6px',
                                                                    textAlign: 'center',
                                                                    borderLeft: '2px solid var(--border)',
                                                                    outline: isTarget
                                                                        ? '2px solid var(--accent)'
                                                                        : undefined,
                                                                    outlineOffset: -1,
                                                                }}
                                                            >
                                                                {skillLevel ? (
                                                                    <CefrBadge level={skillLevel} size="sm" />
                                                                ) : (
                                                                    <span
                                                                        style={{
                                                                            color: 'var(--border)',
                                                                            fontSize: '0.7rem',
                                                                        }}
                                                                    >
                                                                        ·
                                                                    </span>
                                                                )}
                                                            </td>
                                                        );
                                                    })}

                                                    <td
                                                        style={{
                                                            padding: '6px 6px',
                                                            textAlign: 'center',
                                                            borderLeft: '2px solid var(--border)',
                                                        }}
                                                    >
                                                        {(() => {
                                                            const lvl = overallLevel(
                                                                ov.cells,
                                                                SKILLS.map((sk) => sk.key)
                                                            );
                                                            return lvl ? (
                                                                <CefrBadge level={lvl} size="sm" />
                                                            ) : (
                                                                <span
                                                                    style={{
                                                                        color: 'var(--border)',
                                                                        fontSize: '0.7rem',
                                                                    }}
                                                                >
                                                                    ·
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>

                                                    <td
                                                        style={{
                                                            padding: '8px 10px',
                                                            textAlign: 'center',
                                                            borderLeft: '2px solid var(--border)',
                                                        }}
                                                    >
                                                        <button
                                                            className="btn btn-ghost btn-sm"
                                                            style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                                                            onClick={() => navigate(`/students/${s.id}/cefr-overview`)}
                                                            aria-label={t('cefrOverview.open_student_detail', {
                                                                name: s.name,
                                                            })}
                                                            title={t('cefrOverview.open_student_detail', {
                                                                name: s.name,
                                                            })}
                                                        >
                                                            <ChevronRight size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div
                                    style={{
                                        display: 'flex',
                                        gap: 16,
                                        padding: '10px 14px',
                                        borderTop: '1px solid var(--border)',
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    {[
                                        {
                                            color: '#22c55e',
                                            label: t('cefr.legend_achieved'),
                                            bg: 'rgba(34,197,94,0.25)',
                                        },
                                        {
                                            color: '#eab308',
                                            label: t('cefr.legend_developing'),
                                            bg: 'rgba(234,179,8,0.25)',
                                        },
                                        {
                                            color: 'var(--text-dim)',
                                            label: t('cefr.legend_not_started'),
                                            bg: 'rgba(148,163,184,0.12)',
                                        },
                                        {
                                            color: 'var(--accent)',
                                            label: t('cefr.legend_target_level'),
                                            bg: 'transparent',
                                            outline: true,
                                        },
                                    ].map(({ color, label, bg, outline }) => (
                                        <div
                                            key={label}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                                fontSize: '0.75rem',
                                                color: 'var(--text-muted)',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: 14,
                                                    height: 14,
                                                    borderRadius: 3,
                                                    background: bg,
                                                    border: outline ? `2px solid ${color}` : undefined,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}
                                            >
                                                {!outline && (
                                                    <div
                                                        style={{
                                                            width: 6,
                                                            height: 6,
                                                            borderRadius: '50%',
                                                            background: color,
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {label}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {viewMode === 'student' && (
                    <>
                        <div className="form-group" style={{ maxWidth: 320, marginBottom: 24 }}>
                            <label>{t('statistics.label_student')}</label>
                            <select
                                aria-label={t('statistics.label_student')}
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

                        {!selectedStudentId ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>{t('cefrOverview.select_student_prompt')}</p>
                            </div>
                        ) : (
                            <>
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
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    gap: 12,
                                                    flexWrap: 'wrap',
                                                    alignItems: 'center',
                                                }}
                                            >
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

                                {overview && (
                                    <div className="grid-3" style={{ marginBottom: 24 }}>
                                        <div className="card" style={{ borderTop: '3px solid var(--accent)' }}>
                                            <div
                                                style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--accent)' }}
                                            >
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

                                {radarEntries.length >= 3 && (
                                    <div className="card" style={{ marginBottom: 24 }}>
                                        <CefrProgressChart entries={radarEntries} />
                                    </div>
                                )}

                                {overview && (
                                    <div className="card" style={{ marginBottom: 24 }}>
                                        <h3 style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                            <CefrOverviewGrid
                                                cells={overview.cells}
                                                targetLevel={targetLevel}
                                                lang={lang}
                                            />
                                        )}
                                    </div>
                                )}

                                {overview && overview.standardSets.length > 0 && (
                                    <div className="card" style={{ marginBottom: 24 }}>
                                        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Award size={18} style={{ color: 'var(--accent)' }} />
                                            {t('cefrOverview.standards_title')}
                                        </h3>
                                        <StandardsCoveragePanel standardSets={overview.standardSets} />
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
