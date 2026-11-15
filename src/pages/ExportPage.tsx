import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { saveAs } from 'file-saver';
import { CSV_UNPARSE_OPTIONS } from '../utils/csvOptions';
import { csvDate, downloadCsv, uniqueColumnLabels } from '../utils/csvDownload';
import { logAuditEvent } from '../services/database/AuditLogger';
import { storageSync } from '../services/database';
import PageTour from '../components/Tour/PageTour';
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
    ExternalLink,
    CalendarDays,
    GraduationCap,
    ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Topbar from '../components/Layout/Topbar';
import ClassFilterChips from '../components/ui/ClassFilterChips';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { useToast } from '../hooks/useToast';
import { calcGradeSummary } from '../utils/gradeCalc';
import { getStudentGoalScores } from '../utils/learningGoalsAggregator';
import { encodeFeedbackCode } from '../utils/shareCode';
import { sanitizeFilename } from '../utils/exportDataPrep';
import { localDayWindow } from '../utils/dateInput';
import type { ReportCardConfig, Student, StudentRubric } from '../types';
import {
    buildGradebookPresetCsv,
    GRADEBOOK_PRESET_IDS,
    type DecimalSeparator,
    type GradebookPresetId,
} from '../utils/gradebookExportPresets';
import ExamBookletExportPanel from '../components/Tests/ExamBookletExportPanel';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { useConfirm } from '../hooks/useConfirm';
import { EmptyState } from '../components/ui/EmptyState';
import { useRubricPool, useTestPool } from '../hooks/useMaterialPool';

/** `Class A_period_reports.zip` for a named class, otherwise undefined so the export module names the zip. */
function classZipName(className: string | undefined, kind: string): string | undefined {
    return className ? `${sanitizeFilename(className)}_${kind}.zip` : undefined;
}

type ExportType = 'rubric' | 'reports' | 'exam' | 'essays';

/** One selectable export type above the workbench. */
function ExportTypeCard({
    icon: Icon,
    title,
    description,
    meta,
    active,
    onSelect,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    meta: string;
    active: boolean;
    onSelect: () => void;
}) {
    return (
        <button type="button" className="export-type-card" aria-pressed={active} onClick={onSelect}>
            <span className="export-type-icon">
                <Icon size={17} aria-hidden="true" />
            </span>
            <span className="export-type-copy">
                <strong>{title}</strong>
                <small>{description}</small>
                <span className="export-type-meta">{meta}</span>
            </span>
        </button>
    );
}

