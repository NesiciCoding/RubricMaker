import React, { useMemo, useState } from 'react';
import { BookOpen, Award, Users, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Layout/Topbar';
import CefrBadge from '../components/CEFR/CefrBadge';
import CefrOverviewGrid from '../components/CEFR/CefrOverviewGrid';
import CefrProgressChart from '../components/Statistics/CefrProgressChart';
import StandardsCoveragePanel from '../components/Standards/StandardsCoveragePanel';
import { useApp } from '../context/AppContext';
import { getCefrStudentOverview } from '../utils/cefrStudentAggregator';
import { CEFR_LEVELS, CEFR_LEVEL_COLORS } from '../data/cefrDescriptors';
import { VO_TRACK_LABELS, VO_TRACK_COLORS, VO_TRACK_DEFAULT_CEFR } from '../data/voTracks';
import type { CefrLevel, CefrSkill } from '../types';

const SKILLS: { key: CefrSkill; label: string; short: string }[] = [
    { key: 'reading', label: 'Reading', short: 'Read' },
    { key: 'writing', label: 'Writing', short: 'Write' },
    { key: 'speaking_production', label: 'Speaking (Prod.)', short: 'Spk↑' },
    { key: 'speaking_interaction', label: 'Speaking (Int.)', short: 'Spk↔' },
    { key: 'listening', label: 'Listening', short: 'Listen' },
];

const LEVEL_ORDER: Record<CefrLevel, number> = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };

function highestAchievedLevel(
    cells: ReturnType<typeof getCefrStudentOverview>['cells'],
    skill: CefrSkill
): CefrLevel | null {
    const achieved = cells
        .filter((c) => c.skill === skill && c.state === 'achieved')
        .sort((a, b) => (LEVEL_ORDER[b.level] ?? 0) - (LEVEL_ORDER[a.level] ?? 0));
    return achieved[0]?.level ?? null;
}

function developingLevel(
    cells: ReturnType<typeof getCefrStudentOverview>['cells'],
    skill: CefrSkill
): CefrLevel | null {
    const developing = cells
        .filter((c) => c.skill === skill && c.state === 'developing')
        .sort((a, b) => (LEVEL_ORDER[a.level] ?? 0) - (LEVEL_ORDER[b.level] ?? 0));
    return developing[0]?.level ?? null;
}

