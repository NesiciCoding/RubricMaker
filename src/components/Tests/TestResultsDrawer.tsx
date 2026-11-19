import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, ListChecks, Table2, X } from 'lucide-react';
import ClassAverageAdjuster from './ClassAverageAdjuster';
import ItemAnalysisPanel from './ItemAnalysisPanel';
import PlacementAnalysisPanel from './PlacementAnalysisPanel';
import GrammarStandardsPanel from '../Grammar/GrammarStandardsPanel';
import Modal from '../ui/Modal';
import { logAuditEvent } from '../../services/database/AuditLogger';
import { useToast } from '../../hooks/useToast';
import type { AppSettings, Class, GradeScale, Student, StudentTest, Test } from '../../types';
import type { DocxStyleTemplateOverrides } from '../../utils/docxExport';
import { calcClassAveragePercentage } from '../../utils/testCalc';
import { resolveTestScale } from '../../utils/testGradingNorm';
import { getEffectiveVoTrack, VO_TRACK_LABELS } from '../../data/voTracks';
import { getEffectiveSchoolYear, SCHOOL_YEAR_LABELS } from '../../data/schoolYears';
import {
    GRADEBOOK_PRESET_IDS,
    type DecimalSeparator,
    type GradebookPresetId,
} from '../../utils/gradebookExportPresets';

export interface TestResultsDrawerProps {
    test: Test;
    /** Every student test in the library; the drawer narrows them to this test. */
    studentTests: StudentTest[];
    students: Student[];
    classes: Class[];
    gradeScales: GradeScale[];
    settings: AppSettings;
    activeStyleTemplate?: DocxStyleTemplateOverrides;
    lang: 'nl' | 'en';
    saveStudentTest: (st: StudentTest) => void;
    onOpenStudentResult: (studentTestId: string) => void;
    onOpenAnalysis: () => void;
    onOpenGradeQueue: () => void;
    onClose: () => void;
    /** Owned by the page so closing the drawer mid-export does not re-arm the export buttons. */
    exporting?: boolean;
    onExportingChange?: (exporting: boolean) => void;
}

/**
 * Results, analysis and export for one test, in a right-hand drawer.
 *
 * These panels used to expand inside the test card itself, which turned a 400px tile into a
 * multi-thousand-pixel column of charts, adjustment tables and export forms and pushed every
 * other test off the screen. Keeping them one click away, but out of the grid, is the point.
 */
