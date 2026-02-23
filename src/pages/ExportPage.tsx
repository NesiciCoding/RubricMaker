import React, { useState } from 'react';
import { Download, CheckSquare, Square, FileText, Users, Loader, Layout, X } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf, exportBatchPdf } from '../utils/pdfExport';
import { exportRubricWithTemplate } from '../utils/docxTemplateExport';
import { exportRubricToDocx } from '../utils/docxExport';

export default function ExportPage() {
    const { rubrics, students, studentRubrics, gradeScales, settings, exportTemplates, updateSettings } = useApp();
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    // PDF Export Options
    const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
    const [combineAll, setCombineAll] = useState(false);

    // Template (for Word/DOCX export)
    const activeTemplateId = settings.exportTemplateId ?? '';
    const activeTemplate = exportTemplates.find(t => t.id === activeTemplateId) ?? null;

    const rubric = rubrics.find(r => r.id === selectedRubricId);
    const scale = gradeScales.find(g => g.id === (rubric?.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];

    const gradedStudents = studentRubrics
        .filter(sr => sr.rubricId === selectedRubricId)
        .map(sr => ({
            sr,
            student: students.find(s => s.id === sr.studentId),
            summary: rubric ? calcGradeSummary(sr, rubric.criteria, scale) : null,
        }))
        .filter(x => x.student);

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
                if (sr && student) await exportSinglePdf(sr, rubric, student, scale, { orientation });
            } else {
                const toExport = gradedStudents
                    .filter(x => selectedStudentIds.has(x.student!.id))
                    .map(x => ({ sr: x.sr, student: x.student! }));
                await exportBatchPdf(toExport, rubric, scale, { orientation, combineAll });
            }
        } finally {
            setExporting(false);
        }
    }

    async function handleWordExport() {
        if (!rubric) return;
        setExporting(true);
        try {
            if (activeTemplate) {
                await exportRubricWithTemplate(rubric, activeTemplate);
            } else {
                await exportRubricToDocx(rubric);
            }
        } finally {
            setExporting(false);
        }
    }

    return (
        <>
            <Topbar title="Export to PDF" />
            <div className="page-content fade-in">
                <div className="card" style={{ marginBottom: 20 }}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>Select Rubric to Export</label>
                        <select value={selectedRubricId} onChange={e => { setSelectedRubricId(e.target.value); setSelectedStudentIds(new Set()); }}>
                            {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>

                    {/* Word export template selector */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: '0.88rem' }}>
                                <Layout size={14} /> Word Export Template
                            </div>
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={!rubric || exporting}
                                onClick={handleWordExport}
                            >
                                {exporting ? <Loader size={13} className="spin" /> : <Download size={13} />}
                                {activeTemplate ? `Export Word (${activeTemplate.name})` : 'Export Word (default)'}
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <select
                                style={{ flex: 1, minWidth: 180, maxWidth: 340 }}
                                value={activeTemplateId}
                                onChange={e => updateSettings({ exportTemplateId: e.target.value || undefined })}
                            >
                                <option value="">— Default (no template) —</option>
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
                        {exportTemplates.length === 0 && (
                            <p className="text-muted text-xs" style={{ marginTop: 6 }}>
                                No templates saved. Upload one in <strong>Settings → Export Templates</strong>.
                            </p>
                        )}
                    </div>
                </div>

                {!rubric ? (
                    <div className="empty-state"><FileText size={32} /><p>Select a rubric above.</p></div>
                ) : gradedStudents.length === 0 ? (
                    <div className="empty-state"><Users size={32} /><p>No students have been graded with this rubric yet.</p></div>
                ) : (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                                    {selectedStudentIds.size === gradedStudents.length ? <CheckSquare size={15} /> : <Square size={15} />}
                                    {selectedStudentIds.size === gradedStudents.length ? 'Deselect All' : 'Select All'}
                                </button>
                                <span className="text-muted text-sm">{selectedStudentIds.size} of {gradedStudents.length} selected</span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Layout:</span>
                                    <select value={orientation} onChange={e => setOrientation(e.target.value as 'portrait' | 'landscape')} style={{ padding: '4px 8px', fontSize: '0.85rem' }}>
                                        <option value="portrait">Portrait</option>
                                        <option value="landscape">Landscape</option>
                                    </select>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={combineAll} onChange={e => setCombineAll(e.target.checked)} />
                                        Combine into 1 PDF
                                    </label>
                                </div>
                                <button
                                    className="btn btn-primary"
                                    disabled={selectedStudentIds.size === 0 || exporting}
                                    onClick={() => handleExport()}
                                >
                                    {exporting ? <Loader size={15} className="spin" /> : <Download size={15} />}
                                    {exporting ? 'Exporting…' : (combineAll ? `Export ${selectedStudentIds.size} as Single PDF` : `Export ${selectedStudentIds.size} as ZIP`)}
                                </button>
                            </div>
                        </div>

                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}></th>
                                    <th>Student</th>
                                    <th>Grade</th>
                                    <th>Score</th>
                                    <th>Progress</th>
                                    <th>Actions</th>
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
                                            <td style={{ fontWeight: 500 }}>{student.name}</td>
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
                                            <td onClick={e => e.stopPropagation()}>
                                                <button className="btn btn-secondary btn-sm" onClick={() => handleExport(student.id)} disabled={exporting}>
                                                    <Download size={13} /> PDF
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
