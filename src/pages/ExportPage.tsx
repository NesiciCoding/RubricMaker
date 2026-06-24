import React, { useState, useMemo } from 'react';
import { logAuditEvent } from '../services/database/AuditLogger';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { getExportTourSteps } from '../data/TutorialSteps';
import {
    Download,
    CheckSquare,
    Square,
    FileText,
    Users,
    Loader,
    Layout,
    X,
    Share2,
    XCircle,
    MessageSquare,
    ClipboardList,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { useToast } from '../hooks/useToast';
import { calcGradeSummary } from '../utils/gradeCalc';
import { getStudentGoalScores } from '../utils/learningGoalsAggregator';
import { encodeFeedbackCode } from '../utils/shareCode';
import type { ReportCardConfig, Student } from '../types';

export default function ExportPage() {
    const { t } = useTranslation();
    const {
        rubrics,
        students,
        classes,
        studentRubrics,
        gradeScales,
        settings,
        exportTemplates,
        updateSettings,
        saveStudentRubric,
        selfAssessments,
        analysisResults,
        tests,
        studentTests,
        essayAssignments,
        essaySubmissions,
    } = useApp();
    const { showToast } = useToast();
    const [selectedRubricId, setSelectedRubricId] = useState(rubrics[0]?.id ?? '');
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    const rubric = rubrics.find((r) => r.id === selectedRubricId);

    const [padForDoubleSided, setPadForDoubleSided] = useState(false);
    const [orientation, setOrientation] = useState<'portrait' | 'landscape' | undefined>(undefined);
    const [showBulkComment, setShowBulkComment] = useState(false);
    const [bulkCommentText, setBulkCommentText] = useState('');

    // ── Period report state ────────────────────────────────────────────────────
    const [reportClassId, setReportClassId] = useState('');
    const [reportStudentIds, setReportStudentIds] = useState<Set<string>>(new Set());
    const [reportDateFrom, setReportDateFrom] = useState('');
    const [reportDateTo, setReportDateTo] = useState('');
    const [reportPeriodLabel, setReportPeriodLabel] = useState('');
    const [generatingReport, setGeneratingReport] = useState(false);
    const [tourRun, setTourRun] = useState(false);
    const exportTourSteps = useMemo(() => getExportTourSteps(t), [t]);

    // ── Report card state (reuses the period report class/student picker) ─────
    const [reportCardConfig, setReportCardConfig] = useState<ReportCardConfig>({
        includeRubrics: true,
        includeStandards: true,
        includeLearningGoals: true,
        includeCefr: true,
        includeTestSummary: true,
    });
    const [generatingReportCard, setGeneratingReportCard] = useState(false);

    // ── Essay export state ──────────────────────────────────────────────────────
    const [essayTeacherKey, setEssayTeacherKey] = useState('');
    const [selectedEssayStudentIds, setSelectedEssayStudentIds] = useState<Set<string>>(new Set());
    const [essayFormat, setEssayFormat] = useState<'markdown' | 'docx' | 'pdf'>('pdf');
    const [essayBatchMode, setEssayBatchMode] = useState<'separate' | 'combined'>('separate');
    const [includeRubricAnalysis, setIncludeRubricAnalysis] = useState(false);
    const [exportingEssays, setExportingEssays] = useState(false);

    const activeTemplateId = settings.exportTemplateId ?? '';
    const activeTemplate = exportTemplates.find((t) => t.id === activeTemplateId) ?? null;

    const resolvedScaleId = rubric?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale =
        resolvedScaleId && resolvedScaleId !== 'none'
            ? (gradeScales.find((g) => g.id === resolvedScaleId) ?? null)
            : null;

    const gradedStudents = studentRubrics
        .filter((sr) => sr.rubricId === selectedRubricId)
        .map((sr) => {
            const r = sr.rubricSnapshot || rubric;
            return {
                sr,
                student: students.find((s) => s.id === sr.studentId),
                summary: r ? calcGradeSummary(sr, r.criteria, scale, r) : null,
            };
        })
        .filter((x) => x.student && x.summary);

    function toggleStudent(id: string) {
        setSelectedStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }

    function toggleAll() {
        if (selectedStudentIds.size === gradedStudents.length) {
            setSelectedStudentIds(new Set());
        } else {
            setSelectedStudentIds(new Set(gradedStudents.map((x) => x.student!.id)));
        }
    }

    // ── Essay export ────────────────────────────────────────────────────────────
    const essayGroups = useMemo(() => {
        const byKey = new Map<string, typeof essayAssignments>();
        for (const a of essayAssignments) {
            const existing = byKey.get(a.teacherKey);
            if (existing) existing.push(a);
            else byKey.set(a.teacherKey, [a]);
        }
        return Array.from(byKey.entries()).map(([teacherKey, rows]) => ({ teacherKey, title: rows[0].title }));
    }, [essayAssignments]);

    const essaySubmittedEntries = useMemo(() => {
        if (!essayTeacherKey) return [];
        return essaySubmissions
            .filter((s) => s.teacherKey === essayTeacherKey)
            .map((s) => {
                const assignment = essayAssignments.find(
                    (a) => a.teacherKey === essayTeacherKey && a.studentId === s.assignmentStudentId
                );
                const student = students.find((st) => st.id === s.assignmentStudentId);
                return assignment && student ? { assignment, student, submission: s } : null;
            })
            .filter(
                (
                    x
                ): x is {
                    assignment: (typeof essayAssignments)[number];
                    student: Student;
                    submission: (typeof essaySubmissions)[number];
                } => x !== null
            );
    }, [essayTeacherKey, essaySubmissions, essayAssignments, students]);

    function toggleEssayStudent(id: string) {
        setSelectedEssayStudentIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAllEssayStudents() {
        if (selectedEssayStudentIds.size === essaySubmittedEntries.length) {
            setSelectedEssayStudentIds(new Set());
        } else {
            setSelectedEssayStudentIds(new Set(essaySubmittedEntries.map((e) => e.student.id)));
        }
    }

    async function handleEssayExport() {
        const toExport = essaySubmittedEntries.filter((e) => selectedEssayStudentIds.has(e.student.id));
        if (toExport.length === 0) return;
        setExportingEssays(true);
        try {
            if (includeRubricAnalysis && (essayFormat === 'docx' || essayFormat === 'pdf')) {
                const { exportEssayWithRubric } = await import('../utils/essayExport');
                for (const { assignment, student, submission } of toExport) {
                    const sr = studentRubrics.find(
                        (s) => s.rubricId === assignment.rubricId && s.studentId === assignment.studentId
                    );
                    const essayRubric = rubrics.find((r) => r.id === assignment.rubricId);
                    if (!sr || !essayRubric) continue;
                    const essayScale = gradeScales.find((g) => g.id === essayRubric.gradeScaleId) ?? null;
                    const analysis = analysisResults.find(
                        (ar) => ar.studentId === student.id && ar.rubricId === essayRubric.id
                    );
                    await exportEssayWithRubric(
                        assignment,
                        student,
                        submission,
                        sr,
                        essayRubric,
                        essayScale,
                        essayFormat,
                        analysis
                    );
                }
            } else {
                const { exportEssaysBatch } = await import('../utils/essayExport');
                await exportEssaysBatch(toExport, essayFormat, essayBatchMode);
            }
            logAuditEvent('export', `export_essays_${essayFormat}`, 'essay', essayTeacherKey, {
                count: toExport.length,
            });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExportingEssays(false);
        }
    }

    async function handleExport(single?: string) {
        if (!rubric) return;
        setExporting(true);
        try {
            if (single) {
                const sr = studentRubrics.find((s) => s.rubricId === rubric.id && s.studentId === single);
                const student = students.find((s) => s.id === single);
                if (sr && student) {
                    const { exportSinglePdf } = await import('../utils/pdfExport');
                    await exportSinglePdf(sr, rubric, student, scale, {
                        orientation: orientation || rubric.format.orientation || 'portrait',
                    });
                    logAuditEvent('export', 'export_pdf', 'rubric', rubric.id, { count: 1 });
                }
            } else {
                const toExport = gradedStudents
                    .filter((x) => selectedStudentIds.has(x.student!.id))
                    .map((x) => ({ sr: x.sr, student: x.student! }));
                const { exportBatchPdf } = await import('../utils/pdfExport');
                await exportBatchPdf(toExport, rubric, scale, {
                    padForDoubleSided,
                    orientation: orientation || rubric.format.orientation || 'portrait',
                });
                logAuditEvent('export', 'export_pdf', 'rubric', rubric.id, { count: toExport.length });
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
                .filter((x) => selectedStudentIds.has(x.student!.id))
                .map((x) => ({ sr: x.sr, student: x.student! }));
            const { exportBatchDocx } = await import('../utils/docxExport');
            await exportBatchDocx(toExport, rubric, scale);
            logAuditEvent('export', 'export_docx', 'rubric', rubric.id, { count: toExport.length });
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
            logAuditEvent('export', 'export_docx', 'rubric', rubric.id, { template: !!activeTemplate });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleCsvExport() {
        if (!rubric) return;

        const toExport = gradedStudents.filter((x) => selectedStudentIds.has(x.student!.id));

        if (toExport.length === 0) return;

        const data = toExport.map(({ sr, student, summary }) => {
            const row: Record<string, string | number> = {
                'Student Name': student!.name,
                Email: student!.email || '',
                'Rubric Name': rubric.name,
                'Date Graded': sr.gradedAt ? new Date(sr.gradedAt).toLocaleDateString() : '',
                'Score %': summary!.modifiedPercentage.toFixed(1),
                'Letter Grade': summary!.letterGrade,
                'Raw Points': summary!.rawScore,
                'Max Points': summary!.maxRawScore,
                'Global Modifier':
                    sr.globalModifier && sr.globalModifier.value !== 0
                        ? `${sr.globalModifier.value} (${sr.globalModifier.reason})`.trim()
                        : '',
                'Overall Comment': sr.overallComment || '',
            };

            rubric.criteria.forEach((c) => {
                const entry = sr.entries.find((e) => e.criterionId === c.id);
                const snapshotC = (sr.rubricSnapshot || rubric).criteria.find((sc) => sc.id === c.id) || c;
                let score = '';
                if (entry) {
                    if (entry.overridePoints !== undefined) {
                        score = entry.overridePoints.toString();
                    } else if (entry.selectedPoints !== undefined) {
                        score = entry.selectedPoints.toString();
                    } else if (entry.levelId) {
                        const level = snapshotC.levels.find((l) => l.id === entry.levelId);
                        if (level) {
                            score =
                                level.minPoints === level.maxPoints
                                    ? level.maxPoints.toString()
                                    : `${level.minPoints}-${level.maxPoints}`;
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
        logAuditEvent('export', 'export_csv', 'rubric', rubric.id, { count: toExport.length });
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

    function gatherPeriodEntries(studentId: string) {
        const fromTs = reportDateFrom ? new Date(reportDateFrom).getTime() : 0;
        const toTs = reportDateTo ? new Date(reportDateTo + 'T23:59:59').getTime() : Infinity;
        const srs = studentRubrics.filter(
            (sr) =>
                sr.studentId === studentId &&
                sr.gradedAt &&
                !sr.isPeerReview &&
                !sr.notHandedIn &&
                new Date(sr.gradedAt).getTime() >= fromTs &&
                new Date(sr.gradedAt).getTime() <= toTs
        );
        const entries = srs
            .map((sr) => {
                const rubric = sr.rubricSnapshot ?? rubrics.find((r) => r.id === sr.rubricId);
                if (!rubric) return null;
                const scale =
                    gradeScales.find((g) => g.id === (rubric.gradeScaleId ?? settings.defaultGradeScaleId)) ??
                    gradeScales[0] ??
                    null;
                return { sr, rubric, scale };
            })
            .filter(Boolean) as import('../utils/periodReportExport').PeriodReportEntry[];
        return { srs, entries };
    }

    function gatherPeriodTests(studentId: string) {
        const fromTs = reportDateFrom ? new Date(reportDateFrom).getTime() : 0;
        const toTs = reportDateTo ? new Date(reportDateTo + 'T23:59:59').getTime() : Infinity;
        const periodStudentTests = studentTests.filter((st) => {
            if (st.studentId !== studentId || st.status !== 'graded') return false;
            const at = st.gradedAt ?? st.submittedAt;
            if (!at) return false;
            const ts = new Date(at).getTime();
            return ts >= fromTs && ts <= toTs;
        });
        const testIds = new Set(periodStudentTests.map((st) => st.testId));
        const periodTests = tests.filter((test) => testIds.has(test.id));
        return { tests: periodTests, studentTests: periodStudentTests };
    }

    async function handleGeneratePeriodReports() {
        if (reportStudentIds.size === 0) return;
        setGeneratingReport(true);
        try {
            const { exportPeriodReportsBatch } = await import('../utils/periodReportExport');
            const classStudents = students.filter((s) => s.classId === reportClassId && reportStudentIds.has(s.id));
            const cls = classes.find((c) => c.id === reportClassId);

            const inputs = classStudents.map((student) => {
                const { srs, entries } = gatherPeriodEntries(student.id);
                return {
                    student,
                    className: cls?.name ?? '',
                    entries,
                    periodLabel: reportPeriodLabel || undefined,
                    goals: getStudentGoalScores(student.id, srs, rubrics),
                };
            });

            await exportPeriodReportsBatch(inputs);
            logAuditEvent('export', 'export_period_report', 'class', reportClassId, { count: inputs.length });
            showToast(t('exportPage.period_report_success', { count: inputs.length }), 'success');
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setGeneratingReport(false);
        }
    }

    async function buildReportCardDataForStudent(student: (typeof students)[number]) {
        const { entries } = gatherPeriodEntries(student.id);
        const { tests: periodTests, studentTests: periodStudentTests } = gatherPeriodTests(student.id);
        const cls = classes.find((c) => c.id === reportClassId);
        const { buildReportCardData } = await import('../utils/reportCardAggregator');
        return buildReportCardData(student.id, reportCardConfig, {
            student,
            className: cls?.name ?? '',
            periodLabel: reportPeriodLabel || undefined,
            entries,
            rubrics,
            studentRubrics,
            selfAssessments,
            analysisResults,
            tests: periodTests,
            studentTests: periodStudentTests,
        });
    }

    async function handleGenerateReportCard(studentId: string) {
        setGeneratingReportCard(true);
        try {
            const student = students.find((s) => s.id === studentId);
            if (!student) return;
            const { exportReportCard } = await import('../utils/periodReportExport');
            const data = await buildReportCardDataForStudent(student);
            await exportReportCard(data);
            logAuditEvent('export', 'export_report_card', 'student', studentId, { count: 1 });
            showToast(t('exportPage.report_card_success', { count: 1 }), 'success');
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setGeneratingReportCard(false);
        }
    }

    async function handleGenerateReportCardsBatch() {
        if (reportStudentIds.size === 0) return;
        setGeneratingReportCard(true);
        try {
            const classStudents = students.filter((s) => s.classId === reportClassId && reportStudentIds.has(s.id));
            const { exportReportCardsBatch } = await import('../utils/periodReportExport');
            const dataList = await Promise.all(classStudents.map((student) => buildReportCardDataForStudent(student)));
            await exportReportCardsBatch(dataList);
            logAuditEvent('export', 'export_report_card', 'class', reportClassId, { count: dataList.length });
            showToast(t('exportPage.report_card_success', { count: dataList.length }), 'success');
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setGeneratingReportCard(false);
        }
    }

    return (
        <>
            <Joyride
                steps={exportTourSteps}
                run={tourRun}
                continuous
                onEvent={(data: EventData) => {
                    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
                        setTourRun(false);
                    }
                }}
                options={{
                    showProgress: true,
                    primaryColor: 'var(--accent)',
                    backgroundColor: 'var(--bg-elevated)',
                    textColor: 'var(--text)',
                    arrowColor: 'var(--bg-elevated)',
                    overlayColor: 'rgba(0, 0, 0, 0.6)',
                }}
            />
            <Topbar
                title={t('navigation.export')}
                actions={
                    <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                        {t('tutorial.export_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <div data-tour="export-rubric" className="card" style={{ marginBottom: 20 }}>
                    <div className="form-group" style={{ marginBottom: 16 }}>
                        <label>{t('exportPage.select_rubric')}</label>
                        <select
                            value={selectedRubricId}
                            onChange={(e) => {
                                setSelectedRubricId(e.target.value);
                                setSelectedStudentIds(new Set());
                                setOrientation(undefined);
                            }}
                        >
                            {rubrics.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Word export template selector */}
                    <div data-tour="export-template" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 8,
                            }}
                        >
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                }}
                            >
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
                                onChange={(e) => updateSettings({ exportTemplateId: e.target.value || undefined })}
                            >
                                <option value="">{t('exportPage.template_default_option')}</option>
                                {exportTemplates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} ({t.levelHeaders.length} levels)
                                    </option>
                                ))}
                            </select>
                            {activeTemplate && (
                                <button
                                    className="btn btn-ghost btn-icon btn-sm"
                                    title="Clear template"
                                    onClick={() => updateSettings({ exportTemplateId: undefined })}
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        {exportTemplates.length === 0 ? (
                            <div
                                className="text-muted text-xs"
                                style={{
                                    marginTop: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 6,
                                }}
                            >
                                <span>
                                    {t('exportPage.no_templates_help_prefix', 'No templates saved. Upload one in')}{' '}
                                    <strong>
                                        {t('exportPage.no_templates_help_location', 'Settings → Export Templates')}
                                    </strong>
                                    .
                                </span>
                                <a
                                    href="sample-template.docx"
                                    download="sample-template.docx"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    style={{
                                        padding: '0 6px',
                                        height: 20,
                                        display: 'inline-flex',
                                        alignSelf: 'center',
                                        alignItems: 'center',
                                        gap: 4,
                                        textDecoration: 'none',
                                        color: 'var(--accent)',
                                    }}
                                >
                                    <Download size={10} /> {t('exportPage.download_sample')}
                                </a>
                            </div>
                        ) : (
                            <div
                                className="text-muted text-xs"
                                style={{
                                    marginTop: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: 6,
                                }}
                            >
                                <a
                                    href="sample-template.docx"
                                    download="sample-template.docx"
                                    className="btn btn-ghost btn-icon btn-sm"
                                    style={{
                                        padding: '0 6px',
                                        height: 20,
                                        display: 'inline-flex',
                                        alignSelf: 'center',
                                        alignItems: 'center',
                                        gap: 4,
                                        textDecoration: 'none',
                                        color: 'var(--accent)',
                                    }}
                                >
                                    <Download size={10} /> {t('exportPage.download_sample')}
                                </a>
                            </div>
                        )}
                    </div>

                    {/* CSV export */}
                    <div
                        data-tour="export-grades"
                        style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    fontWeight: 600,
                                    fontSize: '0.88rem',
                                }}
                            >
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
                    <div className="empty-state">
                        <FileText size={32} />
                        <p>{t('exportPage.no_rubric')}</p>
                    </div>
                ) : gradedStudents.length === 0 ? (
                    <div className="empty-state">
                        <Users size={32} />
                        <p>{t('exportPage.no_students')}</p>
                    </div>
                ) : (
                    <>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: 14,
                            }}
                        >
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                                    {selectedStudentIds.size === gradedStudents.length ? (
                                        <CheckSquare size={15} />
                                    ) : (
                                        <Square size={15} />
                                    )}
                                    {selectedStudentIds.size === gradedStudents.length
                                        ? t('exportPage.deselect_all')
                                        : t('exportPage.select_all')}
                                </button>
                                <span className="text-muted text-sm">
                                    {t('exportPage.selected_count', {
                                        count: selectedStudentIds.size,
                                        total: gradedStudents.length,
                                    })}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 10 }}>
                                    <label
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            marginLeft: 6,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer',
                                            color: 'var(--text-muted)',
                                        }}
                                        title="Adds to blank page so each student starts on a new physical sheet"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={padForDoubleSided}
                                            onChange={(e) => setPadForDoubleSided(e.target.checked)}
                                        />
                                        {t('exportPage.pad_double_sided')}
                                    </label>
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            marginLeft: 12,
                                            borderLeft: '1px solid var(--border)',
                                            paddingLeft: 12,
                                        }}
                                    >
                                        <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            {t('rubricBuilder.format_orientation')}:
                                        </label>
                                        <select
                                            value={orientation || rubric.format.orientation || 'portrait'}
                                            onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
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
                            <div
                                style={{
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    borderRadius: 8,
                                    padding: '10px 14px',
                                    marginBottom: 12,
                                    display: 'flex',
                                    gap: 10,
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                    {selectedStudentIds.size} selected —
                                </span>
                                <button className="btn btn-secondary btn-sm" onClick={handleBulkMarkNHI}>
                                    <XCircle size={13} /> {t('exportPage.bulk_nhi')}
                                </button>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => setShowBulkComment((v) => !v)}
                                >
                                    <MessageSquare size={13} /> {t('exportPage.bulk_add_comment')}
                                </button>
                                {showBulkComment && (
                                    <div
                                        style={{
                                            display: 'flex',
                                            gap: 8,
                                            alignItems: 'center',
                                            flex: 1,
                                            minWidth: 260,
                                        }}
                                    >
                                        <input
                                            type="text"
                                            value={bulkCommentText}
                                            onChange={(e) => setBulkCommentText(e.target.value)}
                                            placeholder={t('exportPage.bulk_comment_placeholder')}
                                            style={{ flex: 1 }}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleBulkComment();
                                            }}
                                            autoFocus
                                        />
                                        <button
                                            className="btn btn-primary btn-sm"
                                            onClick={handleBulkComment}
                                            disabled={!bulkCommentText.trim()}
                                        >
                                            {t('exportPage.bulk_comment_confirm')}
                                        </button>
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            aria-label={t('common.close')}
                                            onClick={() => setShowBulkComment(false)}
                                        >
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
                                        <tr
                                            key={student.id}
                                            onClick={() => toggleStudent(student.id)}
                                            style={{ cursor: 'pointer' }}
                                        >
                                            <td onClick={(e) => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleStudent(student.id)}
                                                />
                                            </td>
                                            <td style={{ fontWeight: 500 }}>
                                                {student.name}
                                                {sr.feedbackOnly && (
                                                    <span
                                                        style={{
                                                            marginLeft: 8,
                                                            fontSize: '0.7rem',
                                                            background: '#fef3c7',
                                                            color: '#92400e',
                                                            border: '1px solid #fcd34d',
                                                            borderRadius: 4,
                                                            padding: '1px 6px',
                                                            fontWeight: 600,
                                                            verticalAlign: 'middle',
                                                        }}
                                                    >
                                                        {t('exportPage.feedback_only_badge')}
                                                    </span>
                                                )}
                                                {sr.isAnchor && (
                                                    <span
                                                        style={{
                                                            marginLeft: 6,
                                                            fontSize: '0.7rem',
                                                            background: '#ede9fe',
                                                            color: '#6d28d9',
                                                            border: '1px solid #c4b5fd',
                                                            borderRadius: 4,
                                                            padding: '1px 6px',
                                                            fontWeight: 600,
                                                            verticalAlign: 'middle',
                                                        }}
                                                    >
                                                        {t('exportPage.anchor_badge')}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span
                                                    className="grade-chip"
                                                    style={{
                                                        background: summary.gradeColor + '22',
                                                        color: summary.gradeColor,
                                                        border: `1.5px solid ${summary.gradeColor}`,
                                                        minWidth: 36,
                                                        height: 36,
                                                        fontSize: '1rem',
                                                    }}
                                                >
                                                    {summary.letterGrade}
                                                </span>
                                            </td>
                                            <td>
                                                {summary.modifiedPercentage.toFixed(1)}% ({summary.rawScore}/
                                                {summary.maxRawScore})
                                            </td>
                                            <td>
                                                <div className="progress-bar" style={{ width: 120 }}>
                                                    <div
                                                        className="progress-bar-fill"
                                                        style={{
                                                            width: `${(summary.gradedCount / Math.max(summary.totalCriteria, 1)) * 100}%`,
                                                        }}
                                                    />
                                                </div>
                                                <div className="text-xs text-muted">
                                                    {summary.gradedCount}/{summary.totalCriteria}
                                                </div>
                                            </td>
                                            <td
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ display: 'flex', gap: 6, alignItems: 'center' }}
                                            >
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => handleExport(student.id)}
                                                    disabled={exporting}
                                                >
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

            {/* ── Essay export ──────────────────────────────────────────────────── */}
            <div className="card" style={{ marginTop: 24 }} data-tour="export-essays">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <FileText size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{t('exportPage.essays_title')}</h3>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>{t('exportPage.essays_select_assignment')}</label>
                    <select
                        value={essayTeacherKey}
                        onChange={(e) => {
                            setEssayTeacherKey(e.target.value);
                            setSelectedEssayStudentIds(new Set());
                        }}
                    >
                        <option value="">{t('exportPage.essays_select_assignment_placeholder')}</option>
                        {essayGroups.map((g) => (
                            <option key={g.teacherKey} value={g.teacherKey}>
                                {g.title}
                            </option>
                        ))}
                    </select>
                </div>

                {essayTeacherKey && (
                    <>
                        {essaySubmittedEntries.length === 0 ? (
                            <p className="text-muted text-sm">{t('exportPage.essays_no_submissions')}</p>
                        ) : (
                            <div style={{ marginBottom: 12 }}>
                                <button
                                    className="btn btn-ghost btn-sm"
                                    onClick={toggleAllEssayStudents}
                                    style={{ marginBottom: 8 }}
                                >
                                    {selectedEssayStudentIds.size === essaySubmittedEntries.length ? (
                                        <CheckSquare size={13} />
                                    ) : (
                                        <Square size={13} />
                                    )}{' '}
                                    {t('exportPage.select_all')}
                                </button>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {essaySubmittedEntries.map(({ student }) => (
                                        <label
                                            key={student.id}
                                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={selectedEssayStudentIds.has(student.id)}
                                                onChange={() => toggleEssayStudent(student.id)}
                                            />
                                            {student.name}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div
                            style={{
                                display: 'flex',
                                gap: 16,
                                flexWrap: 'wrap',
                                alignItems: 'flex-end',
                                marginBottom: 12,
                            }}
                        >
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.8rem' }}>{t('exportPage.essays_format')}</label>
                                <select
                                    value={essayFormat}
                                    onChange={(e) => setEssayFormat(e.target.value as typeof essayFormat)}
                                >
                                    <option value="pdf">PDF</option>
                                    <option value="docx">DOCX</option>
                                    <option value="markdown">Markdown</option>
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label style={{ fontSize: '0.8rem' }}>{t('exportPage.essays_batch_mode')}</label>
                                <select
                                    value={essayBatchMode}
                                    onChange={(e) => setEssayBatchMode(e.target.value as typeof essayBatchMode)}
                                    disabled={includeRubricAnalysis}
                                >
                                    <option value="separate">{t('exportPage.essays_mode_separate')}</option>
                                    <option value="combined">{t('exportPage.essays_mode_combined')}</option>
                                </select>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                <input
                                    type="checkbox"
                                    checked={includeRubricAnalysis}
                                    disabled={essayFormat === 'markdown'}
                                    onChange={(e) => setIncludeRubricAnalysis(e.target.checked)}
                                />
                                {t('exportPage.essays_include_rubric_analysis')}
                            </label>
                        </div>

                        <button
                            className="btn btn-primary btn-sm"
                            disabled={exportingEssays || selectedEssayStudentIds.size === 0}
                            onClick={handleEssayExport}
                        >
                            {exportingEssays ? <Loader size={13} className="spin" /> : <Download size={13} />}
                            {t('exportPage.essays_export_button')}
                        </button>
                    </>
                )}
            </div>

            {/* ── Period / Report Card Generator ─────────────────────────────── */}
            <div className="card" style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <ClipboardList size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                        {t('exportPage.period_report_title')}
                    </h3>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t('exportPage.period_report_help')}
                </p>

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.8rem' }}>{t('exportPage.period_class')}</label>
                        <select
                            value={reportClassId}
                            onChange={(e) => {
                                setReportClassId(e.target.value);
                                setReportStudentIds(new Set());
                            }}
                        >
                            <option value="">{t('exportPage.period_select_class')}</option>
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: '1 1 130px', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.8rem' }}>{t('exportPage.period_from')}</label>
                        <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 130px', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.8rem' }}>{t('exportPage.period_to')}</label>
                        <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
                    </div>
                    <div className="form-group" style={{ flex: '1 1 160px', marginBottom: 0 }}>
                        <label style={{ fontSize: '0.8rem' }}>{t('exportPage.period_label_field')}</label>
                        <input
                            type="text"
                            value={reportPeriodLabel}
                            onChange={(e) => setReportPeriodLabel(e.target.value)}
                            placeholder={t('exportPage.period_label_placeholder')}
                        />
                    </div>
                </div>

                {/* Student selector for this class */}
                {reportClassId &&
                    (() => {
                        const classStudents = students.filter((s) => s.classId === reportClassId);
                        if (classStudents.length === 0)
                            return (
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                    {t('exportPage.period_no_students')}
                                </p>
                            );
                        const allSelected = classStudents.every((s) => reportStudentIds.has(s.id));
                        return (
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={() =>
                                            setReportStudentIds(
                                                allSelected ? new Set() : new Set(classStudents.map((s) => s.id))
                                            )
                                        }
                                    >
                                        {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                        {allSelected ? t('exportPage.deselect_all') : t('exportPage.select_all')}
                                    </button>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                        {reportStudentIds.size} / {classStudents.length} {t('exportPage.selected')}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {classStudents.map((s) => (
                                        <button
                                            key={s.id}
                                            className={`btn btn-sm ${reportStudentIds.has(s.id) ? 'btn-primary' : 'btn-secondary'}`}
                                            onClick={() =>
                                                setReportStudentIds((prev) => {
                                                    const n = new Set(prev);
                                                    if (n.has(s.id)) n.delete(s.id);
                                                    else n.add(s.id);
                                                    return n;
                                                })
                                            }
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })()}

                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        className="btn btn-primary"
                        disabled={reportStudentIds.size === 0 || generatingReport}
                        onClick={handleGeneratePeriodReports}
                    >
                        {generatingReport ? <Loader size={14} className="spin" /> : <Download size={14} />}
                        {t('exportPage.period_generate_btn', { count: reportStudentIds.size })}
                    </button>
                </div>
            </div>

            {/* ── Report Card Generator ──────────────────────────────────────── */}
            <div className="card" style={{ marginTop: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <ClipboardList size={16} style={{ color: 'var(--accent)' }} aria-hidden="true" />
                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{t('reportCard.title')}</h3>
                </div>
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {t('reportCard.help')}
                </p>
                <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {t('reportCard.uses_period_picker')}
                </p>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                    {(
                        [
                            ['includeRubrics', 'reportCard.section_rubrics'],
                            ['includeStandards', 'reportCard.section_standards'],
                            ['includeLearningGoals', 'reportCard.section_learning_goals'],
                            ['includeCefr', 'reportCard.section_cefr'],
                            ['includeTestSummary', 'reportCard.section_test_summary'],
                        ] as const
                    ).map(([key, labelKey]) => (
                        <label
                            key={key}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={reportCardConfig[key]}
                                onChange={(e) => setReportCardConfig((prev) => ({ ...prev, [key]: e.target.checked }))}
                            />
                            {t(labelKey)}
                        </label>
                    ))}
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                    <button
                        className="btn btn-secondary"
                        disabled={reportStudentIds.size !== 1 || generatingReportCard}
                        onClick={() => {
                            const [only] = reportStudentIds;
                            if (only) void handleGenerateReportCard(only);
                        }}
                    >
                        {generatingReportCard ? <Loader size={14} className="spin" /> : <Download size={14} />}
                        {t('reportCard.generate_single_btn')}
                    </button>
                    <button
                        className="btn btn-primary"
                        disabled={reportStudentIds.size === 0 || generatingReportCard}
                        onClick={handleGenerateReportCardsBatch}
                    >
                        {generatingReportCard ? <Loader size={14} className="spin" /> : <Download size={14} />}
                        {t('reportCard.generate_batch_btn', { count: reportStudentIds.size })}
                    </button>
                </div>
            </div>
        </>
    );
}
