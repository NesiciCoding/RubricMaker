import React, { useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useNavigate } from 'react-router-dom';
import {
    Archive,
    Plus,
    Edit2,
    Trash2,
    Copy,
    ClipboardCheck,
    Send,
    Radio,
    Sparkles,
    LayoutGrid,
    List,
    Table2,
    Share2,
    FileJson,
    X,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { useToast } from '../hooks/useToast';
import { cloneTestForCopy } from '../utils/testClone';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import Modal from '../components/ui/Modal';
import TestCard from '../components/Tests/TestCard';
import TestResultsDrawer from '../components/Tests/TestResultsDrawer';
import CardGrid from '../components/ui/CardGrid';
import { EmptyState } from '../components/ui/EmptyState';
import { useConfirm } from '../hooks/useConfirm';
import { useFolderDropTarget } from '../hooks/useFolderDropTarget';
import TestAssignmentModal from '../components/Tests/TestAssignmentModal';
import FolderBar from '../components/Folders/FolderBar';
import { FOLDER_DROP_PREFIX } from '../components/Folders/FolderTile';
import FolderNameModal from '../components/Folders/FolderNameModal';
import TestSubmissionImportModal from '../components/Tests/TestSubmissionImportModal';
import ExamScanBatchModal from '../components/Tests/ExamScanBatchModal';
import GenerateTestModal from '../components/Tests/GenerateTestModal';
import TestImportModal from '../components/Tests/TestImportModal';
import type { ImportedTest } from '../utils/testImport';
import ExamBookletExportPanel from '../components/Tests/ExamBookletExportPanel';
import type { Folder, MaterialSharing, Test, CohortFilter as CohortFilterValue } from '../types';
import { toggleClassTest } from '../utils/classTests';
import { useDbStatus } from '../hooks/useDbStatus';
import {
    inheritedSharing,
    isShared,
    resolveFolderSharing,
    resolveSharing,
    type SharedEntry,
} from '../utils/materialSharing';
import SharingModal from '../components/Sharing/SharingModal';
import SharedMaterialsSection from '../components/Sharing/SharedMaterialsSection';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';
import { ALL_FOLDERS, filterByFolder, folderPathLabel, foldersForKind, nextFolderOrder } from '../utils/folders';
import { getCohortStudentIds, isAllCohorts, ALL_COHORTS } from '../utils/cohortAggregator';
import { isGeneratorTest } from '../utils/placementGenerator';
import CohortFilter from '../components/CohortFilter';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import { calcClassAveragePercentage } from '../utils/testCalc';
import { testAssignBlockers } from '../utils/testQuestionIssues';
import { resolveScanOcrSettings } from '../utils/scanSettings';
import { defaultScoreOnlyQuestions } from '../utils/scoreSheet';

export default function TestListPage() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language.startsWith('nl') ? 'nl' : 'en';
    const tour = usePageTourState('tests');
    const navigate = useNavigate();
    const {
        students: allStudents,
        classes,
        exportTemplates,
        tests,
        studentTests,
        settings,
        gradeScales,
        // `= []` guards page tests and older local snapshots that predate the collection.
        folders = [],
    } = useStoreSelector((s) => ({
        students: s.students,
        classes: s.classes,
        exportTemplates: s.exportTemplates,
        tests: s.tests,
        studentTests: s.studentTests,
        settings: s.settings,
        gradeScales: s.gradeScales,
        folders: s.folders,
    }));
    // The roster domain hooks filtered soft-deleted rows; archived students must not
    // appear in cohort filters or per-student statistics.
    const students = React.useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);
    const {
        addTest,
        updateTest,
        deleteTest,
        archiveTest,
        restoreTest,
        saveStudentTest,
        addFolder,
        updateFolder,
        deleteFolder,
        updateClass,
        deleteTestAssignments,
    } = useStoreActions();

    const activeStyleTemplate = exportTemplates.find((t) => t.kind === 'style' && t.id === settings.styleTemplateId);
    const [cohortFilter, setCohortFilter] = useState<CohortFilterValue>(ALL_COHORTS);
    const [view, setView] = useState<'cards' | 'list'>('cards');
    const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDERS);
    // `parentId` is where a new folder is created: the folder you are inside of, if any.
    const [folderModal, setFolderModal] = useState<{ folder?: Folder; parentId?: string } | null>(null);
    const [sharingTarget, setSharingTarget] = useState<{ kind: 'test' | 'folder'; id: string } | null>(null);
    const dbStatus = useDbStatus();
    const allCohorts = isAllCohorts(cohortFilter);
    const cohortStudentIds = React.useMemo(
        () => getCohortStudentIds(students, classes, cohortFilter),
        [students, classes, cohortFilter]
    );
    const testFolders = foldersForKind(folders, 'test');
    const assignedClassIdsByTest = React.useMemo(() => {
        const map = new Map<string, string[]>();
        for (const cls of classes) {
            for (const testId of cls.testIds ?? []) map.set(testId, [...(map.get(testId) ?? []), cls.id]);
        }
        return map;
    }, [classes]);
    const visibleTests = React.useMemo(() => {
        const sorted = filterByFolder(sortByDisplayOrder(tests.filter((test) => !test.archivedAt)), activeFolder);
        if (allCohorts) return sorted;
        const cohortTestIds = new Set(
            studentTests.filter((st) => cohortStudentIds.has(st.studentId)).map((st) => st.testId)
        );
        // A class also owns the tests linked to it, whether or not anyone has taken them yet —
        // that link is what makes "what still needs grading for this class" filterable.
        const cohortClassIds = new Set(students.filter((s) => cohortStudentIds.has(s.id)).map((s) => s.classId));
        for (const cls of classes) {
            if (!cohortClassIds.has(cls.id)) continue;
            for (const testId of cls.testIds ?? []) cohortTestIds.add(testId);
        }
        return sorted.filter((test) => cohortTestIds.has(test.id));
    }, [tests, studentTests, cohortStudentIds, allCohorts, activeFolder, classes, students]);
    const reorderable = allCohorts && activeFolder === ALL_FOLDERS;
    const { dropFolderId, startFolderDrop, endFolderDrop } = useFolderDropTarget();

    function fileIntoFolder(test: Test | undefined, folderId: string) {
        if (!test || test.folderId === folderId) return;
        updateTest({ ...test, folderId });
        const folder = testFolders.find((f) => f.id === folderId);
        if (folder) showToast(t('folders.moved_toast', { name: folder.name }), 'success');
    }

    function handleDragEnd(result: DropResult) {
        // Pointer-based: @hello-pangea/dnd only sees the dragged card's centre, which never reaches
        // a folder tile from a card grabbed by its corner handle.
        const pointerFolderId = endFolderDrop();
        // `reason` guards Escape: @hello-pangea/dnd calls onDragEnd with CANCEL and a null
        // destination, and the pointer may well be resting on a tile at that moment.
        if (pointerFolderId && result.reason === 'DROP') {
            fileIntoFolder(visibleTests[result.source.index], pointerFolderId);
            return;
        }
        const destination = result.destination;
        if (!destination) return;
        if (destination.droppableId.startsWith(FOLDER_DROP_PREFIX)) {
            fileIntoFolder(visibleTests[result.source.index], destination.droppableId.slice(FOLDER_DROP_PREFIX.length));
            return;
        }
        if (destination.droppableId !== 'test-list' || !reorderable) return;
        if (destination.index === result.source.index) return;
        for (const [test, order] of reorderDisplayOrder(visibleTests, result.source.index, destination.index)) {
            if (test.displayOrder !== order) updateTest({ ...test, displayOrder: order });
        }
    }
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const { showToast } = useToast();

    function moveFolder(folder: Folder, parentId: string | undefined) {
        if (folder.parentId === parentId) return;
        updateFolder({
            ...folder,
            parentId,
            displayOrder: nextFolderOrder(folders, 'test', parentId),
        });
    }

    function moveTest(test: Test, folderId: string | undefined) {
        if ((test.folderId ?? undefined) === folderId) return;
        updateTest({ ...test, folderId });
    }

    function submitFolderName(name: string) {
        const editing = folderModal?.folder;
        if (editing) {
            updateFolder({ ...editing, name });
        } else {
            const parentId = folderModal?.parentId;
            const folder = addFolder({
                name,
                kind: 'test',
                parentId,
                displayOrder: nextFolderOrder(folders, 'test', parentId),
            });
            setActiveFolder(folder.id);
        }
        setFolderModal(null);
    }

    async function handleDeleteFolder(folder: Folder) {
        const ok = await confirm({
            title: t('folders.delete_title'),
            message: t('folders.delete_warning', { name: folder.name }),
            confirmLabel: t('common.delete'),
            danger: true,
        });
        if (!ok) return;
        deleteFolder(folder.id, 'test');
        if (activeFolder === folder.id) setActiveFolder(ALL_FOLDERS);
    }
    const [assigningTestId, setAssigningTestId] = useState<string | null>(null);
    const [assigningShared, setAssigningShared] = useState<SharedEntry<Test> | null>(null);
    const [importingTestId, setImportingTestId] = useState<string | null>(null);
    const [scanningTestId, setScanningTestId] = useState<string | null>(null);
    const [resultsTestId, setResultsTestId] = useState<string | null>(null);
    const [examExportTestId, setExamExportTestId] = useState<string | null>(null);
    const [showGenerateModal, setShowGenerateModal] = useState(false);
    const [showImportTest, setShowImportTest] = useState(false);

    const resultsTest = resultsTestId ? tests.find((tst) => tst.id === resultsTestId) : undefined;
    const examExportTest = examExportTestId ? tests.find((tst) => tst.id === examExportTestId) : undefined;

    function sharingOf(test: Test): MaterialSharing {
        return resolveSharing(test.sharing, test.folderId, testFolders, settings.materialSharing).sharing;
    }

    function duplicateShared(entry: SharedEntry<Test>) {
        const copy = addTest(
            cloneTestForCopy(entry.item, { name: `${entry.item.name} ${t('tests.copy_suffix')}`, folderId: undefined })
        );
        showToast(t('sharing.duplicated_toast', { name: copy.name }), 'success', {
            action: { label: t('rubricList.open_copy'), onClick: () => navigate(`/tests/${copy.id}`) },
        });
    }

    function renderSharingModal() {
        if (!sharingTarget) return null;
        if (sharingTarget.kind === 'folder') {
            const folder = folders.find((f) => f.id === sharingTarget.id);
            /* v8 ignore next -- provably dead: the modal closes with its folder */
            if (!folder) return null;
            return (
                <SharingModal
                    name={folder.name}
                    isFolder
                    connected={dbStatus.isConnected}
                    value={folder.sharing}
                    inherited={inheritedSharing(folder.parentId, testFolders, settings.materialSharing)}
                    onChange={(sharing) => updateFolder({ ...folder, sharing, updatedAt: new Date().toISOString() })}
                    onClose={() => setSharingTarget(null)}
                />
            );
        }
        const test = tests.find((x) => x.id === sharingTarget.id);
        /* v8 ignore next -- provably dead: the modal closes with its test */
        if (!test) return null;
        return (
            <SharingModal
                name={test.name}
                connected={dbStatus.isConnected}
                value={test.sharing}
                inherited={inheritedSharing(test.folderId, testFolders, settings.materialSharing)}
                onChange={(sharing) => updateTest({ ...test, sharing, updatedAt: new Date().toISOString() })}
                onClose={() => setSharingTarget(null)}
            />
        );
    }

    function handleDuplicate(testId: string) {
        const test = tests.find((tst) => tst.id === testId);
        // v8 ignore next line — the duplicate button only renders for tests in visibleTests
        if (!test) return;
        const newTest = addTest(cloneTestForCopy(test, { name: `${test.name} ${t('tests.copy_suffix')}` }));
        navigate(`/tests/${newTest.id}`);
    }

    function handleNewScoreOnly() {
        const created = addTest({
            name: t('tests.scoreSheet.new_test_name'),
            questions: defaultScoreOnlyQuestions(),
            requireSEB: false,
            shuffleQuestions: false,
            scoreOnly: true,
            gradingNorm: { type: 'nterm', n: 1 },
        });
        navigate(`/tests/${created.id}/scores`);
    }

    // Imported tests land in the folder that is open, the same way a new test does; with one test in
    // the file the teacher expects to land on it, while a batch stays on the list with a count.
    function handleImportTests(imported: ImportedTest[]) {
        const folderId = activeFolder === ALL_FOLDERS ? undefined : activeFolder;
        const created = imported.map((draft) => addTest(folderId ? { ...draft, folderId } : draft));
        if (created.length === 1) navigate(`/tests/${created[0].id}`);
        else showToast(t('importTest.import_success_toast', { count: created.length }), 'success');
    }

    function assignTestToClass(test: Test, classId: string) {
        const cls = classes.find((c) => c.id === classId);
        if (!cls || (cls.testIds ?? []).includes(test.id)) return;
        updateClass(toggleClassTest(cls, test.id, false));
        showToast(t('tests.class_linked_toast', { name: test.name, className: cls.name }), 'success');
    }

    /** Unassigning also revokes the class's student assignment rows, not just the class link. */
    async function unassignTestFromClass(test: Test, classId: string) {
        const cls = classes.find((c) => c.id === classId);
        if (!cls || !(cls.testIds ?? []).includes(test.id)) return;
        const ok = await confirm({
            title: t('tests.class_unlink_title'),
            message: t('tests.class_unlink_message', { name: test.name, className: cls.name }),
            confirmLabel: t('tests.class_unlink_action'),
            danger: true,
        });
        if (!ok) return;
        updateClass(toggleClassTest(cls, test.id, true));
        const studentIds = students.filter((s) => s.classId === cls.id).map((s) => s.id);
        const result = dbStatus.isConnected
            ? await deleteTestAssignments(test.id, studentIds).catch(() => ({ success: false }) as const)
            : ({ success: true } as const);
        if (result.success) {
            showToast(t('tests.class_unlinked_toast', { name: test.name, className: cls.name }), 'success');
        } else {
            showToast(t('tests.class_unlink_partial'), 'error');
        }
    }

    async function toggleTestClass(test: Test, classId: string) {
        if ((classes.find((c) => c.id === classId)?.testIds ?? []).includes(test.id)) {
            await unassignTestFromClass(test, classId);
        } else {
            assignTestToClass(test, classId);
        }
    }

    function requestAssign(test: Test, onReady: () => void = () => setAssigningTestId(test.id)) {
        const { noQuestions, entries } = testAssignBlockers(test);
        if (noQuestions) showToast(t('tests.assign_blocked_empty'), 'error');
        else if (entries.length > 0) showToast(t('tests.assign_blocked', { count: entries.length }), 'error');
        else onReady();
    }

    function handleArchive(test: Test) {
        archiveTest(test.id);
        showToast(t('tests.archived_toast', { name: test.name }), 'info', {
            action: { label: t('common.undo'), onClick: () => restoreTest(test.id) },
        });
    }

    async function handleDelete(testId: string, testName: string) {
        const ok = await confirm({
            title: t('tests.delete_test_title'),
            message: t('tests.delete_test_warning', {
                name: testName,
                count: studentTests.filter((st) => st.testId === testId).length,
            }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteTest(testId);
    }

    return (
        <>
            <PageTour {...tour.tourProps} />
            <Topbar
                classSelector
                title={t('tests.list_title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={tour.start}>
                            {t('tutorial.page_tour_button')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={handleNewScoreOnly}>
                            <Table2 size={15} /> {t('tests.scoreSheet.new_score_only')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowGenerateModal(true)}>
                            <Sparkles size={15} /> {t('generateTest.entry_point')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowImportTest(true)}>
                            <FileJson size={15} /> {t('importTest.import_button')}
                        </button>
                        <button
                            data-tour="tl-new"
                            className="btn btn-primary btn-sm"
                            onClick={() => navigate('/tests/new')}
                        >
                            <Plus size={15} /> {t('tests.new_test')}
                        </button>
                    </>
                }
            />
            {showGenerateModal && <GenerateTestModal onClose={() => setShowGenerateModal(false)} />}
            {showImportTest && (
                <TestImportModal onClose={() => setShowImportTest(false)} onImport={handleImportTests} />
            )}
            <div className="page-content fade-in">
                <div data-tour="tl-filters" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                    <CohortFilter classes={classes} value={cohortFilter} onChange={setCohortFilter} />
                    <div style={{ marginLeft: 'auto' }}>
                        <SegmentedToggle
                            ariaLabel={t('common.view')}
                            value={view}
                            onChange={setView}
                            options={[
                                {
                                    value: 'cards',
                                    label: t('common.view_cards'),
                                    icon: <LayoutGrid size={14} />,
                                },
                                { value: 'list', label: t('common.view_list'), icon: <List size={14} /> },
                            ]}
                        />
                    </div>
                </div>
                <DragDropContext onBeforeCapture={startFolderDrop} onDragEnd={handleDragEnd}>
                    <FolderBar
                        folders={folders}
                        kind="test"
                        activeFolderId={activeFolder}
                        items={tests.filter((test) => !test.archivedAt)}
                        onSelect={setActiveFolder}
                        onCreate={(parentId) => setFolderModal({ parentId })}
                        onRename={(f) => setFolderModal({ folder: f })}
                        onDelete={handleDeleteFolder}
                        onMoveFolder={moveFolder}
                        dropFolderId={dropFolderId}
                        onShare={(f) => setSharingTarget({ kind: 'folder', id: f.id })}
                        isFolderShared={(f) =>
                            isShared(resolveFolderSharing(f, testFolders, settings.materialSharing).sharing)
                        }
                    />
                    {visibleTests.length === 0 ? (
                        <EmptyState
                            icon={ClipboardCheck}
                            title={activeFolder === ALL_FOLDERS ? t('tests.no_tests') : t('folders.empty')}
                            description={
                                activeFolder === ALL_FOLDERS
                                    ? t('tests.create_first_instruction')
                                    : t('folders.empty_hint')
                            }
                            action={{
                                label: t('tests.new_test'),
                                icon: Plus,
                                onClick: () => navigate('/tests/new'),
                            }}
                        />
                    ) : view === 'list' ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>{t('tests.col_name')}</th>
                                        <th>{t('tests.col_questions')}</th>
                                        <th>{t('tests.col_submitted')}</th>
                                        <th>{t('tests.col_avg')}</th>
                                        <th>{t('common.actions')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleTests.map((test) => {
                                        const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
                                        const submittedCount = new Set(relevantStudentTests.map((st) => st.studentId))
                                            .size;
                                        const avgPct =
                                            relevantStudentTests.length > 0
                                                ? Math.round(calcClassAveragePercentage(relevantStudentTests, test))
                                                : null;
                                        return (
                                            <tr
                                                key={test.id}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() =>
                                                    navigate(
                                                        test.scoreOnly
                                                            ? `/tests/${test.id}/scores`
                                                            : `/tests/${test.id}`
                                                    )
                                                }
                                            >
                                                <td style={{ fontWeight: 500 }}>{test.name}</td>
                                                <td>{test.questions.length}</td>
                                                <td>{submittedCount}</td>
                                                <td>{avgPct !== null ? `${avgPct}%` : '—'}</td>
                                                <td onClick={(e) => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('tests.action_edit')}
                                                            aria-label={t('tests.action_edit')}
                                                            onClick={() => navigate(`/tests/${test.id}`)}
                                                        >
                                                            <Edit2 size={14} />
                                                        </button>
                                                        {test.mode !== 'placement' && (
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                title={t('tests.scoreSheet.action_open')}
                                                                aria-label={t('tests.scoreSheet.action_open')}
                                                                onClick={() => navigate(`/tests/${test.id}/scores`)}
                                                            >
                                                                <Table2 size={14} />
                                                            </button>
                                                        )}
                                                        {!test.scoreOnly && (
                                                            <>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_assign')}
                                                                    aria-label={t('tests.action_assign')}
                                                                    disabled={
                                                                        test.questions.length === 0 &&
                                                                        !isGeneratorTest(test)
                                                                    }
                                                                    onClick={() => requestAssign(test)}
                                                                >
                                                                    <Send size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.monitor.action_monitor')}
                                                                    aria-label={t('tests.monitor.action_monitor')}
                                                                    onClick={() =>
                                                                        navigate(`/tests/${test.id}/monitor`)
                                                                    }
                                                                >
                                                                    <Radio size={14} />
                                                                </button>
                                                            </>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('sharing.action_share')}
                                                            aria-label={t('sharing.action_share')}
                                                            onClick={() =>
                                                                setSharingTarget({ kind: 'test', id: test.id })
                                                            }
                                                        >
                                                            <Share2 size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('tests.action_duplicate')}
                                                            aria-label={t('tests.action_duplicate')}
                                                            onClick={() => handleDuplicate(test.id)}
                                                        >
                                                            <Copy size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('tests.archive')}
                                                            aria-label={t('tests.archive')}
                                                            onClick={() => handleArchive(test)}
                                                        >
                                                            <Archive size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('tests.action_delete')}
                                                            aria-label={t('tests.action_delete')}
                                                            style={{ color: 'var(--red-text)' }}
                                                            onClick={() => handleDelete(test.id, test.name)}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <Droppable droppableId="test-list">
                            {(droppableProvided) => (
                                <CardGrid ref={droppableProvided.innerRef} {...droppableProvided.droppableProps}>
                                    {visibleTests.map((test, idx) => {
                                        const totalPoints = test.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                                        const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
                                        const submittedCount = new Set(relevantStudentTests.map((st) => st.studentId))
                                            .size;
                                        const avgPct =
                                            relevantStudentTests.length > 0
                                                ? Math.round(calcClassAveragePercentage(relevantStudentTests, test))
                                                : null;
                                        return (
                                            <Draggable
                                                key={test.id}
                                                draggableId={test.id}
                                                index={idx}
                                                isDragDisabled={!reorderable}
                                            >
                                                {(dragProvided) => (
                                                    <TestCard
                                                        ref={dragProvided.innerRef}
                                                        draggableProps={dragProvided.draggableProps}
                                                        dragHandleProps={dragProvided.dragHandleProps}
                                                        test={test}
                                                        totalPoints={totalPoints}
                                                        submittedCount={submittedCount}
                                                        averagePercentage={avgPct}
                                                        folderPath={
                                                            activeFolder === ALL_FOLDERS
                                                                ? (folderPathLabel(testFolders, test.folderId) ??
                                                                  undefined)
                                                                : undefined
                                                        }
                                                        shared={sharingOf(test)}
                                                        canReorder={reorderable}
                                                        folders={testFolders}
                                                        classes={classes}
                                                        assignedClassIds={assignedClassIdsByTest.get(test.id) ?? []}
                                                        onToggleClass={(classId) => void toggleTestClass(test, classId)}
                                                        resultsOpen={resultsTestId === test.id}
                                                        onOpen={() => navigate(`/tests/${test.id}`)}
                                                        onOpenScores={() => navigate(`/tests/${test.id}/scores`)}
                                                        onOpenResults={() =>
                                                            setResultsTestId(resultsTestId === test.id ? null : test.id)
                                                        }
                                                        onAssign={() => requestAssign(test)}
                                                        onImportSubmission={() => setImportingTestId(test.id)}
                                                        onScan={() => setScanningTestId(test.id)}
                                                        onMonitor={() => navigate(`/tests/${test.id}/monitor`)}
                                                        onExamExport={() => setExamExportTestId(test.id)}
                                                        onShare={() => setSharingTarget({ kind: 'test', id: test.id })}
                                                        onDuplicate={() => handleDuplicate(test.id)}
                                                        onArchive={() => handleArchive(test)}
                                                        onDelete={() => handleDelete(test.id, test.name)}
                                                        onMove={(folderId) => moveTest(test, folderId)}
                                                    />
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

                <SharedMaterialsSection
                    kind="test"
                    onOpen={(id) => navigate(`/tests/${id}`)}
                    onDuplicate={duplicateShared}
                    renderActions={(entry) => (
                        <>
                            {!entry.item.scoreOnly && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title={t('tests.action_assign')}
                                    aria-label={`${t('tests.action_assign')}: ${entry.item.name}`}
                                    onClick={() => requestAssign(entry.item, () => setAssigningShared(entry))}
                                >
                                    <Send size={14} />
                                </button>
                            )}
                            {entry.item.mode !== 'placement' && (
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title={t('tests.scoreSheet.action_open')}
                                    aria-label={`${t('tests.scoreSheet.action_open')}: ${entry.item.name}`}
                                    onClick={() => navigate(`/tests/${entry.item.id}/scores`)}
                                >
                                    <Table2 size={14} />
                                </button>
                            )}
                        </>
                    )}
                    subtitle={(x) => t('tests.question_count', { count: x.questions.length })}
                />
                {renderSharingModal()}

                {resultsTest && (
                    <TestResultsDrawer
                        key={resultsTest.id}
                        test={resultsTest}
                        studentTests={studentTests}
                        students={students}
                        classes={classes}
                        gradeScales={gradeScales}
                        settings={settings}
                        activeStyleTemplate={activeStyleTemplate}
                        lang={lang}
                        saveStudentTest={saveStudentTest}
                        onOpenStudentResult={(studentTestId) =>
                            navigate(`/tests/${resultsTest.id}/results/${studentTestId}`)
                        }
                        onOpenAnalysis={() => navigate(`/tests/${resultsTest.id}/scores?tab=analysis`)}
                        onOpenGradeQueue={() => navigate(`/tests/${resultsTest.id}/grade`)}
                        onClose={() => setResultsTestId(null)}
                    />
                )}

                {examExportTest && (
                    <Modal titleId="test-exam-export-title" onClose={() => setExamExportTestId(null)} maxWidth={720}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '16px 20px',
                                borderBottom: '1px solid var(--border)',
                            }}
                        >
                            <h2 id="test-exam-export-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                                {t('tests.export.exam.section_title')}
                            </h2>
                            <button
                                type="button"
                                className="btn btn-ghost btn-icon btn-sm"
                                aria-label={t('common.close')}
                                onClick={() => setExamExportTestId(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
                            <ExamBookletExportPanel
                                test={examExportTest}
                                students={students}
                                fontFamily={settings.defaultFormat.fontFamily}
                                styleTemplate={activeStyleTemplate}
                            />
                        </div>
                    </Modal>
                )}

                {folderModal && (
                    <FolderNameModal
                        title={
                            folderModal.folder
                                ? t('folders.rename_title')
                                : folderModal.parentId
                                  ? t('folders.new_subfolder')
                                  : t('folders.new_folder')
                        }
                        submitLabel={folderModal.folder ? t('folders.rename') : t('folders.create')}
                        initialName={folderModal.folder?.name}
                        onSubmit={submitFolderName}
                        onClose={() => setFolderModal(null)}
                    />
                )}

                <ConfirmDialog {...confirmDialogProps} />

                {assigningTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === assigningTestId);
                        // v8 ignore next line — assign buttons only render for existing tests
                        if (!test) return null;
                        return (
                            <TestAssignmentModal
                                test={test}
                                onAssignClass={(classId) => assignTestToClass(test, classId)}
                                onUnassignClass={(classId) => {
                                    setAssigningTestId(null);
                                    void unassignTestFromClass(test, classId);
                                }}
                                onClose={() => setAssigningTestId(null)}
                            />
                        );
                    })()}

                {assigningShared && (
                    <TestAssignmentModal
                        test={assigningShared.item}
                        ownerId={assigningShared.ownerId}
                        onAssignClass={(classId) => assignTestToClass(assigningShared.item, classId)}
                        onUnassignClass={(classId) => {
                            const shared = assigningShared.item;
                            setAssigningShared(null);
                            void unassignTestFromClass(shared, classId);
                        }}
                        onClose={() => setAssigningShared(null)}
                    />
                )}

                {importingTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === importingTestId);
                        // v8 ignore next line — import buttons only render for existing tests
                        if (!test) return null;
                        return (
                            <TestSubmissionImportModal
                                test={test}
                                studentTests={studentTests.filter((st) => st.testId === test.id)}
                                onSave={saveStudentTest}
                                onClose={() => setImportingTestId(null)}
                            />
                        );
                    })()}

                {scanningTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === scanningTestId);
                        // v8 ignore next line — scan buttons only render for existing tests
                        if (!test) return null;
                        return (
                            <ExamScanBatchModal
                                test={test}
                                students={students}
                                studentTests={studentTests.filter((st) => st.testId === test.id)}
                                defaultLang={resolveScanOcrSettings(settings.scanOcr).defaultLang}
                                onSave={saveStudentTest}
                                onClose={() => setScanningTestId(null)}
                            />
                        );
                    })()}
            </div>
        </>
    );
}
