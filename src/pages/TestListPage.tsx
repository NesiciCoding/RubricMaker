import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Edit2, Trash2, Copy, ClipboardCheck, Send, BarChart3, Upload, Radio } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { nanoid } from '../utils/nanoid';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import TestAssignmentModal from '../components/Tests/TestAssignmentModal';
import TestSubmissionImportModal from '../components/Tests/TestSubmissionImportModal';
import ClassAverageAdjuster from '../components/Tests/ClassAverageAdjuster';

export default function TestListPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { tests, addTest, deleteTest, studentTests, saveStudentTest, students } = useApp();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const [assigningTestId, setAssigningTestId] = useState<string | null>(null);
    const [importingTestId, setImportingTestId] = useState<string | null>(null);
    const [resultsTestId, setResultsTestId] = useState<string | null>(null);

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
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: 16,
                        }}
                    >
                        {tests.map((test) => {
                            const totalPoints = test.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                            return (
                                <div
                                    key={test.id}
                                    className="card"
                                    style={{ cursor: 'pointer', transition: 'border-color var(--transition)' }}
                                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            marginBottom: 12,
                                        }}
                                    >
                                        <div>
                                            <h3>{test.name}</h3>
                                            <div className="text-muted text-xs" style={{ marginTop: 2 }}>
                                                {new Date(test.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('tests.action_duplicate')}
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

                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span className="badge badge-blue">
                                            {t('tests.question_count', { count: test.questions.length })}
                                        </span>
                                        <span className="badge badge-purple">
                                            {t('tests.total_points', { points: totalPoints })}
                                        </span>
                                        {test.requireSEB && (
                                            <span className="badge badge-green">{t('tests.seb_badge')}</span>
                                        )}
                                    </div>

                                    {test.description && (
                                        <p className="text-muted text-sm truncate" style={{ marginBottom: 14 }}>
                                            {test.description}
                                        </p>
                                    )}

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                                            disabled={studentTests.filter((st) => st.testId === test.id).length === 0}
                                            onClick={() => setResultsTestId(resultsTestId === test.id ? null : test.id)}
                                        >
                                            <BarChart3 size={14} /> {t('tests.results.action_results')}
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
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                {studentTests
                                                    .filter((st) => st.testId === test.id)
                                                    .map((st) => {
                                                        const stStudent = students.find((s) => s.id === st.studentId);
                                                        return (
                                                            <button
                                                                key={st.id}
                                                                className="btn btn-ghost btn-sm"
                                                                style={{ justifyContent: 'flex-start' }}
                                                                onClick={() => navigate(`/tests/${test.id}/results/${st.id}`)}
                                                            >
                                                                {stStudent?.name ?? st.studentId}
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                            <ClassAverageAdjuster
                                                test={test}
                                                studentTests={studentTests.filter((st) => st.testId === test.id)}
                                                students={students}
                                                onSaveStudentTest={saveStudentTest}
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
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
