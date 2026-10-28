import React, { useState } from 'react';
import PageTour from '../components/Tour/PageTour';
import { usePageTourState } from '../hooks/usePageTourState';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Edit2,
    Trash2,
    Copy,
    ClipboardCheck,
    Send,
    BarChart3,
    Upload,
    Radio,
    FileDown,
    GripVertical,
    Sparkles,
    LayoutGrid,
    List,
    ScanLine,
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { useToast } from '../hooks/useToast';
import { logAuditEvent } from '../services/database/AuditLogger';
import { nanoid } from '../utils/nanoid';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import TestAssignmentModal from '../components/Tests/TestAssignmentModal';
import FolderTile, { FOLDER_DROP_PREFIX } from '../components/Folders/FolderTile';
import FolderNameModal from '../components/Folders/FolderNameModal';
import TestSubmissionImportModal from '../components/Tests/TestSubmissionImportModal';
import ExamScanCaptureModal from '../components/Tests/ExamScanCaptureModal';
import ClassAverageAdjuster from '../components/Tests/ClassAverageAdjuster';
import ItemAnalysisPanel from '../components/Tests/ItemAnalysisPanel';
import PlacementAnalysisPanel from '../components/Tests/PlacementAnalysisPanel';
import GenerateTestModal from '../components/Tests/GenerateTestModal';
import ExamBookletExportPanel from '../components/Tests/ExamBookletExportPanel';
import type { Folder, Test, StudentTest, CohortFilter as CohortFilterValue } from '../types';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';
import { ALL_FOLDERS, countInFolder, filterByFolder, foldersForKind, nextFolderOrder } from '../utils/folders';
import { getCohortStudentIds, isAllCohorts, ALL_COHORTS } from '../utils/cohortAggregator';
import { isGeneratorTest } from '../utils/placementGenerator';
import CohortFilter from '../components/CohortFilter';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import { calcClassAveragePercentage } from '../utils/testCalc';
import { GRADEBOOK_PRESET_IDS, type DecimalSeparator, type GradebookPresetId } from '../utils/gradebookExportPresets';
import { testAssignBlockers } from '../utils/testQuestionIssues';

