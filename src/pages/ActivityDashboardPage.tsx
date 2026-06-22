import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, GripVertical, ClipboardList, X } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { getActivityDashboardTourSteps } from '../data/TutorialSteps';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { getActivityRows, buildDashboardMatrix } from '../utils/activityDashboardAggregator';
import { getClassStandardsCoverage } from '../utils/standardsCoverageAggregator';
import ClassCoverageGapPanel from '../components/Standards/ClassCoverageGapPanel';
import { reorderDisplayOrder } from '../utils/displayOrder';
import { VO_TRACKS } from '../data/voTracks';
import type { VoTrack } from '../types';
import { nanoid } from '../utils/nanoid';

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
        updateRubric,
        updateTest,
        updateEssayGroup,
        gradingTasks,
        addGradingTasks,
        deleteGradingTask,
    } = useApp();

    const [filterYear, setFilterYear] = useState<string>('all');
    const [filterTrack, setFilterTrack] = useState<VoTrack | 'all'>('all');
    const [coverageClassId, setCoverageClassId] = useState<string>('');
    const [tourRun, setTourRun] = useState(false);
    const [assignTaskCell, setAssignTaskCell] = useState<{ classId: string; rubricId: string } | null>(null);
    const [assignTeacherName, setAssignTeacherName] = useState('');
    const [assignDueDate, setAssignDueDate] = useState('');
    const activityTourSteps = useMemo(() => getActivityDashboardTourSteps(t), [t]);

    const pendingTasks = useMemo(
        () =>
            gradingTasks.filter(
                (task) =>
                    !studentRubrics.some(
                        (sr) => !sr.isPeerReview && sr.rubricId === task.rubricId && sr.studentId === task.studentId
                    )
            ),
        [gradingTasks, studentRubrics]
    );

    function openAssignTaskModal(classId: string, rubricId: string) {
        setAssignTaskCell({ classId, rubricId });
        setAssignTeacherName('');
        setAssignDueDate('');
    }

    function handleAssignTasks() {
        if (!assignTaskCell || !assignTeacherName.trim()) return;
        const classStudents = students.filter((s) => s.classId === assignTaskCell.classId);
        const ungraded = classStudents.filter(
            (s) =>
                !studentRubrics.some(
                    (sr) => !sr.isPeerReview && sr.rubricId === assignTaskCell.rubricId && sr.studentId === s.id
                )
        );
        const now = new Date().toISOString();
        addGradingTasks(
            ungraded.map((s) => ({
                id: nanoid(),
                rubricId: assignTaskCell.rubricId,
                studentId: s.id,
                assignedToTeacher: assignTeacherName.trim(),
                assignedAt: now,
                dueDate: assignDueDate || undefined,
            }))
        );
        setAssignTaskCell(null);
    }

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

    const activeCoverageClassId = coverageClassId || visibleClasses[0]?.id || '';
    const coverage = useMemo(
        () =>
            activeCoverageClassId
                ? getClassStandardsCoverage(activeCoverageClassId, classes, students, studentRubrics, rubrics)
                : { covered: [], gap: [] },
        [activeCoverageClassId, classes, students, studentRubrics, rubrics]
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
            .map((s) => ({
                ...template,
                id: crypto.randomUUID(),
                studentId: s.id,
                createdAt: new Date().toISOString(),
            }));
        if (newAssignments.length > 0) addEssayAssignments(newAssignments);
    }

    const kinds: Array<'rubric' | 'test' | 'essay'> = ['rubric', 'test', 'essay'];

    function handleDragEnd(result: DropResult) {
        if (!result.destination) return;
        const kind = result.destination.droppableId.replace('ad-', '') as 'rubric' | 'test' | 'essay';
        const rows = activities.filter((a) => a.kind === kind);
        for (const [row, order] of reorderDisplayOrder(rows, result.source.index, result.destination.index)) {
            if (kind === 'rubric') {
                const r = rubrics.find((x) => x.id === row.id);
                if (r && r.displayOrder !== order) updateRubric({ ...r, displayOrder: order });
            } else if (kind === 'test') {
                const tst = tests.find((x) => x.id === row.id);
                if (tst && tst.displayOrder !== order) updateTest({ ...tst, displayOrder: order });
            } else {
                const group = essayAssignments.find((x) => x.teacherKey === row.id);
                if (group && group.displayOrder !== order) updateEssayGroup(row.id, { displayOrder: order });
            }
        }
    }

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
            <Joyride
                steps={activityTourSteps}
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
                title={t('activityDashboard.title')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                        {t('tutorial.ad_tour_button')}
                    </button>
                }
            />
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
                                            {t('voTrack.' + track)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                )}

                {pendingTasks.length > 0 && (
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '0.95rem' }}>
                            {t('gradingTasks.pending_title', { count: pendingTasks.length })}
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {pendingTasks.map((task) => {
                                const rubric = rubrics.find((r) => r.id === task.rubricId);
                                const student = students.find((s) => s.id === task.studentId);
                                return (
                                    <div
                                        key={task.id}
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            fontSize: '0.82rem',
                                            padding: '6px 8px',
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 6,
                                        }}
                                    >
                                        <span>
                                            {student?.name ?? task.studentId} — {rubric?.name ?? task.rubricId} ·{' '}
                                            <span style={{ color: 'var(--text-muted)' }}>
                                                {t('gradingTasks.assigned_to', { name: task.assignedToTeacher })}
                                            </span>
                                            {task.dueDate && (
                                                <span style={{ color: 'var(--text-muted)' }}>
                                                    {' '}
                                                    · {t('gradingTasks.due', { date: task.dueDate })}
                                                </span>
                                            )}
                                        </span>
                                        <button
                                            className="btn btn-ghost btn-icon btn-xs"
                                            aria-label={t('common.delete')}
                                            onClick={() => deleteGradingTask(task.id)}
                                        >
                                            <X size={13} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div data-tour="ad-grid" style={{ overflowX: 'auto' }}>
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
                                    data-tour="ad-activity"
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
                                {visibleClasses.map((cls, clsIndex) => (
                                    <th
                                        key={cls.id}
                                        data-tour={clsIndex === 0 ? 'ad-cell' : undefined}
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
                        <DragDropContext onDragEnd={handleDragEnd}>
                            {kinds.map((kind) => {
                                const rows = activities.filter((a) => a.kind === kind);
                                if (rows.length === 0) return null;
                                return (
                                    <Droppable droppableId={`ad-${kind}`} key={kind}>
                                        {(droppableProvided) => (
                                            <tbody
                                                ref={droppableProvided.innerRef}
                                                {...droppableProvided.droppableProps}
                                            >
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
                                                {rows.map((activity, idx) => (
                                                    <Draggable
                                                        key={activity.id}
                                                        draggableId={`${kind}:${activity.id}`}
                                                        index={idx}
                                                    >
                                                        {(dragProvided) => (
                                                            <tr
                                                                ref={dragProvided.innerRef}
                                                                {...dragProvided.draggableProps}
                                                                style={{
                                                                    borderBottom: '1px solid var(--border)',
                                                                    ...dragProvided.draggableProps.style,
                                                                }}
                                                            >
                                                                <td
                                                                    style={{
                                                                        position: 'sticky',
                                                                        left: 0,
                                                                        zIndex: 1,
                                                                        background: 'var(--bg-card)',
                                                                        padding: '8px 12px',
                                                                        maxWidth: 200,
                                                                        overflow: 'hidden',
                                                                        textOverflow: 'ellipsis',
                                                                        whiteSpace: 'nowrap',
                                                                    }}
                                                                    title={activity.name}
                                                                >
                                                                    <span
                                                                        {...dragProvided.dragHandleProps}
                                                                        aria-label={t('rubricList.drag_to_reorder')}
                                                                        style={{
                                                                            cursor: 'grab',
                                                                            color: 'var(--text-dim)',
                                                                            marginRight: 6,
                                                                            display: 'inline-flex',
                                                                            verticalAlign: 'middle',
                                                                        }}
                                                                    >
                                                                        <GripVertical size={13} />
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost btn-sm"
                                                                        style={{
                                                                            padding: 0,
                                                                            color: 'var(--accent)',
                                                                            fontWeight: 500,
                                                                        }}
                                                                        onClick={() => {
                                                                            if (activity.kind === 'rubric')
                                                                                navigate(`/rubrics/${activity.id}`);
                                                                            else if (activity.kind === 'test')
                                                                                navigate(`/tests/${activity.id}`);
                                                                            else navigate(`/essays/${activity.id}`);
                                                                        }}
                                                                    >
                                                                        {activity.name}
                                                                    </button>
                                                                </td>

                                                                {visibleClasses.map((cls) => {
                                                                    const cell = matrix[
                                                                        `${activity.kind}:${activity.id}`
                                                                    ]?.[cls.id] ?? {
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
                                                                                                    ? 'var(--accent)'
                                                                                                    : 'var(--text-muted)',
                                                                                            fontWeight: 600,
                                                                                        }}
                                                                                    >
                                                                                        {cell.submittedCount}/
                                                                                        {cell.totalStudents}
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
                                                                                                ? t(
                                                                                                      'activityDashboard.unlink'
                                                                                                  )
                                                                                                : t(
                                                                                                      'activityDashboard.link'
                                                                                                  )}
                                                                                        </button>
                                                                                    )}

                                                                                    {activity.kind === 'rubric' &&
                                                                                        cell.submittedCount <
                                                                                            cell.totalStudents && (
                                                                                            <button
                                                                                                className="btn btn-ghost btn-sm"
                                                                                                style={{
                                                                                                    fontSize: '0.7rem',
                                                                                                    padding: '2px 8px',
                                                                                                }}
                                                                                                title={t(
                                                                                                    'gradingTasks.assign_title'
                                                                                                )}
                                                                                                onClick={() =>
                                                                                                    openAssignTaskModal(
                                                                                                        cls.id,
                                                                                                        activity.id
                                                                                                    )
                                                                                                }
                                                                                            >
                                                                                                <ClipboardList
                                                                                                    size={11}
                                                                                                />{' '}
                                                                                                {t(
                                                                                                    'gradingTasks.assign_button'
                                                                                                )}
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
                                                                                                assignEssayToClass(
                                                                                                    cls.id,
                                                                                                    activity.id
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            {cell.isLinked &&
                                                                                            cell.submittedCount >=
                                                                                                cell.totalStudents
                                                                                                ? t(
                                                                                                      'activityDashboard.all_assigned'
                                                                                                  )
                                                                                                : t(
                                                                                                      'activityDashboard.assign'
                                                                                                  )}
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
                                                                                                navigate(
                                                                                                    `/tests/${activity.id}`
                                                                                                )
                                                                                            }
                                                                                        >
                                                                                            {t(
                                                                                                'activityDashboard.open'
                                                                                            )}
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    );
                                                                })}
                                                            </tr>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {droppableProvided.placeholder}
                                            </tbody>
                                        )}
                                    </Droppable>
                                );
                            })}
                        </DragDropContext>
                    </table>
                </div>

                {visibleClasses.length > 0 && (
                    <div style={{ marginTop: 28 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>{t('activityDashboard.coverage_title')}</h3>
                            <div className="form-group" style={{ marginBottom: 0, maxWidth: 200 }}>
                                <label htmlFor="coverage-class-select" className="sr-only">
                                    {t('activityDashboard.coverage_title')}
                                </label>
                                <select
                                    id="coverage-class-select"
                                    value={activeCoverageClassId}
                                    onChange={(e) => setCoverageClassId(e.target.value)}
                                >
                                    {visibleClasses.map((cls) => (
                                        <option key={cls.id} value={cls.id}>
                                            {cls.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <ClassCoverageGapPanel covered={coverage.covered} gap={coverage.gap} />
                    </div>
                )}
            </div>

            {assignTaskCell && (
                <div className="modal-overlay" onClick={() => setAssignTaskCell(null)}>
                    <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{t('gradingTasks.modal_title')}</h3>
                            <button
                                className="btn btn-ghost btn-icon"
                                aria-label={t('common.close')}
                                onClick={() => setAssignTaskCell(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group">
                                <label>{t('gradingTasks.teacher_label')}</label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={assignTeacherName}
                                    onChange={(e) => setAssignTeacherName(e.target.value)}
                                    placeholder={t('gradingTasks.teacher_placeholder')}
                                />
                            </div>
                            <div className="form-group">
                                <label>{t('gradingTasks.due_date_label')}</label>
                                <input
                                    type="date"
                                    value={assignDueDate}
                                    onChange={(e) => setAssignDueDate(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setAssignTaskCell(null)}>
                                {t('common.cancel')}
                            </button>
                            <button
                                className="btn btn-primary"
                                disabled={!assignTeacherName.trim()}
                                onClick={handleAssignTasks}
                            >
                                {t('gradingTasks.action_assign')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