export default function TestResultsDrawer({
    test,
    studentTests,
    students,
    classes,
    gradeScales,
    settings,
    activeStyleTemplate,
    lang,
    saveStudentTest,
    onOpenStudentResult,
    onOpenAnalysis,
    onOpenGradeQueue,
    onClose,
    exporting: exportingProp,
    onExportingChange,
}: TestResultsDrawerProps) {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [exportScope, setExportScope] = useState<'single' | 'batch'>('single');
    const [exportStudentId, setExportStudentId] = useState('');
    const [gradebookPreset, setGradebookPreset] = useState<GradebookPresetId>('generic');
    const [gradebookDecimal, setGradebookDecimal] = useState<DecimalSeparator>('comma');
    const [localExporting, setLocalExporting] = useState(false);
    const exporting = exportingProp ?? localExporting;
    const setExporting = onExportingChange ?? setLocalExporting;

    const relevantStudentTests = studentTests.filter((st) => st.testId === test.id);
    const submittedCount = new Set(relevantStudentTests.map((st) => st.studentId)).size;
    const average = relevantStudentTests.length
        ? Math.round(calcClassAveragePercentage(relevantStudentTests, test))
        : null;

    async function handleExportTestSummaryText(attempts: StudentTest[]) {
        const { buildTestStudentSummary, pickLatestAttempt } = await import('../../utils/testAnswerText');
        const { effectiveTestQuestions } = await import('../../utils/testSummaryAggregator');
        const { saveAs } = await import('file-saver');
        const { scoreStudentTest } = await import('../../utils/studentTestScore');
        const { sanitizeFilename } = await import('../../utils/exportDataPrep');

        const summaryFor = (studentTest: StudentTest) => {
            const student = students.find((s) => s.id === studentTest.studentId);
            const studentClass = classes.find((c) => c.id === student?.classId);
            const track = getEffectiveVoTrack(student, studentClass);
            const year = getEffectiveSchoolYear(student, studentClass);
            // Score against the questions this student was actually presented: a staged placement
            // attempt never saw the other branch's questions, so they must not count as unanswered.
            const presented = scoreStudentTest(test, studentTest).pathQuestions;
            return buildTestStudentSummary(
                test,
                studentTest,
                student,
                presented.length > 0 ? presented : effectiveTestQuestions(studentTest.studentId, [studentTest], test),
                {
                    className: studentClass?.name,
                    level: track ? VO_TRACK_LABELS[track] : year ? SCHOOL_YEAR_LABELS[year] : undefined,
                }
            );
        };

        if (exportScope === 'single') {
            const studentTest = pickLatestAttempt(attempts.filter((st) => st.studentId === exportStudentId));
            if (!studentTest) return;
            const student = students.find((s) => s.id === exportStudentId);
            saveAs(
                new Blob([summaryFor(studentTest)], { type: 'text/plain;charset=utf-8' }),
                `${sanitizeFilename(test.name)}_${sanitizeFilename(student?.name ?? 'student')}_summary.txt`
            );
            logAuditEvent('export', 'export_test_summary_text', 'test', test.id, { count: 1 });
            return;
        }
        const attemptsByStudent = new Map<string, StudentTest[]>();
        for (const st of attempts) {
            const arr = attemptsByStudent.get(st.studentId);
            if (arr) arr.push(st);
            else attemptsByStudent.set(st.studentId, [st]);
        }
        const latestByStudent = new Map<string, StudentTest>();
        for (const [studentId, attemptsForStudent] of attemptsByStudent) {
            const latest = pickLatestAttempt(attemptsForStudent);
            if (latest) latestByStudent.set(studentId, latest);
        }
        const text = [...latestByStudent.values()].map(summaryFor).join('\n\n' + '═'.repeat(40) + '\n\n');
        saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${sanitizeFilename(test.name)}_summaries.txt`);
        logAuditEvent('export', 'export_test_summary_text', 'test', test.id, { count: latestByStudent.size });
    }

    async function handleExportTestSummary(format: 'pdf' | 'docx' | 'text') {
        if (relevantStudentTests.length === 0) return;
        setExporting(true);
        try {
            if (format === 'text') {
                await handleExportTestSummaryText(relevantStudentTests);
                return;
            }
            if (exportScope === 'single') {
                const student = students.find((s) => s.id === exportStudentId);
                if (!student) return;
                if (format === 'pdf') {
                    const { exportTestSummaryPdf } = await import('../../utils/pdfExport');
                    await exportTestSummaryPdf(
                        exportStudentId,
                        studentTests,
                        test,
                        student,
                        activeStyleTemplate,
                        settings.cefrAchieveThreshold
                    );
                } else {
                    const { exportTestSummaryDocx } = await import('../../utils/docxExport');
                    await exportTestSummaryDocx(
                        exportStudentId,
                        studentTests,
                        test,
                        student,
                        settings.cefrAchieveThreshold
                    );
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: 1 });
            } else {
                const seenStudentIds = new Set<string>();
                const entries = relevantStudentTests
                    .filter((st) => {
                        if (seenStudentIds.has(st.studentId)) return false;
                        seenStudentIds.add(st.studentId);
                        return true;
                    })
                    .map((st) => ({
                        studentId: st.studentId,
                        student: students.find((s) => s.id === st.studentId),
                    }))
                    .filter((e): e is { studentId: string; student: Student } => !!e.student);
                if (format === 'pdf') {
                    const { exportBatchTestSummaryPdf } = await import('../../utils/pdfExport');
                    await exportBatchTestSummaryPdf(
                        entries,
                        studentTests,
                        test,
                        activeStyleTemplate,
                        settings.cefrAchieveThreshold
                    );
                } else {
                    const { exportBatchTestSummaryDocx } = await import('../../utils/docxExport');
                    await exportBatchTestSummaryDocx(entries, studentTests, test, settings.cefrAchieveThreshold);
                }
                logAuditEvent('export', `export_test_summary_${format}`, 'test', test.id, { count: entries.length });
            }
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    async function handleExportTestResultsCsv() {
        if (relevantStudentTests.length === 0) return;
        setExporting(true);
        try {
            const { buildTestResultsCsv, buildTestGradebookRows } = await import('../../utils/testExportPresets');
            const { buildGradebookPresetCsv } = await import('../../utils/gradebookExportPresets');
            const { downloadCsv } = await import('../../utils/csvDownload');
            const { sanitizeFilename } = await import('../../utils/exportDataPrep');
            const scale = resolveTestScale(test, gradeScales, settings.defaultGradeScaleId);
            const preset = buildGradebookPresetCsv(
                gradebookPreset,
                buildTestGradebookRows(test, studentTests, students, scale, classes),
                gradebookDecimal
            );
            if (preset) {
                downloadCsv(preset.csv, `${sanitizeFilename(test.name)}_${gradebookPreset}_results.csv`);
                if (preset.missingNumberCount > 0) {
                    showToast(
                        t('exportPage.csv_missing_student_numbers', { count: preset.missingNumberCount }),
                        'warning'
                    );
                }
                if (preset.blankGradeCount > 0) {
                    showToast(t('exportPage.csv_grades_blank', { count: preset.blankGradeCount }), 'warning');
                }
                if (preset.inProgressCount > 0) {
                    showToast(t('exportPage.csv_grades_in_progress', { count: preset.inProgressCount }), 'warning');
                }
            } else {
                const csv = buildTestResultsCsv(
                    test,
                    studentTests,
                    students,
                    settings.cefrAchieveThreshold,
                    scale,
                    classes
                );
                downloadCsv(csv, `${sanitizeFilename(test.name)}_results.csv`);
            }
            logAuditEvent('export', 'export_test_summary_csv', 'test', test.id, {
                count: new Set(relevantStudentTests.map((st) => st.studentId)).size,
            });
        } catch {
            showToast(t('toast.export_error'), 'error');
        } finally {
            setExporting(false);
        }
    }

    return (
        <Modal
            titleId="test-results-drawer-title"
            onClose={onClose}
            className="modal-sheet modal-sheet-wide"
            style={{ padding: 0 }}
        >
            <div
                data-testid="test-results-drawer"
                style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '16px 20px',
                        borderBottom: '1px solid var(--border)',
                    }}
                >
                    <div style={{ minWidth: 0 }}>
                        <h2 id="test-results-drawer-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
                            {t('tests.results.drawer_title', { name: test.name })}
                        </h2>
                        <p className="text-muted text-xs" style={{ margin: '4px 0 0' }}>
                            {t('tests.list_submitted', { count: submittedCount })}
                            {average !== null && <> · {t('tests.list_avg', { pct: average })}</>}
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('common.close')}
                        onClick={onClose}
                    >
                        <X size={16} />
                    </button>
                </div>

                <div
                    style={{
                        padding: 20,
                        overflowY: 'auto',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        flex: 1,
                    }}
                >
                    <div>
                        <h3 style={{ margin: '0 0 8px', fontSize: '0.85rem', fontWeight: 600 }}>
                            {t('tests.results.submissions_title', { count: relevantStudentTests.length })}
                        </h3>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {relevantStudentTests.map((st) => {
                                const student = students.find((s) => s.id === st.studentId);
                                return (
                                    <button
                                        key={st.id}
                                        type="button"
                                        className="btn btn-ghost btn-sm"
                                        style={{ border: '1px solid var(--border)', borderRadius: 999 }}
                                        onClick={() => onOpenStudentResult(st.id)}
                                    >
                                        {student?.name ?? st.studentId}
                                        {st.attemptNumber && st.attemptNumber > 1 && (
                                            <span
                                                style={{
                                                    marginLeft: 6,
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                }}
                                            >
                                                {t('tests.results.attempt_label', { n: st.attemptNumber })}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {test.mode === 'placement' ? (
                        <PlacementAnalysisPanel test={test} studentTests={relevantStudentTests} students={students} />
                    ) : (
                        <>
                            <ClassAverageAdjuster
                                test={test}
                                studentTests={relevantStudentTests}
                                students={students}
                                onSaveStudentTest={saveStudentTest}
                            />
                            <ItemAnalysisPanel test={test} studentTests={relevantStudentTests} />
                            <GrammarStandardsPanel
                                test={test}
                                studentTests={relevantStudentTests}
                                students={students}
                                lang={lang}
                            />
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenAnalysis}>
                                    <Table2 size={14} /> {t('tests.scoreSheet.action_full_analysis')}
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenGradeQueue}>
                                    <ListChecks size={14} /> {t('tests.scoreSheet.grade_queue_action')}
                                </button>
                            </div>
                        </>
                    )}

                    <div
                        style={{
                            paddingTop: 14,
                            borderTop: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t('tests.export.section_title')}</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <select
                                aria-label={t('tests.export.scope_label')}
                                value={exportScope}
                                onChange={(e) => setExportScope(e.target.value as 'single' | 'batch')}
                                style={{ width: 'auto' }}
                            >
                                <option value="single">{t('tests.export.scope_single')}</option>
                                <option value="batch">{t('tests.export.scope_batch')}</option>
                            </select>
                            {exportScope === 'single' && (
                                <select
                                    aria-label={t('tests.export.student_label')}
                                    value={exportStudentId}
                                    onChange={(e) => setExportStudentId(e.target.value)}
                                    style={{ width: 'auto' }}
                                >
                                    <option value="">{t('tests.export.select_student_placeholder')}</option>
                                    {relevantStudentTests.map((st) => {
                                        const student = students.find((s) => s.id === st.studentId);
                                        return (
                                            <option key={st.id} value={st.studentId}>
                                                {student?.name ?? st.studentId}
                                            </option>
                                        );
                                    })}
                                </select>
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={exporting || (exportScope === 'single' && !exportStudentId)}
                                onClick={() => handleExportTestSummary('pdf')}
                            >
                                <FileDown size={14} /> {t('tests.export.export_pdf')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={exporting || (exportScope === 'single' && !exportStudentId)}
                                onClick={() => handleExportTestSummary('docx')}
                            >
                                <FileDown size={14} /> {t('tests.export.export_docx')}
                            </button>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={exporting || (exportScope === 'single' && !exportStudentId)}
                                onClick={() => handleExportTestSummary('text')}
                            >
                                <FileDown size={14} /> {t('tests.export.export_text')}
                            </button>
                            {exportScope === 'batch' && (
                                <>
                                    <select
                                        aria-label={t('exportPage.csv_preset_label')}
                                        className="form-control"
                                        style={{ fontSize: '0.8rem', padding: '4px 6px', width: 'auto' }}
                                        value={gradebookPreset}
                                        onChange={(e) => setGradebookPreset(e.target.value as GradebookPresetId)}
                                    >
                                        {GRADEBOOK_PRESET_IDS.map((id) => (
                                            <option key={id} value={id}>
                                                {t(`exportPage.csv_preset_${id}`)}
                                            </option>
                                        ))}
                                    </select>
                                    {gradebookPreset !== 'generic' && (
                                        <select
                                            aria-label={t('exportPage.csv_decimal_label')}
                                            className="form-control"
                                            style={{ fontSize: '0.8rem', padding: '4px 6px', width: 'auto' }}
                                            value={gradebookDecimal}
                                            onChange={(e) => setGradebookDecimal(e.target.value as DecimalSeparator)}
                                        >
                                            <option value="comma">{t('exportPage.csv_decimal_comma')}</option>
                                            <option value="dot">{t('exportPage.csv_decimal_dot')}</option>
                                        </select>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        disabled={exporting}
                                        onClick={handleExportTestResultsCsv}
                                    >
                                        <FileDown size={14} /> {t('tests.export.export_csv')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
