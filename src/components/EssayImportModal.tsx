import React, { useState, useCallback } from 'react';
import { X, Upload, CheckCircle } from 'lucide-react';
import { decodeEssaySubmission } from '../utils/essaySubmissionCode';
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
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: 'var(--bg)', borderRadius: 14, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Upload size={18} style={{ color: 'var(--accent)' }} />
                        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Import essay — {studentName}</h2>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16} /></button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {imported && meta ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '16px 0', textAlign: 'center' }}>
                            <CheckCircle size={40} style={{ color: '#16a34a' }} />
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Essay imported successfully!</div>
                            <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                                {meta.wordCount} words · submitted {new Date(meta.submittedAt).toLocaleString()}
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: 0 }}>
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
                                <div style={{ padding: '8px 12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, fontSize: '0.8rem', color: '#dc2626' }}>
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
            </div>
        </div>
    );
}
