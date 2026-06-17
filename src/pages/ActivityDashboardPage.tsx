import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { getActivityRows, buildDashboardMatrix } from '../utils/activityDashboardAggregator';
import { VO_TRACKS, VO_TRACK_LABELS } from '../data/voTracks';
import type { VoTrack } from '../types';

const SECTION_LABELS: Record<string, string> = {
    rubric: 'activityDashboard.section_rubrics',
    test: 'activityDashboard.section_tests',
    essay: 'activityDashboard.section_essays',
};

export default function ActivityDashboardPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        rubrics,
        tests,
        essayAssignments,
        classes,
        students,
        studentRubrics,
        studentTests,
        updateClass,
        addEssayAssignments,
    } = useApp();

    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterTrack, setFilterTrack] = useState<VoTrack | 'all'>('all');

    const yearOptions = useMemo(() => {
        const years = new Set(classes.map((c) => c.year).filter((y): y is string => !!y));
        return Array.from(years).sort();
    }, [classes]);

    const visibleClasses = useMemo(
        () =>
            classes.filter((c) => {
                if (filterYear !== 'all' && c.year !== filterYear) return false;
                if (filterTrack !== 'all' && c.voTrack !== filterTrack) return false;
                return true;
            }),
        [classes, filterYear, filterTrack]
    );

    const activities = useMemo(
        () => getActivityRows(rubrics, tests, essayAssignments),
        [rubrics, tests, essayAssignments]
    );

    const matrix = useMemo(
        () =>
            buildDashboardMatrix(activities, visibleClasses, students, studentRubrics, studentTests, essayAssignments),
        [activities, visibleClasses, students, studentRubrics, studentTests, essayAssignments]
    );

    function toggleRubricLink(classId: string, rubricId: string, linked: boolean) {
        const cls = classes.find((c) => c.id === classId);
        if (!cls) return;
        const rubricIds = linked
            ? (cls.rubricIds ?? []).filter((id) => id !== rubricId)
            : [...(cls.rubricIds ?? []), rubricId];
        updateClass({ ...cls, rubricIds });
    }

    function assignEssayToClass(classId: string, teacherKey: string) {
        const template = essayAssignments.find((a) => a.teacherKey === teacherKey);
        if (!template) return;
        const assignedIds = new Set(
            essayAssignments.filter((a) => a.teacherKey === teacherKey).map((a) => a.studentId)
        );
        const newAssignments = students
            .filter((s) => s.classId === classId && !assignedIds.has(s.id))
            .map((s) => ({ ...template, studentId: s.id, createdAt: new Date().toISOString() }));
        if (newAssignments.length > 0) addEssayAssignments(newAssignments);
    }

    const kinds: Array<'rubric' | 'test' | 'essay'> = ['rubric', 'test', 'essay'];

    if (activities.length === 0) {
        return (
            <>
                <Topbar title={t('activityDashboard.title')} />
                <div className="page-content fade-in">
                    <div className="empty-state">
                        <LayoutGrid size={36} />
                        <p>{t('activityDashboard.empty')}</p>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Topbar title={t('activityDashboard.title')} />
            <div className="page-content fade-in">
                {(yearOptions.length > 0 || classes.some((c) => c.voTrack)) && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                        {yearOptions.length > 0 && (
                            <div className="form-group" style={{ marginBottom: 0, maxWidth: 140 }}>
                                <label>{t('statistics.filters.year')}</label>
                                <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}>
                                    <option value="all">{t('statistics.all_classes')}</option>
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {classes.some((c) => c.voTrack) && (
                            <div className="form-group" style={{ marginBottom: 0, maxWidth: 160 }}>
                                <label>{t('statistics.filters.track')}</label>
                                <select
                                    value={filterTrack}
                                    onChange={(e) => setFilterTrack(e.target.value as VoTrack | 'all')}
                                >
                                    <option value="all">{t('statistics.all_classes')}</option>
                                    {VO_TRACKS.map((track) => (
                                        <option key={track} value={track}>
                                            {VO_TRACK_LABELS[track]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table
                        style={{
                            borderCollapse: 'collapse',
                            minWidth: '100%',
                            fontSize: '0.85rem',
                        }}
                    >
                        <thead>
                            <tr>
                                <th
                                    style={{
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 2,
                                        background: 'var(--bg-elevated)',
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        borderBottom: '2px solid var(--border)',
                                        minWidth: 200,
                                        fontWeight: 600,
                                    }}
                                >
                                    {t('activityDashboard.col_activity')}
                                </th>
                                {visibleClasses.map((cls) => (
                                    <th
                                        key={cls.id}
                                        style={{
                                            padding: '8px 12px',
                                            textAlign: 'center',
                                            borderBottom: '2px solid var(--border)',
                                            whiteSpace: 'nowrap',
                                            fontWeight: 600,
                                            minWidth: 130,
                                            color: 'var(--text-muted)',
                                        }}
                                    >
                                        {cls.name}
                                        {(cls.year || cls.voTrack) && (
                                            <div
                                                style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 400,
                                                    color: 'var(--text-muted)',
                                                    opacity: 0.7,
                                                }}
                                            >
                                                {[cls.year, cls.voTrack?.toUpperCase()].filter(Boolean).join(' · ')}
                                            </div>
                                        )}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {kinds.map((kind) => {
                                const rows = activities.filter((a) => a.kind === kind);
                                if (rows.length === 0) return null;
                                return (
                                    <React.Fragment key={kind}>
                                        <tr>
                                            <td
                                                colSpan={visibleClasses.length + 1}
                                                style={{
                                                    padding: '10px 12px 4px',
                                                    fontWeight: 700,
                                                    fontSize: '0.72rem',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.06em',
                                                    color: 'var(--text-muted)',
                                                    background: 'var(--bg-elevated)',
                                                    borderTop: '1px solid var(--border)',
                                                }}
                                            >
                                                {t(SECTION_LABELS[kind])}
                                            </td>
                                        </tr>
                                        {rows.map((activity) => (
                                            <tr key={activity.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                <td
                                                    style={{
                                                        position: 'sticky',
                                                        left: 0,
                                                        zIndex: 1,
                                                        background: 'var(--bg-card)',
                                                        padding: '8px 12px',
                                                        fontWeight: 500,
                                                        maxWidth: 200,
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap',
                                                        cursor: 'pointer',
                                                        color: 'var(--accent)',
                                                    }}
                                                    onClick={() => {
                                                        if (activity.kind === 'rubric')
                                                            navigate(`/rubrics/${activity.id}`);
                                                        else if (activity.kind === 'test')
                                                            navigate(`/tests/${activity.id}`);
                                                        else navigate(`/essays/${activity.id}`);
                                                    }}
                                                    title={activity.name}
                                                >
                                                    {activity.name}
                                                </td>

                                                {visibleClasses.map((cls) => {
                                                    const cell = matrix[`${activity.kind}:${activity.id}`]?.[
                                                        cls.id
                                                    ] ?? {
                                                        submittedCount: 0,
                                                        totalStudents: 0,
                                                        isLinked: false,
                                                    };
                                                    return (
                                                        <td
                                                            key={cls.id}
                                                            style={{
                                                                padding: '6px 8px',
                                                                textAlign: 'center',
                                                                verticalAlign: 'middle',
                                                            }}
                                                        >
                                                            {cell.totalStudents === 0 ? (
                                                                <span
                                                                    className="text-muted"
                                                                    style={{ fontSize: '0.75rem' }}
                                                                >
                                                                    —
                                                                </span>
                                                            ) : (
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        alignItems: 'center',
                                                                        gap: 4,
                                                                    }}
                                                                >
                                                                    <span
                                                                        style={{
                                                                            fontSize: '0.78rem',
                                                                            color:
                                                                                cell.submittedCount > 0
                                                                                    ? 'var(--green, #22c55e)'
                                                                                    : 'var(--text-muted)',
                                                                            fontWeight: 600,
                                                                        }}
                                                                    >
                                                                        {cell.submittedCount}/{cell.totalStudents}
                                                                    </span>

                                                                    {activity.kind === 'rubric' && (
                                                                        <button
                                                                            className={`btn btn-sm ${cell.isLinked ? 'btn-secondary' : 'btn-primary'}`}
                                                                            style={{
                                                                                fontSize: '0.7rem',
                                                                                padding: '2px 8px',
                                                                            }}
                                                                            onClick={() =>
                                                                                toggleRubricLink(
                                                                                    cls.id,
                                                                                    activity.id,
                                                                                    cell.isLinked
                                                                                )
                                                                            }
                                                                        >
                                                                            {cell.isLinked
                                                                                ? t('activityDashboard.unlink')
                                                                                : t('activityDashboard.link')}
                                                                        </button>
                                                                    )}

                                                                    {activity.kind === 'essay' && (
                                                                        <button
                                                                            className={`btn btn-sm ${cell.isLinked ? 'btn-ghost' : 'btn-primary'}`}
                                                                            style={{
                                                                                fontSize: '0.7rem',
                                                                                padding: '2px 8px',
                                                                            }}
                                                                            disabled={
                                                                                cell.isLinked &&
                                                                                cell.submittedCount >=
                                                                                    cell.totalStudents
                                                                            }
                                                                            onClick={() =>
                                                                                assignEssayToClass(cls.id, activity.id)
                                                                            }
                                                                        >
                                                                            {cell.isLinked &&
                                                                            cell.submittedCount >= cell.totalStudents
                                                                                ? t('activityDashboard.all_assigned')
                                                                                : t('activityDashboard.assign')}
                                                                        </button>
                                                                    )}

                                                                    {activity.kind === 'test' && (
                                                                        <button
                                                                            className="btn btn-ghost btn-sm"
                                                                            style={{
                                                                                fontSize: '0.7rem',
                                                                                padding: '2px 8px',
                                                                            }}
                                                                            onClick={() =>
                                                                                navigate(`/tests/${activity.id}`)
                                                                            }
                                                                        >
                                                                            {t('activityDashboard.open')}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}
