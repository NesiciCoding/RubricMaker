import React, { useState, useRef, useCallback } from 'react';
import { Upload, Paperclip, Trash2, Download, Link2, Users, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';

export default function AttachmentsPage() {
    const { t } = useTranslation();
    const { attachments, rubrics, students, classes, addAttachment, deleteAttachment } = useApp();
    const { confirm, dialogProps } = useConfirm();
    const [dragOver, setDragOver] = useState(false);
    const [selectedRubricId, setSelectedRubricId] = useState('');
    const [selectedClassId, setSelectedClassId] = useState('');
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const handleFiles = useCallback(
        (files: FileList | null) => {
            if (!files) return;
            Array.from(files).forEach((file) => {
                const reader = new FileReader();
                reader.onload = () => {
                    addAttachment({
                        name: file.name,
                        mimeType: file.type,
                        dataUrl: reader.result as string,
                        rubricId: selectedRubricId || undefined,
                        studentId: selectedStudentId || undefined,
                        size: file.size,
                    });
                };
                reader.readAsDataURL(file);
            });
        },
        [addAttachment, selectedRubricId, selectedStudentId]
    );

    function downloadAttachment(att: (typeof attachments)[0]) {
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
            <Topbar title={t('attachments.title')} />
            <div className="page-content fade-in">
                {/* Drop zone */}
                <div
                    className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
                    style={{ marginBottom: 24 }}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        handleFiles(e.dataTransfer.files);
                    }}
                >
                    <Upload size={28} style={{ margin: '0 auto 10px', display: 'block' }} />
                    <p style={{ fontWeight: 600 }}>{t('attachments.drop_zone_title')}</p>
                    <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                        {t('attachments.drop_zone_subtitle')}
                    </p>
                    <div
                        style={{
                            marginTop: 14,
                            display: 'flex',
                            gap: 10,
                            justifyContent: 'center',
                            alignItems: 'center',
                        }}
                    >
                        <label className="text-xs text-muted">{t('attachments.link_to_rubric')}</label>
                        <select
                            value={selectedRubricId}
                            onChange={(e) => {
                                setSelectedRubricId(e.target.value);
                                setSelectedStudentId('');
                            }}
                            style={{ width: 200 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <option value="">{t('attachments.no_rubric')}</option>
                            {rubrics.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    {selectedRubricId && (
                        <div
                            style={{
                                marginTop: 10,
                                display: 'flex',
                                gap: 10,
                                justifyContent: 'center',
                                alignItems: 'center',
                            }}
                        >
                            <label className="text-xs text-muted">{t('attachments.link_to_student')}</label>
                            <select
                                value={selectedClassId}
                                onChange={(e) => {
                                    setSelectedClassId(e.target.value);
                                    setSelectedStudentId('');
                                }}
                                style={{ width: 140 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="">{t('attachments.any_class')}</option>
                                {classes.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={selectedStudentId}
                                onChange={(e) => setSelectedStudentId(e.target.value)}
                                style={{ width: 140 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <option value="">{t('attachments.no_student')}</option>
                                {students
                                    .filter((s) => !selectedClassId || s.classId === selectedClassId)
                                    .map((s) => (
                                        <option key={s.id} value={s.id}>
                                            {s.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    )}
                </div>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    onChange={(e) => handleFiles(e.target.files)}
                    style={{ display: 'none' }}
                />

                {/* File list */}
                {attachments.length === 0 ? (
                    <div className="empty-state">
                        <Paperclip size={40} />
                        <h3>{t('attachments.empty_state')}</h3>
                        <p className="text-muted text-sm">{t('attachments.empty_state_subtitle')}</p>
                        <button className="btn btn-primary btn-sm" onClick={() => fileRef.current?.click()}>
                            <Plus size={14} /> {t('attachments.empty_state_cta')}
                        </button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>{t('attachments.table_name')}</th>
                                <th>{t('attachments.table_type')}</th>
                                <th>{t('attachments.table_size')}</th>
                                <th>{t('attachments.table_linked_rubric')}</th>
                                <th>{t('attachments.table_linked_student')}</th>
                                <th>{t('attachments.table_added')}</th>
                                <th>{t('attachments.table_actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {attachments.map((att) => {
                                const linkedRubric = rubrics.find((r) => r.id === att.rubricId);
                                const linkedStudent = students.find((s) => s.id === att.studentId);
                                return (
                                    <tr key={att.id}>
                                        <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Paperclip size={14} style={{ color: 'var(--accent)' }} />
                                            {att.name}
                                        </td>
                                        <td>
                                            <span className="badge badge-blue">
                                                {att.mimeType.split('/')[1] ?? att.mimeType}
                                            </span>
                                        </td>
                                        <td className="text-muted text-sm">{formatSize(att.size)}</td>
                                        <td>
                                            {linkedRubric ? (
                                                <span className="badge badge-purple">
                                                    <Link2 size={11} /> {linkedRubric.name}
                                                </span>
                                            ) : (
                                                <span className="text-muted text-xs">—</span>
                                            )}
                                        </td>
                                        <td>
                                            {linkedStudent ? (
                                                <span className="badge badge-blue">
                                                    <Users size={11} /> {linkedStudent.name}
                                                </span>
                                            ) : (
                                                <span className="text-muted text-xs">—</span>
                                            )}
                                        </td>
                                        <td className="text-muted text-sm">
                                            {new Date(att.addedAt).toLocaleDateString()}
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    onClick={() => downloadAttachment(att)}
                                                    title="Download"
                                                >
                                                    <Download size={14} />
                                                </button>
                                                {att.mimeType.startsWith('image/') && (
                                                    <a
                                                        href={att.dataUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="btn btn-ghost btn-icon btn-sm"
                                                        title="Preview"
                                                    >
                                                        👁
                                                    </a>
                                                )}
                                                <button
                                                    className="btn btn-ghost btn-icon btn-sm"
                                                    aria-label={t('attachments.delete_title', 'Delete attachment')}
                                                    style={{ color: 'var(--red)' }}
                                                    onClick={async () => {
                                                        const ok = await confirm({
                                                            title: t('attachments.delete_title', 'Delete attachment'),
                                                            message: t(
                                                                'attachments.delete_message',
                                                                'This attachment will be permanently removed.'
                                                            ),
                                                        });
                                                        if (ok) deleteAttachment(att.id);
                                                    }}
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
                )}
            </div>
            <ConfirmDialog {...dialogProps} />
        </>
    );
}
