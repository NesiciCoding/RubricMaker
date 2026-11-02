import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Columns3, Download, Edit2, Table2, BarChart3 } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { useOwnOrSharedItem, useSharedMaterials } from '../hooks/useSharedMaterials';
import { useToast } from '../hooks/useToast';
import { useDbStatus } from '../hooks/useDbStatus';
import { useCanEditStudentWork } from '../hooks/useClassRoles';
import { SkeletonRow } from '../components/ui/Skeleton';
import ScoreSheetGrid from '../components/Tests/ScoreSheet/ScoreSheetGrid';
import TestQualityPanel from '../components/Tests/ScoreSheet/TestQualityPanel';
import NormConfig, { type NormSettings } from '../components/Tests/ScoreSheet/NormConfig';
import NormPreview from '../components/Tests/ScoreSheet/NormPreview';
import ScoreSheetColumnsModal from '../components/Tests/ScoreSheet/ScoreSheetColumnsModal';
import type { Class, GradeScale, Student, StudentTest, Test } from '../types';
import { pickLatestAttempt } from '../utils/testAnswerText';
import { scoreStudentTest } from '../utils/studentTestScore';
import { scoreTestAnswer } from '../utils/testCalc';
import { calcTestQuality } from '../utils/testQualityMetrics';
import {
    DEFAULT_PASS_GRADE,
    labelDistribution,
    normTierLabel,
    resolveTestGrade,
    resolveTestScale,
    type TestGradeResult,
} from '../utils/testGradingNorm';
import { buildScoreSheetCsv, isSheetComplete } from '../utils/scoreSheet';
import { downloadCsv } from '../utils/csvDownload';
import { sanitizeFilename } from '../utils/exportDataPrep';

const WITH_RESULTS = '__results';

type Tab = 'sheet' | 'analysis';

export default function TestScoreSheetPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab: Tab = searchParams.get('tab') === 'analysis' ? 'analysis' : 'sheet';
    const {
        tests,
        studentTests,
        students: allStudents,
        classes,
        settings,
        gradeScales,
    } = useStoreSelector((s) => ({
        tests: s.tests,
        studentTests: s.studentTests,
        students: s.students,
        classes: s.classes,
        settings: s.settings,
        gradeScales: s.gradeScales,
    }));
    const { updateTest, saveStudentTest } = useStoreActions();
    const [editingColumns, setEditingColumns] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const {
        item: test,
        entry: sharedEntry,
        loading: sharedLoading,
    } = useOwnOrSharedItem(
        'test',
        id,
        tests.find((x) => x.id === id)
    );
    const { save: saveSharedTest } = useSharedMaterials('test', false);
    const dbStatus = useDbStatus();
    // Same local lastEditedBy stamp as the grading and results pages; the server sets it as well.
    const saveAnyStudentTest = useCallback(
        (st: StudentTest) =>
            saveStudentTest(dbStatus.isConnected && dbStatus.userId ? { ...st, lastEditedBy: dbStatus.userId } : st),
        [saveStudentTest, dbStatus.isConnected, dbStatus.userId]
    );
    const { showToast } = useToast();
    // A colleague's test: its settings (norm, columns) are saved into their original when they
    // allowed editing; otherwise only the results on this sheet are ours to change.
    const updateAnyTest = useCallback(
        (next: Test) => {
            if (!sharedEntry) return updateTest(next);
            if (sharedEntry.access !== 'edit') {
                showToast(t('sharing.test_settings_owner_only'), 'info');
                return;
            }
            void saveSharedTest(next).then((r) => {
                if (!r.success) showToast(t('sharing.save_failed'), 'error');
            });
        },
        [sharedEntry, updateTest, saveSharedTest, showToast, t]
    );
    const testStudentTests = useMemo(() => studentTests.filter((st) => st.testId === id), [studentTests, id]);
    const students = useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);

    const sheetByStudent = useMemo(() => {
        const grouped = new Map<string, StudentTest[]>();
        for (const st of testStudentTests) grouped.set(st.studentId, [...(grouped.get(st.studentId) ?? []), st]);
        const latest = new Map<string, StudentTest>();
        for (const [studentId, attempts] of grouped) latest.set(studentId, pickLatestAttempt(attempts)!);
        return latest;
    }, [testStudentTests]);

    const defaultClassId = useMemo(() => {
        if (settings.activeClassId && classes.some((c) => c.id === settings.activeClassId))
            return settings.activeClassId;
        const counts = new Map<string, number>();
        for (const s of students) if (sheetByStudent.has(s.id)) counts.set(s.classId, (counts.get(s.classId) ?? 0) + 1);
        const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return busiest ?? classes[0]?.id ?? WITH_RESULTS;
    }, [settings.activeClassId, classes, students, sheetByStudent]);
    const [classIdState, setClassId] = useState<string | null>(null);
    const classId = classIdState ?? defaultClassId;

    const rows: Student[] = useMemo(() => {
        const picked =
            classId === WITH_RESULTS
                ? students.filter((s) => sheetByStudent.has(s.id))
                : students.filter((s) => s.classId === classId);
        return [...picked].sort((a, b) => a.name.localeCompare(b.name));
    }, [classId, students, sheetByStudent]);

    if (!test && sharedLoading) {
        return (
            <>
                <Topbar title={t('tests.scoreSheet.title')} />
                <div className="page-content fade-in" aria-busy="true">
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            </>
        );
    }
    if (!test) {
        return (
            <>
                <Topbar title={t('tests.scoreSheet.title')} />
                <div className="page-content">
                    <EmptyState
                        icon={Table2}
                        title={t('tests.scoreSheet.not_found')}
                        description=""
                        action={{ label: t('tests.list_title'), icon: ArrowLeft, onClick: () => navigate('/tests') }}
                    />
                </div>
            </>
        );
    }

    return (
        <ScoreSheetBody
            test={test}
            rows={rows}
            classId={classId}
            setClassId={setClassId}
            sheetByStudent={sheetByStudent}
            tab={tab}
            setTab={(next) => setSearchParams(next === 'analysis' ? { tab: 'analysis' } : {}, { replace: true })}
            editingColumns={editingColumns}
            setEditingColumns={setEditingColumns}
            showPreview={showPreview}
            setShowPreview={setShowPreview}
            classes={classes}
            gradeScales={gradeScales}
            defaultGradeScaleId={settings.defaultGradeScaleId}
            standardsApiKey={settings.standardsApiKey}
            updateTest={updateAnyTest}
            saveStudentTest={saveAnyStudentTest}
        />
    );
}

