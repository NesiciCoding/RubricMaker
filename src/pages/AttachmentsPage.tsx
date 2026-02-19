import React, { useState, useRef, useCallback } from 'react';
import { Upload, Paperclip, Trash2, Download, Link2 } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';

export default function AttachmentsPage() {
    const { attachments, rubrics, addAttachment, deleteAttachment } = useApp();
    const [dragOver, setDragOver] = useState(false);
    const [selectedRubricId, setSelectedRubricId] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback((files: FileList | null) => {
        if (!files) return;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = () => {
                addAttachment({
                    name: file.name,
                    mimeType: file.type,
                    dataUrl: reader.result as string,
                    rubricId: selectedRubricId || undefined,
                    size: file.size,
                });
            };
            reader.readAsDataURL(file);
        });
    }, [addAttachment, selectedRubricId]);

    function downloadAttachment(att: typeof attachments[0]) {
        const a = document.createElement('a');
        a.href = att.dataUrl;
        a.download = att.name;
        a.click();
    }

    function formatSize(bytes: number) {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    return (
        <>
            <Topbar title="Attachments" />
            <div className="page-content fade-in">
                {/* Drop zone */}
                <div
                    className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                    style={{ marginBottom: 24 }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
                >
                    <Upload size={28} style={{ margin: '0 auto 10px', display: 'block' }} />
                    <p style={{ fontWeight: 600 }}>Drag & drop files here, or click to browse</p>
                    <p className="text-xs text-muted" style={{ marginTop: 6 }}>PDFs, images, Word docs, and more</p>
                    <div style={{ marginTop: 14, display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}>
                        <label className="text-xs text-muted">Link to rubric:</label>
                        <select value={selectedRubricId} onChange={e => setSelectedRubricId(e.target.value)}
                            style={{ width: 200 }}
                            onClick={e => e.stopPropagation()}>
                            <option value="">— No rubric —</option>
                            {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                </div>
                <input ref={fileRef} type="file" multiple onChange={e => handleFiles(e.target.files)} style={{ display: 'none' }} />

                {/* File list */}
                {attachments.length === 0 ? (
                    <div className="empty-state">
                        <Paperclip size={32} />
                        <p>No attachments yet. Upload files above.</p>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr><th>Name</th><th>Type</th><th>Size</th><th>Linked Rubric</th><th>Added</th><th>Actions</th></tr>
                        </thead>
                        <tbody>
                            {attachments.map(att => {
                                const linkedRubric = rubrics.find(r => r.id === att.rubricId);
                                return (
                                    <tr key={att.id}>
                                        <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Paperclip size={14} style={{ color: 'var(--accent)' }} />
                                            {att.name}
                                        </td>
                                        <td><span className="badge badge-blue">{att.mimeType.split('/')[1] ?? att.mimeType}</span></td>
                                        <td className="text-muted text-sm">{formatSize(att.size)}</td>
                                        <td>
                                            {linkedRubric
                                                ? <span className="badge badge-purple"><Link2 size={11} /> {linkedRubric.name}</span>
                                                : <span className="text-muted text-xs">—</span>}
                                        </td>
                                        <td className="text-muted text-sm">{new Date(att.addedAt).toLocaleDateString()}</td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button className="btn btn-ghost btn-icon btn-sm" onClick={() => downloadAttachment(att)} title="Download">
                                                    <Download size={14} />
                                                </button>
                                                {att.mimeType.startsWith('image/') && (
                                                    <a href={att.dataUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-icon btn-sm" title="Preview">
                                                        👁
                                                    </a>
                                                )}
                                                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteAttachment(att.id)}>
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </>
    );
}
