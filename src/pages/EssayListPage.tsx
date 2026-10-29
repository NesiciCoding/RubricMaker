import React from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, FileText, Radio } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useAuthoring, useClasses, useEssays, useStudents } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import CardGrid from '../components/ui/CardGrid';
import CardTile from '../components/ui/CardTile';
import CardGrip from '../components/ui/CardGrip';
import FolderBar from '../components/Folders/FolderBar';
import FolderNameModal from '../components/Folders/FolderNameModal';
import { useToast } from '../hooks/useToast';
import { useConfirm } from '../hooks/useConfirm';
import { useFolderDropTarget } from '../hooks/useFolderDropTarget';
import { useOnlineEssaySubmissions } from '../hooks/useOnlineEssaySubmissions';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';
import { getCohortStudentIds, isAllCohorts, ALL_COHORTS } from '../utils/cohortAggregator';
import { ALL_FOLDERS, countInFolder, filterByFolder, foldersForKind, nextFolderOrder } from '../utils/folders';
import type { CohortFilter as CohortFilterValue, Folder } from '../types';
import CohortFilter from '../components/CohortFilter';

export default function EssayListPage() {
    const { t } = useTranslation();
    const tour = usePageTourState('essays');
    const navigate = useNavigate();
    const { students } = useStudents();
    const { classes } = useClasses();

    const {
        rubrics,
        // `= []` guards page tests and older local snapshots that predate the collection.
        folders = [],
        addFolder,
        updateFolder,
        deleteFolder,
    } = useAuthoring();
    const { essayAssignments, essaySubmissions, deleteEssayGroup, updateEssayGroup } = useEssays();
    const onlineEssaySubmissions = useOnlineEssaySubmissions();

    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const { showToast } = useToast();
    const [cohortFilter, setCohortFilter] = React.useState<CohortFilterValue>(ALL_COHORTS);
    const [activeFolder, setActiveFolder] = React.useState<string>(ALL_FOLDERS);
    const [folderModal, setFolderModal] = React.useState<{ folder?: Folder } | null>(null);
    const { dropFolderId, startFolderDrop, endFolderDrop } = useFolderDropTarget();
    const cohortStudentIds = React.useMemo(
        () => getCohortStudentIds(students, classes, cohortFilter),
        [students, classes, cohortFilter]
    );
    // Reordering writes displayOrder back by index, so it only runs while the list is
    // unfiltered — under a cohort or folder filter the index would not be the list's position.
    const reorderable = isAllCohorts(cohortFilter) && activeFolder === ALL_FOLDERS;

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
            folderId: rows[0]?.folderId,
            // v8 ignore next line — grouped rows always have ≥1 row with a createdAt
            createdAt: rows[0]?.createdAt ?? '',
        }));
        return sortByDisplayOrder(unsorted).filter(
            (g) => isAllCohorts(cohortFilter) || g.rows.some((r) => cohortStudentIds.has(r.studentId))
        );
    }, [essayAssignments, cohortFilter, cohortStudentIds]);

    const essayFolders = foldersForKind(folders, 'essay');
    const visibleGroups = filterByFolder(groups, activeFolder);

    function fileIntoFolder(teacherKey: string | undefined, folderId: string) {
        const group = groups.find((g) => g.teacherKey === teacherKey);
        if (!group || group.folderId === folderId) return;
        // Every assignment row of the group carries the folder, so the group stays together.
        updateEssayGroup(group.teacherKey, { folderId });
        const folder = essayFolders.find((f) => f.id === folderId);
        if (folder) showToast(t('folders.moved_toast', { name: folder.name }), 'success');
    }

    function handleDragEnd(result: DropResult) {
        // The pointer decides which folder was under the card: @hello-pangea/dnd only sees the
        // dragged card's centre, which never reaches a folder tile from a corner grab.
        const pointerFolderId = endFolderDrop();
        if (pointerFolderId) {
            fileIntoFolder(visibleGroups[result.source.index]?.teacherKey, pointerFolderId);
            return;
        }
        if (!result.destination || !reorderable) return;
        if (result.destination.index === result.source.index) return;
        for (const [group, order] of reorderDisplayOrder(
            visibleGroups,
            result.source.index,
            result.destination.index
        )) {
            if (group.displayOrder !== order) updateEssayGroup(group.teacherKey, { displayOrder: order });
        }
    }

    function submitFolderName(name: string) {
        const editing = folderModal?.folder;
        if (editing) {
            updateFolder({ ...editing, name });
            showToast(t('folders.renamed_toast'), 'success');
        } else {
            const folder = addFolder({ name, kind: 'essay', displayOrder: nextFolderOrder(folders, 'essay') });
            setActiveFolder(folder.id);
            showToast(t('folders.created_toast', { name }), 'success');
        }
        setFolderModal(null);
    }

    async function handleDeleteFolder(folder: Folder) {
        const ok = await confirm({
            title: t('folders.delete_title'),
            message: t('folders.delete_warning_other', { name: folder.name }),
            confirmLabel: t('common.delete'),
            danger: true,
        });
        if (!ok) return;
        deleteFolder(folder.id, 'essay');
        if (activeFolder === folder.id) setActiveFolder(ALL_FOLDERS);
        showToast(t('folders.deleted_toast', { name: folder.name }), 'success');
    }

    // Offline (pasted-code) submissions come from the hydrated essaySubmissions; online hand-ins
    // (essay_submissions via submit-essay) are added via useOnlineEssaySubmissions — otherwise the
    // count would stay 0 for portal submissions.
    const submittedCount = (teacherKey: string) =>
        new Set([
            ...essaySubmissions.filter((s) => s.teacherKey === teacherKey).map((s) => s.assignmentStudentId),
            ...(onlineEssaySubmissions.get(teacherKey) ?? []),
        ]).size;

    async function handleDelete(teacherKey: string, title: string) {
        const ok = await confirm({
            title: t('essays.delete_essay_title'),
            message: t('essays.delete_essay_warning', {
                name: title,
                count: submittedCount(teacherKey),
            }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteEssayGroup(teacherKey);
    }

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                title={t('essays.list_title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                            {t('tutorial.page_tour_button')}
                        </button>
                        <button
                            data-tour="el-new"
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate('/essays/new')}
                        >
                            <Plus size={15} /> {t('essays.new_essay')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div data-tour="el-filters" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <CohortFilter classes={classes} value={cohortFilter} onChange={setCohortFilter} />
                </div>
                {groups.length === 0 && essayFolders.length === 0 ? (
                    <div className="empty-state">
                        <FileText size={40} />
                        <h3>{t('essays.no_essays')}</h3>
                        <p className="text-muted text-sm">{t('essays.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/essays/new')}>
                            <Plus size={16} /> {t('essays.new_essay')}
                        </button>
                    </div>
                ) : (
                    <DragDropContext onBeforeCapture={startFolderDrop} onDragEnd={handleDragEnd}>
                        <FolderBar
                            folders={essayFolders}
                            activeFolder={activeFolder}
                            countFor={(folderId) => countInFolder(groups, folderId)}
                            dropFolderId={dropFolderId}
                            onOpen={(id) => setActiveFolder((current) => (current === id ? ALL_FOLDERS : id))}
                            onRename={(folder) => setFolderModal({ folder })}
                            onDelete={handleDeleteFolder}
                            onCreate={() => setFolderModal({})}
                        />
                        {visibleGroups.length === 0 ? (
                            <div className="empty-state">
                                <FileText size={40} />
                                <h3>{t('folders.empty')}</h3>
                                <p className="text-muted text-sm">{t('folders.empty_hint')}</p>
                            </div>
                        ) : (
                            <Droppable droppableId="essay-list">
                                {(droppableProvided) => (
                                    <CardGrid ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                                        {visibleGroups.map(({ teacherKey, rows }, idx) => {
                                            const first = rows[0];
                                            const rubric = rubrics.find((r) => r.id === first.rubricId);
                                            const submitted = submittedCount(teacherKey);
                                            return (
                                                <Draggable
                                                    key={teacherKey}
                                                    draggableId={teacherKey}
                                                    index={idx}
                                                    isDragDisabled={!reorderable}
                                                >
                                                    {(dragProvided) => (
                                                        <CardTile
                                                            ref={dragProvided.innerRef}
                                                            {...dragProvided.draggableProps}
                                                            style={dragProvided.draggableProps.style}
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
                                                                        <CardGrip
                                                                            {...dragProvided.dragHandleProps}
                                                                            label={t('rubricList.drag_to_reorder')}
                                                                        />
                                                                    )}
                                                                    <div style={{ minWidth: 0 }}>
                                                                        <h3>{first.title}</h3>
                                                                        <div
                                                                            className="text-muted text-xs"
                                                                            style={{ marginTop: 2 }}
                                                                        >
                                                                            {new Date(
                                                                                first.createdAt
                                                                            ).toLocaleDateString()}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: 4 }}>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        title={t('tests.action_edit')}
                                                                        aria-label={t('tests.action_edit')}
                                                                        onClick={() =>
                                                                            navigate(`/essays/${teacherKey}`)
                                                                        }
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
                                                                    <span className="badge badge-blue">
                                                                        {rubric.name}
                                                                    </span>
                                                                )}
                                                                <span className="badge badge-purple">
                                                                    {t('essays.assigned_students_title')}: {rows.length}
                                                                </span>
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        gap: 6,
                                                                        minWidth: 120,
                                                                    }}
                                                                >
                                                                    <span className="text-muted text-xs">
                                                                        {t('essays.submission_status_submitted')}
                                                                    </span>
                                                                    <div
                                                                        role="progressbar"
                                                                        aria-valuenow={
                                                                            // v8 ignore next line — grouped rows always have at least one row
                                                                            rows.length
                                                                                ? Math.round(
                                                                                      (submitted / rows.length) * 100
                                                                                  )
                                                                                : 0
                                                                        }
                                                                        aria-valuemin={0}
                                                                        aria-valuemax={100}
                                                                        style={{
                                                                            flex: 1,
                                                                            height: 6,
                                                                            borderRadius: 3,
                                                                            background: 'var(--border)',
                                                                            overflow: 'hidden',
                                                                        }}
                                                                    >
                                                                        <div
                                                                            style={{
                                                                                height: '100%',
                                                                                width: `${
                                                                                    // v8 ignore next line — grouped rows always have at least one row
                                                                                    rows.length
                                                                                        ? (submitted / rows.length) *
                                                                                          100
                                                                                        : 0
                                                                                }%`,
                                                                                background: 'var(--green, #22c55e)',
                                                                            }}
                                                                        />
                                                                    </div>
                                                                    <span className="text-muted text-xs">
                                                                        {submitted}/{rows.length}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div style={{ display: 'flex', gap: 8 }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-primary btn-sm"
                                                                    style={{ flex: '1 1 auto' }}
                                                                    onClick={() => navigate(`/essays/${teacherKey}`)}
                                                                >
                                                                    <Edit2 size={14} /> {t('tests.action_edit')}
                                                                </button>
                                                                <Link
                                                                    to={`/essays/${teacherKey}/monitor`}
                                                                    className="btn btn-secondary btn-sm"
                                                                    style={{ flex: '1 1 auto' }}
                                                                >
                                                                    <Radio size={14} /> {t('essays.action_monitor')}
                                                                </Link>
                                                            </div>
                                                        </CardTile>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        {droppableProvided.placeholder}
                                    </CardGrid>
                                )}
                            </Droppable>
                        )}
                    </DragDropContext>
                )}

                {folderModal && (
                    <FolderNameModal
                        title={folderModal.folder ? t('folders.rename_title') : t('folders.new_folder')}
                        submitLabel={folderModal.folder ? t('folders.rename') : t('folders.create')}
                        initialName={folderModal.folder?.name}
                        onSubmit={submitFolderName}
                        onClose={() => setFolderModal(null)}
                    />
                )}

                <ConfirmDialog {...confirmDialogProps} />
            </div>
        </>
    );
}
