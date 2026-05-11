import React, { useState } from 'react';
import { Download, CheckSquare, Square, FileText, Users, Loader, Layout, X, Share2, XCircle, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { calcGradeSummary } from '../utils/gradeCalc';
import { encodeFeedbackCode } from '../utils/studentShareCode';

export default function ExportPage() {
    const { t } = useTranslation();
    const { rubrics, students, studentRubrics, gradeScales, settings, exportTemplates, updateSettings, saveStudentRubric } = useApp();
    const { showToast } = useToast();
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const rubric = rubrics.find(r => r.id === selectedRubricId);

    const [padForDoubleSided, setPadForDoubleSided] = useState(false);
    const [orientation, setOrientation] = useState<'portrait' | 'landscape' | undefined>(undefined);
    const [showBulkComment, setShowBulkComment] = useState(false);
    const [bulkCommentText, setBulkCommentText] = useState('');

    const activeTemplateId = settings.exportTemplateId ?? '';
    const activeTemplate = exportTemplates.find(t => t.id === activeTemplateId) ?? null;

    const resolvedScaleId = rubric?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale = (resolvedScaleId && resolvedScaleId !== 'none')
        ? (gradeScales.find(g => g.id === resolvedScaleId) ?? null)
        : null;

    const gradedStudents = studentRubrics
        .filter(sr => sr.rubricId === selectedRubricId)
        .map(sr => {
            const r = sr.rubricSnapshot || rubric;
            return {
                sr,
                student: students.find(s => s.id === sr.studentId),
                summary: r ? calcGradeSummary(sr, r.criteria, scale, r) : null,
            };
        })
        .filter(x => x.student && x.summary);

    function toggleStudent(id: string) {
        setSelectedStudentIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (selectedStudentIds.size === gradedStudents.length) {
            setSelectedStudentIds(new Set());
        } else {
            setSelectedStudentIds(new Set(gradedStudents.map(x => x.student!.id)));
        }
    }

    async function handleExport(single?: string) {
        if (!rubric) return;
        setExporting(true);
        try {
            if (single) {
                const sr = studentRubrics.find(s => s.rubricId === rubric.id && s.studentId === single);
                const student = students.find(s => s.id === single);
                if (sr && student) {
                    const { exportSinglePdf } = await import('../utils/pdfExport');
                    await exportSinglePdf(sr, rubric, student, scale, {
                        orientation: orientation || rubric.format.orientation || 'portrait'
                    });
                }
            } else {
                const toExport = gradedStudents
                    .filter(x => selectedStudentIds.has(x.student!.id))
                    .map(x => ({ sr: x.sr, student: x.student! }));
                const { exportBatchPdf } = await import('../utils/pdfExport');
                await exportBatchPdf(toExport, rubric, scale, {
                    padForDoubleSided,
                    orientation: orientation || rubric.format.orientation || 'portrait'
                });
            }
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleBatchDocxExport() {
        if (!rubric || selectedStudentIds.size === 0) return;
        setExporting(true);
        try {
            const toExport = gradedStudents
                .filter(x => selectedStudentIds.has(x.student!.id))
                .map(x => ({ sr: x.sr, student: x.student! }));
            const { exportBatchDocx } = await import('../utils/docxExport');
            await exportBatchDocx(toExport, rubric, scale);
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleWordExport() {
        if (!rubric) return;
        setExporting(true);
        try {
            if (activeTemplate) {
                const { exportRubricWithTemplate } = await import('../utils/docxTemplateExport');
                await exportRubricWithTemplate(rubric, activeTemplate);
            } else {
                const { exportRubricToDocx } = await import('../utils/docxExport');
                await exportRubricToDocx(rubric);
            }
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleCsvExport() {
        if (!rubric) return;

        const toExport = gradedStudents
            .filter(x => selectedStudentIds.has(x.student!.id));

        if (toExport.length === 0) return;

        const data = toExport.map(({ sr, student, summary }) => {
            const row: Record<string, string | number> = {
                'Student Name': student!.name,
                'Email': student!.email || '',
                'Rubric Name': rubric.name,
                'Date Graded': sr.gradedAt ? new Date(sr.gradedAt).toLocaleDateString() : '',
                'Score %': summary!.modifiedPercentage.toFixed(1),
                'Letter Grade': summary!.letterGrade,
                'Raw Points': summary!.rawScore,
                'Max Points': summary!.maxRawScore,
                'Global Modifier': sr.globalModifier && sr.globalModifier.value !== 0 ? `${sr.globalModifier.value} (${sr.globalModifier.reason})`.trim() : '',
                'Overall Comment': sr.overallComment || ''
            };

            rubric.criteria.forEach((c) => {
                const entry = sr.entries.find(e => e.criterionId === c.id);
                const snapshotC = (sr.rubricSnapshot || rubric).criteria.find(sc => sc.id === c.id) || c;
                let score = '';
                if (entry) {
                    if (entry.overridePoints !== undefined) {
                        score = entry.overridePoints.toString();
                    } else if (entry.selectedPoints !== undefined) {
                        score = entry.selectedPoints.toString();
                    } else if (entry.levelId) {
                        const level = snapshotC.levels.find(l => l.id === entry.levelId);
                        if (level) {
                            score = level.minPoints === level.maxPoints ? level.maxPoints.toString() : `${level.minPoints}-${level.maxPoints}`;
                        }
                    }
                }

                row[`Criterion: ${c.title} (Score)`] = score;
                row[`Criterion: ${c.title} (Comment)`] = entry?.comment || '';
            });

            return row;
        });

        const Papa = await import('papaparse');
        const csv = Papa.unparse(data);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${rubric.name.replace(/[^a-z0-9]/gi, '_')}_grades.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function handleBulkMarkNHI() {
        const now = new Date().toISOString();
        gradedStudents.forEach(({ sr }) => {
            if (!selectedStudentIds.has(sr.studentId)) return;
            saveStudentRubric({ ...sr, notHandedIn: true, gradedAt: now });
        });
        showToast(`Marked ${selectedStudentIds.size} student(s) as not handed in`, 'success');
        setSelectedStudentIds(new Set());
    }

    function handleBulkComment() {
        if (!bulkCommentText.trim()) return;
        const now = new Date().toISOString();
        gradedStudents.forEach(({ sr }) => {
            if (!selectedStudentIds.has(sr.studentId)) return;
            const current = sr.overallComment || '';
            const spacer = current && !current.endsWith(' ') ? ' ' : '';
            saveStudentRubric({ ...sr, overallComment: current + spacer + bulkCommentText, gradedAt: now });
        });
        showToast(`Added comment to ${selectedStudentIds.size} student(s)`, 'success');
        setBulkCommentText('');
        setShowBulkComment(false);
    }

    return (
        <>
            <Topbar title={t('navigation.export')} />
            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>{t('exportPage.select_rubric')}</label>
                        <select value={selectedRubricId} onChange={e => {
                            setSelectedRubricId(e.target.value);
                            setSelectedStudentIds(new Set());
                            setOrientation(undefined);
                        }}>
                            {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    {/* Word export template selector */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.88rem' }}>
                                <Layout size={14} /> {t('exportPage.word_template_label')}
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={!rubric || exporting}
                                onClick={handleWordExport}
                            >
                                {exporting ? <Loader size={13} className="spin" /> : <Download size={13} />}
                                {activeTemplate
                                    ? t('exportPage.export_word_template', { template: activeTemplate.name })
                                    : t('exportPage.export_word_default')}
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                                style={{ flex: 1, minWidth: 180, maxWidth: 340 }}
                                value={activeTemplateId}
                                onChange={e => updateSettings({ exportTemplateId: e.target.value || undefined })}
                            >
                                <option value="">{t('exportPage.template_default_option')}</option>
                                {exportTemplates.map(t => (
                                    <option key={t.id} value={t.id}>{t.name} ({t.levelHeaders.length} levels)</option>
                                ))}
                            </select>
                            {activeTemplate && (
                                <button className="btn btn-ghost btn-icon btn-sm" title="Clear template"
                                    onClick={() => updateSettings({ exportTemplateId: undefined })}>
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        {exportTemplates.length === 0 ? (
                            <div className="text-muted text-xs" style={{ marginTop: 6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <span dangerouslySetInnerHTML={{ __html: t('exportPage.no_templates_help') }} />
                                <a href="sample-template.docx" download="sample-template.docx" className="btn btn-ghost btn-icon btn-sm" style={{ padding: '0 6px', height: 20, display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--accent)' }}>
                                    <Download size={10} /> {t('exportPage.download_sample')}
                                </a>
                            </div>
                        ) : (
                            <div className="text-muted text-xs" style={{ marginTop: 6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                                <a href="sample-template.docx" download="sample-template.docx" className="btn btn-ghost btn-icon btn-sm" style={{ padding: '0 6px', height: 20, display: 'inline-flex', alignSelf: 'center', alignItems: 'center', gap: 4, textDecoration: 'none', color: 'var(--accent)' }}>
                                    <Download size={10} /> {t('exportPage.download_sample')}
                                </a>
                            </div>
                        )}
                    </div>

                    {/* CSV export */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.88rem' }}>
                                <FileText size={14} /> {t('exportPage.csv_label')}
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={!rubric || exporting || selectedStudentIds.size === 0}
                                onClick={handleCsvExport}
                            >
                                <Download size={13} />
                                {selectedStudentIds.size === 0
                                    ? t('exportPage.csv_select_prompt')
                                    : t('exportPage.csv_export_count', { count: selectedStudentIds.size })}
                            </button>
                        </div>
                    </div>
                </div>

                {!rubric ? (
                    <div className="empty-state"><FileText size={32} /><p>{t('exportPage.no_rubric')}</p></div>
                ) : gradedStudents.length === 0 ? (
                    <div className="empty-state"><Users size={32} /><p>{t('exportPage.no_students')}</p></div>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                                    {selectedStudentIds.size === gradedStudents.length ? <CheckSquare size={15} /> : <Square size={15} />}
                                    {selectedStudentIds.size === gradedStudents.length ? t('exportPage.deselect_all') : t('exportPage.select_all')}
                                </button>
                                <span className="text-muted text-sm">{t('exportPage.selected_count', { count: selectedStudentIds.size, total: gradedStudents.length })}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)' }} title="Adds to blank page so each student starts on a new physical sheet">
                                        <input type="checkbox" checked={padForDoubleSided} onChange={e => setPadForDoubleSided(e.target.checked)} />
                                        {t('exportPage.pad_double_sided')}
                                    </label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 12, borderLeft: '1px solid var(--border)', paddingLeft: 12 }}>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{t('rubricBuilder.format_orientation')}:</label>
                                        <select
                                            value={orientation || rubric.format.orientation || 'portrait'}
                                            onChange={e => setOrientation(e.target.value as 'portrait' | 'landscape')}
                                            style={{ height: 30, fontSize: '0.85rem', padding: '0 8px' }}
                                        >
                                            <option value="portrait">{t('rubricBuilder.format_portrait')}</option>
                                            <option value="landscape">{t('rubricBuilder.format_landscape')}</option>
                                        </select>
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary"
                                    disabled={selectedStudentIds.size === 0 || exporting}
                                    onClick={handleBatchDocxExport}
                                    title="Export graded results as a Word document"
                                >
                                    {exporting ? <Loader size={15} className="spin" /> : <Download size={15} />}
                                    {t('exportPage.batch_docx_export', { count: selectedStudentIds.size })}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    disabled={selectedStudentIds.size === 0 || exporting}
                                    onClick={() => handleExport()}
                                >
                                    {exporting ? <Loader size={15} className="spin" /> : <Download size={15} />}
                                    {exporting
                                        ? t('exportPage.preparing_print')
                                        : t('exportPage.print_to_pdf', { count: selectedStudentIds.size })}
                                </button>
                            </div>
                        </div>

                        {/* Bulk action bar */}
                        {selectedStudentIds.size > 0 && (
                            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {selectedStudentIds.size} selected —
                                </span>
                                <button className="btn btn-secondary btn-sm" onClick={handleBulkMarkNHI}>
                                    <XCircle size={13} /> {t('exportPage.bulk_nhi')}
                                </button>
                                <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkComment(v => !v)}>
                                    <MessageSquare size={13} /> {t('exportPage.bulk_add_comment')}
                                </button>
                                {showBulkComment && (
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, minWidth: 260 }}>
                                        <input
                                            type="text"
                                            value={bulkCommentText}
                                            onChange={e => setBulkCommentText(e.target.value)}
                                            placeholder={t('exportPage.bulk_comment_placeholder')}
                                            style={{ flex: 1 }}
                                            onKeyDown={e => { if (e.key === 'Enter') handleBulkComment(); }}
                                            autoFocus
                                        />
                                        <button className="btn btn-primary btn-sm" onClick={handleBulkComment} disabled={!bulkCommentText.trim()}>
                                            {t('exportPage.bulk_comment_confirm')}
                                        </button>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowBulkComment(false)}>
                                            <X size={13} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}></th>
                                    <th>{t('exportPage.table_student')}</th>
                                    <th>{t('exportPage.table_grade')}</th>
                                    <th>{t('exportPage.table_score')}</th>
                                    <th>{t('exportPage.table_progress')}</th>
                                    <th>{t('exportPage.table_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {gradedStudents.map(({ sr, student, summary }) => {
                                    if (!student || !summary) return null;
                                    const isSelected = selectedStudentIds.has(student.id);
                                    return (
                                        <tr key={student.id} onClick={() => toggleStudent(student.id)} style={{ cursor: 'pointer' }}>
                                            <td onClick={e => e.stopPropagation()}>
                                                <input type="checkbox" checked={isSelected} onChange={() => toggleStudent(student.id)} />
                                            </td>
                                            <td style={{ fontWeight: 500 }}>
                                                {student.name}
                                                {sr.feedbackOnly && (
                                                    <span style={{ marginLeft: 8, fontSize: '0.7rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 4, padding: '1px 6px', fontWeight: 600, verticalAlign: 'middle' }}>
                                                        {t('exportPage.feedback_only_badge')}
                                                    </span>
                                                )}
                                                {sr.isAnchor && (
                                                    <span style={{ marginLeft: 6, fontSize: '0.7rem', background: '#ede9fe', color: '#6d28d9', border: '1px solid #c4b5fd', borderRadius: 4, padding: '1px 6px', fontWeight: 600, verticalAlign: 'middle' }}>
                                                        {t('exportPage.anchor_badge')}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span className="grade-chip" style={{ background: summary.gradeColor + '22', color: summary.gradeColor, border: `1.5px solid ${summary.gradeColor}`, minWidth: 36, height: 36, fontSize: '1rem' }}>
                                                    {summary.letterGrade}
                                                </span>
                                            </td>
                                            <td>{summary.modifiedPercentage.toFixed(1)}% ({summary.rawScore}/{summary.maxRawScore})</td>
                                            <td>
                                                <div className="progress-bar" style={{ width: 120 }}>
                                                    <div className="progress-bar-fill" style={{ width: `${(summary.gradedCount / Math.max(summary.totalCriteria, 1)) * 100}%` }} />
                                                </div>
                                                <div className="text-xs text-muted">{summary.gradedCount}/{summary.totalCriteria}</div>
                                            </td>
                                            <td onClick={e => e.stopPropagation()} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleExport(student.id)} disabled={exporting}>
                                                    <Download size={13} /> PDF
                                                </button>
                                                <button
                                                    className="btn btn-ghost btn-sm"
                                                    title="Copy student feedback link"
                                                    onClick={() => {
                                                        if (!rubric) return;
                                                        const code = encodeFeedbackCode({ sr, rubric, student, scale });
                                                        const url = `${window.location.origin}${window.location.pathname}#/feedback/${code}`;
                                                        navigator.clipboard.writeText(url);
                                                        showToast('Feedback link copied to clipboard', 'success');
                                                    }}
                                                >
                                                    <Share2 size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </>
                )}
            </div>
        </>
    );
}