export default function CefrOverviewPage() {
    const { students, classes, rubrics, studentRubrics, selfAssessments, analysisResults } = useApp();
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
    const navigate = useNavigate();

    const [selectedClassId, setSelectedClassId] = useState<string>('all');
    const [selectedStudentId, setSelectedStudentId] = useState<string>('');
    const [viewMode, setViewMode] = useState<'class' | 'student'>('class');

    const filteredStudents = useMemo(
        () =>
            [...students]
                .filter((s) => selectedClassId === 'all' || s.classId === selectedClassId)
                .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')),
        [students, selectedClassId]
    );

    // Compute per-student overviews for the class heatmap
    const studentOverviews = useMemo(
        () =>
            filteredStudents.map((s) => ({
                student: s,
                overview: getCefrStudentOverview(s.id, studentRubrics, rubrics, selfAssessments, analysisResults),
                cls: classes.find((c) => c.id === s.classId),
            })),
        [filteredStudents, studentRubrics, rubrics, selfAssessments, analysisResults, classes]
    );

    // Individual student detail
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
            <Topbar title={t('cefrOverview.page_title')} />
            <div className="page-content fade-in">
                {/* Controls row */}
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ flex: '0 0 auto', minWidth: 180, marginBottom: 0 }}>
                        <label>{t('statistics.label_class_filter')}</label>
                        <select
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

                    {/* View mode toggle */}
                    <div
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
                            <Users size={14} /> Class View
                        </button>
                        <button
                            className={`btn btn-sm ${viewMode === 'student' ? 'btn-secondary' : 'btn-ghost'}`}
                            style={{ border: 'none' }}
                            onClick={() => setViewMode('student')}
                        >
                            <BookOpen size={14} /> Student Detail
                        </button>
                    </div>
                </div>

                {/* ── CLASS VIEW: whole-class heatmap ── */}
                {viewMode === 'class' && (
                    <>
                        {filteredStudents.length === 0 ? (
                            <div className="empty-state">
                                <Users size={36} />
                                <p>No students found. Add students and link rubrics with CEFR target levels.</p>
                            </div>
                        ) : (
                            <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
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
                                                Student
                                            </th>
                                            {SKILLS.map((sk) => (
                                                <th
                                                    key={sk.key}
                                                    colSpan={6}
                                                    style={{
                                                        padding: '10px 6px',
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        color: 'var(--text-muted)',
                                                        borderLeft: '2px solid var(--border)',
                                                    }}
                                                >
                                                    {sk.label}
                                                </th>
                                            ))}
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
                                                Detail
                                            </th>
                                        </tr>
                                        <tr
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: 'var(--bg-elevated)',
                                            }}
                                        >
                                            <th
                                                style={{
                                                    padding: '4px 14px',
                                                    position: 'sticky',
                                                    left: 0,
                                                    background: 'var(--bg-elevated)',
                                                    zIndex: 1,
                                                }}
                                            />
                                            {SKILLS.map((sk) =>
                                                CEFR_LEVELS.map((lvl) => (
                                                    <th
                                                        key={`${sk.key}-${lvl}`}
                                                        style={{
                                                            padding: '4px 3px',
                                                            textAlign: 'center',
                                                            fontSize: '0.7rem',
                                                            color: 'var(--text-dim)',
                                                            borderLeft:
                                                                lvl === 'A1' ? '2px solid var(--border)' : undefined,
                                                            minWidth: 30,
                                                        }}
                                                    >
                                                        {lvl}
                                                    </th>
                                                ))
                                            )}
                                            <th style={{ borderLeft: '2px solid var(--border)' }} />
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
                                                    {/* Student name */}
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

                                                    {/* Skill × level cells */}
                                                    {SKILLS.map((sk) =>
                                                        CEFR_LEVELS.map((lvl) => {
                                                            const cell = ov.cells.find(
                                                                (c) => c.skill === sk.key && c.level === lvl
                                                            );
                                                            const state = cell?.state ?? 'not_started';
                                                            const isTarget = rowTarget === lvl;
                                                            const hasData =
                                                                (cell?.rubricCount ?? 0) > 0 ||
                                                                (cell?.totalDescriptors ?? 0) > 0;

                                                            let bg = 'transparent';
                                                            let dot = null;

                                                            if (hasData) {
                                                                if (state === 'achieved') bg = 'rgba(34,197,94,0.25)';
                                                                else if (state === 'developing')
                                                                    bg = 'rgba(234,179,8,0.25)';
                                                                else bg = 'rgba(148,163,184,0.12)';

                                                                dot = (
                                                                    <div
                                                                        style={{
                                                                            width: 8,
                                                                            height: 8,
                                                                            borderRadius: '50%',
                                                                            background:
                                                                                state === 'achieved'
                                                                                    ? '#22c55e'
                                                                                    : state === 'developing'
                                                                                      ? '#eab308'
                                                                                      : 'var(--text-dim)',
                                                                            margin: '0 auto',
                                                                        }}
                                                                    />
                                                                );
                                                            }

                                                            return (
                                                                <td
                                                                    key={`${sk.key}-${lvl}`}
                                                                    title={
                                                                        hasData
                                                                            ? `${s.name} — ${sk.label} ${lvl}: ${state}`
                                                                            : undefined
                                                                    }
                                                                    style={{
                                                                        padding: '6px 3px',
                                                                        textAlign: 'center',
                                                                        background: bg,
                                                                        borderLeft:
                                                                            lvl === 'A1'
                                                                                ? '2px solid var(--border)'
                                                                                : undefined,
                                                                        outline: isTarget
                                                                            ? '2px solid var(--accent)'
                                                                            : undefined,
                                                                        outlineOffset: -1,
                                                                        position: 'relative',
                                                                    }}
                                                                >
                                                                    {dot ?? (
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
                                                        })
                                                    )}

                                                    {/* Link to detail */}
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
                                                            title={`Open ${s.name}'s CEFR detail`}
                                                        >
                                                            <ChevronRight size={13} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                {/* Legend */}
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
                                        { color: '#22c55e', label: 'Achieved', bg: 'rgba(34,197,94,0.25)' },
                                        { color: '#eab308', label: 'Developing', bg: 'rgba(234,179,8,0.25)' },
                                        {
                                            color: 'var(--text-dim)',
                                            label: 'Not started',
                                            bg: 'rgba(148,163,184,0.12)',
                                        },
                                        {
                                            color: 'var(--accent)',
                                            label: 'Target level',
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

                {/* ── STUDENT DETAIL VIEW ── */}
                {viewMode === 'student' && (
                    <>
                        {/* Student picker */}
                        <div className="form-group" style={{ maxWidth: 320, marginBottom: 24 }}>
                            <label>{t('statistics.label_student')}</label>
                            <select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
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
