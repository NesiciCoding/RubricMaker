import React, { useState, useRef, useMemo } from 'react';
import { saveAs } from 'file-saver';
import { useNavigate } from 'react-router-dom';
import {
    Plus,
    Trash2,
    Edit2,
    Users as UsersIcon,
    Upload,
    Download,
    TrendingUp,
    MoreVertical,
    Search,
    BookOpen,
    Link,
    GraduationCap,
    ClipboardCopy,
    FileText,
    GripVertical,
    KeyRound,
    ArrowUp,
    ArrowDown,
    Minus,
} from 'lucide-react';
import { Joyride, STATUS } from 'react-joyride';
import type { EventData } from 'react-joyride';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { getStudentsTourSteps } from '../data/TutorialSteps';
import Topbar from '../components/Layout/Topbar';
import { useAssessment, useAuthoring, useClasses, useGrading, useSettings, useStudents } from '../context/AppContext';
import { useDbStatus } from '../hooks/useDbStatus';
import { useToast } from '../hooks/useToast';
import Papa from 'papaparse';
import CsvImportModal from '../components/Students/CsvImportModal';
import StudentPasswordSlipSheet, { type PasswordSlip } from '../components/Students/StudentPasswordSlipSheet';
import { useTranslation, Trans } from 'react-i18next';
import {
    VO_TRACKS,
    VO_TRACK_LABELS,
    VO_TRACK_COLORS,
    isAdjacentTrack,
    getTrackBadgeColor,
    getEffectiveVoTrack,
} from '../data/voTracks';
import { SCHOOL_YEARS, SCHOOL_YEAR_LABELS, SCHOOL_YEAR_HAS_TRACK } from '../data/schoolYears';
import type { VoTrack, SchoolYear, StudentRubric, Rubric, GradeScale, CefrLevel } from '../types';
import Avatar from '../components/ui/Avatar';
import CefrBadge from '../components/CEFR/CefrBadge';
import { getCefrStudentOverview, highestLevelForSkill } from '../utils/cefrStudentAggregator';
import { formatShortDate } from '../utils/dateInput';
import {
    calcGradeSummary,
    calcEntryPoints,
    calcLetterGrade,
    calcGradeColor,
    criterionMaxPoints,
} from '../utils/gradeCalc';
import { sortByDisplayOrder, reorderDisplayOrder } from '../utils/displayOrder';
import { generateStudentPassword } from '../utils/studentPassword';
import { sanitizeFilename, stripCommentHtml } from '../utils/exportDataPrep';

const sortHeaderButtonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
    padding: 0,
    font: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    userSelect: 'none',
};

/** Build a plain-text rubric summary for one student, suitable for pasting into a tracking system. */
function buildStudentSummary(
    studentName: string,
    srs: StudentRubric[],
    rubrics: Rubric[],
    gradeScales: GradeScale[],
    defaultGradeScaleId: string
): string {
    const blocks = srs
        .map((sr) => {
            const liveR = rubrics.find((r) => r.id === sr.rubricId);
            const r = sr.rubricSnapshot || liveR;
            if (!r) return null;
            const scaleId = r.gradeScaleId ?? defaultGradeScaleId;
            const scale = scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0]);
            const summary = calcGradeSummary(sr, r.criteria, scale, r);

            const lines: string[] = [];
            lines.push(`Rubric: ${r.name}`);
            if (scale) {
                lines.push(
                    `Score: ${summary.modifiedPercentage.toFixed(1)}% (${summary.letterGrade}) — ${summary.rawScore}/${summary.configuredMaxPoints} pts`
                );
            } else {
                lines.push(`Score: ${summary.rawScore}/${summary.configuredMaxPoints} pts`);
            }
            lines.push('');

            r.criteria.forEach((c) => {
                const entry = sr.entries.find((e) => e.criterionId === c.id);
                if (!entry) {
                    lines.push(`  ${c.title}: —`);
                    return;
                }
                const level = entry.levelId ? c.levels.find((l) => l.id === entry.levelId) : null;
                const pts = calcEntryPoints(entry, c);
                const max = criterionMaxPoints(c);
                const levelLabel = level ? `${level.label} (${pts}/${max} pts)` : `${pts}/${max} pts`;
                lines.push(`  ${c.title}: ${levelLabel}`);
                if (entry.comment) {
                    const plain = stripCommentHtml(entry.comment);
                    if (plain) lines.push(`    → ${plain}`);
                }
            });

            if (sr.overallComment) {
                const plain = stripCommentHtml(sr.overallComment);
                if (plain) {
                    lines.push('');
                    lines.push(`Feedback: ${plain}`);
                }
            }

            return lines.join('\n');
        })
        .filter((b): b is string => b !== null);

    if (blocks.length === 0) return `${studentName}\n\n(No graded rubrics yet)`;
    return `${studentName}\n${'─'.repeat(studentName.length)}\n\n${blocks.join('\n\n---\n\n')}`;
}

function calcGradedPercentages(
    srs: StudentRubric[],
    rubrics: Rubric[],
    gradeScales: GradeScale[],
    defaultGradeScaleId: string
): number[] {
    return srs
        .map((sr) => {
            const liveR = rubrics.find((r) => r.id === sr.rubricId);
            const r = sr.rubricSnapshot || liveR;
            if (!r) return null;
            const scaleId = r.gradeScaleId ?? defaultGradeScaleId;
            const scale = scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0]);
            const summary = calcGradeSummary(sr, r.criteria, scale, r);
            return summary.gradedCount > 0 ? summary.modifiedPercentage : null;
        })
        .filter((p): p is number => p !== null);
}

function calcStudentOverall(
    pcts: number[],
    gradeScales: GradeScale[],
    defaultGradeScaleId: string
): { pct: number; letter: string; color: string } | null {
    if (pcts.length === 0) return null;
    const avg = pcts.reduce((sum, p) => sum + p, 0) / pcts.length;
    const scale = gradeScales.find((g) => g.id === defaultGradeScaleId) ?? gradeScales[0] ?? null;
    return {
        pct: avg,
        letter: scale ? calcLetterGrade(avg, scale) : `${Math.round(avg)}%`,
        color: scale ? calcGradeColor(avg, scale) : 'var(--text)',
    };
}

