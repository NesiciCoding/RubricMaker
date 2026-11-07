import React, { useRef, useState } from 'react';
import { AlertTriangle, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import type { ImportWarning } from '../../utils/questionBankImport';
import { parseTestFile, type ImportedTest } from '../../utils/testImport';
import type { DocumentReview } from '../../utils/import/draftImport';
import TestImportReview from './TestImportReview';

interface Props {
    onImport: (tests: ImportedTest[]) => void;
    onClose: () => void;
}

const PREVIEW_LIMIT = 8;

export default function TestImportModal({ onImport, onClose }: Props) {
    const { t } = useTranslation();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [tests, setTests] = useState<ImportedTest[] | null>(null);
    const [warnings, setWarnings] = useState<ImportWarning[]>([]);
    const [review, setReview] = useState<DocumentReview | null>(null);
    const [parsing, setParsing] = useState(false);

    async function handleFile(file: File) {
        setParsing(true);
        setTests(null);
        setWarnings([]);
        setReview(null);
        try {
            const result = await parseTestFile(file);
            setWarnings(result.warnings);
            setReview(result.review ?? null);
            setTests(result.tests.length > 0 ? result.tests : null);
        } catch (err) {
            // Reading the file can fail (a vanished pick, a permission error), and parseTestFile is only
            // 'never throws' for the parsing itself — the button must never stay stuck on "Parsing...".
            const message = err instanceof Error ? err.message : String(err);
            setWarnings([{ key: 'importTest.warn_parse_failed', params: { message } }]);
        } finally {
            setParsing(false);
        }
    }

    const totalPoints = (test: ImportedTest) => test.questions.reduce((sum, q) => sum + q.points, 0);

    return (
        <Modal titleId="test-import-title" onClose={onClose} maxWidth={620}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 id="test-import-title" style={{ margin: 0 }}>
                    {t('importTest.import_title')}
                </h3>
                <button
                    type="button"
                    className="btn btn-ghost btn-icon btn-sm"
                    aria-label={t('common.close')}
                    onClick={onClose}
                >
                    <X size={16} />
                </button>
            </div>
            <p className="text-muted text-sm" style={{ marginTop: 0 }}>
                {t('importTest.import_instructions')}{' '}
                <a href="sample-test.json" download="sample-test.json">
                    {t('importTest.import_download_sample')}
                </a>
            </p>
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,.docx,.pdf"
                style={{ display: 'none' }}
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    /* v8 ignore next -- hidden input: change only fires with a selected file */
                    if (file) handleFile(file);
                    e.target.value = '';
                }}
            />
            <button
                type="button"
                className="btn btn-secondary"
                disabled={parsing}
                onClick={() => fileInputRef.current?.click()}
            >
                <Upload size={15} /> {parsing ? t('importTest.import_parsing') : t('importTest.import_choose_file')}
            </button>

            {warnings.length > 0 && (
                <div
                    className="text-sm"
                    style={{
                        marginTop: 12,
                        padding: 10,
                        borderRadius: 6,
                        background: 'var(--yellow-subtle, rgba(234,179,8,0.1))',
                        border: '1px solid var(--yellow)',
                    }}
                >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600, marginBottom: 4 }}>
                        <AlertTriangle size={14} style={{ color: 'var(--yellow-text)' }} />
                        {t('importTest.import_warnings_title')}
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                        {warnings.map((w) => (
                            <li key={`${w.key}:${JSON.stringify(w.params ?? {})}`}>{t(w.key, w.params)}</li>
                        ))}
                    </ul>
                </div>
            )}

            {!parsing && tests === null && warnings.length > 0 && (
                <div className="text-muted text-sm" style={{ marginTop: 8 }}>
                    {t('importTest.import_no_tests')}
                </div>
            )}

            {review && <TestImportReview review={review} />}

            {tests && (
                <div style={{ marginTop: 16 }}>
                    <div className="text-sm" style={{ fontWeight: 600, marginBottom: 8 }}>
                        {t('importTest.import_preview', { count: tests.length })}
                    </div>
                    <div
                        style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}
                    >
                        {tests.slice(0, PREVIEW_LIMIT).map((test, i) => (
                            <div
                                key={i}
                                className="card"
                                style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 4 }}
                            >
                                <div className="text-muted text-xs">
                                    {[
                                        t('importTest.import_meta_questions', { count: test.questions.length }),
                                        t('importTest.import_meta_points', { count: totalPoints(test) }),
                                        ...(test.sections?.length
                                            ? [t('importTest.import_meta_sections', { count: test.sections.length })]
                                            : []),
                                    ].join(' · ')}
                                </div>
                                <div style={{ fontSize: '0.9rem' }}>{test.name}</div>
                            </div>
                        ))}
                    </div>
                    {tests.length > PREVIEW_LIMIT && (
                        <div className="text-muted text-xs" style={{ marginTop: 4 }}>
                            {t('questionBank.import_more_rows', { count: tests.length - PREVIEW_LIMIT })}
                        </div>
                    )}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                    {t('common.cancel')}
                </button>
                {tests && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                            onImport(tests);
                            onClose();
                        }}
                    >
                        {t('importTest.import_confirm', { count: tests.length })}
                    </button>
                )}
            </div>
        </Modal>
    );
}