export default function ExportPage() {
    const { t } = useTranslation();
    const {
        students: allStudents,
        classes,
        studentRubrics: allStudentRubrics,
        rubrics: ownRubrics,
        gradeScales,
        exportTemplates,
        selfAssessments,
        analysisResults,
        tests: ownTests,
        studentTests,
        essayAssignments,
        essaySubmissions,
        settings,
    } = useStoreSelector((s) => ({
        students: s.students,
        classes: s.classes,
        studentRubrics: s.studentRubrics,
        rubrics: s.rubrics,
        gradeScales: s.gradeScales,
        exportTemplates: s.exportTemplates,
        selfAssessments: s.selfAssessments,
        analysisResults: s.analysisResults,
        tests: s.tests,
        studentTests: s.studentTests,
        essayAssignments: s.essayAssignments,
        essaySubmissions: s.essaySubmissions,
        settings: s.settings,
    }));
    // A co-teacher exports grades/results given with the class owner's rubric/test too — merge in
    // colleague material (shared, or used in a co-taught class) alongside the teacher's own library.
    const { rubrics } = useRubricPool(ownRubrics);
    const { tests } = useTestPool(ownTests);
    // The roster domain hooks filtered soft-deleted rows; keep that behavior here.
    const students = useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);
    const studentRubrics = useMemo(() => allStudentRubrics.filter((sr) => !sr.deletedAt), [allStudentRubrics]);
    const { saveStudentRubric, updateSettings } = useStoreActions();

    const { showToast } = useToast();
    const { confirm, dialogProps: confirmDialogProps } = useConfirm();
    const navigate = useNavigate();
    // ?rubric= carries the rubric the teacher opened this page for (card/editor/queue); without it
    // the page would silently export whichever rubric happens to sort first.
    const [searchParams] = useSearchParams();
    const rubricParam = searchParams.get('rubric');
    const classParam = searchParams.get('class');
    const [selectedRubricId, setSelectedRubricId] = useState(rubricParam ?? rubrics[0]?.id ?? '');
    // useRubricPool's colleague rubrics arrive asynchronously, after this state's initial value is
    // already locked in — a co-teacher with no own rubrics would otherwise be stuck on '' forever,
    // even once their only selectable rubric (a colleague's) loads. Recomputed every render instead.
    const activeRubricId = rubrics.some((r) => r.id === selectedRubricId) ? selectedRubricId : (rubrics[0]?.id ?? '');
    const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);
    const [activeExportType, setActiveExportType] = useState<ExportType>('rubric');
    const [hasOpenedExam, setHasOpenedExam] = useState(false);
    const [reportOutput, setReportOutput] = useState<'period' | 'card'>('period');
    const [selectedTestId, setSelectedTestId] = useState(tests[0]?.id ?? '');
    const selectedTest = tests.find((tst) => tst.id === selectedTestId) ?? tests[0];

    const rubric = rubrics.find((r) => r.id === activeRubricId);

    const [gradebookPreset, setGradebookPreset] = useState<GradebookPresetId>('generic');
    // Magister and SOMtoday are Dutch systems, whose Excel reads 7,5 and treats 7.5 as text.
    const [gradebookDecimal, setGradebookDecimal] = useState<DecimalSeparator>('comma');
    const [padForDoubleSided, setPadForDoubleSided] = useState(false);
    const [orientation, setOrientation] = useState<'portrait' | 'landscape' | undefined>(undefined);
    const [showBulkComment, setShowBulkComment] = useState(false);
    const [bulkCommentText, setBulkCommentText] = useState('');

    // ── Period report state ────────────────────────────────────────────────────
    // F15: start on the globally selected class so Export agrees with the Topbar selector.
    const [reportClassId, setReportClassId] = useState(classParam ?? settings.activeClassId ?? '');
    const reportClassStudents = useMemo(
        () => students.filter((s) => s.classId === reportClassId),
        [students, reportClassId]
    );
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

    const tableTemplates = exportTemplates.filter((t) => t.kind !== 'style');
    const styleTemplates = exportTemplates.filter((t) => t.kind === 'style');

    const activeTemplateId = settings.exportTemplateId ?? '';
    const activeTemplate = tableTemplates.find((t) => t.id === activeTemplateId) ?? null;
    const activeStyleTemplateId = settings.styleTemplateId ?? '';
    const activeStyleTemplate = styleTemplates.find((t) => t.id === activeStyleTemplateId) ?? undefined;
    const classNameById = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);

    const resolvedScaleId = rubric?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale =
        resolvedScaleId && resolvedScaleId !== 'none'
            ? (gradeScales.find((g) => g.id === resolvedScaleId) ?? null)
            : null;

    const gradedStudents = studentRubrics
        .filter((sr) => sr.rubricId === activeRubricId)
        .map((sr) => {
            const r = sr.rubricSnapshot || rubric;
            return {
                sr,
                student: students.find((s) => s.id === sr.studentId),
                summary: r ? calcGradeSummary(sr, r.criteria, scale, r) : null,
            };
        })
        // ?class= narrows the rubric's rows to the class the link was about, so "Select all" and the
        // CSV/PDF/DOCX exports can't pull in another class that happens to hold the same rubric.
        .filter((x) => x.student && x.summary && (!classParam || x.student.classId === classParam));

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

    // Build a self-contained /feedback/:code link, inlining any bucket-stored voice audio as
    // signed URLs first. Shared by the copy-link and dev-preview controls so both stay in sync.
    async function buildFeedbackUrl(sr: StudentRubric, student: Student): Promise<string | null> {
        // v8 ignore next 1 -- the copy-link / dev-preview buttons only render inside the rubric table
        if (!rubric) return null;
        const preparedSr = await storageSync.feedbackAudioSync.inlineForShare(sr);
        const code = encodeFeedbackCode({ sr: preparedSr, rubric, student, scale });
        return `${window.location.origin}${window.location.pathname}#/feedback/${code}`;
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
        // v8 ignore next 1 -- disabled when nothing is selected; switching keys clears the selection
        if (toExport.length === 0) return;
        setExportingEssays(true);
        try {
            let exportedCount = 0;
            const skippedNames: string[] = [];
            if (includeRubricAnalysis && (essayFormat === 'docx' || essayFormat === 'pdf')) {
                const { exportEssaysWithRubricBatch } = await import('../utils/essayExport');
                const items: import('../utils/essayExport').EssayWithRubricEntry[] = [];
                for (const { assignment, student, submission } of toExport) {
                    const sr = studentRubrics.find(
                        (s) => s.rubricId === assignment.rubricId && s.studentId === assignment.studentId
                    );
                    const essayRubric = rubrics.find((r) => r.id === assignment.rubricId);
                    if (!sr || !essayRubric) {
                        skippedNames.push(student.name);
                        continue;
                    }
                    // v8 ignore next 1 -- gradeScaleId is required on Rubric, so the fallback is unreachable
                    const essayScaleId = essayRubric.gradeScaleId ?? settings.defaultGradeScaleId;
                    const essayScale =
                        essayScaleId && essayScaleId !== 'none'
                            ? (gradeScales.find((g) => g.id === essayScaleId) ?? null)
                            : null;
                    const analysis = analysisResults.find(
                        (ar) => ar.studentId === student.id && ar.rubricId === essayRubric.id
                    );
                    items.push({
                        assignment,
                        student,
                        submission,
                        studentRubric: sr,
                        rubric: essayRubric,
                        scale: essayScale,
                        analysis,
                    });
                }
                // One zip / one print job for the whole selection: a download or dialog per student is
                // what made the browser drop or prompt for every file after the first (#701).
                await exportEssaysWithRubricBatch(
                    items,
                    essayFormat,
                    activeStyleTemplate,
                    toExport[0] ? `${sanitizeFilename(toExport[0].assignment.title)}_with_rubric.zip` : undefined
                );
                exportedCount = items.length;
                if (skippedNames.length > 0) {
                    showToast(t('exportPage.essays_skipped_ungraded', { names: skippedNames.join(', ') }), 'error');
                }
            } else {
                const { exportEssaysBatch } = await import('../utils/essayExport');
                await exportEssaysBatch(toExport, essayFormat, essayBatchMode, activeStyleTemplate);
                exportedCount = toExport.length;
            }
            logAuditEvent('export', `export_essays_${essayFormat}`, 'essay', essayTeacherKey, {
                count: exportedCount,
            });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExportingEssays(false);
        }
    }

    async function handleIcsExport() {
        try {
            const dedup = new Map<string, { title: string; expiresAt: string }>();
            for (const a of essayAssignments) {
                if (a.expiresAt && !dedup.has(a.teacherKey)) {
                    dedup.set(a.teacherKey, { title: a.title, expiresAt: a.expiresAt });
                }
            }
            if (dedup.size === 0) {
                showToast(t('exportPage.ics_export_none'), 'error');
                return;
            }
            const { buildIcs } = await import('../utils/icsExport');
            const ics = buildIcs(
                Array.from(dedup.entries()).map(([teacherKey, { title, expiresAt }]) => ({
                    uid: `essay-${teacherKey}@rubricmaker`,
                    title,
                    dueDate: expiresAt,
                }))
            );
            saveAs(new Blob([ics], { type: 'text/calendar;charset=utf-8;' }), 'essay_deadlines.ics');
            logAuditEvent('export', 'export_ics', 'essay', 'all', { count: dedup.size });
        } catch {
            showToast(t('toast.export_error'), 'error');
        }
    }

    async function handleExport(single?: string) {
        // v8 ignore next 1 -- the export buttons are disabled whenever rubric is missing
        if (!rubric) return;
        setExporting(true);
        try {
            if (single) {
                const sr = studentRubrics.find((s) => s.rubricId === rubric.id && s.studentId === single);
                const student = students.find((s) => s.id === single);
                // v8 ignore next 1 -- row-level PDF buttons only exist for graded rows, so sr/student always exist
                if (sr && student) {
                    const { exportSinglePdf } = await import('../utils/pdfExport');
                    await exportSinglePdf(sr, rubric, student, scale, {
                        /* v8 ignore next 1 */
                        orientation: orientation || rubric.format.orientation || 'portrait',
                        styleTemplate: activeStyleTemplate,
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
                    /* v8 ignore next 1 */
                    orientation: orientation || rubric.format.orientation || 'portrait',
                    styleTemplate: activeStyleTemplate,
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
        // v8 ignore next 1 -- the batch-docx button is disabled without a rubric or selection
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
        // v8 ignore next 1 -- the word-export button is disabled without a rubric
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
        // v8 ignore next 1 -- the CSV button is disabled without a rubric or selection
        if (!rubric) return;

        const toExport = gradedStudents.filter((x) => selectedStudentIds.has(x.student!.id));

        // v8 ignore next 1 -- disabled whenever nothing is selected
        if (toExport.length === 0) return;

        const preset = buildGradebookPresetCsv(
            gradebookPreset,
            toExport.map(({ student, summary }) => ({
                studentName: student!.name,
                studentNumber: student!.studentNumber || '',
                percentage: summary!.modifiedPercentage,
                grade: summary!.letterGrade,
            })),
            gradebookDecimal
        );
        if (preset !== null) {
            downloadCsv(preset.csv, `${sanitizeFilename(rubric.name)}_${gradebookPreset}_grades.csv`);
            if (preset.missingNumberCount > 0)
                showToast(t('exportPage.csv_missing_student_numbers', { count: preset.missingNumberCount }), 'warning');
            if (preset.blankGradeCount > 0)
                showToast(t('exportPage.csv_grades_blank', { count: preset.blankGradeCount }), 'warning');
            logAuditEvent('export', 'export_csv', 'rubric', rubric.id, {
                count: toExport.length,
                preset: gradebookPreset,
            });
            return;
        }

        const criterionLabels = uniqueColumnLabels(
            rubric.criteria.map((c) => c.title),
            (position) => `#${position}`
        );
        const data = toExport.map(({ sr, student, summary }) => {
            const row: Record<string, string | number> = {
                'Student Name': student!.name,
                Email: student!.email || '',
                'Rubric Name': rubric.name,
                'Date Graded': csvDate(sr.gradedAt),
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

            rubric.criteria.forEach((c, ci) => {
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

                row[`Criterion: ${criterionLabels[ci]} (Score)`] = score;
                row[`Criterion: ${criterionLabels[ci]} (Comment)`] = entry?.comment || '';
            });

            return row;
        });

        const Papa = await import('papaparse');
        const csv = Papa.unparse(data, CSV_UNPARSE_OPTIONS);
        downloadCsv(csv, `${sanitizeFilename(rubric.name)}_grades.csv`);
        logAuditEvent('export', 'export_csv', 'rubric', rubric.id, { count: toExport.length });
    }

    async function handleBulkMarkNHI() {
        const targets = gradedStudents.filter(({ sr }) => selectedStudentIds.has(sr.studentId));
        if (targets.length === 0) return;
        const ok = await confirm({
            title: t('exportPage.bulk_nhi_confirm_title'),
            message: t('exportPage.bulk_nhi_confirm_message', { count: targets.length }),
            confirmLabel: t('exportPage.bulk_nhi'),
            cancelLabel: t('common.cancel'),
            danger: true,
        });
        if (!ok) return;
        const now = new Date().toISOString();
        // Keep the original grade date: it drives "Date graded", period reports and recent activity.
        targets.forEach(({ sr }) => saveStudentRubric({ ...sr, notHandedIn: true, gradedAt: sr.gradedAt ?? now }));
        showToast(t('exportPage.bulk_nhi_done', { count: targets.length }), 'success');
        setSelectedStudentIds(new Set());
    }

    function handleBulkComment() {
        if (!bulkCommentText.trim()) return;
        const targets = gradedStudents.filter(({ sr }) => selectedStudentIds.has(sr.studentId));
        targets.forEach(({ sr }) => {
            const current = sr.overallComment || '';
            const spacer = current && !current.endsWith(' ') ? ' ' : '';
            saveStudentRubric({ ...sr, overallComment: current + spacer + bulkCommentText });
        });
        showToast(t('exportPage.bulk_comment_done', { count: targets.length }), 'success');
        setBulkCommentText('');
        setShowBulkComment(false);
    }

    function gatherPeriodEntries(studentId: string) {
        // Both pickers are calendar days in the teacher's own zone; see localDayWindow().
        const { fromTs, toTs } = localDayWindow(reportDateFrom, reportDateTo);
        const srs = studentRubrics.filter(
            (sr) =>
                sr.studentId === studentId &&
                sr.gradedAt &&
                !sr.isPeerReview &&
                !sr.notHandedIn &&
                new Date(sr.gradedAt).getTime() >= fromTs &&
                new Date(sr.gradedAt).getTime() < toTs
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
        const { fromTs, toTs } = localDayWindow(reportDateFrom, reportDateTo);
        const periodStudentTests = studentTests.filter((st) => {
            if (st.studentId !== studentId || st.status !== 'graded') return false;
            const at = st.gradedAt ?? st.submittedAt;
            if (!at) return false;
            const ts = new Date(at).getTime();
            return ts >= fromTs && ts < toTs;
        });
        const testIds = new Set(periodStudentTests.map((st) => st.testId));
        const periodTests = tests.filter((test) => testIds.has(test.id));
        return { tests: periodTests, studentTests: periodStudentTests };
    }

    async function handleGeneratePeriodReports() {
        // v8 ignore next 1 -- the generate button is disabled with no selection
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
                    /* v8 ignore next 1 -- reportClassId always matches a class from the select options */
                    className: cls?.name ?? '',
                    entries,
                    periodLabel: reportPeriodLabel || undefined,
                    goals: getStudentGoalScores(student.id, srs, rubrics),
                };
            });

            await exportPeriodReportsBatch(inputs, activeStyleTemplate, classZipName(cls?.name, 'period_reports'));
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
            /* v8 ignore next 1 -- reportClassId always matches a class from the select options */
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
            // v8 ignore next 1 -- reportStudentIds always reference real students
            if (!student) return;
            const { exportReportCard } = await import('../utils/periodReportExport');
            const data = await buildReportCardDataForStudent(student);
            await exportReportCard(data, activeStyleTemplate);
            logAuditEvent('export', 'export_report_card', 'student', studentId, { count: 1 });
            showToast(t('exportPage.report_card_success', { count: 1 }), 'success');
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setGeneratingReportCard(false);
        }
    }

    async function handleGenerateReportCardsBatch() {
        // v8 ignore next 1 -- the batch button is disabled with no selection
        if (reportStudentIds.size === 0) return;
        setGeneratingReportCard(true);
        try {
            const classStudents = students.filter((s) => s.classId === reportClassId && reportStudentIds.has(s.id));
            const { exportReportCardsBatch } = await import('../utils/periodReportExport');
            const dataList = await Promise.all(classStudents.map((student) => buildReportCardDataForStudent(student)));
            const cls = classes.find((c) => c.id === reportClassId);
            await exportReportCardsBatch(dataList, activeStyleTemplate, classZipName(cls?.name, 'report_cards'));
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
            <PageTour
                steps={exportTourSteps}
                run={tourRun}
                onFinish={() => setTourRun(false)}
                onStartRequest={() => {
                    setActiveExportType('rubric');
                    setTourRun(true);
                }}
            />
            <Topbar
                title={t('navigation.export')}
                actions={
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                            setActiveExportType('rubric');
                            setTourRun(true);
                        }}
                    >
                        {t('tutorial.export_tour_button')}
                    </button>
                }
            />
            <div className="page-content fade-in">
                <div className="export-desk">
                    <div>
                        <p className="export-eyebrow">{t('exportPage.desk_eyebrow')}</p>
                        <h2 className="export-title">{t('exportPage.desk_title')}</h2>
                        <p className="export-lede">{t('exportPage.desk_lede')}</p>
                    </div>
                    <div className="export-stats" aria-label={t('exportPage.desk_summary')}>
                        {[
                            { value: gradedStudents.length, label: t('exportPage.desk_stat_graded') },
                            { value: classes.length, label: t('exportPage.desk_stat_classes') },
                            { value: exportTemplates.length, label: t('exportPage.desk_stat_templates') },
                        ].map((stat) => (
                            <div className="export-stat" key={stat.label}>
                                <strong>{stat.value}</strong>
                                <span>{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="export-type-grid" role="group" aria-label={t('exportPage.type_group_label')}>
                    <ExportTypeCard
                        icon={FileText}
                        title={t('exportPage.rubric_section_title')}
                        description={t('exportPage.type_rubric_desc')}
                        meta={t('exportPage.type_meta_graded', { count: gradedStudents.length })}
                        active={activeExportType === 'rubric'}
                        onSelect={() => setActiveExportType('rubric')}
                    />
                    <ExportTypeCard
                        icon={GraduationCap}
                        title={t('exportPage.period_report_title')}
                        description={t('exportPage.type_reports_desc')}
                        meta={t('exportPage.type_meta_classes', { count: classes.length })}
                        active={activeExportType === 'reports'}
                        onSelect={() => setActiveExportType('reports')}
                    />
                    <ExportTypeCard
                        icon={ClipboardList}
                        title={t('tests.export.exam.section_title')}
                        description={t('exportPage.type_exam_desc')}
                        meta={t('exportPage.type_meta_tests', { count: tests.length })}
                        active={activeExportType === 'exam'}
                        onSelect={() => {
                            setActiveExportType('exam');
                            setHasOpenedExam(true);
                        }}
                    />
                    <ExportTypeCard
                        icon={Layout}
                        title={t('exportPage.essays_title')}
                        description={t('exportPage.type_essays_desc')}
                        meta={t('exportPage.type_meta_assignments', { count: essayGroups.length })}
                        active={activeExportType === 'essays'}
                        onSelect={() => setActiveExportType('essays')}
                    />
                </div>

                <section
                    className="export-workbench"
                    aria-labelledby="export-wb-rubric"
                    style={{ display: activeExportType === 'rubric' ? undefined : 'none' }}
                >
                    <div className="export-workbench-head">
                        <span className="export-type-icon">
                            <FileText size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="export-wb-rubric">{t('exportPage.rubric_workbench_title')}</h2>
                            <p>{t('exportPage.rubric_workbench_desc')}</p>
                        </div>
                        <span className="badge badge-green">
                            {t('exportPage.type_meta_graded', { count: gradedStudents.length })}
                        </span>
                    </div>

                    <div className="export-workbench-body">
                        <div className="export-panel" data-tour="export-rubric">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.source_label')}</h3>
                                <span className="badge badge-blue">
                                    {t('rubricList.criteria_badge', { count: rubric?.criteria.length ?? 0 })}
                                </span>
                            </div>

                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label htmlFor="export-rubric-select">{t('exportPage.select_rubric')}</label>
                                <select
                                    id="export-rubric-select"
                                    value={activeRubricId}
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

                            <div className="export-panel-head">
                                <h3>{t('exportPage.output_label')}</h3>
                            </div>

                            <div className="export-output-row" data-tour="export-template">
                                <span className="export-output-icon">
                                    <Layout size={15} aria-hidden="true" />
                                </span>
                                <div className="export-output-copy">
                                    <strong>{t('exportPage.word_document_title')}</strong>
                                    <small>{t('exportPage.word_document_help')}</small>
                                    <div className="export-output-controls">
                                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
                                            <label htmlFor="export-template-select">
                                                {t('exportPage.word_template_label')}
                                            </label>
                                            <select
                                                id="export-template-select"
                                                value={activeTemplateId}
                                                onChange={(e) =>
                                                    updateSettings({ exportTemplateId: e.target.value || undefined })
                                                }
                                            >
                                                <option value="">{t('exportPage.template_default_option')}</option>
                                                {tableTemplates.map((tpl) => (
                                                    <option key={tpl.id} value={tpl.id}>
                                                        {t('exportPage.template_option', {
                                                            name: tpl.name,
                                                            count: tpl.levelHeaders.length,
                                                        })}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {activeTemplate && (
                                            <button
                                                className="btn btn-ghost btn-icon btn-sm"
                                                title={t('tooltips.clear_template')}
                                                onClick={() => updateSettings({ exportTemplateId: undefined })}
                                            >
                                                <X size={13} />
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={!rubric || exporting}
                                            onClick={handleWordExport}
                                        >
                                            {exporting ? <Loader size={13} className="spin" /> : <Download size={13} />}
                                            {activeTemplate
                                                ? t('exportPage.export_word_template', {
                                                      template: activeTemplate.name,
                                                  })
                                                : t('exportPage.export_word_default')}
                                        </button>
                                    </div>
                                    <div className="export-output-links">
                                        <a
                                            href="sample-template.docx"
                                            download="sample-template.docx"
                                            className="export-inline-link"
                                        >
                                            <Download size={11} aria-hidden="true" />
                                            {t('exportPage.download_sample')}
                                        </a>
                                        {exportTemplates.length === 0 && (
                                            <span>
                                                {t(
                                                    'exportPage.no_templates_help_prefix',
                                                    'No templates saved. Upload one in'
                                                )}{' '}
                                                <strong>
                                                    {t(
                                                        'exportPage.no_templates_help_location',
                                                        'Settings → Export Templates'
                                                    )}
                                                </strong>
                                                .
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="export-output-row" data-tour="export-grades">
                                <span className="export-output-icon">
                                    <FileText size={15} aria-hidden="true" />
                                </span>
                                <div className="export-output-copy">
                                    <strong>{t('exportPage.csv_document_title')}</strong>
                                    <small>{t('exportPage.csv_document_help')}</small>
                                    <div className="export-output-controls">
                                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 150px' }}>
                                            <label htmlFor="export-csv-preset">
                                                {t('exportPage.csv_preset_label')}
                                            </label>
                                            <select
                                                id="export-csv-preset"
                                                value={gradebookPreset}
                                                onChange={(e) =>
                                                    setGradebookPreset(e.target.value as GradebookPresetId)
                                                }
                                            >
                                                {GRADEBOOK_PRESET_IDS.map((id) => (
                                                    <option key={id} value={id}>
                                                        {t(`exportPage.csv_preset_${id}`)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        {gradebookPreset !== 'generic' && (
                                            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 130px' }}>
                                                <label htmlFor="export-csv-decimal">
                                                    {t('exportPage.csv_decimal_label')}
                                                </label>
                                                <select
                                                    id="export-csv-decimal"
                                                    value={gradebookDecimal}
                                                    onChange={(e) =>
                                                        setGradebookDecimal(e.target.value as DecimalSeparator)
                                                    }
                                                >
                                                    <option value="comma">{t('exportPage.csv_decimal_comma')}</option>
                                                    <option value="dot">{t('exportPage.csv_decimal_dot')}</option>
                                                </select>
                                            </div>
                                        )}
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            disabled={!rubric || exporting || selectedStudentIds.size === 0}
                                            onClick={handleCsvExport}
                                        >
                                            <Download size={13} />
                                            {selectedStudentIds.size === 0
                                                ? t('exportPage.csv_select_prompt')
                                                : t('exportPage.csv_export_count', {
                                                      count: selectedStudentIds.size,
                                                  })}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="export-print-options">
                                <label className="export-switch" title={t('tooltips.new_page_per_student')}>
                                    <input
                                        type="checkbox"
                                        checked={padForDoubleSided}
                                        onChange={(e) => setPadForDoubleSided(e.target.checked)}
                                    />
                                    {t('exportPage.pad_double_sided')}
                                </label>
                                <div className="export-orientation">
                                    <label htmlFor="export-orientation-select">
                                        {t('rubricBuilder.format_orientation')}
                                    </label>
                                    <select
                                        id="export-orientation-select"
                                        /* v8 ignore next 1 */
                                        value={orientation || rubric?.format.orientation || 'portrait'}
                                        onChange={(e) => setOrientation(e.target.value as 'portrait' | 'landscape')}
                                    >
                                        <option value="portrait">{t('rubricBuilder.format_portrait')}</option>
                                        <option value="landscape">{t('rubricBuilder.format_landscape')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="export-panel export-students" data-tour="export-rubric-students">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.rubric_students_section_title')}</h3>
                                <span className="badge badge-blue">
                                    {t('exportPage.selected_count', {
                                        count: selectedStudentIds.size,
                                        total: gradedStudents.length,
                                    })}
                                </span>
                            </div>

                            {!rubric ? (
                                <EmptyState icon={FileText} description={t('exportPage.no_rubric')} />
                            ) : gradedStudents.length === 0 ? (
                                <EmptyState
                                    icon={Users}
                                    description={t('exportPage.no_students')}
                                    action={{
                                        label: t('exportPage.open_grading_queue'),
                                        icon: ArrowRight,
                                        onClick: () => navigate(`/rubrics/${rubric.id}/grade`),
                                    }}
                                />
                            ) : (
                                <>
                                    <div className="export-students-tools">
                                        <button className="btn btn-ghost btn-sm" onClick={toggleAll}>
                                            {selectedStudentIds.size === gradedStudents.length ? (
                                                <CheckSquare size={14} />
                                            ) : (
                                                <Square size={14} />
                                            )}
                                            {selectedStudentIds.size === gradedStudents.length
                                                ? t('exportPage.deselect_all')
                                                : t('exportPage.select_all')}
                                        </button>
                                    </div>
                                    <div className="export-student-scroll">
                                        <table className="data-table export-student-table">
                                            <thead>
                                                <tr>
                                                    <th scope="col" className="sr-only">
                                                        {t('exportPage.table_select')}
                                                    </th>
                                                    <th scope="col">{t('exportPage.table_student')}</th>
                                                    <th scope="col">{t('exportPage.table_grade')}</th>
                                                    <th scope="col" className="sr-only">
                                                        {t('exportPage.table_actions')}
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {gradedStudents.map(({ sr, student, summary }) => {
                                                    // v8 ignore next 1 -- gradedStudents is pre-filtered to rows with student + summary
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
                                                                    aria-label={student.name}
                                                                    onChange={() => toggleStudent(student.id)}
                                                                />
                                                            </td>
                                                            <td>
                                                                <div className="export-student-name">
                                                                    {student.name}
                                                                    {sr.feedbackOnly && (
                                                                        <span className="export-mini-badge export-mini-badge-yellow">
                                                                            {t('exportPage.feedback_only_badge')}
                                                                        </span>
                                                                    )}
                                                                    {sr.isAnchor && (
                                                                        <span className="export-mini-badge export-mini-badge-purple">
                                                                            {t('exportPage.anchor_badge')}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="export-student-meta">
                                                                    {classNameById.get(student.classId ?? '') && (
                                                                        <>
                                                                            <span>
                                                                                {classNameById.get(
                                                                                    student.classId ?? ''
                                                                                )}
                                                                            </span>
                                                                            <span className="export-dot" />
                                                                        </>
                                                                    )}
                                                                    <span>
                                                                        {summary.modifiedPercentage.toFixed(1)}%
                                                                    </span>
                                                                    <span className="export-dot" />
                                                                    <span>
                                                                        {summary.gradedCount}/{summary.totalCriteria}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span
                                                                    className="grade-chip export-grade"
                                                                    style={{
                                                                        background: summary.gradeColor + '22',
                                                                        color: summary.gradeColor,
                                                                        border: `1.5px solid ${summary.gradeColor}`,
                                                                    }}
                                                                >
                                                                    {summary.letterGrade}
                                                                </span>
                                                            </td>
                                                            <td
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="export-row-actions"
                                                            >
                                                                <button
                                                                    className="btn btn-secondary btn-sm"
                                                                    onClick={() => handleExport(student.id)}
                                                                    disabled={exporting}
                                                                >
                                                                    <Download size={12} /> PDF
                                                                </button>
                                                                <button
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    title={t('tooltips.copy_feedback_link')}
                                                                    aria-label={t('tooltips.copy_feedback_link')}
                                                                    onClick={async () => {
                                                                        const url = await buildFeedbackUrl(sr, student);
                                                                        // v8 ignore next 1 -- buildFeedbackUrl only returns null without a rubric, which can't render this row
                                                                        if (!url) return;
                                                                        navigator.clipboard.writeText(url);
                                                                        showToast(
                                                                            t('exportPage.feedback_link_copied'),
                                                                            'success'
                                                                        );
                                                                    }}
                                                                >
                                                                    <Share2 size={13} />
                                                                </button>
                                                                {import.meta.env.DEV && rubric && (
                                                                    <button
                                                                        className="btn btn-ghost btn-icon btn-sm"
                                                                        title={t('tooltips.open_as_student')}
                                                                        aria-label={t('tooltips.open_as_student')}
                                                                        onClick={async () => {
                                                                            const url = await buildFeedbackUrl(
                                                                                sr,
                                                                                student
                                                                            );
                                                                            // v8 ignore next 1 -- the dev-only button is gated on rubric, so url is always set
                                                                            if (url)
                                                                                window.open(
                                                                                    url,
                                                                                    '_blank',
                                                                                    'noreferrer'
                                                                                );
                                                                        }}
                                                                    >
                                                                        <ExternalLink size={13} />
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="export-students-foot">
                                        <span>{t('exportPage.students_sorted')}</span>
                                        <button
                                            className="export-inline-link"
                                            onClick={() => navigate(`/rubrics/${rubric.id}/grade`)}
                                        >
                                            <ArrowRight size={12} /> {t('exportPage.open_grading_queue')}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="export-footer">
                        {selectedStudentIds.size > 0 && (
                            <div className="export-bulk">
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
                                    <div className="export-bulk-comment">
                                        <input
                                            type="text"
                                            value={bulkCommentText}
                                            onChange={(e) => setBulkCommentText(e.target.value)}
                                            placeholder={t('exportPage.bulk_comment_placeholder')}
                                            aria-label={t('exportPage.bulk_comment_placeholder')}
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
                        <span className="export-selection">
                            {t('exportPage.selected_count', {
                                count: selectedStudentIds.size,
                                total: gradedStudents.length,
                            })}
                        </span>
                        <div className="export-footer-actions">
                            <button
                                className="btn btn-secondary"
                                disabled={selectedStudentIds.size === 0 || exporting}
                                onClick={handleBatchDocxExport}
                                title={t('tooltips.export_word_results')}
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
                </section>

                <section
                    className="export-workbench"
                    data-tour="export-exam-booklet"
                    aria-labelledby="export-wb-exam"
                    style={{ display: activeExportType === 'exam' ? undefined : 'none' }}
                >
                    <div className="export-workbench-head">
                        <span className="export-type-icon">
                            <ClipboardList size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="export-wb-exam">{t('exportPage.exam_workbench_title')}</h2>
                            <p>{t('exportPage.exam_workbench_desc')}</p>
                        </div>
                        <span className="badge badge-yellow">{t('exportPage.exam_key_help')}</span>
                    </div>
                    <div className="export-workbench-body export-workbench-single">
                        <div className="export-panel">
                            {tests.length === 0 ? (
                                <EmptyState icon={ClipboardList} description={t('tests.no_tests')} />
                            ) : (
                                <>
                                    <div className="form-group" style={{ marginBottom: 14 }}>
                                        <label htmlFor="export-test-select">{t('exportPage.select_test')}</label>
                                        <select
                                            id="export-test-select"
                                            value={selectedTest?.id ?? ''}
                                            onChange={(e) => setSelectedTestId(e.target.value)}
                                        >
                                            {tests.map((tst) => (
                                                <option key={tst.id} value={tst.id}>
                                                    {tst.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedTest && hasOpenedExam && (
                                        <div
                                            style={{
                                                display: activeExportType === 'exam' ? undefined : 'none',
                                            }}
                                        >
                                            <ExamBookletExportPanel
                                                test={selectedTest}
                                                students={students}
                                                fontFamily={settings.defaultFormat.fontFamily}
                                                styleTemplate={activeStyleTemplate}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </section>

                <section
                    className="export-workbench"
                    data-tour="export-essays"
                    aria-labelledby="export-wb-essays"
                    style={{ display: activeExportType === 'essays' ? undefined : 'none' }}
                >
                    <div className="export-workbench-head">
                        <span className="export-type-icon">
                            <Layout size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="export-wb-essays">{t('exportPage.essays_workbench_title')}</h2>
                            <p>{t('exportPage.essays_workbench_desc')}</p>
                        </div>
                        <button className="btn btn-secondary btn-sm" onClick={handleIcsExport}>
                            <CalendarDays size={13} /> {t('exportPage.ics_export_button')}
                        </button>
                    </div>
                    <div className="export-workbench-body" id="export-section-essays">
                        <div className="export-panel">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.assignment_label')}</h3>
                                <span className="badge badge-green">
                                    {t('exportPage.essays_submitted_badge', { count: essaySubmittedEntries.length })}
                                </span>
                            </div>
                            <div className="form-group" style={{ marginBottom: 14 }}>
                                <label htmlFor="export-essay-assignment-select">
                                    {t('exportPage.essays_select_assignment')}
                                </label>
                                <select
                                    id="export-essay-assignment-select"
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
                                    <div className="export-output-controls">
                                        <div className="form-group" style={{ marginBottom: 0, flex: '0 1 170px' }}>
                                            <label htmlFor="export-essay-format">{t('exportPage.essays_format')}</label>
                                            <select
                                                id="export-essay-format"
                                                value={essayFormat}
                                                onChange={(e) => {
                                                    const next = e.target.value as typeof essayFormat;
                                                    setEssayFormat(next);
                                                    if (next === 'markdown') setIncludeRubricAnalysis(false);
                                                }}
                                            >
                                                <option value="pdf">PDF</option>
                                                <option value="docx">DOCX</option>
                                                <option value="markdown">Markdown</option>
                                            </select>
                                        </div>
                                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
                                            <label htmlFor="export-essay-batch-mode">
                                                {t('exportPage.essays_batch_mode')}
                                            </label>
                                            <select
                                                id="export-essay-batch-mode"
                                                value={essayBatchMode}
                                                onChange={(e) =>
                                                    setEssayBatchMode(e.target.value as typeof essayBatchMode)
                                                }
                                                disabled={includeRubricAnalysis && essayFormat !== 'markdown'}
                                            >
                                                <option value="separate">{t('exportPage.essays_mode_separate')}</option>
                                                <option value="combined">{t('exportPage.essays_mode_combined')}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <label className="export-switch export-switch-block">
                                        <input
                                            type="checkbox"
                                            checked={includeRubricAnalysis}
                                            disabled={essayFormat === 'markdown'}
                                            onChange={(e) => setIncludeRubricAnalysis(e.target.checked)}
                                        />
                                        {t('exportPage.essays_include_rubric_analysis')}
                                    </label>
                                </>
                            )}
                        </div>

                        <div className="export-panel export-students">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.essays_students_title')}</h3>
                                <span className="badge badge-blue">
                                    {t('exportPage.selected_count', {
                                        count: selectedEssayStudentIds.size,
                                        total: essaySubmittedEntries.length,
                                    })}
                                </span>
                            </div>
                            {!essayTeacherKey ? (
                                <p className="text-muted text-sm">
                                    {t('exportPage.essays_select_assignment_placeholder')}
                                </p>
                            ) : essaySubmittedEntries.length === 0 ? (
                                <p className="text-muted text-sm">{t('exportPage.essays_no_submissions')}</p>
                            ) : (
                                <>
                                    <div className="export-students-tools">
                                        <button className="btn btn-ghost btn-sm" onClick={toggleAllEssayStudents}>
                                            {selectedEssayStudentIds.size === essaySubmittedEntries.length ? (
                                                <CheckSquare size={14} />
                                            ) : (
                                                <Square size={14} />
                                            )}{' '}
                                            {selectedEssayStudentIds.size === essaySubmittedEntries.length
                                                ? t('exportPage.deselect_all')
                                                : t('exportPage.select_all')}
                                        </button>
                                    </div>
                                    <div className="export-checklist export-student-scroll">
                                        {essaySubmittedEntries.map(({ student }) => (
                                            <label key={student.id} className="export-check-row">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedEssayStudentIds.has(student.id)}
                                                    onChange={() => toggleEssayStudent(student.id)}
                                                />
                                                <span>{student.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                    <div className="export-students-foot">
                                        <span>{t('exportPage.essays_students_hint')}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="export-footer">
                        <span className="export-selection">
                            {t('exportPage.selected_count', {
                                count: selectedEssayStudentIds.size,
                                total: essaySubmittedEntries.length,
                            })}
                        </span>
                        <div className="export-footer-actions">
                            <button
                                className="btn btn-primary"
                                disabled={exportingEssays || selectedEssayStudentIds.size === 0}
                                onClick={handleEssayExport}
                            >
                                {exportingEssays ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                {t('exportPage.essays_export_button')}
                            </button>
                        </div>
                    </div>
                </section>

                <section
                    className="export-workbench"
                    aria-labelledby="export-wb-reports"
                    style={{ display: activeExportType === 'reports' ? undefined : 'none' }}
                >
                    <div className="export-workbench-head">
                        <span className="export-type-icon">
                            <GraduationCap size={17} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="export-wb-reports">{t('exportPage.reports_workbench_title')}</h2>
                            <p>{t('exportPage.reports_workbench_desc')}</p>
                        </div>
                        <div className="export-seg" role="group" aria-label={t('exportPage.report_output_label')}>
                            <button
                                type="button"
                                aria-pressed={reportOutput === 'period'}
                                onClick={() => setReportOutput('period')}
                            >
                                {t('exportPage.report_output_period')}
                            </button>
                            <button
                                type="button"
                                aria-pressed={reportOutput === 'card'}
                                onClick={() => setReportOutput('card')}
                            >
                                {t('exportPage.report_output_card')}
                            </button>
                        </div>
                    </div>

                    <div className="export-workbench-body">
                        <div className="export-panel">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.report_output_label')}</h3>
                                <span className="badge badge-blue">
                                    {t('exportPage.selected_count', {
                                        count: reportStudentIds.size,
                                        total: reportClassStudents.length,
                                    })}
                                </span>
                            </div>
                            <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
                                {t('exportPage.period_report_help')}
                            </p>

                            <div className="form-group" style={{ marginBottom: 12 }}>
                                <label>{t('exportPage.period_class')}</label>
                                <ClassFilterChips
                                    classes={classes}
                                    selectedClassId={reportClassId}
                                    onChange={(classId) => {
                                        setReportClassId(classId);
                                        setReportStudentIds(new Set());
                                    }}
                                    ariaLabel={t('exportPage.period_class')}
                                />
                            </div>

                            <div className="export-range-grid">
                                <div className="form-group">
                                    <label htmlFor="export-period-from">{t('exportPage.period_from')}</label>
                                    <input
                                        id="export-period-from"
                                        type="date"
                                        value={reportDateFrom}
                                        onChange={(e) => setReportDateFrom(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="export-period-to">{t('exportPage.period_to')}</label>
                                    <input
                                        id="export-period-to"
                                        type="date"
                                        value={reportDateTo}
                                        onChange={(e) => setReportDateTo(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginTop: 12 }}>
                                <label htmlFor="export-period-label">{t('exportPage.period_label_field')}</label>
                                <input
                                    id="export-period-label"
                                    type="text"
                                    value={reportPeriodLabel}
                                    onChange={(e) => setReportPeriodLabel(e.target.value)}
                                    placeholder={t('exportPage.period_label_placeholder')}
                                />
                            </div>

                            <div
                                className="export-report-card"
                                style={{ display: reportOutput === 'card' ? undefined : 'none' }}
                            >
                                <div className="export-panel-head">
                                    <h3>{t('reportCard.title')}</h3>
                                </div>
                                <p className="text-muted text-sm" style={{ marginBottom: 10 }}>
                                    {t('reportCard.help')}
                                </p>
                                <div className="export-section-checks">
                                    {(
                                        [
                                            ['includeRubrics', 'reportCard.section_rubrics'],
                                            ['includeStandards', 'reportCard.section_standards'],
                                            ['includeLearningGoals', 'reportCard.section_learning_goals'],
                                            ['includeCefr', 'reportCard.section_cefr'],
                                            ['includeTestSummary', 'reportCard.section_test_summary'],
                                        ] as const
                                    ).map(([key, labelKey]) => (
                                        <label key={key} className="export-switch">
                                            <input
                                                type="checkbox"
                                                checked={reportCardConfig[key]}
                                                onChange={(e) =>
                                                    setReportCardConfig((prev) => ({
                                                        ...prev,
                                                        [key]: e.target.checked,
                                                    }))
                                                }
                                            />
                                            {t(labelKey)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="export-panel export-students">
                            <div className="export-panel-head">
                                <h3>{t('exportPage.period_students_title')}</h3>
                                <span className="badge badge-blue">
                                    {reportStudentIds.size} / {reportClassStudents.length}
                                </span>
                            </div>

                            {!reportClassId ? (
                                <p className="text-muted text-sm">{t('exportPage.period_select_class')}</p>
                            ) : reportClassStudents.length === 0 ? (
                                <p className="text-muted text-sm">{t('exportPage.period_no_students')}</p>
                            ) : (
                                <>
                                    <div className="export-students-tools">
                                        <button
                                            className="btn btn-ghost btn-sm"
                                            onClick={() =>
                                                setReportStudentIds(
                                                    reportClassStudents.every((s) => reportStudentIds.has(s.id))
                                                        ? new Set()
                                                        : new Set(reportClassStudents.map((s) => s.id))
                                                )
                                            }
                                        >
                                            {reportClassStudents.every((s) => reportStudentIds.has(s.id)) ? (
                                                <CheckSquare size={14} />
                                            ) : (
                                                <Square size={14} />
                                            )}
                                            {reportClassStudents.every((s) => reportStudentIds.has(s.id))
                                                ? t('exportPage.deselect_all')
                                                : t('exportPage.select_all')}
                                        </button>
                                    </div>
                                    <div className="export-student-chips">
                                        {reportClassStudents.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                className="chip"
                                                aria-pressed={reportStudentIds.has(s.id)}
                                                onClick={() =>
                                                    setReportStudentIds((prev) => {
                                                        const next = new Set(prev);
                                                        if (next.has(s.id)) next.delete(s.id);
                                                        else next.add(s.id);
                                                        return next;
                                                    })
                                                }
                                            >
                                                {s.name}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="export-students-foot">
                                        <span>{t('exportPage.period_students_hint')}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="export-footer">
                        <span className="export-selection">
                            {t('exportPage.selected_count', {
                                count: reportStudentIds.size,
                                total: reportClassStudents.length,
                            })}
                        </span>
                        <div className="export-footer-actions">
                            <button
                                className="btn btn-secondary"
                                style={{ display: reportOutput === 'card' ? undefined : 'none' }}
                                disabled={reportStudentIds.size !== 1 || generatingReportCard}
                                onClick={() => {
                                    const [only] = reportStudentIds;
                                    // v8 ignore next 1 -- disabled unless exactly one is selected
                                    if (only) void handleGenerateReportCard(only);
                                }}
                            >
                                {generatingReportCard ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                {t('reportCard.generate_single_btn')}
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ display: reportOutput === 'period' ? undefined : 'none' }}
                                disabled={reportStudentIds.size === 0 || generatingReport}
                                onClick={handleGeneratePeriodReports}
                            >
                                {generatingReport ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                {t('exportPage.period_generate_btn', { count: reportStudentIds.size })}
                            </button>
                            <button
                                className="btn btn-primary"
                                style={{ display: reportOutput === 'card' ? undefined : 'none' }}
                                disabled={reportStudentIds.size === 0 || generatingReportCard}
                                onClick={handleGenerateReportCardsBatch}
                            >
                                {generatingReportCard ? <Loader size={14} className="spin" /> : <Download size={14} />}
                                {t('reportCard.generate_batch_btn', { count: reportStudentIds.size })}
                            </button>
                        </div>
                    </div>
                </section>
            </div>
            <ConfirmDialog {...confirmDialogProps} />
        </>
    );
}
