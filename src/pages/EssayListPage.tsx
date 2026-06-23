import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, FileText, Radio, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';
import {
    getCohortStudentIds,
    isAllCohorts,
    ALL_COHORTS,
    type CohortFilter as CohortFilterValue,
} from '../utils/cohortAggregator';
import CohortFilter from '../components/CohortFilter';

export default function EssayListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { essayAssignments, essaySubmissions, rubrics, deleteEssayGroup, updateEssayGroup, students, classes } =
        useApp();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const [cohortFilter, setCohortFilter] = React.useState<CohortFilterValue>(ALL_COHORTS);
    const cohortStudentIds = getCohortStudentIds(students, classes, cohortFilter);
    const reorderable = isAllCohorts(cohortFilter);

    const groups = React.useMemo(() => {
        const byKey = new Map<string, typeof essayAssignments>();
        for (const a of essayAssignments) {
            const existing = byKey.get(a.teacherKey);
            if (existing) existing.push(a);
            else byKey.set(a.teacherKey, [a]);
        }
        const unsorted = Array.from(byKey.entries()).map(([teacherKey, rows]) => ({
            teacherKey,
            rows,
            displayOrder: rows[0]?.displayOrder,
            createdAt: rows[0]?.createdAt ?? '',
        }));
        return sortByDisplayOrder(unsorted).filter(
            (g) => isAllCohorts(cohortFilter) || g.rows.some((r) => cohortStudentIds.has(r.studentId))
        );
    }, [essayAssignments, cohortFilter, cohortStudentIds]);

    function handleDragEnd(result: DropResult) {
        if (!result.destination || !reorderable) return;
        if (result.destination.index === result.source.index) return;
        for (const [group, order] of reorderDisplayOrder(groups, result.source.index, result.destination.index)) {
            if (group.displayOrder !== order) updateEssayGroup(group.teacherKey, { displayOrder: order });
        }
    }

    async function handleDelete(teacherKey: string, title: string) {
        const ok = await confirm({
            title: t('essays.delete_essay_title'),
            message: t('essays.delete_essay_warning', { name: title }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteEssayGroup(teacherKey);
    }

    return (
        <>
            <Topbar
                title={t('essays.list_title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/essays/new')}>
                        <Plus size={15} /> {t('essays.new_essay')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <CohortFilter classes={classes} value={cohortFilter} onChange={setCohortFilter} />
                </div>
                {groups.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={40} />
                        <h3>{t('essays.no_essays')}</h3>
                        <p className="text-muted text-sm">{t('essays.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/essays/new')}>
                            <Plus size={16} /> {t('essays.new_essay')}
                        </button>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="essay-list">
                            {(droppableProvided) => (
                                <div
                                    ref={droppableProvided.innerRef}
                                    {...droppableProvided.droppableProps}
                                    style={{
                                        // ponytail: flex-wrap, not CSS grid — see RubricList for why @hello-pangea/dnd needs this
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 16,
                                    }}
                                >
                                    {groups.map(({ teacherKey, rows }, idx) => {
                                        const first = rows[0];
                                        const rubric = rubrics.find((r) => r.id === first.rubricId);
                                        const submittedCount = new Set(
                                            essaySubmissions
                                                .filter((s) => s.teacherKey === teacherKey)
                                                .map((s) => s.assignmentStudentId)
                                        ).size;
                                        return (
                                            <Draggable
                                                key={teacherKey}
                                                draggableId={teacherKey}
                                                index={idx}
                                                isDragDisabled={!reorderable}
                                            >
                                                {(dragProvided) => (
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                        className="card"
                                                        style={{
                                                            transition: 'border-color var(--transition)',
                                                            flex: '1 1 320px',
                                                            maxWidth: 480,
                                                            ...dragProvided.draggableProps.style,
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                justifyContent: 'space-between',
                                                                alignItems: 'flex-start',
                                                                marginBottom: 12,
                                                            }}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    alignItems: 'flex-start',
                                                                    gap: 6,
                                                                }}
                                                            >
                                                                {reorderable && (
                                                                    <span
                                                                        {...dragProvided.dragHandleProps}
                                                                        aria-label={t('rubricList.drag_to_reorder')}
                                                                        style={{
                                                                            cursor: 'grab',
                                                                            color: 'var(--text-dim)',
                                                                            marginTop: 3,
                                                                        }}
                                                                    >
                                                                        <GripVertical size={15} />
                                                                    </span>
                                                                )}
                                                                <div>
                                                                    <h3>{first.title}</h3>
                                                                    <div
                                                                        className="text-muted text-xs"
                                                                        style={{ marginTop: 2 }}
                                                                    >
                                                                        {new Date(first.createdAt).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_edit')}
                                                                    aria-label={t('tests.action_edit')}
                                                                    onClick={() => navigate(`/essays/${teacherKey}`)}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_delete')}
                                                                    aria-label={t('tests.action_delete')}
                                                                    style={{ color: 'var(--red)' }}
                                                                    onClick={() =>
                                                                        handleDelete(teacherKey, first.title)
                                                                    }
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: 8,
                                                                flexWrap: 'wrap',
                                                                marginBottom: 14,
                                                            }}
                                                        >
                                                            {rubric && (
                                                                <span className="badge badge-blue">{rubric.name}</span>
                                                            )}
                                                            <span className="badge badge-purple">
                                                                {t('essays.assigned_students_title')}: {rows.length}
                                                            </span>
                                                            <span className="badge badge-green">
                                                                {t('essays.submission_status_submitted')}:{' '}
                                                                {submittedCount}/{rows.length}
                                                            </span>
                                                        </div>

                                                        <div
                                                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="btn btn-primary btn-sm"
                                                                onClick={() => navigate(`/essays/${teacherKey}`)}
                                                            >
                                                                <Edit2 size={14} /> {t('tests.action_edit')}
                                                            </button>
                                                            <Link
                                                                to={`/essays/${teacherKey}/monitor`}
                                                                className="btn btn-secondary btn-sm"
                                                            >
                                                                <Radio size={14} /> {t('essays.action_monitor')}
                                                            </Link>
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        );
                                    })}
                                    {droppableProvided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    </DragDropContext>
                )}

                <ConfirmDialog {...confirmDialogProps} />
            </div>
        </>
    );
}
