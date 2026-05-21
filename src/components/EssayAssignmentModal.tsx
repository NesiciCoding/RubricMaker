import React, { useState, useCallback } from 'react';
import { X, Copy, Download, Check, FileText } from 'lucide-react';
import { saveAs } from 'file-saver';
import { encodeEssayAssignment } from '../utils/essayShareCode';
import { nanoid } from '../utils/nanoid';
import Modal from './Modal';
import type { EssayAssignment } from '../types';

interface Props {
    rubricId: string;
    rubricName: string;
    studentId: string;
    studentName: string;
    onClose: () => void;
    onOpenSlipSheet: (assignment: EssayAssignment, classStudents: { id: string; name: string }[]) => void;
    classStudents: { id: string; name: string }[];
}

export default function EssayAssignmentModal({ rubricId, rubricName, studentId, studentName, onClose, onOpenSlipSheet, classStudents }: Props) {
    const [title, setTitle] = useState(rubricName);
    const [prompt, setPrompt] = useState('');
    const [minWords, setMinWords] = useState('');
    const [maxWords, setMaxWords] = useState('');
    const [timeLimitMinutes, setTimeLimitMinutes] = useState('');
    const [requireSEB, setRequireSEB] = useState(false);
    const [readOnlyAfterSubmit, setReadOnlyAfterSubmit] = useState(true);
    const [copied, setCopied] = useState(false);

    const teacherKey = React.useMemo(() => nanoid(), []);

    const buildAssignment = useCallback((sid: string): EssayAssignment => ({
        rubricId,
        studentId: sid,
        teacherKey,
        title,
        prompt: prompt || undefined,
        minWords: minWords ? parseInt(minWords, 10) : undefined,
        maxWords: maxWords ? parseInt(maxWords, 10) : undefined,
        timeLimitMinutes: timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : undefined,
        requireSEB,
        readOnlyAfterSubmit,
        createdAt: new Date().toISOString(),
    }), [rubricId, teacherKey, title, prompt, minWords, maxWords, timeLimitMinutes, requireSEB, readOnlyAfterSubmit]);

    const essayUrl = `${window.location.origin}${window.location.pathname}#/essay/${encodeEssayAssignment(buildAssignment(studentId))}`;

    const handleCopyLink = useCallback(() => {
        navigator.clipboard.writeText(essayUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }, [essayUrl]);

    const handleDownloadSEB = useCallback(() => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>startURL</key>
\t<string>${essayUrl}</string>
\t<key>allowQuit</key>
\t<false/>
\t<key>quitURL</key>
\t<string>${window.location.origin}/#/seb-done</string>
\t<key>quitURLConfirm</key>
\t<false/>
\t<key>browserWindowAllowAddressBar</key>
\t<false/>
\t<key>URLFilterEnable</key>
\t<true/>
\t<key>URLFilterRules</key>
\t<array>
\t\t<dict>
\t\t\t<key>action</key>
\t\t\t<integer>1</integer>
\t\t\t<key>active</key>
\t\t\t<true/>
\t\t\t<key>expression</key>
\t\t\t<string>${window.location.origin}.*</string>
\t\t\t<key>regex</key>
\t\t\t<false/>
\t\t</dict>
\t</array>
</dict>
</plist>`;
        const blob = new Blob([xml], { type: 'application/xml' });
        saveAs(blob, `essay-${studentName.replace(/\s+/g, '-').toLowerCase()}.seb`);
    }, [essayUrl, studentName]);

    const handlePrintSlips = useCallback(() => {
        const assignment = buildAssignment(studentId);
        onOpenSlipSheet(assignment, classStudents);
        onClose();
    }, [buildAssignment, studentId, classStudents, onOpenSlipSheet, onClose]);

    return (
        <Modal titleId="essay-assignment-title" onClose={onClose} maxWidth={560}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FileText size={18} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                        <h2 id="essay-assignment-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Essay Assignment — {studentName}</h2>
                    </div>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
                </div>

                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' }}>
                    {/* Title */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Assignment title</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Essay writing — Chapter 3" />
                    </div>

                    {/* Prompt */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Prompt / instructions <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} placeholder="Write about…" style={{ resize: 'vertical' }} />
                    </div>

                    {/* Word limits */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                            <label>Min words <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opt.)</span></label>
                            <input type="number" min={0} value={minWords} onChange={e => setMinWords(e.target.value)} placeholder="—" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                            <label>Max words <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opt.)</span></label>
                            <input type="number" min={0} value={maxWords} onChange={e => setMaxWords(e.target.value)} placeholder="—" />
                        </div>
                        <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
                            <label>Time limit (min) <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(opt.)</span></label>
                            <input type="number" min={1} value={timeLimitMinutes} onChange={e => setTimeLimitMinutes(e.target.value)} placeholder="—" />
                        </div>
                    </div>

                    {/* Toggles */}
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="checkbox" checked={requireSEB} onChange={e => setRequireSEB(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                            Require Safe Exam Browser
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '0.875rem' }}>
                            <input type="checkbox" checked={readOnlyAfterSubmit} onChange={e => setReadOnlyAfterSubmit(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                            Lock essay after submit
                        </label>
                    </div>

                    {/* Generated URL */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Student essay link</label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input readOnly value={essayUrl} style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)' }} />
                            <button className="btn btn-secondary btn-sm" onClick={handleCopyLink} style={{ flexShrink: 0 }}>
                                {copied ? <Check size={14} /> : <Copy size={14} />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer actions */}
                <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {classStudents.length > 1 && (
                        <button className="btn btn-secondary btn-sm" onClick={handlePrintSlips}>
                            Print class slips ({classStudents.length} students)
                        </button>
                    )}
                    <button className="btn btn-secondary btn-sm" onClick={handleDownloadSEB}>
                        <Download size={14} /> Download .seb config
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={handleCopyLink}>
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? 'Link copied!' : 'Copy link'}
                    </button>
                </div>
        </Modal>
    );
}