export default function StudentsPage() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { students, addStudent, updateStudent, deleteStudent, setStudentPassword } = useStudents();
    const { classes, addClass, updateClass, deleteClass, mergeClasses } = useClasses();
    const { studentRubrics } = useGrading();

    const { rubrics, gradeScales } = useAuthoring();
    const { selfAssessments, analysisResults, tests, studentTests } = useAssessment();
    const { settings, updateSettings } = useSettings();

    const dbStatus = useDbStatus();
    const { showToast } = useToast();

    // Cohort-chip selection: an empty selection means "All classes" (combined roster).
    // Seeded from the remembered single active class, if any.
    const initialCohorts =
        settings.activeClassId && classes.some((c) => c.id === settings.activeClassId) ? [settings.activeClassId] : [];
    const [selectedCohorts, setSelectedCohorts] = useState<string[]>(initialCohorts);
    const selectedSet = useMemo(() => new Set(selectedCohorts), [selectedCohorts]);
    const isAllCohorts = selectedCohorts.length === 0;
    // Contract for settings.activeClassId (read app-wide as "one class, or unset = all"):
    // a concrete id ONLY when exactly one cohort is selected; otherwise undefined.
    const singleClassId = selectedCohorts.length === 1 ? selectedCohorts[0] : undefined;

    function toggleCohort(id: string) {
        setSelectedCohorts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    }

    const sortedClasses = sortByDisplayOrder(classes);
    function handleClassDragEnd(result: DropResult) {
        if (!result.destination) return;
        for (const [c, order] of reorderDisplayOrder(sortedClasses, result.source.index, result.destination.index)) {
            if (c.displayOrder !== order) updateClass({ ...c, displayOrder: order });
        }
    }

    // Preserve the singular activeClassId contract: write a class only on single-select, else clear it.
    // Skip while classes are still loading, so we don't clear the remembered class before the seed resolves.
    React.useEffect(() => {
        if (classes.length === 0) return;
        if (singleClassId !== settings.activeClassId) {
            updateSettings({ activeClassId: singleClassId });
        }
    }, [classes.length, singleClassId, settings.activeClassId, updateSettings]);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editStudent, setEditStudent] = useState<null | { id: string; name: string; email: string }>(null);
    const [passwordSlips, setPasswordSlips] = useState<PasswordSlip[] | null>(null);
    const [generatingSlips, setGeneratingSlips] = useState(false);

    async function handleGeneratePasswordSlips(targets: { id: string; name: string; email: string }[]) {
        setGeneratingSlips(true);
        const slips = await Promise.all(
            targets.map(async (s): Promise<PasswordSlip> => {
                const password = generateStudentPassword();
                const result = await setStudentPassword(s.email, password);
                return result.success ? { ...s, password } : { ...s, error: result.error };
            })
        );
        setGeneratingSlips(false);
        setPasswordSlips(slips);
        const failedCount = slips.filter((s) => s.error).length;
        if (failedCount > 0) {
            showToast(t('studentsPage.password_slip_partial_failure', { count: failedCount }), 'warning');
        }
    }
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [editStudentClassId, setEditStudentClassId] = useState('');
    const [editStudentTrack, setEditStudentTrack] = useState<VoTrack | ''>('');
    const [newClassName, setNewClassName] = useState('');
    const [importFile, setImportFile] = useState<File | null>(null);
    const [tourRun, setTourRun] = useState(false);
    const studentsTourSteps = React.useMemo(() => getStudentsTourSteps(t), [t]);

    // Context Menu State for Classes
    const [classMenuOpen, setClassMenuOpen] = useState<string | null>(null);
    const [gradeMenuOpen, setGradeMenuOpen] = useState<string | null>(null);

    // Class Management Modal States
    const [renameClassId, setRenameClassId] = useState<string | null>(null);
    const [renameClassVal, setRenameClassVal] = useState('');
    const [renameClassTrack, setRenameClassTrack] = useState<VoTrack | ''>('');
    const [renameClassYear, setRenameClassYear] = useState<SchoolYear | ''>('');
    const [renameClassColor, setRenameClassColor] = useState('');

    function saveClassRename() {
        const c = classes.find((cl) => cl.id === renameClassId);
        if (!c || !renameClassVal.trim()) return;
        updateClass({
            ...c,
            name: renameClassVal.trim(),
            voTrack:
                renameClassYear && !SCHOOL_YEAR_HAS_TRACK[renameClassYear] ? undefined : renameClassTrack || undefined,
            year: renameClassYear || undefined,
            color: renameClassColor || undefined,
        });
        setRenameClassId(null);
    }

    const [mergeClassId, setMergeClassId] = useState<string | null>(null);
    const [mergeTargetId, setMergeTargetId] = useState('');
    const [mergeConfirming, setMergeConfirming] = useState(false);

    const [deleteClassId, setDeleteClassId] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const [studentSearch, setStudentSearch] = useState('');
    const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<string | null>(null);
    const [showLinkRubrics, setShowLinkRubrics] = useState(false);

    // Sorting
    const [sortKey, setSortKey] = useState<'name' | 'email' | 'grades'>('name');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    function handleSort(key: typeof sortKey) {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }
    const sortArrow = (key: typeof sortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');
    const ariaSort = (key: typeof sortKey): 'ascending' | 'descending' | undefined =>
        sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined;

    // Summary export modal
    const [summaryStudentId, setSummaryStudentId] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // The single selected class (single-select only) drives class-scoped defaults + the grade menu.
    const activeClassData = classes.find((c) => c.id === singleClassId);

    // Link-rubrics targets a specific class (opened from that class's chip menu), independent of selection.
    const [linkRubricsClassId, setLinkRubricsClassId] = useState<string | null>(null);
    const linkClass = classes.find((c) => c.id === linkRubricsClassId);

    function toggleClassRubric(rubricId: string) {
        if (!linkClass) return;
        const current = linkClass.rubricIds ?? [];
        const next = current.includes(rubricId) ? current.filter((id) => id !== rubricId) : [...current, rubricId];
        updateClass({ ...linkClass, rubricIds: next });
    }

    const chipStyle = (active: boolean): React.CSSProperties => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 12px',
        borderRadius: 999,
        fontSize: '0.85rem',
        fontWeight: 600,
        cursor: 'pointer',
        border: '1px solid var(--border)',
        background: active ? 'var(--accent)' : 'var(--bg-raised)',
        color: active ? 'var(--accent-fg)' : 'var(--text-muted)',
    });

    const showClassColumn = singleClassId === undefined; // combined roster (All or multi) needs attribution
    const rosterLabel = singleClassId
        ? (classes.find((c) => c.id === singleClassId)?.name ?? t('studentsPage.default_class_name'))
        : isAllCohorts
          ? t('studentsPage.all_classes_label')
          : t('studentsPage.n_cohorts_label', { count: selectedCohorts.length });

    // Per-student roster extras (CEFR writing level, score trend, last-active date), memoized over the
    // full data set so search/selection changes don't recompute the CEFR aggregation.
    const derivedByStudent = useMemo(() => {
        const map = new Map<
            string,
            {
                writing: CefrLevel | null;
                trend: 'up' | 'down' | 'flat' | null;
                lastActive: string | null;
                pcts: number[];
            }
        >();
        // Index the grading history once by student, rather than re-filtering per student.
        const srsByStudent = new Map<string, StudentRubric[]>();
        for (const sr of studentRubrics) {
            const arr = srsByStudent.get(sr.studentId);
            if (arr) arr.push(sr);
            else srsByStudent.set(sr.studentId, [sr]);
        }
        for (const s of students) {
            const srs = srsByStudent.get(s.id) ?? [];
            const gradedTimed = srs.filter((sr) => sr.gradedAt).sort((a, b) => a.gradedAt!.localeCompare(b.gradedAt!));
            const lastActive = gradedTimed.length ? gradedTimed[gradedTimed.length - 1].gradedAt! : null;

            const pcts = calcGradedPercentages(gradedTimed, rubrics, gradeScales, settings.defaultGradeScaleId);
            let trend: 'up' | 'down' | 'flat' | null = null;
            if (pcts.length >= 2) {
                const recent = pcts[pcts.length - 1];
                const baseline = pcts.slice(0, -1).reduce((a, b) => a + b, 0) / (pcts.length - 1);
                const delta = recent - baseline;
                trend = delta > 3 ? 'up' : delta < -3 ? 'down' : 'flat';
            }

            const cls = classes.find((c) => c.id === s.classId);
            const ov = getCefrStudentOverview(
                s.id,
                studentRubrics,
                rubrics,
                selfAssessments,
                analysisResults,
                cls?.year,
                getEffectiveVoTrack(s, cls),
                tests,
                studentTests
            );
            map.set(s.id, { writing: highestLevelForSkill(ov.cells, 'writing'), trend, lastActive, pcts });
        }
        return map;
    }, [
        students,
        studentRubrics,
        rubrics,
        gradeScales,
        selfAssessments,
        analysisResults,
        tests,
        studentTests,
        classes,
        settings.defaultGradeScaleId,
    ]);

    const classStudentsWithEmail = useMemo(
        () =>
            students
                .filter((s) => (isAllCohorts || selectedSet.has(s.classId)) && s.email)
                .map((s) => ({ id: s.id, name: s.name, email: s.email! })),
        [students, isAllCohorts, selectedSet]
    );

    const filteredStudents = useMemo(
        () =>
            students
                .filter((s) => isAllCohorts || selectedSet.has(s.classId))
                .filter(
                    (s) =>
                        !studentSearch.trim() ||
                        s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                        (s.email ?? '').toLowerCase().includes(studentSearch.toLowerCase())
                )
                .sort((a, b) => {
                    let valA: string | number, valB: string | number;
                    if (sortKey === 'name') {
                        valA = a.name.toLowerCase();
                        valB = b.name.toLowerCase();
                    } else if (sortKey === 'email') {
                        valA = (a.email ?? '').toLowerCase();
                        valB = (b.email ?? '').toLowerCase();
                    } else {
                        // Reuse the per-student graded-percentage array already computed in
                        // derivedByStudent instead of re-scanning studentRubrics twice per comparison.
                        valA = derivedByStudent.get(a.id)?.pcts.length ?? 0;
                        valB = derivedByStudent.get(b.id)?.pcts.length ?? 0;
                    }
                    if (valA < valB) return sortDir === 'asc' ? -1 : 1;
                    if (valA > valB) return sortDir === 'asc' ? 1 : -1;
                    return 0;
                }),
        [students, isAllCohorts, selectedSet, studentSearch, sortKey, sortDir, derivedByStudent]
    );

    function handleAddStudent() {
        if (!name.trim()) return;
        if (editStudent) {
            const prev = students.find((s) => s.id === editStudent.id)!;
            const isTransfer = prev.classId !== editStudentClassId;
            const targetClass = classes.find((c) => c.id === editStudentClassId);
            updateStudent({
                ...prev,
                name,
                email,
                classId: editStudentClassId,
                voTrack: targetClass?.voTrack ? editStudentTrack || undefined : undefined,
                pastClassMemberships: isTransfer
                    ? [
                          ...(prev.pastClassMemberships ?? []),
                          {
                              classId: prev.classId,
                              enrolledAt: prev.pastClassMemberships?.at(-1)?.leftAt,
                              leftAt: new Date().toISOString(),
                          },
                      ]
                    : prev.pastClassMemberships,
            });
        } else {
            addStudent({ name, email, classId: editStudentClassId || singleClassId || classes[0]?.id || '' });
        }
        setName('');
        setEmail('');
        setShowAddModal(false);
        setEditStudent(null);
    }

    // Open the add-student modal, seeding the class from the current selection so the target is
    // explicit even when the combined roster ("All" / multi) has no single active class.
    function openAddStudent() {
        setEditStudent(null);
        setName('');
        setEmail('');
        setEditStudentClassId(singleClassId ?? selectedCohorts[0] ?? classes[0]?.id ?? '');
        setEditStudentTrack('');
        setShowAddModal(true);
    }

    function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setImportFile(file);
        e.target.value = '';
    }

    function exportCSV() {
        const rows = filteredStudents.map((s) => ({ name: s.name, email: s.email ?? '' }));
        const csv = Papa.unparse(rows);
        saveAs(new Blob([csv], { type: 'text/csv' }), 'students.csv');
    }

    function exportAllSummaries() {
        const className = activeClassData?.name ?? 'class';
        const text = filteredStudents
            .map((s) => {
                const srs = studentRubrics.filter((sr) => sr.studentId === s.id);
                return buildStudentSummary(s.name, srs, rubrics, gradeScales, settings.defaultGradeScaleId);
            })
            .join('\n\n' + '═'.repeat(40) + '\n\n');
        saveAs(new Blob([text], { type: 'text/plain;charset=utf-8' }), `summaries_${sanitizeFilename(className)}.txt`);
    }

    const summaryText = summaryStudentId
        ? buildStudentSummary(
              students.find((s) => s.id === summaryStudentId)?.name ?? '',
              studentRubrics.filter((sr) => sr.studentId === summaryStudentId),
              rubrics,
              gradeScales,
              settings.defaultGradeScaleId
          )
        : '';

    // Helper to close all context menus on outside click
    React.useEffect(() => {
        const handleClick = () => {
            setClassMenuOpen(null);
            setGradeMenuOpen(null);
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <>
            <Joyride
                steps={studentsTourSteps}
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
                title={t('studentsPage.title')}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => setTourRun(true)}>
                            {t('tutorial.students_tour_button')}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            data-tour="students-import"
                            onClick={() => fileRef.current?.click()}
                        >
                            <Upload size={15} /> {t('studentsPage.import_csv')}
                        </button>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv"
                            onChange={handleCSVImport}
                            style={{ display: 'none' }}
                        />
                        <button className="btn btn-secondary btn-sm" onClick={exportCSV}>
                            <Download size={15} /> {t('studentsPage.export_csv')}
                        </button>
                        {filteredStudents.length > 0 && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={exportAllSummaries}
                                title={t('studentsPage.action_export_summaries')}
                            >
                                <FileText size={15} /> {t('studentsPage.action_export_summaries')}
                            </button>
                        )}
                        {dbStatus.isConnected && classStudentsWithEmail.length > 0 && (
                            <button
                                className="btn btn-secondary btn-sm"
                                disabled={generatingSlips}
                                onClick={() => void handleGeneratePasswordSlips(classStudentsWithEmail)}
                                title={t('studentsPage.action_generate_class_passwords')}
                            >
                                <KeyRound size={15} />
                                {generatingSlips
                                    ? t('studentsPage.password_generating')
                                    : t('studentsPage.action_generate_class_passwords')}
                            </button>
                        )}
                        <button className="btn btn-primary btn-sm" data-tour="students-add" onClick={openAddStudent}>
                            <Plus size={15} /> {t('studentsPage.add_student')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Cohort chips */}
                    <div
                        role="group"
                        aria-label={t('studentsPage.cohort_filter_label')}
                        data-tour="students-cohorts"
                        style={{
                            display: 'flex',
                            flexWrap: 'nowrap',
                            gap: 8,
                            alignItems: 'center',
                            overflowX: 'auto',
                            paddingBottom: 4,
                        }}
                    >
                        <button
                            type="button"
                            aria-pressed={isAllCohorts}
                            onClick={() => setSelectedCohorts([])}
                            style={chipStyle(isAllCohorts)}
                        >
                            {t('studentsPage.all_cohorts')}
                            <span style={{ opacity: 0.7, fontSize: '0.75rem' }}>{students.length}</span>
                        </button>
                        <DragDropContext onDragEnd={handleClassDragEnd}>
                            <Droppable droppableId="class-list" direction="horizontal">
                                {(classDroppableProvided) => (
                                    <div
                                        ref={classDroppableProvided.innerRef}
                                        {...classDroppableProvided.droppableProps}
                                        style={{ display: 'flex', flexWrap: 'nowrap', gap: 8, alignItems: 'center' }}
                                    >
                                        {sortedClasses.map((c, classIdx) => (
                                            <Draggable key={c.id} draggableId={c.id} index={classIdx}>
                                                {(classDragProvided) => (
                                                    <div
                                                        ref={classDragProvided.innerRef}
                                                        {...classDragProvided.draggableProps}
                                                        style={{
                                                            position: 'relative',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            ...classDragProvided.draggableProps.style,
                                                        }}
                                                    >
                                                        <span
                                                            {...classDragProvided.dragHandleProps}
                                                            aria-label={t('rubricList.drag_to_reorder')}
                                                            style={{
                                                                cursor: 'grab',
                                                                color: 'var(--text-dim)',
                                                                display: 'flex',
                                                                padding: '0 2px',
                                                            }}
                                                        >
                                                            <GripVertical size={13} />
                                                        </span>
                                                        <button
                                                            type="button"
                                                            aria-pressed={selectedSet.has(c.id)}
                                                            onClick={() => toggleCohort(c.id)}
                                                            style={chipStyle(selectedSet.has(c.id))}
                                                        >
                                                            <UsersIcon size={14} />
                                                            <span
                                                                title={c.name}
                                                                style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}
                                                            >
                                                                {c.name}
                                                            </span>
                                                            <span
                                                                style={{
                                                                    fontSize: '0.75rem',
                                                                    opacity: 0.8,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: 4,
                                                                }}
                                                            >
                                                                {c.voTrack ? (
                                                                    <span
                                                                        style={{
                                                                            fontSize: 9,
                                                                            fontWeight: 700,
                                                                            padding: '1px 5px',
                                                                            borderRadius: 3,
                                                                            background: getTrackBadgeColor(c),
                                                                            color: '#fff',
                                                                            opacity: 1,
                                                                        }}
                                                                    >
                                                                        {VO_TRACK_LABELS[c.voTrack]}
                                                                    </span>
                                                                ) : (
                                                                    c.color && (
                                                                        <span
                                                                            aria-hidden="true"
                                                                            style={{
                                                                                width: 9,
                                                                                height: 9,
                                                                                borderRadius: '50%',
                                                                                background: c.color,
                                                                                display: 'inline-block',
                                                                            }}
                                                                        />
                                                                    )
                                                                )}
                                                                {c.rubricIds && c.rubricIds.length > 0 && (
                                                                    <span
                                                                        title={`${c.rubricIds.length} ${
                                                                            c.rubricIds.length !== 1
                                                                                ? t('studentsPage.rubric_plural')
                                                                                : t('studentsPage.rubric_single')
                                                                        }`}
                                                                        style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: 2,
                                                                        }}
                                                                    >
                                                                        <BookOpen size={11} />
                                                                        {c.rubricIds.length}
                                                                    </span>
                                                                )}
                                                                {students.filter((s) => s.classId === c.id).length}
                                                            </span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            className="btn btn-ghost btn-icon btn-sm"
                                                            aria-label={t('studentsPage.action_class_menu')}
                                                            aria-expanded={classMenuOpen === c.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setClassMenuOpen(classMenuOpen === c.id ? null : c.id);
                                                            }}
                                                            style={{
                                                                opacity: classMenuOpen === c.id ? 1 : 0.6,
                                                            }}
                                                        >
                                                            <MoreVertical size={14} />
                                                        </button>

                                                        {classMenuOpen === c.id && (
                                                            <div
                                                                className="card"
                                                                style={{
                                                                    position: 'absolute',
                                                                    right: 0,
                                                                    top: '100%',
                                                                    zIndex: 10,
                                                                    padding: 4,
                                                                    minWidth: 160,
                                                                    boxShadow: 'var(--shadow-lg)',
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{
                                                                        width: '100%',
                                                                        justifyContent: 'flex-start',
                                                                    }}
                                                                    onClick={() => {
                                                                        setRenameClassId(c.id);
                                                                        setRenameClassVal(c.name);
                                                                        setRenameClassTrack(c.voTrack ?? '');
                                                                        setRenameClassYear(c.year ?? '');
                                                                        setRenameClassColor(c.color ?? '');
                                                                        setClassMenuOpen(null);
                                                                    }}
                                                                >
                                                                    {t('studentsPage.action_rename')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{
                                                                        width: '100%',
                                                                        justifyContent: 'flex-start',
                                                                    }}
                                                                    onClick={() => {
                                                                        setLinkRubricsClassId(c.id);
                                                                        setShowLinkRubrics(true);
                                                                        setClassMenuOpen(null);
                                                                    }}
                                                                >
                                                                    <Link size={13} style={{ marginRight: 4 }} />{' '}
                                                                    {t('studentsPage.link_rubrics')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm"
                                                                    style={{
                                                                        width: '100%',
                                                                        justifyContent: 'flex-start',
                                                                    }}
                                                                    onClick={() => {
                                                                        setMergeClassId(c.id);
                                                                        setMergeTargetId('');
                                                                        setClassMenuOpen(null);
                                                                    }}
                                                                >
                                                                    {t('studentsPage.action_merge')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-sm text-red"
                                                                    style={{
                                                                        width: '100%',
                                                                        justifyContent: 'flex-start',
                                                                    }}
                                                                    onClick={() => {
                                                                        setDeleteClassId(c.id);
                                                                        setClassMenuOpen(null);
                                                                    }}
                                                                >
                                                                    {t('studentsPage.action_delete')}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {classDroppableProvided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                                type="text"
                                placeholder={t('studentsPage.new_class_placeholder')}
                                value={newClassName}
                                onChange={(e) => setNewClassName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && newClassName.trim()) {
                                        addClass({ name: newClassName.trim() });
                                        setNewClassName('');
                                    }
                                }}
                                style={{ width: 150, fontSize: '0.82rem' }}
                            />
                            <button
                                className="btn btn-primary btn-icon btn-sm"
                                aria-label={t('studentsPage.add_class')}
                                onClick={() => {
                                    if (newClassName.trim()) {
                                        addClass({ name: newClassName.trim() });
                                        setNewClassName('');
                                    }
                                }}
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Student list */}
                    <div className="card" data-tour="students-roster">
                        <div className="card-header">
                            <h3>
                                {rosterLabel} — {filteredStudents.length} {t('studentsPage.students_count')}
                            </h3>
                        </div>
                        {/* Student search */}
                        <div style={{ position: 'relative', marginBottom: 14 }}>
                            <Search
                                size={14}
                                style={{
                                    position: 'absolute',
                                    left: 10,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    color: 'var(--text-dim)',
                                    pointerEvents: 'none',
                                }}
                            />
                            <input
                                type="text"
                                placeholder={t('studentsPage.search_students')}
                                value={studentSearch}
                                onChange={(e) => setStudentSearch(e.target.value)}
                                style={{ paddingLeft: 32, width: '100%' }}
                            />
                        </div>
                        {filteredStudents.length === 0 ? (
                            <div className="empty-state">
                                <UsersIcon size={40} />
                                <h3>
                                    {studentSearch
                                        ? t('studentsPage.no_students_match')
                                        : t('studentsPage.no_students')}
                                </h3>
                                {!studentSearch && (
                                    <p className="text-muted text-sm">
                                        {t(
                                            'studentsPage.add_student_hint',
                                            'Add students to this class to start grading.'
                                        )}
                                    </p>
                                )}
                                {!studentSearch && (
                                    <button type="button" className="btn btn-primary btn-sm" onClick={openAddStudent}>
                                        <Plus size={14} /> {t('studentsPage.add_student')}
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th aria-sort={ariaSort('name')}>
                                                <button
                                                    type="button"
                                                    style={sortHeaderButtonStyle}
                                                    onClick={() => handleSort('name')}
                                                >
                                                    {t('studentsPage.table_name')}
                                                    {sortArrow('name')}
                                                </button>
                                            </th>
                                            {showClassColumn && <th>{t('studentsPage.table_class')}</th>}
                                            <th aria-sort={ariaSort('email')}>
                                                <button
                                                    type="button"
                                                    style={sortHeaderButtonStyle}
                                                    onClick={() => handleSort('email')}
                                                >
                                                    {t('studentsPage.table_email')}
                                                    {sortArrow('email')}
                                                </button>
                                            </th>
                                            <th aria-sort={ariaSort('grades')}>
                                                <button
                                                    type="button"
                                                    style={sortHeaderButtonStyle}
                                                    onClick={() => handleSort('grades')}
                                                >
                                                    {t('studentsPage.table_grades')}
                                                    {sortArrow('grades')}
                                                </button>
                                            </th>
                                            <th>{t('studentsPage.table_cefr_writing')}</th>
                                            <th>{t('studentsPage.table_trend')}</th>
                                            <th>{t('studentsPage.table_last_active')}</th>
                                            <th>{t('studentsPage.table_overall')}</th>
                                            <th>{t('studentsPage.table_actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s) => {
                                            const d = derivedByStudent.get(s.id);
                                            const gradedPcts = d?.pcts ?? [];
                                            const graded = gradedPcts.length;
                                            const overall = calcStudentOverall(
                                                gradedPcts,
                                                gradeScales,
                                                settings.defaultGradeScaleId
                                            );
                                            // Grade menu shows the rubrics linked to THIS student's class (not the
                                            // single active class), so links stay effective in the combined roster.
                                            const studentClass = classes.find((c) => c.id === s.classId);
                                            const studentRubricList = studentClass?.rubricIds?.length
                                                ? rubrics.filter((r) => studentClass.rubricIds!.includes(r.id))
                                                : rubrics;
                                            return (
                                                <tr key={s.id}>
                                                    <td style={{ fontWeight: 500 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <Avatar name={s.name} size={26} fontSize="0.75rem" />
                                                            {s.name}
                                                        </div>
                                                    </td>
                                                    {showClassColumn && (
                                                        <td className="text-muted text-sm">
                                                            {classes.find((c) => c.id === s.classId)?.name ?? '—'}
                                                        </td>
                                                    )}
                                                    <td className="text-muted text-sm">{s.email || '—'}</td>
                                                    <td>
                                                        {graded > 0 ? (
                                                            <span className="badge badge-green">
                                                                {graded}{' '}
                                                                {graded !== 1
                                                                    ? t('studentsPage.rubric_plural')
                                                                    : t('studentsPage.rubric_single')}
                                                            </span>
                                                        ) : (
                                                            <span className="badge badge-yellow">
                                                                {t('studentsPage.not_graded')}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {d?.writing ? (
                                                            <CefrBadge level={d.writing} size="sm" />
                                                        ) : (
                                                            <span className="text-muted text-sm">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {d?.trend === 'up' ? (
                                                            <span
                                                                title={t('studentsPage.trend_up')}
                                                                aria-label={t('studentsPage.trend_up')}
                                                            >
                                                                <ArrowUp size={16} color="var(--green)" />
                                                            </span>
                                                        ) : d?.trend === 'down' ? (
                                                            <span
                                                                title={t('studentsPage.trend_down')}
                                                                aria-label={t('studentsPage.trend_down')}
                                                            >
                                                                <ArrowDown size={16} color="var(--red)" />
                                                            </span>
                                                        ) : d?.trend === 'flat' ? (
                                                            <span
                                                                title={t('studentsPage.trend_flat')}
                                                                aria-label={t('studentsPage.trend_flat')}
                                                            >
                                                                <Minus size={16} color="var(--text-muted)" />
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted text-sm">—</span>
                                                        )}
                                                    </td>
                                                    <td className="text-muted text-sm">
                                                        {d?.lastActive
                                                            ? formatShortDate(d.lastActive, i18n.language)
                                                            : '—'}
                                                    </td>
                                                    <td>
                                                        {overall ? (
                                                            <span
                                                                className="badge"
                                                                style={{
                                                                    background: overall.color,
                                                                    color: '#fff',
                                                                }}
                                                                title={`${Math.round(overall.pct)}%`}
                                                            >
                                                                {overall.letter}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted text-sm">—</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                gap: 6,
                                                                flexWrap: 'wrap',
                                                                position: 'relative',
                                                            }}
                                                        >
                                                            {studentRubricList.length > 0 && (
                                                                <div style={{ position: 'relative' }}>
                                                                    <button
                                                                        type="button"
                                                                        className="btn btn-primary btn-sm"
                                                                        aria-haspopup="menu"
                                                                        aria-expanded={gradeMenuOpen === s.id}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setGradeMenuOpen(
                                                                                gradeMenuOpen === s.id ? null : s.id
                                                                            );
                                                                        }}
                                                                    >
                                                                        {t('studentsPage.grade_prefix')} ▾
                                                                    </button>
                                                                    {gradeMenuOpen === s.id && (
                                                                        <div
                                                                            className="card"
                                                                            role="menu"
                                                                            style={{
                                                                                position: 'absolute',
                                                                                left: 0,
                                                                                top: '100%',
                                                                                zIndex: 10,
                                                                                padding: 4,
                                                                                minWidth: 180,
                                                                                boxShadow: 'var(--shadow-lg)',
                                                                            }}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        >
                                                                            {studentRubricList.map((r) => (
                                                                                <button
                                                                                    key={r.id}
                                                                                    type="button"
                                                                                    role="menuitem"
                                                                                    className="btn btn-ghost btn-sm"
                                                                                    style={{
                                                                                        width: '100%',
                                                                                        justifyContent: 'flex-start',
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        setGradeMenuOpen(null);
                                                                                        navigate(
                                                                                            `/rubrics/${r.id}/grade/${s.id}`
                                                                                        );
                                                                                    }}
                                                                                >
                                                                                    {r.name}
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-icon btn-sm"
                                                                onClick={() => navigate(`/students/${s.id}`)}
                                                                title={t('studentsPage.view_profile')}
                                                            >
                                                                <TrendingUp size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                onClick={() => {
                                                                    setSummaryStudentId(s.id);
                                                                    setCopied(false);
                                                                }}
                                                                title={t('studentsPage.action_copy_summary')}
                                                            >
                                                                <ClipboardCopy size={14} />
                                                            </button>
                                                            {dbStatus.isConnected && s.email && (
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-ghost btn-icon btn-sm"
                                                                    aria-label={t(
                                                                        'studentsPage.action_generate_password'
                                                                    )}
                                                                    title={t('studentsPage.action_generate_password')}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        void handleGeneratePasswordSlips([
                                                                            { id: s.id, name: s.name, email: s.email! },
                                                                        ]);
                                                                    }}
                                                                >
                                                                    <KeyRound size={14} />
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                aria-label={t('studentsPage.action_edit_student')}
                                                                onClick={() => {
                                                                    setEditStudent({
                                                                        id: s.id,
                                                                        name: s.name,
                                                                        email: s.email ?? '',
                                                                    });
                                                                    setName(s.name);
                                                                    setEmail(s.email ?? '');
                                                                    setEditStudentClassId(s.classId);
                                                                    setEditStudentTrack(s.voTrack ?? '');
                                                                    setShowAddModal(true);
                                                                }}
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-icon btn-sm"
                                                                aria-label={t('studentsPage.action_delete_student')}
                                                                style={{ color: 'var(--red)' }}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setConfirmDeleteStudent(s.id);
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
                            </div>
                        )}
                    </div>
                </div>

                {showAddModal && (
                    <div
                        className="modal-overlay"
                        onClick={() => {
                            setShowAddModal(false);
                            setEditStudent(null);
                        }}
                    >
                        <div
                            className="modal"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="student-modal-title"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3 id="student-modal-title">
                                    {editStudent
                                        ? t('studentsPage.edit_student_title')
                                        : t('studentsPage.add_student_title')}
                                </h3>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setEditStudent(null);
                                    }}
                                    aria-label={t('common.close', 'Close')}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label htmlFor="student-name">{t('studentsPage.form_full_name')}</label>
                                    <input
                                        id="student-name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder={t('studentsPage.form_name_placeholder')}
                                        autoFocus
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 12 }}>
                                    <label htmlFor="student-email">{t('studentsPage.form_email')}</label>
                                    <input
                                        id="student-email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder={t('studentsPage.form_email_placeholder')}
                                    />
                                </div>
                                {(editStudent || !singleClassId) && (
                                    <div className="form-group">
                                        <label htmlFor="student-class">{t('studentsPage.form_class')}</label>
                                        <select
                                            id="student-class"
                                            value={editStudentClassId}
                                            onChange={(e) => {
                                                setEditStudentClassId(e.target.value);
                                                setEditStudentTrack('');
                                            }}
                                        >
                                            {classes.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                                {editStudent &&
                                    (() => {
                                        const cls = classes.find((c) => c.id === editStudentClassId);
                                        if (!cls?.voTrack) return null;
                                        const options = VO_TRACKS.filter((track) =>
                                            isAdjacentTrack(track, cls.voTrack!)
                                        );
                                        return (
                                            <div className="form-group" style={{ marginTop: 12 }}>
                                                <label htmlFor="student-track">{t('voTrack.section_label')}</label>
                                                <select
                                                    id="student-track"
                                                    value={editStudentTrack}
                                                    onChange={(e) =>
                                                        setEditStudentTrack(e.target.value as VoTrack | '')
                                                    }
                                                >
                                                    <option value="">
                                                        {t('voTrack.same_as_class', {
                                                            track: VO_TRACK_LABELS[cls.voTrack],
                                                        })}
                                                    </option>
                                                    {options.map((track) => (
                                                        <option key={track} value={track}>
                                                            {VO_TRACK_LABELS[track]}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        );
                                    })()}
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setShowAddModal(false);
                                        setEditStudent(null);
                                    }}
                                >
                                    {t('common.cancel')}
                                </button>
                                <button className="btn btn-primary" onClick={handleAddStudent} disabled={!name.trim()}>
                                    {editStudent
                                        ? t('studentsPage.action_save_changes')
                                        : t('studentsPage.add_student')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {importFile && (
                    <CsvImportModal
                        file={importFile}
                        onClose={() => setImportFile(null)}
                        onSuccess={() => setImportFile(null)}
                    />
                )}

                {/* Class Management Modals */}
                {renameClassId && (
                    <div className="modal-overlay" onClick={() => setRenameClassId(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <GraduationCap size={18} style={{ color: 'var(--accent)' }} />
                                    {t('voTrack.class_settings_title')}
                                </h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setRenameClassId(null)}>
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="form-group" style={{ marginBottom: 14 }}>
                                    <label>{t('studentsPage.form_new_name')}</label>
                                    <input
                                        type="text"
                                        value={renameClassVal}
                                        onChange={(e) => setRenameClassVal(e.target.value)}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && renameClassVal.trim()) saveClassRename();
                                        }}
                                    />
                                </div>
                                <div className="form-group" style={{ marginBottom: 14 }}>
                                    <label htmlFor="class-rename-year">{t('studentsPage.form_school_year')}</label>
                                    <select
                                        id="class-rename-year"
                                        value={renameClassYear}
                                        onChange={(e) => setRenameClassYear(e.target.value as SchoolYear | '')}
                                    >
                                        <option value="">{t('studentsPage.form_school_year_none')}</option>
                                        {SCHOOL_YEARS.map((year) => (
                                            <option key={year} value={year}>
                                                {SCHOOL_YEAR_LABELS[year]}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {(!renameClassYear || SCHOOL_YEAR_HAS_TRACK[renameClassYear]) && (
                                    <div className="form-group" style={{ marginBottom: 14 }}>
                                        <label htmlFor="class-rename-track">{t('voTrack.section_label')}</label>
                                        <select
                                            id="class-rename-track"
                                            value={renameClassTrack}
                                            onChange={(e) => setRenameClassTrack(e.target.value as VoTrack | '')}
                                        >
                                            <option value="">{t('voTrack.no_track')}</option>
                                            {VO_TRACKS.map((track) => (
                                                <option key={track} value={track}>
                                                    {VO_TRACK_LABELS[track]}
                                                </option>
                                            ))}
                                        </select>
                                        {renameClassTrack && (
                                            <div
                                                style={{
                                                    marginTop: 8,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 8,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        padding: '3px 10px',
                                                        borderRadius: 5,
                                                        background: VO_TRACK_COLORS[renameClassTrack],
                                                        color: '#fff',
                                                    }}
                                                >
                                                    {VO_TRACK_LABELS[renameClassTrack]}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="form-group">
                                    <label htmlFor="class-rename-color">{t('studentsPage.form_class_color')}</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <input
                                            id="class-rename-color"
                                            type="color"
                                            value={renameClassColor || '#94a3b8'}
                                            onChange={(e) => setRenameClassColor(e.target.value)}
                                            style={{ width: 44, height: 32, padding: 0, border: 'none' }}
                                        />
                                        {renameClassColor && (
                                            <button
                                                type="button"
                                                className="btn btn-ghost btn-sm"
                                                onClick={() => setRenameClassColor('')}
                                            >
                                                {t('common.clear')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setRenameClassId(null)}>
                                    {t('common.cancel')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    disabled={!renameClassVal.trim()}
                                    onClick={saveClassRename}
                                >
                                    {t('common.save')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {mergeClassId && (
                    <div
                        className="modal-overlay"
                        onClick={() => {
                            setMergeClassId(null);
                            setMergeConfirming(false);
                        }}
                    >
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.merge_class_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setMergeClassId(null)}>
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16 }}>
                                    <Trans
                                        i18nKey="studentsPage.merge_class_description"
                                        values={{ className: classes.find((c) => c.id === mergeClassId)?.name }}
                                    >
                                        Select the target class to move all students into. The current class (
                                        <strong>{'{{className}}'}</strong>) will be deleted.
                                    </Trans>
                                </p>
                                <div className="form-group">
                                    <label>{t('studentsPage.form_target_class')}</label>
                                    <select
                                        value={mergeTargetId}
                                        onChange={(e) => {
                                            setMergeTargetId(e.target.value);
                                            setMergeConfirming(false);
                                        }}
                                    >
                                        <option value="" disabled>
                                            {t('studentsPage.select_class_placeholder')}
                                        </option>
                                        {classes
                                            .filter((c) => c.id !== mergeClassId)
                                            .map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name}
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>
                            {mergeConfirming && (
                                <div
                                    style={{
                                        margin: '0 0 12px',
                                        padding: 12,
                                        background: 'var(--bg-elevated)',
                                        borderRadius: 8,
                                        border: '1px solid var(--red)',
                                        fontSize: '0.875rem',
                                    }}
                                >
                                    <Trans
                                        i18nKey="studentsPage.merge_confirm_description"
                                        values={{
                                            source: classes.find((c) => c.id === mergeClassId)?.name,
                                            target: classes.find((c) => c.id === mergeTargetId)?.name,
                                        }}
                                    >
                                        All students from <strong>{'{{source}}'}</strong> will be moved into{' '}
                                        <strong>{'{{target}}'}</strong>. The source class will be deleted. This cannot
                                        be undone.
                                    </Trans>
                                </div>
                            )}
                            <div className="modal-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        setMergeClassId(null);
                                        setMergeConfirming(false);
                                    }}
                                >
                                    {t('common.cancel')}
                                </button>
                                {!mergeConfirming ? (
                                    <button
                                        className="btn btn-primary"
                                        disabled={!mergeTargetId}
                                        onClick={() => setMergeConfirming(true)}
                                    >
                                        {t('studentsPage.action_merge_classes')}
                                    </button>
                                ) : (
                                    <button
                                        className="btn btn-danger"
                                        onClick={() => {
                                            mergeClasses(mergeClassId!, mergeTargetId);
                                            setSelectedCohorts((prev) =>
                                                prev.includes(mergeClassId!)
                                                    ? [
                                                          ...new Set(
                                                              prev.map((id) =>
                                                                  id === mergeClassId ? mergeTargetId : id
                                                              )
                                                          ),
                                                      ]
                                                    : prev
                                            );
                                            setMergeClassId(null);
                                            setMergeConfirming(false);
                                        }}
                                    >
                                        {t('studentsPage.merge_confirm_action')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {deleteClassId && (
                    <div className="modal-overlay" onClick={() => setDeleteClassId(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.delete_class_title')}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setDeleteClassId(null)}>
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p>
                                    <Trans
                                        i18nKey="studentsPage.delete_class_confirmation"
                                        values={{ className: classes.find((c) => c.id === deleteClassId)?.name }}
                                    >
                                        Are you sure you want to delete <strong>{'{{className}}'}</strong>?
                                    </Trans>
                                </p>

                                <div
                                    style={{
                                        background: 'var(--red-soft)',
                                        color: 'var(--red)',
                                        padding: '12px 16px',
                                        borderRadius: 8,
                                        marginTop: 16,
                                        fontSize: '0.9rem',
                                    }}
                                >
                                    <strong>{t('studentsPage.warning_label')}</strong>{' '}
                                    {t('studentsPage.delete_class_warning', {
                                        count: students.filter((s) => s.classId === deleteClassId).length,
                                    })}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setDeleteClassId(null)}>
                                    {t('common.cancel')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                                    onClick={() => {
                                        deleteClass(deleteClassId!, true);
                                        setSelectedCohorts((prev) => prev.filter((id) => id !== deleteClassId));
                                        setDeleteClassId(null);
                                    }}
                                >
                                    {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {confirmDeleteStudent && (
                    <div className="modal-overlay" onClick={() => setConfirmDeleteStudent(null)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.delete_student_title') || 'Delete Student'}</h3>
                                <button
                                    className="btn btn-ghost btn-icon"
                                    onClick={() => setConfirmDeleteStudent(null)}
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p>
                                    <Trans
                                        i18nKey="studentsPage.delete_student_confirmation"
                                        values={{
                                            studentName: students.find((s) => s.id === confirmDeleteStudent)?.name,
                                        }}
                                    >
                                        Are you sure you want to delete <strong>{'{{studentName}}'}</strong>?
                                    </Trans>
                                </p>
                                <div
                                    style={{
                                        background: 'var(--red-soft)',
                                        color: 'var(--red)',
                                        padding: '12px 16px',
                                        borderRadius: 8,
                                        marginTop: 16,
                                        fontSize: '0.9rem',
                                    }}
                                >
                                    <strong>{t('studentsPage.warning_label') || 'Warning:'}</strong>{' '}
                                    {t('studentsPage.delete_student_warning') ||
                                        'This will permanently delete all grades and rubrics associated with this student.'}
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setConfirmDeleteStudent(null)}>
                                    {t('common.cancel')}
                                </button>
                                <button
                                    className="btn btn-primary"
                                    style={{ background: 'var(--red)', borderColor: 'var(--red)' }}
                                    onClick={() => {
                                        deleteStudent(confirmDeleteStudent);
                                        setConfirmDeleteStudent(null);
                                    }}
                                >
                                    {t('common.delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {summaryStudentId && (
                    <div className="modal-overlay" onClick={() => setSummaryStudentId(null)}>
                        <div
                            className="modal"
                            style={{ maxWidth: 560, width: '100%' }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <ClipboardCopy size={17} style={{ color: 'var(--accent)' }} />
                                    {students.find((s) => s.id === summaryStudentId)?.name} — Rubric Summary
                                </h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setSummaryStudentId(null)}>
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <textarea
                                    readOnly
                                    value={summaryText}
                                    rows={16}
                                    style={{
                                        width: '100%',
                                        fontFamily: 'monospace',
                                        fontSize: '0.82rem',
                                        resize: 'vertical',
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 8,
                                        padding: 12,
                                        color: 'var(--text)',
                                    }}
                                    onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                                />
                            </div>
                            <div className="modal-footer">
                                <button className="btn btn-secondary" onClick={() => setSummaryStudentId(null)}>
                                    Close
                                </button>
                                <button
                                    className={`btn ${copied ? 'btn-secondary' : 'btn-primary'}`}
                                    onClick={() =>
                                        navigator.clipboard.writeText(summaryText).then(() => setCopied(true))
                                    }
                                >
                                    <ClipboardCopy size={14} />
                                    {copied ? 'Copied!' : 'Copy to clipboard'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {passwordSlips && (
                    <StudentPasswordSlipSheet slips={passwordSlips} onClose={() => setPasswordSlips(null)} />
                )}

                {showLinkRubrics && linkClass && (
                    <div className="modal-overlay" onClick={() => setShowLinkRubrics(false)}>
                        <div className="modal" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>{t('studentsPage.link_rubrics_title', { className: linkClass.name })}</h3>
                                <button className="btn btn-ghost btn-icon" onClick={() => setShowLinkRubrics(false)}>
                                    ✕
                                </button>
                            </div>
                            <div className="modal-body">
                                <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Select which rubrics are available for students in this class. If none are selected,
                                    all rubrics will be shown.
                                </p>
                                {rubrics.length === 0 ? (
                                    <div className="empty-state">
                                        <BookOpen size={28} />
                                        <p>No rubrics yet. Create a rubric first.</p>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {rubrics.map((r) => {
                                            const linked = (linkClass.rubricIds ?? []).includes(r.id);
                                            return (
                                                <label
                                                    key={r.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 10,
                                                        padding: '10px 12px',
                                                        borderRadius: 8,
                                                        cursor: 'pointer',
                                                        background: linked ? 'var(--accent-soft)' : 'var(--bg-2)',
                                                        border: `1px solid ${linked ? 'var(--accent)' : 'var(--border)'}`,
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={linked}
                                                        onChange={() => toggleClassRubric(r.id)}
                                                        style={{
                                                            width: 16,
                                                            height: 16,
                                                            accentColor: 'var(--accent)',
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ fontWeight: 500, fontSize: '0.92rem' }}>
                                                            {r.name}
                                                        </div>
                                                        {r.subject && (
                                                            <div
                                                                style={{
                                                                    fontSize: '0.78rem',
                                                                    color: 'var(--text-muted)',
                                                                }}
                                                            >
                                                                {r.subject}
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button
                                    className="btn btn-secondary"
                                    onClick={() => {
                                        updateClass({ ...linkClass, rubricIds: [] });
                                    }}
                                >
                                    Clear all
                                </button>
                                <button className="btn btn-primary" onClick={() => setShowLinkRubrics(false)}>
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
