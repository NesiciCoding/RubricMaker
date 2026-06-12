import React, { useState, useCallback, useEffect } from 'react';
import {
    X,
    Upload,
    CheckCircle,
    Database,
    RefreshCw,
    FileText,
    Trash2,
    AlertTriangle,
    TrendingDown,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { decodeEssaySubmission } from '../../utils/essaySubmissionCode';
import Modal from '../ui/Modal';
import type { Attachment } from '../../types';
import { useDbStatus } from '../../hooks/useDbStatus';

type Tab = 'code' | 'database';

interface DbSubmission {
    id: string;
    studentEmail: string | null;
    wordCount: number;
    wordLimitStatus: 'ok' | 'under' | 'over' | null;
    submittedAt: string;
    storagePath: string;
}

interface Props {
    rubricId: string;
    studentId: string;
    studentName: string;
    /** The teacherKey of the active assignment — used to query DB submissions */
    teacherKey?: string;
    onImport: (attachment: Omit<Attachment, 'id' | 'addedAt'>) => void;
    onClose: () => void;
    onFetchSubmissions?: (teacherKey: string) => Promise<DbSubmission[]>;
    onGetSignedUrl?: (storagePath: string) => Promise<string | null>;
    onDeleteSubmission?: (id: string, storagePath: string) => Promise<{ success: boolean; error?: string }>;
}

export default function EssayImportModal({
    rubricId,
    studentId,
    studentName,
    teacherKey,
    onImport,
    onClose,
    onFetchSubmissions,
    onGetSignedUrl,
    onDeleteSubmission,
}: Props) {
    const { t } = useTranslation();
    const dbStatus = useDbStatus();
    const hasDb = dbStatus.isConnected && !!onFetchSubmissions;

    const [tab, setTab] = useState<Tab>(hasDb ? 'database' : 'code');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [imported, setImported] = useState(false);
    const [meta, setMeta] = useState<{
        wordCount: number;
        submittedAt: string;
        wordLimitStatus?: 'ok' | 'under' | 'over' | null;
    } | null>(null);

    // DB tab state
    const [submissions, setSubmissions] = useState<DbSubmission[]>([]);
    const [loadingDb, setLoadingDb] = useState(false);
    const [importingId, setImportingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [dbError, setDbError] = useState('');

    const loadSubmissions = useCallback(async () => {
        if (!hasDb || !onFetchSubmissions) return;
        setLoadingDb(true);
        setDbError('');
        try {
            const rows = await onFetchSubmissions(teacherKey ?? '');
            setSubmissions(rows);
        } catch {
            setDbError('Failed to load submissions. Make sure you are connected to the database.');
        } finally {
            setLoadingDb(false);
        }
    }, [hasDb, teacherKey, onFetchSubmissions]);

    useEffect(() => {
        if (tab === 'database' && hasDb) loadSubmissions();
    }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Code-paste import ─────────────────────────────────────────────────────

    const handleImportCode = useCallback(() => {
        setError('');
        const submission = decodeEssaySubmission(code.trim());
        if (!submission) {
            setError('Invalid submission code. Make sure you copied the full code from the student.');
            return;
        }
        if (submission.assignmentRubricId !== rubricId || submission.assignmentStudentId !== studentId) {
            setError(`This submission is for a different student or rubric.`);
            return;
        }
        const dateStr = new Date(submission.submittedAt).toLocaleDateString();
        const filename = `Essay – ${studentName} – ${dateStr}.html`;
        const dataUrl = `data:text/html;base64,${btoa(unescape(encodeURIComponent(submission.contentHtml)))}`;
        onImport({
            name: filename,
            mimeType: 'text/html',
            dataUrl,
            rubricId,
            studentId,
            size: submission.contentHtml.length,
        });
        setMeta({
            wordCount: submission.wordCount,
            submittedAt: submission.submittedAt,
            wordLimitStatus: submission.wordLimitStatus,
        });
        setImported(true);
    }, [code, rubricId, studentId, studentName, onImport]);

    // ── DB import ─────────────────────────────────────────────────────────────

    const handleImportFromDb = useCallback(
        async (sub: DbSubmission) => {
            if (!onGetSignedUrl) return;
            setImportingId(sub.id);
            setDbError('');
            try {
                const url = await onGetSignedUrl(sub.storagePath);
                if (!url) {
                    setDbError('Could not get download URL. Try again.');
                    setImportingId(null);
                    return;
                }
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Failed to download essay: ${res.status}`);
                const html = await res.text();
                const dateStr = new Date(sub.submittedAt).toLocaleDateString();
                const who = sub.studentEmail ?? studentName;
                const filename = `Essay – ${who} – ${dateStr}.html`;
                const dataUrl = `data:text/html;base64,${btoa(unescape(encodeURIComponent(html)))}`;
                onImport({ name: filename, mimeType: 'text/html', dataUrl, rubricId, studentId, size: html.length });
                setMeta({
                    wordCount: sub.wordCount,
                    submittedAt: sub.submittedAt,
                    wordLimitStatus: sub.wordLimitStatus,
                });
                setImported(true);
            } catch {
                setDbError('Failed to download essay. Check your connection and try again.');
            } finally {
                setImportingId(null);
            }
        },
        [onGetSignedUrl, rubricId, studentId, studentName, onImport]
    );

    const handleDelete = useCallback(
        async (sub: DbSubmission) => {
            if (!onDeleteSubmission) return;
            if (!confirm(`Delete this submission from ${sub.studentEmail ?? 'student'}? This cannot be undone.`))
                return;
            setDeletingId(sub.id);
            const result = await onDeleteSubmission(sub.id, sub.storagePath);
            setDeletingId(null);
            if (result.success) {
                setSubmissions((prev) => prev.filter((s) => s.id !== sub.id));
            } else {
                setDbError(`Delete failed: ${result.error}`);
            }
        },
        [onDeleteSubmission]
    );

    // ── Shared success screen ─────────────────────────────────────────────────

    if (imported && meta) {
        return (
            <Modal titleId="essay-import-title" onClose={onClose} maxWidth={500}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Upload size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                        <h2 id="essay-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            Import essay — {studentName}
                        </h2>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
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
                    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--green)' }}>
                        Essay imported successfully!
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {meta.wordCount} words · submitted {new Date(meta.submittedAt).toLocaleString()}
                    </div>
                    {meta.wordLimitStatus === 'over' && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--red)',
                                background: 'color-mix(in srgb, var(--red) 10%, transparent)',
                                border: '1px solid var(--red)',
                                borderRadius: 6,
                                padding: '4px 10px',
                            }}
                        >
                            <AlertTriangle size={13} /> {t('essay.word_limit_over')}
                        </div>
                    )}
                    {meta.wordLimitStatus === 'under' && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--yellow)',
                                background: 'color-mix(in srgb, var(--yellow) 10%, transparent)',
                                border: '1px solid var(--yellow)',
                                borderRadius: 6,
                                padding: '4px 10px',
                            }}
                        >
                            <TrendingDown size={13} /> {t('essay.word_limit_under')}
                        </div>
                    )}
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                        The essay has been added as an attachment. You can view and analyse it in the Attachments panel.
                    </p>
                    <button className="btn btn-primary btn-sm" onClick={onClose}>
                        Close
                    </button>
                </div>
            </Modal>
        );
    }

    return (
        <Modal titleId="essay-import-title" onClose={onClose} maxWidth={520}>
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--border)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h2 id="essay-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                        Import essay — {studentName}
                    </h2>
                </div>
                <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
                    <X size={16} />
                </button>
            </div>

            {/* Tab bar — only shown when DB is available */}
            {hasDb && (
                <div
                    style={{
                        display: 'flex',
                        borderBottom: '1px solid var(--border)',
                        background: 'var(--bg-elevated)',
                    }}
                >
                    {(['database', 'code'] as Tab[]).map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            style={{
                                flex: 1,
                                padding: '10px 0',
                                border: 'none',
                                background: 'none',
                                fontWeight: tab === t ? 700 : 400,
                                color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
                                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                                fontSize: '0.875rem',
                            }}
                        >
                            {t === 'database' ? (
                                <>
                                    <Database size={13} /> From database
                                </>
                            ) : (
                                <>
                                    <FileText size={13} /> Paste code
                                </>
                            )}
                        </button>
                    ))}
                </div>
            )}

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* ── Database tab ── */}
                {tab === 'database' && hasDb && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Submissions for this assignment stored in the database.
                            </p>
                            <button
                                className="btn btn-ghost btn-icon btn-sm"
                                title="Refresh"
                                onClick={loadSubmissions}
                                disabled={loadingDb}
                            >
                                <RefreshCw
                                    size={13}
                                    style={{ animation: loadingDb ? 'spin 1s linear infinite' : undefined }}
                                />
                            </button>
                        </div>

                        {dbError && (
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
                                {dbError}
                            </div>
                        )}

                        {loadingDb ? (
                            <p className="text-muted text-sm" style={{ textAlign: 'center', padding: '16px 0' }}>
                                Loading…
                            </p>
                        ) : submissions.length === 0 ? (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: '24px 0',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.875rem',
                                }}
                            >
                                No submissions yet for this assignment.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {submissions.map((sub) => (
                                    <div
                                        key={sub.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 10,
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 8,
                                            padding: '10px 12px',
                                        }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div
                                                style={{
                                                    fontSize: '0.875rem',
                                                    fontWeight: 600,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {sub.studentEmail ?? 'Anonymous'}
                                            </div>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    flexWrap: 'wrap',
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                <span>
                                                    {sub.wordCount} words · {new Date(sub.submittedAt).toLocaleString()}
                                                </span>
                                                {sub.wordLimitStatus === 'over' && (
                                                    <span
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            fontWeight: 600,
                                                            color: 'var(--red)',
                                                            background:
                                                                'color-mix(in srgb, var(--red) 10%, transparent)',
                                                            border: '1px solid var(--red)',
                                                            borderRadius: 4,
                                                            padding: '1px 6px',
                                                        }}
                                                    >
                                                        <AlertTriangle size={10} /> {t('essay.word_limit_over')}
                                                    </span>
                                                )}
                                                {sub.wordLimitStatus === 'under' && (
                                                    <span
                                                        style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: 3,
                                                            fontWeight: 600,
                                                            color: 'var(--yellow)',
                                                            background:
                                                                'color-mix(in srgb, var(--yellow) 10%, transparent)',
                                                            border: '1px solid var(--yellow)',
                                                            borderRadius: 4,
                                                            padding: '1px 6px',
                                                        }}
                                                    >
                                                        <TrendingDown size={10} /> {t('essay.word_limit_under')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={!!importingId || !!deletingId}
                                            onClick={() => handleImportFromDb(sub)}
                                        >
                                            {importingId === sub.id ? 'Importing…' : 'Import'}
                                        </button>
                                        {onDeleteSubmission && (
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                style={{ color: 'var(--red)' }}
                                                title="Delete submission"
                                                disabled={!!importingId || !!deletingId}
                                                onClick={() => handleDelete(sub)}
                                            >
                                                {deletingId === sub.id ? '…' : <Trash2 size={13} />}
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary btn-sm" onClick={onClose}>
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {/* ── Code-paste tab ── */}
                {tab === 'code' && (
                    <>
                        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            Paste the submission code the student sent you. The essay will be added as an attachment.
                        </p>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label>Submission code</label>
                            <textarea
                                value={code}
                                onChange={(e) => {
                                    setCode(e.target.value);
                                    setError('');
                                }}
                                rows={5}
                                placeholder="Paste the student's submission code here…"
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
                                Cancel
                            </button>
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleImportCode}
                                disabled={!code.trim()}
                            >
                                <Upload size={14} /> Import essay
                            </button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}
