import React, { useState } from 'react';
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
} from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { logAuditEvent } from '../services/database/AuditLogger';
import { nanoid } from '../utils/nanoid';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import TestAssignmentModal from '../components/Tests/TestAssignmentModal';
import TestSubmissionImportModal from '../components/Tests/TestSubmissionImportModal';
import ClassAverageAdjuster from '../components/Tests/ClassAverageAdjuster';
import type { Test } from '../types';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';

export default function TestListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { tests, addTest, updateTest, deleteTest, studentTests, saveStudentTest, students } = useApp();
    const sortedTests = sortByDisplayOrder(tests);

    function handleDragEnd(result: DropResult) {
        if (!result.destination) return;
        for (const [test, order] of reorderDisplayOrder(sortedTests, result.source.index, result.destination.index)) {
            if (test.displayOrder !== order) updateTest({ ...test, displayOrder: order });
        }
    }
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const { showToast } = useToast();
    const [assigningTestId, setAssigningTestId] = useState<string | null>(null);
    const [importingTestId, setImportingTestId] = useState<string | null>(null);
    const [resultsTestId, setResultsTestId] = useState<string | null>(null);
    const [exportScope, setExportScope] = useState<'single' | 'batch'>('single');
    const [exportStudentId, setExportStudentId] = useState<string>('');
    const [exporting, setExporting] = useState(false);

    async function handleExportTestSummary(test: Test, format: 'pdf' | 'docx') {
        const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
        if (relevantStudentTests.length === 0) return;
        setExporting(true);
        try {
            if (exportScope === 'single') {
                const student = students.find((s) => s.id === exportStudentId);
                if (!student) return;
                if (format === 'pdf') {
                    const { exportTestSummaryPdf } = await import('../utils/pdfExport');
                    await exportTestSummaryPdf(exportStudentId, studentTests, test, student);
                } else {
                    const { exportTestSummaryDocx } = await import('../utils/docxExport');
                    await exportTestSummaryDocx(exportStudentId, studentTests, test, student);
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: 1 });
            } else {
                const entries = relevantStudentTests
                    .map((st) => ({ studentId: st.studentId, student: students.find((s) => s.id === st.studentId) }))
                    .filter((e): e is { studentId: string; student: (typeof students)[number] } => !!e.student);
                if (format === 'pdf') {
                    const { exportBatchTestSummaryPdf } = await import('../utils/pdfExport');
                    await exportBatchTestSummaryPdf(entries, studentTests, test);
                } else {
                    const { exportBatchTestSummaryDocx } = await import('../utils/docxExport');
                    await exportBatchTestSummaryDocx(entries, studentTests, test);
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: entries.length });
            }
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    function handleDuplicate(testId: string) {
        const test = tests.find((tst) => tst.id === testId);
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

    async function handleDelete(testId: string, testName: string) {
        const ok = await confirm({
            title: t('tests.delete_test_title'),
            message: t('tests.delete_test_warning', { name: testName }),
            confirmLabel: t('common.delete'),
        });
        if (ok) deleteTest(testId);
    }

    return (
        <>
            <Topbar
                title={t('tests.list_title')}
                actions={
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/tests/new')}>
                        <Plus size={15} /> {t('tests.new_test')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                {tests.length === 0 ? (
                    <div className="empty-state">
                        <ClipboardCheck size={40} />
                        <h3>{t('tests.no_tests')}</h3>
                        <p className="text-muted text-sm">{t('tests.create_first_instruction')}</p>
                        <button className="btn btn-primary" onClick={() => navigate('/tests/new')}>
                            <Plus size={16} /> {t('tests.new_test')}
                        </button>
                    </div>
                ) : (
                    <DragDropContext onDragEnd={handleDragEnd}>
                        <Droppable droppableId="test-list">
                            {(droppableProvided) => (
                                <div
                                    ref={droppableProvided.innerRef}
                                    {...droppableProvided.droppableProps}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                        gap: 16,
                                    }}
                                >
                                    {sortedTests.map((test, idx) => {
                                        const totalPoints = test.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                                        return (
                                            <Draggable key={test.id} draggableId={test.id} index={idx}>
                                                {(dragProvided) => (
                                                    <div
                                                        ref={dragProvided.innerRef}
                                                        {...dragProvided.draggableProps}
                                                        className="card"
                                                        style={{
                                                            cursor: 'pointer',
                                                            transition: 'border-color var(--transition)',
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
                                                                <div>
                                                                    <h3>{test.name}</h3>
                                                                    <div
                                                                        className="text-muted text-xs"
                                                                        style={{ marginTop: 2 }}
                                                                    >
                                                                        {new Date(test.createdAt).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 4 }}>
                                                                <button
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
                                                                {t('tests.total_points', { points: totalPoints })}
                                                            </span>
                                                            {test.requireSEB && (
                                                                <span className="badge badge-green">
                                                                    {t('tests.seb_badge')}
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
                                                                className="btn btn-primary btn-sm"
                                                                onClick={() => navigate(`/tests/${test.id}`)}
                                                            >
                                                                <Edit2 size={14} /> {t('tests.action_edit')}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                disabled={test.questions.length === 0}
                                                                onClick={() => setAssigningTestId(test.id)}
                                                            >
                                                                <Send size={14} /> {t('tests.action_assign')}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                disabled={
                                                                    studentTests.filter((st) => st.testId === test.id)
                                                                        .length === 0
                                                                }
                                                                onClick={() =>
                                                                    setResultsTestId(
                                                                        resultsTestId === test.id ? null : test.id
                                                                    )
                                                                }
                                                            >
                                                                <BarChart3 size={14} />{' '}
                                                                {t('tests.results.action_results')}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => setImportingTestId(test.id)}
                                                            >
                                                                <Upload size={14} /> {t('tests.results.action_import')}
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                onClick={() => navigate(`/tests/${test.id}/monitor`)}
                                                            >
                                                                <Radio size={14} /> {t('tests.monitor.action_monitor')}
                                                            </button>
                                                        </div>

                                                        {resultsTestId === test.id && (
                                                            <div
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
                                                                                </button>
                                                                            );
                                                                        })}
                                                                </div>
                                                                <ClassAverageAdjuster
                                                                    test={test}
                                                                    studentTests={studentTests.filter(
                                                                        (st) => st.testId === test.id
                                                                    )}
                                                                    students={students}
                                                                    onSaveStudentTest={saveStudentTest}
                                                                />

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
                    </DragDropContext>
                )}

                <ConfirmDialog {...confirmDialogProps} />

                {assigningTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === assigningTestId);
                        if (!test) return null;
                        return <TestAssignmentModal test={test} onClose={() => setAssigningTestId(null)} />;
                    })()}

                {importingTestId &&
                    (() => {
                        const test = tests.find((tst) => tst.id === importingTestId);
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
            </div>
        </>
    );
}