export default function TestListPage() {
    const { t } = useTranslation();
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
    const { addTest, updateTest, deleteTest, saveStudentTest, addFolder, updateFolder, deleteFolder } =
        useStoreActions();

    const activeStyleTemplate = exportTemplates.find((t) => t.kind === 'style' && t.id === settings.styleTemplateId);
    const [cohortFilter, setCohortFilter] = useState<CohortFilterValue>(ALL_COHORTS);
    const [view, setView] = useState<'cards' | 'list'>('cards');
    const [activeFolder, setActiveFolder] = useState<string>(ALL_FOLDERS);
    const [folderModal, setFolderModal] = useState<{ folder?: Folder } | null>(null);
    const allCohorts = isAllCohorts(cohortFilter);
    const cohortStudentIds = React.useMemo(
        () => getCohortStudentIds(students, classes, cohortFilter),
        [students, classes, cohortFilter]
    );
    const testFolders = foldersForKind(folders, 'test');
    const visibleTests = React.useMemo(() => {
        const sorted = filterByFolder(sortByDisplayOrder(tests), activeFolder);
        if (allCohorts) return sorted;
        const cohortTestIds = new Set(
            studentTests.filter((st) => cohortStudentIds.has(st.studentId)).map((st) => st.testId)
        );
        return sorted.filter((test) => cohortTestIds.has(test.id));
    }, [tests, studentTests, cohortStudentIds, allCohorts, activeFolder]);
    const reorderable = allCohorts && activeFolder === ALL_FOLDERS;

    function handleDragEnd(result: DropResult) {
        const destination = result.destination;
        if (!destination) return;
        if (destination.droppableId.startsWith(FOLDER_DROP_PREFIX)) {
            const folderId = destination.droppableId.slice(FOLDER_DROP_PREFIX.length);
            const test = visibleTests[result.source.index];
            if (!test || test.folderId === folderId) return;
            updateTest({ ...test, folderId });
            const folder = testFolders.find((f) => f.id === folderId);
            if (folder) showToast(t('folders.moved_toast', { name: folder.name }), 'success');
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

    function submitFolderName(name: string) {
        const editing = folderModal?.folder;
        if (editing) {
            updateFolder({ ...editing, name });
        } else {
            const folder = addFolder({ name, kind: 'test', displayOrder: nextFolderOrder(folders, 'test') });
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
    const [importingTestId, setImportingTestId] = useState<string | null>(null);
    const [scanningTestId, setScanningTestId] = useState<string | null>(null);
    const [resultsTestId, setResultsTestId] = useState<string | null>(null);
    const [examExportTestId, setExamExportTestId] = useState<string | null>(null);
    const [exportScope, setExportScope] = useState<'single' | 'batch'>('single');
    const [exportStudentId, setExportStudentId] = useState<string>('');
    const [gradebookPreset, setGradebookPreset] = useState<GradebookPresetId>('generic');
    const [gradebookDecimal, setGradebookDecimal] = useState<DecimalSeparator>('comma');
    const [exporting, setExporting] = useState(false);
    const [showGenerateModal, setShowGenerateModal] = useState(false);

    async function handleExportTestSummaryText(test: Test, relevantStudentTests: StudentTest[]) {
        const { buildTestStudentSummary, pickLatestAttempt } = await import('../utils/testAnswerText');
        const { effectiveTestQuestions } = await import('../utils/testSummaryAggregator');
        const { saveAs } = await import('file-saver');
        const { sanitizeFilename } = await import('../utils/exportDataPrep');

        // Scope the question set to the exported attempt so adaptive questions from other attempts
        // don't appear as blank rows.
        const summaryFor = (studentTest: StudentTest) =>
            buildTestStudentSummary(
                test,
                studentTest,
                students.find((s) => s.id === studentTest.studentId),
                effectiveTestQuestions(studentTest.studentId, [studentTest], test),
                settings.cefrAchieveThreshold
            );

        if (exportScope === 'single') {
            const studentTest = pickLatestAttempt(
                relevantStudentTests.filter((st) => st.studentId === exportStudentId)
            );
            if (!studentTest) return;
            const student = students.find((s) => s.id === exportStudentId);
            saveAs(
                new Blob([summaryFor(studentTest)], { type: 'text/plain;charset=utf-8' }),
                `${sanitizeFilename(test.name)}_${sanitizeFilename(student?.name ?? 'student')}_summary.txt`
            );
            logAuditEvent('export', 'export_test_summary_text', 'test', test.id, { count: 1 });
            return;
        }
        const attemptsByStudent = new Map<string, StudentTest[]>();
        for (const st of relevantStudentTests) {
            const arr = attemptsByStudent.get(st.studentId);
            if (arr) arr.push(st);
            else attemptsByStudent.set(st.studentId, [st]);
        }
        const latestByStudent = new Map<string, StudentTest>();
        for (const [studentId, attempts] of attemptsByStudent) {
            const latest = pickLatestAttempt(attempts);
            if (latest) latestByStudent.set(studentId, latest);
        }
        const text = [...latestByStudent.values()].map(summaryFor).join('\n\n' + '═'.repeat(40) + '\n\n');
        saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${sanitizeFilename(test.name)}_summaries.txt`);
        logAuditEvent('export', 'export_test_summary_text', 'test', test.id, { count: latestByStudent.size });
    }

    async function handleExportTestSummary(test: Test, format: 'pdf' | 'docx' | 'text') {
        const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
        // v8 ignore next: the results panel (and its export buttons) only render with submissions
        if (relevantStudentTests.length === 0) return;
        setExporting(true);
        try {
            if (format === 'text') {
                await handleExportTestSummaryText(test, relevantStudentTests);
                return;
            }
            if (exportScope === 'single') {
                const student = students.find((s) => s.id === exportStudentId);
                if (!student) return;
                if (format === 'pdf') {
                    const { exportTestSummaryPdf } = await import('../utils/pdfExport');
                    await exportTestSummaryPdf(
                        exportStudentId,
                        studentTests,
                        test,
                        student,
                        activeStyleTemplate,
                        settings.cefrAchieveThreshold
                    );
                } else {
                    const { exportTestSummaryDocx } = await import('../utils/docxExport');
                    await exportTestSummaryDocx(
                        exportStudentId,
                        studentTests,
                        test,
                        student,
                        settings.cefrAchieveThreshold
                    );
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: 1 });
            } else {
                const entries = relevantStudentTests
                    .map((st) => ({ studentId: st.studentId, student: students.find((s) => s.id === st.studentId) }))
                    .filter((e): e is { studentId: string; student: (typeof students)[number] } => !!e.student);
                if (format === 'pdf') {
                    const { exportBatchTestSummaryPdf } = await import('../utils/pdfExport');
                    await exportBatchTestSummaryPdf(
                        entries,
                        studentTests,
                        test,
                        activeStyleTemplate,
                        settings.cefrAchieveThreshold
                    );
                } else {
                    const { exportBatchTestSummaryDocx } = await import('../utils/docxExport');
                    await exportBatchTestSummaryDocx(entries, studentTests, test, settings.cefrAchieveThreshold);
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: entries.length });
            }
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleExportTestResultsCsv(test: Test) {
        const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
        // v8 ignore next: the results panel (and its export buttons) only render with submissions
        if (relevantStudentTests.length === 0) return;
        setExporting(true);
        try {
            const { buildTestResultsCsv, buildTestGradebookRows } = await import('../utils/testExportPresets');
            const { buildGradebookPresetCsv } = await import('../utils/gradebookExportPresets');
            const { downloadCsv } = await import('../utils/csvDownload');
            const { sanitizeFilename } = await import('../utils/exportDataPrep');
            // Same scale resolution as TestResultsPage, so the CSV grade matches the one shown there.
            const scaleId = test.gradeScaleId ?? settings.defaultGradeScaleId;
            const scale =
                scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0] ?? null);
            const preset = buildGradebookPresetCsv(
                gradebookPreset,
                buildTestGradebookRows(test, studentTests, students, scale),
                gradebookDecimal
            );
            if (preset) {
                downloadCsv(preset.csv, `${sanitizeFilename(test.name)}_${gradebookPreset}_results.csv`);
                if (preset.missingNumberCount > 0)
                    showToast(
                        t('exportPage.csv_missing_student_numbers', { count: preset.missingNumberCount }),
                        'warning'
                    );
                if (preset.blankGradeCount > 0)
                    showToast(t('exportPage.csv_grades_blank', { count: preset.blankGradeCount }), 'warning');
                if (preset.inProgressCount > 0)
                    showToast(t('exportPage.csv_grades_in_progress', { count: preset.inProgressCount }), 'warning');
            } else {
                const csv = buildTestResultsCsv(test, studentTests, students, settings.cefrAchieveThreshold, scale);
                downloadCsv(csv, `${sanitizeFilename(test.name)}_results.csv`);
            }
            const uniqueStudentCount = new Set(relevantStudentTests.map((st) => st.studentId)).size;
            logAuditEvent('export', 'export_test_summary_csv', 'test', test.id, {
                count: uniqueStudentCount,
            });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    function handleDuplicate(testId: string) {
        const test = tests.find((tst) => tst.id === testId);
        // v8 ignore next line — the duplicate button only renders for tests in visibleTests
        if (!test) return;
        const newTest = addTest({
            ...test,
            name: `${test.name} ${t('tests.copy_suffix')}`,
            questions: test.questions.map((q) => ({
                ...q,
                id: nanoid(),
                options: q.options?.map((o) => ({ ...o, id: nanoid() })),
            })),
        });
        navigate(`/tests/${newTest.id}`);
    }

    function requestAssign(test: Test) {
        const { noQuestions, entries } = testAssignBlockers(test);
        if (noQuestions) showToast(t('tests.assign_blocked_empty'), 'error');
        else if (entries.length > 0) showToast(t('tests.assign_blocked', { count: entries.length }), 'error');
        else setAssigningTestId(test.id);
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
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowGenerateModal(true)}>
                            <Sparkles size={15} /> {t('generateTest.entry_point')}
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
                <DragDropContext onDragEnd={handleDragEnd}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
                        <button
                            type="button"
                            className={`btn btn-sm ${activeFolder === ALL_FOLDERS ? 'btn-primary' : 'btn-secondary'}`}
                            aria-pressed={activeFolder === ALL_FOLDERS}
                            onClick={() => setActiveFolder(ALL_FOLDERS)}
                        >
                            <LayoutGrid size={14} /> {t('folders.all')}
                        </button>
                        {testFolders.map((folder) => (
                            <FolderTile
                                key={folder.id}
                                folder={folder}
                                count={countInFolder(tests, folder.id)}
                                active={activeFolder === folder.id}
                                onOpen={(id) => setActiveFolder((current) => (current === id ? ALL_FOLDERS : id))}
                                onRename={(f) => setFolderModal({ folder: f })}
                                onDelete={handleDeleteFolder}
                            />
                        ))}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFolderModal({})}>
                            <Plus size={14} /> {t('folders.new_folder')}
                        </button>
                    </div>
                    {visibleTests.length === 0 ? (
                        <div className="empty-state">
                            <ClipboardCheck size={40} />
                            <h3>{activeFolder === ALL_FOLDERS ? t('tests.no_tests') : t('folders.empty')}</h3>
                            <p className="text-muted text-sm">
                                {activeFolder === ALL_FOLDERS
                                    ? t('tests.create_first_instruction')
                                    : t('folders.empty_hint')}
                            </p>
                            <button className="btn btn-primary" onClick={() => navigate('/tests/new')}>
                                <Plus size={16} /> {t('tests.new_test')}
                            </button>
                        </div>
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
                                                onClick={() => navigate(`/tests/${test.id}`)}
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
                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            title={t('tests.action_assign')}
                                                            aria-label={t('tests.action_assign')}
                                                            disabled={
                                                                test.questions.length === 0 && !isGeneratorTest(test)
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
                                                            onClick={() => navigate(`/tests/${test.id}/monitor`)}
                                                        >
                                                            <Radio size={14} />
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
                                                            title={t('tests.action_delete')}
                                                            aria-label={t('tests.action_delete')}
                                                            style={{ color: 'var(--red)' }}
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
                                    {visibleTests.map((test, idx) => {
                                        const totalPoints = test.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                                        const isOverdue = !!test.dueDate && new Date(test.dueDate) < new Date();
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
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                        className="card"
                                                        style={{
                                                            cursor: 'pointer',
                                                            transition: 'border-color var(--transition)',
                                                            flex: '0 1 400px',
                                                            ...dragProvided.draggableProps.style,
                                                        }}
                                                        onMouseEnter={(e) =>
                                                            (e.currentTarget.style.borderColor = 'var(--accent)')
                                                        }
                                                        onMouseLeave={(e) =>
                                                            (e.currentTarget.style.borderColor = 'var(--border)')
                                                        }
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
                                                                    <h3>{test.name}</h3>
                                                                    <div
                                                                        className="text-muted text-xs"
                                                                        style={{ marginTop: 2 }}
                                                                    >
                                                                        {new Date(test.createdAt).toLocaleDateString()}
                                                                        {test.dueDate && (
                                                                            <span
                                                                                style={{
                                                                                    marginLeft: 8,
                                                                                    color: isOverdue
                                                                                        ? 'var(--red)'
                                                                                        : undefined,
                                                                                    fontWeight: isOverdue
                                                                                        ? 700
                                                                                        : undefined,
                                                                                }}
                                                                            >
                                                                                {t('tests.due_date_badge', {
                                                                                    date: new Date(
                                                                                        test.dueDate
                                                                                    ).toLocaleDateString(),
                                                                                })}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_duplicate')}
                                                                    aria-label={t('tests.action_duplicate')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDuplicate(test.id);
                                                                    }}
                                                                >
                                                                    <Copy size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_edit')}
                                                                    aria-label={t('tests.action_edit')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/tests/${test.id}`);
                                                                    }}
                                                                >
                                                                    <Edit2 size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.action_delete')}
                                                                    aria-label={t('tests.action_delete')}
                                                                    style={{ color: 'var(--red)' }}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleDelete(test.id, test.name);
                                                                    }}
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
                                                            <span className="badge badge-blue">
                                                                {t('tests.question_count', {
                                                                    count: test.questions.length,
                                                                })}
                                                            </span>
                                                            <span className="badge badge-purple">
                                                                {t('tests.points_total', { count: totalPoints })}
                                                            </span>
                                                            {test.requireSEB && (
                                                                <span className="badge badge-green">
                                                                    {t('tests.seb_badge')}
                                                                </span>
                                                            )}
                                                            {submittedCount > 0 && (
                                                                <span className="badge badge-blue">
                                                                    {t('tests.list_submitted', {
                                                                        count: submittedCount,
                                                                    })}
                                                                </span>
                                                            )}
                                                            {avgPct !== null && (
                                                                <span className="badge badge-yellow">
                                                                    {t('tests.list_avg', { pct: avgPct })}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {test.description && (
                                                            <p
                                                                className="text-muted text-sm truncate"
                                                                style={{ marginBottom: 14 }}
                                                            >
                                                                {test.description}
                                                            </p>
                                                        )}

                                                        <div
                                                            style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                                                        >
                                                            <button
                                                                type="button"
                                                                className="btn btn-primary btn-sm"
                                                                onClick={() => navigate(`/tests/${test.id}`)}
                                                            >
                                                                <Edit2 size={14} /> {t('tests.action_edit')}
                                                            </button>
                                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
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
                                                                    title={t('tests.results.action_results')}
                                                                    aria-label={t('tests.results.action_results')}
                                                                    aria-expanded={resultsTestId === test.id}
                                                                    aria-controls={`test-results-${test.id}`}
                                                                    disabled={
                                                                        studentTests.filter(
                                                                            (st) => st.testId === test.id
                                                                        ).length === 0
                                                                    }
                                                                    style={{
                                                                        color:
                                                                            resultsTestId === test.id
                                                                                ? 'var(--accent)'
                                                                                : undefined,
                                                                    }}
                                                                    onClick={() =>
                                                                        setResultsTestId(
                                                                            resultsTestId === test.id ? null : test.id
                                                                        )
                                                                    }
                                                                >
                                                                    <BarChart3 size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.results.action_import')}
                                                                    aria-label={t('tests.results.action_import')}
                                                                    onClick={() => setImportingTestId(test.id)}
                                                                >
                                                                    <Upload size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.scan.action_scan')}
                                                                    aria-label={t('tests.scan.action_scan')}
                                                                    onClick={() => setScanningTestId(test.id)}
                                                                >
                                                                    <ScanLine size={14} />
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
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tests.export.exam.section_title')}
                                                                    aria-label={t('tests.export.exam.section_title')}
                                                                    aria-expanded={examExportTestId === test.id}
                                                                    aria-controls={`test-exam-export-${test.id}`}
                                                                    style={{
                                                                        color:
                                                                            examExportTestId === test.id
                                                                                ? 'var(--accent)'
                                                                                : undefined,
                                                                    }}
                                                                    onClick={() =>
                                                                        setExamExportTestId(
                                                                            examExportTestId === test.id
                                                                                ? null
                                                                                : test.id
                                                                        )
                                                                    }
                                                                >
                                                                    <FileDown size={14} />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {examExportTestId === test.id && (
                                                            <div
                                                                id={`test-exam-export-${test.id}`}
                                                                style={{
                                                                    marginTop: 14,
                                                                    paddingTop: 14,
                                                                    borderTop: '1px solid var(--border)',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 8,
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                                    {t('tests.export.exam.section_title')}
                                                                </div>
                                                                <ExamBookletExportPanel
                                                                    test={test}
                                                                    students={students}
                                                                    fontFamily={settings.defaultFormat.fontFamily}
                                                                    styleTemplate={activeStyleTemplate}
                                                                />
                                                            </div>
                                                        )}

                                                        {resultsTestId === test.id && (
                                                            <div
                                                                id={`test-results-${test.id}`}
                                                                style={{
                                                                    marginTop: 14,
                                                                    paddingTop: 14,
                                                                    borderTop: '1px solid var(--border)',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 10,
                                                                }}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 6,
                                                                    }}
                                                                >
                                                                    {studentTests
                                                                        .filter((st) => st.testId === test.id)
                                                                        .map((st) => {
                                                                            const stStudent = students.find(
                                                                                (s) => s.id === st.studentId
                                                                            );
                                                                            return (
                                                                                <button
                                                                                    key={st.id}
                                                                                    type="button"
                                                                                    className="btn btn-ghost btn-sm"
                                                                                    style={{
                                                                                        justifyContent: 'flex-start',
                                                                                    }}
                                                                                    onClick={() =>
                                                                                        navigate(
                                                                                            `/tests/${test.id}/results/${st.id}`
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {stStudent?.name ?? st.studentId}
                                                                                    {st.attemptNumber &&
                                                                                        st.attemptNumber > 1 && (
                                                                                            <span
                                                                                                style={{
                                                                                                    marginLeft: 6,
                                                                                                    fontSize: '0.75rem',
                                                                                                    color: 'var(--text-muted)',
                                                                                                }}
                                                                                            >
                                                                                                {t(
                                                                                                    'tests.results.attempt_label',
                                                                                                    {
                                                                                                        n: st.attemptNumber,
                                                                                                    }
                                                                                                )}
                                                                                            </span>
                                                                                        )}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                </div>
                                                                {test.mode === 'placement' ? (
                                                                    <PlacementAnalysisPanel
                                                                        test={test}
                                                                        studentTests={studentTests.filter(
                                                                            (st) => st.testId === test.id
                                                                        )}
                                                                        students={students}
                                                                    />
                                                                ) : (
                                                                    <>
                                                                        <ClassAverageAdjuster
                                                                            test={test}
                                                                            studentTests={studentTests.filter(
                                                                                (st) => st.testId === test.id
                                                                            )}
                                                                            students={students}
                                                                            onSaveStudentTest={saveStudentTest}
                                                                        />
                                                                        <ItemAnalysisPanel
                                                                            test={test}
                                                                            studentTests={studentTests.filter(
                                                                                (st) => st.testId === test.id
                                                                            )}
                                                                        />
                                                                    </>
                                                                )}

                                                                <div
                                                                    style={{
                                                                        marginTop: 6,
                                                                        paddingTop: 14,
                                                                        borderTop: '1px solid var(--border)',
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 8,
                                                                    }}
                                                                >
                                                                    <div
                                                                        style={{ fontWeight: 600, fontSize: '0.85rem' }}
                                                                    >
                                                                        {t('tests.export.section_title')}
                                                                    </div>
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            gap: 8,
                                                                            flexWrap: 'wrap',
                                                                        }}
                                                                    >
                                                                        <select
                                                                            value={exportScope}
                                                                            onChange={(e) =>
                                                                                setExportScope(
                                                                                    e.target.value as 'single' | 'batch'
                                                                                )
                                                                            }
                                                                            style={{ width: 'auto' }}
                                                                        >
                                                                            <option value="single">
                                                                                {t('tests.export.scope_single')}
                                                                            </option>
                                                                            <option value="batch">
                                                                                {t('tests.export.scope_batch')}
                                                                            </option>
                                                                        </select>
                                                                        {exportScope === 'single' && (
                                                                            <select
                                                                                value={exportStudentId}
                                                                                onChange={(e) =>
                                                                                    setExportStudentId(e.target.value)
                                                                                }
                                                                                style={{ width: 'auto' }}
                                                                            >
                                                                                <option value="">
                                                                                    {t(
                                                                                        'tests.export.select_student_placeholder'
                                                                                    )}
                                                                                </option>
                                                                                {studentTests
                                                                                    .filter(
                                                                                        (st) => st.testId === test.id
                                                                                    )
                                                                                    .map((st) => {
                                                                                        const stStudent = students.find(
                                                                                            (s) => s.id === st.studentId
                                                                                        );
                                                                                        return (
                                                                                            <option
                                                                                                key={st.id}
                                                                                                value={st.studentId}
                                                                                            >
                                                                                                {stStudent?.name ??
                                                                                                    st.studentId}
                                                                                            </option>
                                                                                        );
                                                                                    })}
                                                                            </select>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-secondary btn-sm"
                                                                            disabled={
                                                                                exporting ||
                                                                                (exportScope === 'single' &&
                                                                                    !exportStudentId)
                                                                            }
                                                                            onClick={() =>
                                                                                handleExportTestSummary(test, 'pdf')
                                                                            }
                                                                        >
                                                                            <FileDown size={14} />{' '}
                                                                            {t('tests.export.export_pdf')}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-secondary btn-sm"
                                                                            disabled={
                                                                                exporting ||
                                                                                (exportScope === 'single' &&
                                                                                    !exportStudentId)
                                                                            }
                                                                            onClick={() =>
                                                                                handleExportTestSummary(test, 'docx')
                                                                            }
                                                                        >
                                                                            <FileDown size={14} />{' '}
                                                                            {t('tests.export.export_docx')}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="btn btn-secondary btn-sm"
                                                                            disabled={
                                                                                exporting ||
                                                                                (exportScope === 'single' &&
                                                                                    !exportStudentId)
                                                                            }
                                                                            onClick={() =>
                                                                                handleExportTestSummary(test, 'text')
                                                                            }
                                                                        >
                                                                            <FileDown size={14} />{' '}
                                                                            {t('tests.export.export_text')}
                                                                        </button>
                                                                        {exportScope === 'batch' && (
                                                                            <>
                                                                                <select
                                                                                    aria-label={t(
                                                                                        'exportPage.csv_preset_label'
                                                                                    )}
                                                                                    className="form-control"
                                                                                    style={{
                                                                                        fontSize: '0.8rem',
                                                                                        padding: '4px 6px',
                                                                                        width: 'auto',
                                                                                    }}
                                                                                    value={gradebookPreset}
                                                                                    onChange={(e) =>
                                                                                        setGradebookPreset(
                                                                                            e.target
                                                                                                .value as GradebookPresetId
                                                                                        )
                                                                                    }
                                                                                >
                                                                                    {GRADEBOOK_PRESET_IDS.map((id) => (
                                                                                        <option key={id} value={id}>
                                                                                            {t(
                                                                                                `exportPage.csv_preset_${id}`
                                                                                            )}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                                {gradebookPreset !== 'generic' && (
                                                                                    <select
                                                                                        aria-label={t(
                                                                                            'exportPage.csv_decimal_label'
                                                                                        )}
                                                                                        className="form-control"
                                                                                        style={{
                                                                                            fontSize: '0.8rem',
                                                                                            padding: '4px 6px',
                                                                                            width: 'auto',
                                                                                        }}
                                                                                        value={gradebookDecimal}
                                                                                        onChange={(e) =>
                                                                                            setGradebookDecimal(
                                                                                                e.target
                                                                                                    .value as DecimalSeparator
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <option value="comma">
                                                                                            {t(
                                                                                                'exportPage.csv_decimal_comma'
                                                                                            )}
                                                                                        </option>
                                                                                        <option value="dot">
                                                                                            {t(
                                                                                                'exportPage.csv_decimal_dot'
                                                                                            )}
                                                                                        </option>
                                                                                    </select>
                                                                                )}
                                                                                <button
                                                                                    type="button"
                                                                                    className="btn btn-secondary btn-sm"
                                                                                    disabled={exporting}
                                                                                    onClick={() =>
                                                                                        handleExportTestResultsCsv(test)
                                                                                    }
                                                                                >
                                                                                    <FileDown size={14} />{' '}
                                                                                    {t('tests.export.export_csv')}
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </Draggable>
                                        );
                                    })}
                                    {droppableProvided.placeholder}
                                </div>
                            )}
                        </Droppable>
                    )}
                </DragDropContext>

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

                {assigningTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === assigningTestId);
                        // v8 ignore next line — assign buttons only render for existing tests
                        if (!test) return null;
                        return <TestAssignmentModal test={test} onClose={() => setAssigningTestId(null)} />;
                    })()}

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
                            <ExamScanCaptureModal
                                test={test}
                                students={students}
                                studentTests={studentTests.filter((st) => st.testId === test.id)}
                                onSave={saveStudentTest}
                                onClose={() => setScanningTestId(null)}
                            />
                        );
                    })()}
            </div>
        </>
    );
}