interface BodyProps {
    test: Test;
    rows: Student[];
    classId: string;
    setClassId: (id: string) => void;
    sheetByStudent: Map<string, StudentTest>;
    tab: Tab;
    setTab: (tab: Tab) => void;
    editingColumns: boolean;
    setEditingColumns: (v: boolean) => void;
    showPreview: boolean;
    setShowPreview: (v: boolean) => void;
    classes: Class[];
    gradeScales: GradeScale[];
    defaultGradeScaleId: string;
    standardsApiKey?: string;
    updateTest: (t: Test) => void;
    saveStudentTest: (st: StudentTest) => void;
}

function ScoreSheetBody({
    test,
    rows,
    classId,
    setClassId,
    sheetByStudent,
    tab,
    setTab,
    editingColumns,
    setEditingColumns,
    showPreview,
    setShowPreview,
    classes,
    gradeScales,
    defaultGradeScaleId,
    standardsApiKey,
    updateTest,
    saveStudentTest,
}: BodyProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const scale = resolveTestScale(test, gradeScales, defaultGradeScaleId);
    const maxPoints = test.questions.reduce((s, q) => s + q.points, 0);
    const classById = new Map(classes.map((c) => [c.id, c]));
    const allLabel = t('tests.norm.tier_all');

    const rowTests = rows.map((s) => sheetByStudent.get(s.id)).filter((st): st is StudentTest => !!st);
    const report = calcTestQuality(test, rowTests);

    function gradeFor(student: Student, st: StudentTest | undefined): { grade: TestGradeResult; pct: number } | null {
        if (!st || st.absent || st.answers.length === 0) return null;
        const score = scoreStudentTest(test, st);
        return {
            pct: score.percentage,
            grade: resolveTestGrade(test, {
                points: score.totalPoints,
                maxPoints: score.maxPoints,
                percentage: score.percentage,
                scale,
                student,
                cls: classById.get(student.classId),
            }),
        };
    }

    const graded = rows
        .map((s) => sheetByStudent.get(s.id))
        .filter((st): st is StudentTest => !!st && isSheetComplete(test, st))
        .map((st) =>
            gradeFor(
                rows.find((s) => s.id === st.studentId)!,
                st
            )
        )
        .filter((g) => g !== null);
    const numeric = graded.map((g) => g.grade.numeric).filter((n): n is number => n !== null);
    const passGrade = test.passGrade ?? DEFAULT_PASS_GRADE;
    const judged = graded.filter((g) => g.grade.passed !== null);
    const passRate = judged.length ? judged.filter((g) => g.grade.passed).length / judged.length : null;
    const labelCounts = labelDistribution(
        test,
        graded.map((g) => g.grade)
    );
    const meanGrade = numeric.length ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null;

    function patchNorm(patch: Partial<NormSettings>) {
        updateTest({ ...test, ...patch });
    }

    function exportCsv() {
        const columns = test.questions.map((q, i) => (test.scoreOnly ? q.prompt : `Q${i + 1}`));
        const csvRows = rows.map((student) => {
            const st = sheetByStudent.get(student.id);
            const g = gradeFor(student, st);
            const latest = new Map((st?.answers ?? []).map((a) => [a.questionId, a]));
            const score = st && st.answers.length ? scoreStudentTest(test, st) : null;
            return {
                name: student.name,
                studentNumber: student.studentNumber ?? '',
                points: test.questions.map((q) => {
                    const a = latest.get(q.id);
                    return a ? scoreTestAnswer(q, a) : null;
                }),
                total: st?.absent || !score ? null : score.totalPoints,
                percentage: st?.absent || !score ? null : score.percentage,
                grade: g && !g.grade.alternatives ? g.grade.label : '',
                alternatives: g?.grade.alternatives?.map((a) => ({
                    label: normTierLabel(a.tier, allLabel),
                    grade: a.grade,
                })),
                absent: !!st?.absent,
            };
        });
        downloadCsv(buildScoreSheetCsv(columns, csvRows), `${sanitizeFilename(test.name)}_scores.csv`);
    }

    // Rows of a class shared with me as "Can view" are read-only: the server refuses the write.
    const canEditStudentWork = useCanEditStudentWork();
    const classOfStudent = new Map(rows.map((s) => [s.id, s.classId]));
    const canEditStudent = (student: Student) => canEditStudentWork(student.classId);

    function saveMany(sts: StudentTest[]) {
        sts.filter((st) => canEditStudentWork(classOfStudent.get(st.studentId))).forEach(saveStudentTest);
    }

    return (
        <>
            <Topbar
                title={t('tests.scoreSheet.page_title', { name: test.name })}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/tests')}>
                            <ArrowLeft size={15} /> {t('tests.list_title')}
                        </button>
                        {test.scoreOnly ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingColumns(true)}>
                                <Columns3 size={15} /> {t('tests.scoreSheet.edit_columns')}
                            </button>
                        ) : (
                            <button className="btn btn-secondary btn-sm" onClick={() => navigate(`/tests/${test.id}`)}>
                                <Edit2 size={15} /> {t('tests.action_edit')}
                            </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={exportCsv} disabled={rows.length === 0}>
                            <Download size={15} /> {t('tests.scoreSheet.export_csv')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                        <label htmlFor="score-sheet-class">{t('tests.scoreSheet.class_label')}</label>
                        <select id="score-sheet-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
                            {classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name}
                                </option>
                            ))}
                            <option value={WITH_RESULTS}>{t('tests.scoreSheet.class_with_results')}</option>
                        </select>
                    </div>
                    <div style={{ marginLeft: 'auto' }}>
                        <SegmentedToggle
                            ariaLabel={t('tests.scoreSheet.view_label')}
                            value={tab}
                            onChange={setTab}
                            options={[
                                { value: 'sheet', label: t('tests.scoreSheet.tab_sheet'), icon: <Table2 size={14} /> },
                                {
                                    value: 'analysis',
                                    label: t('tests.scoreSheet.tab_analysis'),
                                    icon: <BarChart3 size={14} />,
                                },
                            ]}
                        />
                    </div>
                </div>

                <details className="card" open={tab === 'sheet' || undefined}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('tests.norm.section_title')}</summary>
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <NormConfig value={test} maxPoints={maxPoints} gradeScales={gradeScales} onChange={patchNorm} />
                        {test.gradingNorm && test.gradingNorm.type !== 'scale' && (
                            <div>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    aria-expanded={showPreview}
                                    onClick={() => setShowPreview(!showPreview)}
                                >
                                    {showPreview ? t('tests.norm.hide_preview') : t('tests.norm.show_preview')}
                                </button>
                                {showPreview && <NormPreview test={test} maxPoints={maxPoints} />}
                            </div>
                        )}
                    </div>
                </details>

                {rows.length === 0 ? (
                    <EmptyState
                        icon={Table2}
                        title={t('tests.scoreSheet.no_students')}
                        description={t('tests.scoreSheet.no_students_hint')}
                    />
                ) : tab === 'sheet' ? (
                    <>
                        <ScoreSheetGrid
                            test={test}
                            students={rows}
                            classes={classes}
                            sheetByStudent={sheetByStudent}
                            scale={scale}
                            items={report.items}
                            onSave={saveMany}
                            canEdit={canEditStudent}
                        />
                        <p className="text-muted text-xs" style={{ margin: 0 }}>
                            {t('tests.scoreSheet.keyboard_hint')}
                        </p>
                    </>
                ) : (
                    <TestQualityPanel
                        test={test}
                        report={report}
                        grades={graded.map((g) => g.grade.numeric)}
                        percentages={graded.map((g) => g.pct)}
                        passGrade={passGrade}
                        passRate={passRate}
                        meanGrade={meanGrade}
                        labelCounts={labelCounts}
                    />
                )}
            </div>
            {editingColumns && (
                <ScoreSheetColumnsModal
                    test={test}
                    standardsApiKey={standardsApiKey}
                    onClose={() => setEditingColumns(false)}
                    onSave={(patch) => {
                        updateTest({ ...test, ...patch });
                        setEditingColumns(false);
                    }}
                />
            )}
        </>
    );
}
