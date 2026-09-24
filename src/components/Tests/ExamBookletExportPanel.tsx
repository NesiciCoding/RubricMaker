import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader, CheckSquare, Square } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { logAuditEvent } from '../../services/database/AuditLogger';
import type { Student, Test } from '../../types';
import type { DocxStyleTemplateOverrides } from '../../utils/docxExport';
import type { TestExamExportOptions } from '../../utils/testExamContent';

interface Props {
    test: Test;
    students: Student[];
    fontFamily?: string;
    styleTemplate?: DocxStyleTemplateOverrides;
}

/** Exam booklet / attachment / answer sheet / grading sheet export, in the CITO-style layout. Shared between ExportPage and TestListPage. */
export default function ExamBookletExportPanel({ test, students, fontFamily, styleTemplate }: Props) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [attachmentMode, setAttachmentMode] = useState<'inline' | 'separate'>('separate');
    const [hotTextMirror, setHotTextMirror] = useState(false);
    const [scanMarkers, setScanMarkers] = useState(false);
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const hasHotText = test.questions.some((q) => q.type === 'hot-text');
    const hasAttachment = (test.sections ?? []).some((s) => s.content);

    function toggleAll() {
        setSelectedStudentIds((prev) =>
            prev.size === students.length ? new Set() : new Set(students.map((s) => s.id))
        );
    }
    function toggleStudent(id: string) {
        setSelectedStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleExport(format: 'pdf' | 'docx') {
        setExporting(true);
        try {
            const options: TestExamExportOptions = {
                fontFamily,
                styleTemplate,
                attachmentMode: hasAttachment ? attachmentMode : 'inline',
                hotTextMirror,
                scanMarkers,
            };
            const selectedStudents = students.filter((s) => selectedStudentIds.has(s.id));
            if (format === 'pdf') {
                const { exportExamPdf } = await import('../../utils/testExamExportHtml');
                await exportExamPdf(test, { ...options, students: selectedStudents });
            } else {
                const { exportExamDocx } = await import('../../utils/testExamExportDocx');
                await exportExamDocx(test, { ...options, students: selectedStudents });
            }
            logAuditEvent('export', `export_test_exam_${format}`, 'test', test.id, {
                count: selectedStudents.length,
            });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    return (
        <div>
            <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
                {t('tests.export.exam.description')}
            </p>

            {hasAttachment && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>{t('tests.export.exam.attachment_mode_label')}</label>
                    <select
                        value={attachmentMode}
                        onChange={(e) => setAttachmentMode(e.target.value as 'inline' | 'separate')}
                    >
                        <option value="separate">{t('tests.export.exam.attachment_separate')}</option>
                        <option value="inline">{t('tests.export.exam.attachment_inline')}</option>
                    </select>
                </div>
            )}

            {hasHotText && (
                <label
                    style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}
                    title={t('tests.export.exam.hot_text_mirror_hint')}
                >
                    <input
                        type="checkbox"
                        checked={hotTextMirror}
                        onChange={(e) => setHotTextMirror(e.target.checked)}
                    />
                    {t('tests.export.exam.hot_text_mirror_label')}
                </label>
            )}

            <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}
                title={t('tests.export.exam.scan_markers_hint')}
            >
                <input type="checkbox" checked={scanMarkers} onChange={(e) => setScanMarkers(e.target.checked)} />
                {t('tests.export.exam.scan_markers_label')}
            </label>

            {students.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={toggleAll}>
                            {selectedStudentIds.size === students.length ? (
                                <CheckSquare size={15} />
                            ) : (
                                <Square size={15} />
                            )}
                            {selectedStudentIds.size === students.length
                                ? t('tests.export.exam.deselect_all')
                                : t('tests.export.exam.select_all')}
                        </button>
                        <span className="text-muted text-sm">
                            {t('tests.export.exam.selected_count', {
                                count: selectedStudentIds.size,
                                total: students.length,
                            })}
                        </span>
                    </div>
                    <div
                        style={{
                            maxHeight: 160,
                            overflowY: 'auto',
                            border: '1px solid var(--border)',
                            borderRadius: 6,
                            padding: 8,
                        }}
                    >
                        {students.map((s) => (
                            <label
                                key={s.id}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0' }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedStudentIds.has(s.id)}
                                    onChange={() => toggleStudent(s.id)}
                                />
                                {s.name}
                            </label>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary btn-sm" disabled={exporting} onClick={() => handleExport('pdf')}>
                    {exporting ? <Loader size={13} className="spin" /> : <Download size={13} />}
                    {t('tests.export.exam.export_pdf')}
                </button>
                <button className="btn btn-secondary btn-sm" disabled={exporting} onClick={() => handleExport('docx')}>
                    {exporting ? <Loader size={13} className="spin" /> : <Download size={13} />}
                    {t('tests.export.exam.export_docx')}
                </button>
            </div>
        </div>
    );
}
