import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutGrid, Plus, X } from 'lucide-react';
import type { DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import PageTour from '../components/Tour/PageTour';
import { getActivityDashboardTourSteps } from '../data/TutorialSteps';
import Topbar from '../components/Layout/Topbar';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { getActivityRows, buildDashboardMatrix, summarizeDashboardMatrix } from '../utils/activityDashboardAggregator';
import ActivityDashboardGrid from '../components/ActivityDashboard/ActivityDashboardGrid';
import ActivityDashboardSummary from '../components/ActivityDashboard/ActivityDashboardSummary';
import Modal from '../components/ui/Modal';
import { reorderDisplayOrder } from '../utils/displayOrder';
import { VO_TRACKS } from '../data/voTracks';
import { SCHOOL_YEAR_LABELS, getAvailableSchoolYears } from '../data/schoolYears';
import type { ActivityRow, SchoolYear, VoTrack } from '../types';
import { nanoid } from '../utils/nanoid';
import { EmptyState } from '../components/ui/EmptyState';

/** Activity Dashboard route: filters, matrix, year summary and class actions. */
export default function ActivityDashboardPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const {
        students: allStudents,
        classes,
        studentRubrics: allStudentRubrics,
        rubrics,
        tests,
        studentTests,
        gradingTasks,
        essayAssignments,
        gradeScales,
        settings,
    } = useStoreSelector((s) => ({
        students: s.students,
        classes: s.classes,
        studentRubrics: s.studentRubrics,
        rubrics: s.rubrics,
        tests: s.tests,
        studentTests: s.studentTests,
        gradingTasks: s.gradingTasks,
        essayAssignments: s.essayAssignments,
        gradeScales: s.gradeScales,
        settings: s.settings,
    }));
    // The roster domain hooks filtered soft-deleted rows; keep that behavior here.
    const students = useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);
    const studentRubrics = useMemo(() => allStudentRubrics.filter((sr) => !sr.deletedAt), [allStudentRubrics]);
    const {
        updateClass,
        updateRubric,
        updateTest,
        addGradingTasks,
        deleteGradingTask,
        addEssayAssignments,
        updateEssayGroup,
        updateSettings,
    } = useStoreActions();

    const [filterYear, setFilterYear] = useState<SchoolYear | 'all'>('all');
    const [filterTrack, setFilterTrack] = useState<VoTrack | 'all'>('all');
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
        /* v8 ignore next -- provably dead: the assign button only renders inside the modal (assignTaskCell set) and is disabled without a teacher name */
        if (!assignTaskCell || !assignTeacherName.trim()) return;
        const classStudents = students.filter((s) => s.classId === assignTaskCell.classId);
        const alreadyPending = new Set(
            pendingTasks.filter((t) => t.rubricId === assignTaskCell.rubricId).map((t) => t.studentId)
        );
        const ungraded = classStudents.filter(
            (s) =>
                !alreadyPending.has(s.id) &&
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

    const yearOptions = useMemo(() => getAvailableSchoolYears(classes), [classes]);

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
            buildDashboardMatrix(
                activities,
                visibleClasses,
                students,
                studentRubrics,
                studentTests,
                essayAssignments,
                rubrics,
                tests,
                gradeScales,
                settings.defaultGradeScaleId
            ),
        [
            activities,
            visibleClasses,
            students,
            studentRubrics,
            studentTests,
            essayAssignments,
            rubrics,
            tests,
            gradeScales,
            settings.defaultGradeScaleId,
        ]
    );

    const summary = useMemo(
        () => summarizeDashboardMatrix(activities, visibleClasses, matrix),
        [activities, visibleClasses, matrix]
    );

    const classNames = useMemo(
        () => Object.fromEntries(visibleClasses.map((cls) => [cls.id, cls.name])),
        [visibleClasses]
    );

    function toggleRubricLink(classId: string, rubricId: string, linked: boolean) {
        const cls = classes.find((c) => c.id === classId);
        /* v8 ignore next -- provably dead: the cell only renders for a visible class */
        if (!cls) return;
        const rubricIds = linked
            ? cls.rubricIds!.filter((id) => id !== rubricId)
            : [...(cls.rubricIds ?? []), rubricId];
        updateClass({ ...cls, rubricIds });
    }

    function assignEssayToClass(classId: string, teacherKey: string) {
        const template = essayAssignments.find((a) => a.teacherKey === teacherKey);
        /* v8 ignore next -- provably dead: essay rows come from essayAssignments, so the template always exists */
        if (!template) return;
        const assignedIds = new Set(
            essayAssignments.filter((a) => a.teacherKey === teacherKey).map((a) => a.studentId)
        );
        // Strip any embedded Supabase credentials: essay_assignments rows are 1:1 with a
        // single teacherKey server-side, but every new row here shares the template's
        // teacherKey. A "DB mode" link would point all of these students at a row that
        // can only ever belong to one of them, so force the offline/local-code flow.
        const { supabaseUrl: _supabaseUrl, supabaseAnonKey: _supabaseAnonKey, ...templateWithoutDb } = template;
        const newAssignments = students
            .filter((s) => s.classId === classId && !assignedIds.has(s.id))
            .map((s) => ({
                ...templateWithoutDb,
                id: crypto.randomUUID(),
                studentId: s.id,
                createdAt: new Date().toISOString(),
            }));
        /* v8 ignore next -- provably dead: the assign button is disabled once every student is assigned */
        if (newAssignments.length > 0) addEssayAssignments(newAssignments);
    }

    function handleDragEnd(result: DropResult) {
        if (!result.destination) return;
        if (result.source.droppableId !== result.destination.droppableId) return;
        if (result.source.index === result.destination.index) return;
        const kind = result.source.droppableId.replace('ad-', '') as 'rubric' | 'test' | 'essay';
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

    /** Open the editor for a rubric/test or the essay workspace for an essay group. */
    function openActivity(activity: ActivityRow) {
        if (activity.kind === 'rubric') navigate(`/rubrics/${activity.id}`);
        else if (activity.kind === 'test') navigate(`/tests/${activity.id}`);
        else navigate(`/essays/${activity.id}`);
    }

    if (activities.length === 0) {
        return (
            <>
                <Topbar title={t('activityDashboard.title')} />
                <div className="page-content fade-in">
                    <EmptyState
                        icon={LayoutGrid}
                        description={t('activityDashboard.empty')}
                        action={{
                            label: t('activityDashboard.create_cta'),
                            icon: Plus,
                            onClick: () => navigate('/rubrics'),
                        }}
                    />
                </div>
            </>
        );
    }

    return (
        <>
            <PageTour
                steps={activityTourSteps}
                run={tourRun}
                onFinish={() => setTourRun(false)}
                onStartRequest={() => setTourRun(true)}
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
                <div className="ad-page-head">
                    <div className="ad-filters">
                        {yearOptions.length > 0 && (
                            <div className="form-group" style={{ marginBottom: 0, maxWidth: 150 }}>
                                <label htmlFor="ad-year-filter">{t('statistics.filters.year')}</label>
                                <select
                                    id="ad-year-filter"
                                    value={filterYear}
                                    onChange={(e) => setFilterYear(e.target.value as SchoolYear | 'all')}
                                >
                                    <option value="all">{t('statistics.all_classes')}</option>
                                    {yearOptions.map((y) => (
                                        <option key={y} value={y}>
                                            {SCHOOL_YEAR_LABELS[y]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {classes.some((c) => c.voTrack) && (
                            <div className="form-group" style={{ marginBottom: 0, maxWidth: 170 }}>
                                <label htmlFor="ad-track-filter">{t('statistics.filters.track')}</label>
                                <select
                                    id="ad-track-filter"
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
                    <p className="ad-header-note" title={t('activityDashboard.cefr_help')}>
                        {t('activityDashboard.header_note')}
                    </p>
                </div>

                {pendingTasks.length > 0 && (
                    <div className="card ad-pending-card">
                        <h2 className="ad-pending-title">
                            {t('gradingTasks.pending_title', { count: pendingTasks.length })}
                        </h2>
                        <div className="ad-pending-list">
                            {pendingTasks.map((task) => {
                                const rubric = rubrics.find((r) => r.id === task.rubricId);
                                const student = students.find((s) => s.id === task.studentId);
                                return (
                                    <div key={task.id} className="ad-pending-row">
                                        <span>
                                            {student?.name ?? task.studentId} — {rubric?.name ?? task.rubricId} ·{' '}
                                            <span className="ad-muted">
                                                {t('gradingTasks.assigned_to', { name: task.assignedToTeacher })}
                                            </span>
                                            {task.dueDate && (
                                                <span className="ad-muted">
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

                <ActivityDashboardGrid
                    activities={activities}
                    visibleClasses={visibleClasses}
                    matrix={matrix}
                    compact={settings.activityDashboardCompact ?? false}
                    onCompactChange={(compact) => updateSettings({ activityDashboardCompact: compact })}
                    onToggleRubricLink={toggleRubricLink}
                    onAssignRubric={openAssignTaskModal}
                    onAssignEssay={assignEssayToClass}
                    onOpenActivity={openActivity}
                    onDragEnd={handleDragEnd}
                />

                {visibleClasses.length > 0 && <ActivityDashboardSummary summary={summary} classNames={classNames} />}
            </div>

            {assignTaskCell && (
                <Modal titleId="grading-task-title" onClose={() => setAssignTaskCell(null)} maxWidth={420}>
                    <div className="modal-header">
                        <h3 id="grading-task-title">{t('gradingTasks.modal_title')}</h3>
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
                            <label htmlFor="grading-task-teacher">{t('gradingTasks.teacher_label')}</label>
                            <input
                                id="grading-task-teacher"
                                type="text"
                                autoFocus
                                value={assignTeacherName}
                                onChange={(e) => setAssignTeacherName(e.target.value)}
                                placeholder={t('gradingTasks.teacher_placeholder')}
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="grading-task-due-date">{t('gradingTasks.due_date_label')}</label>
                            <input
                                id="grading-task-due-date"
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
                </Modal>
            )}
        </>
    );
}
