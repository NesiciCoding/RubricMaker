import React, { useState, useCallback } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { decodeEssaySubmission } from '../utils/essaySubmissionCode';
import Modal from './Modal';
import type { Attachment } from '../types';

interface Props {
    rubricId: string;
    studentId: string;
    studentName: string;
    onImport: (attachment: Omit<Attachment, 'id' | 'addedAt'>) => void;
    onClose: () => void;
}

export default function EssayImportModal({ rubricId, studentId, studentName, onImport, onClose }: Props) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [imported, setImported] = useState(false);
    const [meta, setMeta] = useState<{ wordCount: number; submittedAt: string } | null>(null);

    const handleImport = useCallback(() => {
        setError('');
        const submission = decodeEssaySubmission(code.trim());
        if (!submission) {
            setError('Invalid submission code. Make sure you copied the full code from the student.');
            return;
        }
        if (submission.assignmentRubricId !== rubricId || submission.assignmentStudentId !== studentId) {
            setError(`This submission is for a different student or rubric (rubricId: ${submission.assignmentRubricId}, studentId: ${submission.assignmentStudentId}).`);
            return;
        }
        const dateStr = new Date(submission.submittedAt).toLocaleDateString();
        const filename = `Essay – ${studentName} – ${dateStr}.html`;
        // Store as a data URL so DocumentAnalysisPanel can extract text from it
        const dataUrl = `data:text/html;base64,${btoa(unescape(encodeURIComponent(submission.contentHtml)))}`;
        onImport({
            name: filename,
            mimeType: 'text/html',
            dataUrl,
            rubricId,
            studentId,
            size: submission.contentHtml.length,
        });
        setMeta({ wordCount: submission.wordCount, submittedAt: submission.submittedAt });
        setImported(true);
    }, [code, rubricId, studentId, studentName, onImport]);

    return (
        <Modal titleId="essay-import-title" onClose={onClose} maxWidth={500}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Upload size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                        <h2 id="essay-import-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Import essay — {studentName}</h2>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {imported && meta ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
                            <CheckCircle size={40} style={{ color: 'var(--green)' }} />
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--green)' }}>Essay imported successfully!</div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {meta.wordCount} words · submitted {new Date(meta.submittedAt).toLocaleString()}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                                The essay has been added as an attachment. You can now view and analyse it in the Attachments panel.
                            </p>
                            <button className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
                        </div>
                    ) : (
                        <>
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Paste the submission code the student sent you. The essay will be added as an attachment linked to this student.
                            </p>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label>Submission code</label>
                                <textarea
                                    value={code}
                                    onChange={e => { setCode(e.target.value); setError(''); }}
                                    rows={5}
                                    placeholder="Paste the student's submission code here…"
                                    style={{ fontFamily: 'monospace', fontSize: '0.78rem', resize: 'vertical' }}
                                />
                            </div>
                            {error && (
                                <div style={{ padding: '8px 12px', background: 'color-mix(in srgb, var(--red) 10%, transparent)', border: '1px solid var(--red)', borderRadius: 8, fontSize: '0.8rem', color: 'var(--red)' }}>
                                    {error}
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
                                <button className="btn btn-primary btn-sm" onClick={handleImport} disabled={!code.trim()}>
                                    <Upload size={14} /> Import essay
                                </button>
                            </div>
                        </>
                    )}
                </div>
        </Modal>
    );
}
