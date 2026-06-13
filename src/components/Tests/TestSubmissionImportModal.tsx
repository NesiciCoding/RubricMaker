import React, { useState } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import { decodeTestSubmission } from '../../utils/testSubmissionCode';
import { calcStudentTestRawPoints } from '../../utils/testCalc';
import { nanoid } from '../../utils/nanoid';
import type { StudentTest, Test } from '../../types';

interface Props {
    test: Test;
    studentTests: StudentTest[];
    onSave: (st: StudentTest) => void;
    onClose: () => void;
}

export default function TestSubmissionImportModal({ test, studentTests, onSave, onClose }: Props) {
    const { t } = useTranslation();
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [imported, setImported] = useState(false);

    function handleImport() {
        setError('');
        const submission = decodeTestSubmission(code.trim());
        if (!submission) {
            setError(t('tests.results.import_error_invalid'));
            return;
        }
        if (submission.testId !== test.id) {
            setError(t('tests.results.import_error_wrong_test'));
            return;
        }
        const now = new Date().toISOString();
        const existing = studentTests.find(
            (st) => st.testId === submission.testId && st.studentId === submission.studentId
        );
        const rawTotalPoints = calcStudentTestRawPoints(test, submission.answers);
        const next: StudentTest = {
            id: existing?.id ?? nanoid(),
            testId: submission.testId,
            studentId: submission.studentId,
            answers: submission.answers,
            status: 'submitted',
            startedAt: submission.startedAt,
            submittedAt: submission.submittedAt,
            rawTotalPoints,
            events: submission.events,
            updatedAt: now,
        };
        onSave(next);
        setImported(true);
    }

    if (imported) {
        return (
            <Modal titleId="test-import-title" onClose={onClose} maxWidth={460}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <h2 id="test-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        {t('tests.results.import_title')}
                    </h2>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
                        <X size={16} />
                    </button>
                </div>
                <div
                    style={{
                        padding: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 12,
                        textAlign: 'center',
                    }}
                >
                    <CheckCircle size={40} style={{ color: 'var(--green)' }} />
                    <div style={{ fontWeight: 700 }}>{t('tests.results.import_success')}</div>
                    <button className="btn btn-primary btn-sm" onClick={onClose}>
                        {t('common.close')}
                    </button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal titleId="test-import-title" onClose={onClose} maxWidth={520}>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <h2 id="test-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                    {t('tests.results.import_title')}
                </h2>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label={t('common.close')}>
                    <X size={16} />
                </button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {t('tests.results.import_description')}
                </p>
                <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="test-submission-code">{t('tests.results.import_code_label')}</label>
                    <textarea
                        id="test-submission-code"
                        value={code}
                        onChange={(e) => {
                            setCode(e.target.value);
                            setError('');
                        }}
                        rows={5}
                        placeholder={t('tests.results.import_code_placeholder')}
                        style={{ fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                    />
                </div>
                {error && (
                    <div
                        style={{
                            padding: '8px 12px',
                            background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                            border: '1px solid var(--red)',
                            borderRadius: 8,
                            fontSize: '0.8rem',
                            color: 'var(--red)',
                        }}
                    >
                        {error}
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={onClose}>
                        {t('common.cancel')}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!code.trim()}>
                        <Upload size={14} /> {t('tests.results.import_btn')}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
