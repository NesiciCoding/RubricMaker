import React, { useState, useRef, useCallback } from 'react';
import { Download, CheckSquare, Square, FileText, Users, Loader } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf, exportBatchPdf } from '../utils/pdfExport';

export default function ExportPage() {
    const { rubrics, students, studentRubrics, gradeScales, settings } = useApp();
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

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
                if (sr && student) await exportSinglePdf(sr, rubric, student, scale);
            } else {
                const toExport = gradedStudents
                    .filter(x => selectedStudentIds.has(x.student!.id))
                    .map(x => ({ sr: x.sr, student: x.student! }));
                await exportBatchPdf(toExport, rubric, scale);
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
                    <div className="form-group">
                        <label>Select Rubric to Export</label>
                        <select value={selectedRubricId} onChange={e => { setSelectedRubricId(e.target.value); setSelectedStudentIds(new Set()); }}>
                            {rubrics.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
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
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    className="btn btn-primary"
                                    disabled={selectedStudentIds.size === 0 || exporting}
                                    onClick={() => handleExport()}
                                >
                                    {exporting ? <Loader size={15} className="spin" /> : <Download size={15} />}
                                    {exporting ? 'Exporting…' : `Export Selected (${selectedStudentIds.size}) as ZIP`}
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
