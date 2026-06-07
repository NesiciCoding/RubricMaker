import React, { useState, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    Save,
    MessageSquare,
    Paperclip,
    Info,
    BookOpen,
    FileDown,
    Mic,
    MicOff,
    ChevronRight,
    Users,
    X,
    XCircle,
    ScanSearch,
    PenLine,
    Upload,
    Printer,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import CommentBankModal from '../components/Comments/CommentBankModal';
import AttachmentViewer from '../components/Attachments/AttachmentViewer';
import DocumentAnalysisPanel from '../components/Essay/DocumentAnalysisPanel';
import EssayAssignmentModal from '../components/Essay/EssayAssignmentModal';
import EssayImportModal from '../components/Essay/EssayImportModal';
import EssaySlipSheet from '../components/Essay/EssaySlipSheet';
import { useApp } from '../context/AppContext';
import { useTranslation } from 'react-i18next';
import { useVoiceGrading } from '../hooks/useVoiceGrading';
import TiptapEditor, { type TiptapEditorHandle } from '../components/Editor/TiptapEditor';
import type { ScoreEntry, Modifier, EssayAssignment } from '../types';
import { calcGradeSummary } from '../utils/gradeCalc';
import { exportSinglePdf } from '../utils/pdfExport';
import { loadSupabaseConfig } from '../services/database';

export default function GradeStudent() {
    const { t } = useTranslation();
    const { rubricId, studentId } = useParams();
    const navigate = useNavigate();
    const {
        rubrics,
        students,
        classes,
        studentRubrics,
        attachments,
        analysisResults,
        gradeScales,
        settings,
        saveStudentRubric,
        updateSettings,
        saveAnalysisResult,
        addCommentBankItem,
        addAttachment,
        saveEssayAssignment,
        fetchEssaySubmissionsForStudent,
        deleteEssaySubmission,
        getEssaySignedUrl,
    } = useApp();

    const existingSR = studentRubrics.find((sr) => sr.rubricId === rubricId && sr.studentId === studentId);
    const liveRubric = rubrics.find((r) => r.id === rubricId);
    const rubric = existingSR?.rubricSnapshot || liveRubric;
    const student = students.find((s) => s.id === studentId);
    const classStudents = useMemo(
        () => students.filter((s) => s.classId === student?.classId).map((s) => ({ id: s.id, name: s.name })),
        [students, student?.classId]
    );

    const scaleId = rubric?.gradeScaleId ?? settings.defaultGradeScaleId;
    const scale = scaleId === 'none' ? null : (gradeScales.find((g) => g.id === scaleId) ?? gradeScales[0]);

    const [sr, setSr] = useState(() => {
        if (existingSR) return existingSR;
        if (!rubricId || !studentId) return null;
        const entries: ScoreEntry[] = (rubric?.criteria ?? []).map((c) => ({
            criterionId: c.id,
            levelId: null,
            comment: '',
            checkedSubItems: [],
            selectedPoints: undefined,
        }));
        return {
            id: `${rubricId}_${studentId}_${Date.now()}`,
            rubricId: rubricId!,
            studentId: studentId!,
            entries,
            overallComment: '',
            isPeerReview: false,
        };
    });

    const [feedbackOnly, setFeedbackOnly] = useState<boolean>(existingSR?.feedbackOnly ?? false);
    const [isAnchor, setIsAnchor] = useState<boolean>(existingSR?.isAnchor ?? false);
    const [showAnchorPanel, setShowAnchorPanel] = useState(false);
    const [recordingCritId, setRecordingCritId] = useState<string | null>(null);
    const mediaRecorderRef = useRef<Record<string, MediaRecorder>>({});
    const audioChunksRef = useRef<Record<string, BlobPart[]>>({});
    const [activeCommentCrit, setActiveCommentCrit] = useState<string | null>(null);
    const [showCommentBankFor, setShowCommentBankFor] = useState<string | null>(null);
    const commentEditorRef = useRef<TiptapEditorHandle>(null);
    const [showAttachPanel, setShowAttachPanel] = useState(false);
    const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
    const [showEssayAssignment, setShowEssayAssignment] = useState(false);
    const [showEssayImport, setShowEssayImport] = useState(false);
    const [slipSheetData, setSlipSheetData] = useState<{
        assignment: EssayAssignment;
        students: { id: string; name: string }[];
    } | null>(null);
    const [saved, setSaved] = useState(false);
    const [isDirty, setIsDirty] = useState(false);
    const [showStdDesc, setShowStdDesc] = useState(false);
    const [focusedCriterionIdx, setFocusedCriterionIdx] = useState<number | null>(null);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const criterionCardsRef = useRef<(HTMLDivElement | null)[]>([]);
    const touchStartRef = useRef<{ x: number; y: number } | null>(null);

    // Ensure that if we loaded this student, the global active class defaults to their class
    // This perfectly handles the user going back and expecting to see this student's class
    React.useEffect(() => {
        if (student && student.classId && student.classId !== settings.activeClassId) {
            updateSettings({ activeClassId: student.classId });
        }
    }, [student?.classId, settings.activeClassId, updateSettings]);

    const updateEntry = useCallback(
        (criterionId: string, patch: Partial<ScoreEntry>) => {
            if (!sr) return;
            setSr((prev) => {
                if (!prev) return prev;
                const entries = prev.entries.map((e) => (e.criterionId === criterionId ? { ...e, ...patch } : e));
                return { ...prev, entries };
            });
            setIsDirty(true);
        },
        [sr]
    );

    const summary = useMemo(() => {
        if (!sr || !rubric) return null;
        return calcGradeSummary(sr, rubric.criteria, scale, rubric);
    }, [sr, rubric, scale]);

    const handleSave = useCallback(() => {
        if (!sr || !rubric) return;
        saveStudentRubric({
            ...sr,
            feedbackOnly,
            isAnchor,
            rubricSnapshot: JSON.parse(JSON.stringify(rubric)),
            gradedAt: new Date().toISOString(),
        });
        setSaved(true);
        setIsDirty(false);
        setTimeout(() => setSaved(false), 2000);

        // Fire-and-forget grade notification if the teacher has opted in
        if (settings.notifyStudentsOnGrade && student && studentId) {
            const config = loadSupabaseConfig();
            if (config?.supabaseUrl && config.supabaseAnonKey) {
                const portalUrl = `${window.location.origin}${window.location.pathname}#/portal/${studentId}`;
                fetch(`${config.supabaseUrl}/functions/v1/notify-student-graded`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${config.supabaseAnonKey}`,
                    },
                    body: JSON.stringify({ studentId, rubricName: rubric.name, portalUrl }),
                }).catch(() => {
                    /* silently ignore network errors */
                });
            }
        }
    }, [sr, rubric, saveStudentRubric, settings.notifyStudentsOnGrade, student, studentId]);

    // Find next student; scope is configurable: stay in current class or span all rubric-linked classes
    const navScope = settings.gradeNavigationScope ?? 'rubric-classes';
    const nextStudent = useMemo(() => {
        if (!student) return null;
        let eligible: typeof students;
        if (navScope === 'current-class') {
            eligible = students.filter((s) => s.classId === student.classId);
        } else {
            const linkedClassIds = classes.filter((c) => c.rubricIds?.includes(rubricId ?? '')).map((c) => c.id);
            eligible =
                linkedClassIds.length > 0
                    ? students.filter((s) => linkedClassIds.includes(s.classId))
                    : students.filter((s) => s.classId === student.classId);
        }
        const sorted = [...eligible].sort((a, b) => a.name.localeCompare(b.name));
        const currentIndex = sorted.findIndex((s) => s.id === studentId);
        const after = sorted.slice(currentIndex + 1).concat(sorted.slice(0, currentIndex));
        return (
            after.find((s) => !studentRubrics.find((sr) => sr.rubricId === rubricId && sr.studentId === s.id)) ??
            after[0] ??
            null
        );
    }, [student, students, classes, studentId, studentRubrics, rubricId, navScope]);

    const handleSaveAndNext = useCallback(() => {
        if (!sr || !rubric || !nextStudent) return;
        saveStudentRubric({
            ...sr,
            feedbackOnly,
            isAnchor,
            rubricSnapshot: JSON.parse(JSON.stringify(rubric)),
            gradedAt: new Date().toISOString(),
        });
        setIsDirty(false);
        navigate(`/rubrics/${rubricId}/grade/${nextStudent.id}`);
    }, [sr, rubric, saveStudentRubric, nextStudent, navigate, rubricId]);

    const handleNotHandedIn = useCallback(() => {
        if (!sr || !rubric) return;
        const nhiSR = {
            ...sr,
            feedbackOnly,
            isAnchor,
            notHandedIn: true,
            overallComment: t('gradeStudent.not_handed_in_comment'),
            rubricSnapshot: JSON.parse(JSON.stringify(rubric)),
            gradedAt: new Date().toISOString(),
        };
        saveStudentRubric(nhiSR);
        setIsDirty(false);
        if (nextStudent) {
            navigate(`/rubrics/${rubricId}/grade/${nextStudent.id}`);
        } else {
            navigate(-1);
        }
    }, [sr, rubric, saveStudentRubric, nextStudent, navigate, rubricId, t]);

    // Scroll focused criterion into view
    React.useEffect(() => {
        if (focusedCriterionIdx !== null) {
            criterionCardsRef.current[focusedCriterionIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, [focusedCriterionIdx]);

    // Keyboard shortcuts
    React.useEffect(() => {
        if (!rubric || !sr) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;

            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (nextStudent) handleSaveAndNext();
                else handleSave();
                return;
            }

            if (inInput) return;

            if (e.key === '?') {
                setShowShortcuts(true);
                return;
            }

            if (e.key === 'Escape') {
                setShowShortcuts(false);
                setFocusedCriterionIdx(null);
                return;
            }

            const criteriaCount = rubric.criteria.length;

            if (e.key === 'Tab') {
                e.preventDefault();
                setFocusedCriterionIdx((prev) => {
                    if (prev === null) return e.shiftKey ? criteriaCount - 1 : 0;
                    return e.shiftKey ? (prev - 1 + criteriaCount) % criteriaCount : (prev + 1) % criteriaCount;
                });
                return;
            }

            if (focusedCriterionIdx !== null && /^[1-5]$/.test(e.key)) {
                const criterion = rubric.criteria[focusedCriterionIdx];
                if (!criterion || rubric.scoringMode === 'single-point') return;
                const levels =
                    rubric.format.levelOrder === 'worst-first' ? [...criterion.levels].reverse() : criterion.levels;
                const level = levels[parseInt(e.key) - 1];
                if (!level) return;
                const currentEntry = sr.entries.find((en) => en.criterionId === criterion.id);
                updateEntry(criterion.id, {
                    levelId: currentEntry?.levelId === level.id ? null : level.id,
                    overridePoints: undefined,
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleSave, handleSaveAndNext, nextStudent, rubric, sr, focusedCriterionIdx, updateEntry]);

    // Warn on unsaved changes
    React.useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = ''; // Required for Chrome
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }, []);

    const handleTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchStartRef.current || !nextStudent) return;
            const touch = e.changedTouches[0];
            const dx = touchStartRef.current.x - touch.clientX;
            const dy = Math.abs(touchStartRef.current.y - touch.clientY);
            touchStartRef.current = null;
            if (dx > 80 && dy < 60) handleSaveAndNext();
        },
        [nextStudent, handleSaveAndNext]
    );

    const anchorSR = useMemo(() => {
        if (!rubricId) return null;
        return studentRubrics.find((s) => s.rubricId === rubricId && s.isAnchor && s.id !== existingSR?.id) ?? null;
    }, [studentRubrics, rubricId, existingSR?.id]);

    const startAudioRecording = useCallback(
        async (criterionId: string) => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mr = new MediaRecorder(stream);
                audioChunksRef.current[criterionId] = [];
                mr.ondataavailable = (e) => {
                    audioChunksRef.current[criterionId].push(e.data);
                };
                mr.onstop = () => {
                    const blob = new Blob(audioChunksRef.current[criterionId], { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = () => updateEntry(criterionId, { audioDataUrl: reader.result as string });
                    reader.readAsDataURL(blob);
                    stream.getTracks().forEach((t) => t.stop());
                };
                mr.start();
                mediaRecorderRef.current[criterionId] = mr;
                setRecordingCritId(criterionId);
            } catch {
                // getUserMedia denied — silently ignore
            }
        },
        [updateEntry]
    );

    const stopAudioRecording = useCallback((criterionId: string) => {
        mediaRecorderRef.current[criterionId]?.stop();
        setRecordingCritId(null);
    }, []);

    const voice = useVoiceGrading(
        (critIdx, lvlIdx) => {
            const crit = rubric?.criteria[critIdx];
            if (!crit) return;
            const level = crit.levels[lvlIdx];
            if (!level) return;
            updateEntry(crit.id, { levelId: level.id, overridePoints: undefined });
        },
        (text) => {
            setSr((p) => (p ? { ...p, overallComment: (p.overallComment ? p.overallComment + ' ' : '') + text } : p));
            setIsDirty(true);
        },
        ({ nl: 'nl-NL', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' } as Record<string, string>)[settings.language] ?? 'en-US'
    );

    const handlePrint = useCallback(() => {
        const orientation = rubric?.format?.orientation ?? 'portrait';
        const style = document.createElement('style');
        style.textContent = `@page { size: A4 ${orientation}; }`;
        document.head.appendChild(style);
        window.print();
        document.head.removeChild(style);
    }, [rubric]);

    if (!rubric || !student || !sr)
        return (
            <div className="page-content">
                {t('gradeStudent.error_not_found')}{' '}
                <button onClick={() => navigate(-1)}>{t('gradeStudent.action_back')}</button>
            </div>
        );

    const handleExportPdf = async () => {
        if (!sr || !rubric || !student) return;
        await exportSinglePdf(sr, rubric, student, scale, { orientation: rubric.format.orientation });
    };

    const fmt = rubric.format;
    const orderedLevels =
        fmt.levelOrder === 'worst-first'
            ? (c: (typeof rubric.criteria)[0]) => [...c.levels].reverse()
            : (c: (typeof rubric.criteria)[0]) => c.levels;
    const rubricAttachments = attachments.filter((a) => a.rubricId === rubricId);
    const studentAttachments = attachments.filter((a) => a.studentId === studentId);
    const existingAnalysisResult = analysisResults.find((r) => r.rubricId === rubricId && r.studentId === studentId);

    // Helper to set a sub-item score
    function setSubItemScore(entry: ScoreEntry, subItemId: string, score: number) {
        const currentScores = entry.subItemScores ?? {};
        updateEntry(entry.criterionId, { subItemScores: { ...currentScores, [subItemId]: score } });
    }

    return (
        <>
            <Topbar
                title={`${t('gradeStudent.title_prefix')} ${student.name}`}
                actions={
                    <>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                            <ArrowLeft size={15} /> {t('gradeStudent.action_back')}
                        </button>
                        <button
                            className={`btn btn-sm ${voice.isListening ? 'btn-danger pulse' : 'btn-secondary'}`}
                            onClick={voice.toggleListening}
                            title={
                                voice.isListening
                                    ? t('gradeStudent.action_voice_stop')
                                    : t('gradeStudent.action_voice_start')
                            }
                        >
                            {voice.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                            {voice.isListening
                                ? t('gradeStudent.voice_listening')
                                : t('gradeStudent.action_voice_start')}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() =>
                                updateSettings({
                                    gradeNavigationScope:
                                        navScope === 'current-class' ? 'rubric-classes' : 'current-class',
                                })
                            }
                            title={
                                navScope === 'current-class'
                                    ? t('gradeStudent.nav_scope_current_class')
                                    : t('gradeStudent.nav_scope_rubric_classes')
                            }
                        >
                            <Users size={15} />
                            {navScope === 'current-class'
                                ? t('gradeStudent.nav_scope_current_class')
                                : t('gradeStudent.nav_scope_rubric_classes')}
                        </button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowAttachPanel((p) => !p)}>
                            <Paperclip size={15} /> {t('gradeStudent.action_attachments')}
                        </button>
                        {studentAttachments.length > 0 && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setShowAnalysisPanel(true)}
                                title={t('analysis.open_panel', 'Analyse student document')}
                            >
                                <ScanSearch size={15} /> {t('analysis.button', 'Analyse')}
                            </button>
                        )}
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowEssayAssignment(true)}
                            title={t('gradeStudent.action_essay')}
                        >
                            <PenLine size={15} /> {t('gradeStudent.action_essay')}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setShowEssayImport(true)}
                            title={t('gradeStudent.action_import_essay')}
                        >
                            <Upload size={15} /> {t('gradeStudent.action_import_essay')}
                        </button>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handleNotHandedIn}
                            title={t('gradeStudent.action_not_handed_in')}
                        >
                            <XCircle size={15} /> {t('gradeStudent.action_not_handed_in')}
                        </button>
                        <button className="btn btn-secondary btn-sm no-print" onClick={handlePrint}>
                            <Printer size={15} /> {t('gradeStudent.action_print')}
                        </button>
                        <button className="btn btn-primary btn-sm" onClick={handleSave}>
                            <Save size={15} /> {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                        {nextStudent && (
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={handleSaveAndNext}
                                title={`Next: ${nextStudent.name}`}
                            >
                                <Save size={15} />
                                <ChevronRight size={14} />
                                {nextStudent.name.split(' ')[0]}
                            </button>
                        )}
                    </>
                }
            />
            <div
                className="page-content fade-in"
                style={summary ? { paddingBottom: 80 } : undefined}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
            >
                {/* Print-only header */}
                <div className="print-only" style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}>{rubric.name}</h2>
                    <p style={{ margin: '4px 0 0', color: '#555', fontSize: '0.9rem' }}>
                        {student.name} &middot; {new Date().toLocaleDateString()}
                    </p>
                </div>

                {/* Modifier + export panel */}
                <div
                    className="card no-print"
                    style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
                >
                    <span
                        style={{
                            fontSize: '0.72rem',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            flexShrink: 0,
                        }}
                    >
                        {t('gradeStudent.label_modifier')}
                    </span>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 280 }}>
                        <select
                            value={sr.globalModifier?.type ?? 'percentage'}
                            onChange={(e) => {
                                setSr((p) =>
                                    p
                                        ? {
                                              ...p,
                                              globalModifier: {
                                                  type: e.target.value as Modifier['type'],
                                                  value: p.globalModifier?.value ?? 0,
                                                  reason: p.globalModifier?.reason ?? '',
                                              },
                                          }
                                        : p
                                );
                                setIsDirty(true);
                            }}
                            style={{ width: 110 }}
                        >
                            <option value="percentage">{t('gradeStudent.offset_percentage')}</option>
                            <option value="points">{t('gradeStudent.offset_points')}</option>
                        </select>
                        <input
                            type="number"
                            value={sr.globalModifier?.value ?? 0}
                            onChange={(e) => {
                                setSr((p) =>
                                    p
                                        ? {
                                              ...p,
                                              globalModifier: {
                                                  type: p.globalModifier?.type ?? 'percentage',
                                                  value: Number(e.target.value),
                                                  reason: p.globalModifier?.reason ?? '',
                                              },
                                          }
                                        : p
                                );
                                setIsDirty(true);
                            }}
                            style={{ width: 60 }}
                        />
                        <input
                            type="text"
                            placeholder={t('gradeStudent.modifier_reason_placeholder')}
                            value={sr.globalModifier?.reason ?? ''}
                            onChange={(e) => {
                                setSr((p) =>
                                    p
                                        ? {
                                              ...p,
                                              globalModifier: {
                                                  type: p.globalModifier?.type ?? 'percentage',
                                                  value: p.globalModifier?.value ?? 0,
                                                  reason: e.target.value,
                                              },
                                          }
                                        : p
                                );
                                setIsDirty(true);
                            }}
                            style={{ flex: 1, minWidth: 80 }}
                        />
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={handleExportPdf} style={{ flexShrink: 0 }}>
                        <FileDown size={14} /> Export PDF
                    </button>
                </div>

                {/* Standards display toggle */}
                {rubric.criteria.some(
                    (c) => c.linkedStandard || (c.linkedStandards && c.linkedStandards.length > 0)
                ) && (
                    <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                            }}
                        >
                            Standards:
                            <div
                                style={{
                                    display: 'flex',
                                    background: 'var(--bg-elevated)',
                                    borderRadius: 6,
                                    padding: 2,
                                    marginLeft: 4,
                                }}
                            >
                                <button
                                    className={`btn btn-sm ${!showStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                    onClick={() => setShowStdDesc(false)}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                >
                                    Code
                                </button>
                                <button
                                    className={`btn btn-sm ${showStdDesc ? 'btn-white shadow-sm' : 'btn-ghost'}`}
                                    onClick={() => setShowStdDesc(true)}
                                    style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                                >
                                    Description
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rubric — card per criterion */}
                <div
                    style={{
                        marginBottom: 20,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        fontFamily: fmt.fontFamily,
                        fontSize: fmt.fontSize,
                    }}
                >
                    {rubric.criteria.map((c, criterionIndex) => {
                        const entry = sr.entries.find((e) => e.criterionId === c.id)!;
                        const levels = orderedLevels(c);
                        const isCriterionFocused = focusedCriterionIdx === criterionIndex;

                        return (
                            <div
                                key={c.id}
                                className="card print-criterion"
                                style={{
                                    padding: 16,
                                    outline: isCriterionFocused ? '2px solid var(--accent)' : undefined,
                                    outlineOffset: 2,
                                }}
                                ref={(el) => {
                                    criterionCardsRef.current[criterionIndex] = el;
                                }}
                            >
                                {/* Criterion header */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{c.title}</div>
                                        {c.description && (
                                            <div
                                                style={{ fontSize: '0.8em', color: 'var(--text-muted)', marginTop: 2 }}
                                            >
                                                {c.description}
                                            </div>
                                        )}
                                        {c.linkedStandard && (
                                            <div
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: '0.72em',
                                                    color: 'var(--accent)',
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: 3,
                                                }}
                                                title={
                                                    showStdDesc
                                                        ? (c.linkedStandard.statementNotation ?? '')
                                                        : c.linkedStandard.description
                                                }
                                            >
                                                <Info size={10} style={{ flexShrink: 0, marginTop: 2 }} />{' '}
                                                {showStdDesc
                                                    ? c.linkedStandard.description
                                                    : (c.linkedStandard.statementNotation ??
                                                      t('gradeStudent.label_standard'))}
                                            </div>
                                        )}
                                        {(c.linkedStandards || []).map((std, idx) => (
                                            <div
                                                key={idx}
                                                style={{
                                                    marginTop: 4,
                                                    fontSize: '0.72em',
                                                    color: 'var(--accent)',
                                                    display: 'flex',
                                                    alignItems: 'flex-start',
                                                    gap: 3,
                                                }}
                                                title={showStdDesc ? (std.statementNotation ?? '') : std.description}
                                            >
                                                <Info size={10} style={{ flexShrink: 0, marginTop: 2 }} />{' '}
                                                {showStdDesc
                                                    ? std.description
                                                    : (std.statementNotation ?? t('gradeStudent.label_standard'))}
                                            </div>
                                        ))}
                                        {entry.overridePoints !== undefined && (
                                            <div style={{ fontSize: '0.75em', color: 'var(--yellow)', marginTop: 3 }}>
                                                {t('gradeStudent.label_override')} {entry.overridePoints}
                                                {t('gradeStudent.table_points')}
                                            </div>
                                        )}
                                    </div>
                                    <div
                                        className="no-print"
                                        style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}
                                    >
                                        {fmt.showWeights && <span className="badge badge-blue">{c.weight}%</span>}
                                        <button
                                            className="btn btn-ghost btn-icon btn-sm"
                                            onClick={() =>
                                                setActiveCommentCrit(activeCommentCrit === c.id ? null : c.id)
                                            }
                                            style={{ color: entry.comment ? 'var(--accent)' : 'var(--text-dim)' }}
                                            title={t('gradeStudent.comment_open_bank')}
                                        >
                                            <MessageSquare size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* Single-point rubric: Exceeds / Meets / Not Yet buttons */}
                                {rubric.scoringMode === 'single-point' &&
                                    (() => {
                                        const proficiency = c.levels[0];
                                        const outcomes: Array<{
                                            value: 'exceeds' | 'meets' | 'not-yet';
                                            label: string;
                                            color: string;
                                        }> = [
                                            {
                                                value: 'exceeds',
                                                label: t('gradeStudent.single_point_exceeds'),
                                                color: '#10b981',
                                            },
                                            {
                                                value: 'meets',
                                                label: t('gradeStudent.single_point_meets'),
                                                color: fmt.accentColor,
                                            },
                                            {
                                                value: 'not-yet',
                                                label: t('gradeStudent.single_point_not_yet'),
                                                color: '#ef4444',
                                            },
                                        ];
                                        return (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                {proficiency?.description && (
                                                    <div
                                                        style={{
                                                            padding: '10px 14px',
                                                            background: 'var(--bg-elevated)',
                                                            borderRadius: 8,
                                                            fontSize: '0.85em',
                                                            color: 'var(--text-muted)',
                                                            border: '1px solid var(--border)',
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontSize: '0.7em',
                                                                textTransform: 'uppercase',
                                                                fontWeight: 600,
                                                                color: 'var(--text-dim)',
                                                                display: 'block',
                                                                marginBottom: 4,
                                                            }}
                                                        >
                                                            {t('gradeStudent.single_point_standard_label')}
                                                        </span>
                                                        {proficiency.description}
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', gap: 10 }}>
                                                    {outcomes.map((o) => {
                                                        const isSelected = entry.singlePointOutcome === o.value;
                                                        return (
                                                            <button
                                                                key={o.value}
                                                                className="level-btn"
                                                                style={
                                                                    isSelected
                                                                        ? {
                                                                              borderColor: o.color,
                                                                              background: `${o.color}1a`,
                                                                              flex: 1,
                                                                          }
                                                                        : { flex: 1 }
                                                                }
                                                                onClick={() =>
                                                                    updateEntry(c.id, {
                                                                        singlePointOutcome: isSelected
                                                                            ? undefined
                                                                            : o.value,
                                                                        levelId: null,
                                                                    })
                                                                }
                                                            >
                                                                <span
                                                                    style={{
                                                                        fontWeight: 700,
                                                                        fontSize: '0.95em',
                                                                        color: isSelected ? o.color : 'var(--text)',
                                                                    }}
                                                                >
                                                                    {o.label}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                {/* Level cards (standard mode) */}
                                {rubric.scoringMode !== 'single-point' && (
                                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                        {levels.map((level, levelIndex) => {
                                            const isSelected = entry.levelId === level.id;
                                            const shortcutNum = levelIndex + 1;
                                            return (
                                                <button
                                                    key={level.id}
                                                    className={`level-btn${isSelected ? ' selected' : ''}`}
                                                    style={
                                                        isSelected
                                                            ? {
                                                                  borderColor: fmt.accentColor,
                                                                  background: `${fmt.accentColor}1a`,
                                                              }
                                                            : {}
                                                    }
                                                    title={
                                                        shortcutNum <= 5
                                                            ? `Press ${shortcutNum} to select (when criterion is focused)`
                                                            : undefined
                                                    }
                                                    onClick={() =>
                                                        updateEntry(c.id, {
                                                            levelId: isSelected ? null : level.id,
                                                            overridePoints: undefined,
                                                        })
                                                    }
                                                >
                                                    {/* Label + points badge */}
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'baseline',
                                                            marginBottom: 5,
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontWeight: 700,
                                                                fontSize: '0.88em',
                                                                color: isSelected ? fmt.accentColor : 'var(--text)',
                                                            }}
                                                        >
                                                            {isCriterionFocused && shortcutNum <= 5 && (
                                                                <span
                                                                    style={{
                                                                        display: 'inline-block',
                                                                        marginRight: 5,
                                                                        fontSize: '0.75em',
                                                                        fontWeight: 700,
                                                                        background: isSelected
                                                                            ? fmt.accentColor
                                                                            : 'var(--bg)',
                                                                        color: isSelected
                                                                            ? '#fff'
                                                                            : 'var(--text-muted)',
                                                                        border: '1px solid var(--border)',
                                                                        borderRadius: 3,
                                                                        padding: '0 4px',
                                                                        verticalAlign: 'middle',
                                                                    }}
                                                                >
                                                                    {shortcutNum}
                                                                </span>
                                                            )}
                                                            {level.label}
                                                        </span>
                                                        {level.cefrLevel && (
                                                            <span
                                                                style={{
                                                                    fontSize: '0.65em',
                                                                    fontWeight: 700,
                                                                    padding: '1px 5px',
                                                                    borderRadius: 3,
                                                                    background: isSelected
                                                                        ? 'rgba(255,255,255,0.25)'
                                                                        : 'var(--accent-soft)',
                                                                    color: isSelected ? '#fff' : 'var(--accent)',
                                                                    flexShrink: 0,
                                                                    letterSpacing: '0.03em',
                                                                }}
                                                            >
                                                                {level.cefrLevel}
                                                            </span>
                                                        )}
                                                        {fmt.showPoints && (
                                                            <span
                                                                style={{
                                                                    fontSize: '0.72em',
                                                                    color: isSelected
                                                                        ? fmt.accentColor
                                                                        : 'var(--text-muted)',
                                                                    fontWeight: 600,
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {level.minPoints === level.maxPoints
                                                                    ? `${level.minPoints}${t('gradeStudent.table_points')}`
                                                                    : `${level.minPoints}–${level.maxPoints}${t('gradeStudent.table_points')}`}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Description */}
                                                    {level.description ? (
                                                        <p
                                                            style={{
                                                                margin: 0,
                                                                fontSize: '0.8em',
                                                                color: isSelected ? 'var(--text)' : 'var(--text-muted)',
                                                                lineHeight: 1.45,
                                                            }}
                                                        >
                                                            {level.description}
                                                        </p>
                                                    ) : (
                                                        <p
                                                            style={{
                                                                margin: 0,
                                                                fontSize: '0.8em',
                                                                color: 'var(--text-dim)',
                                                                fontStyle: 'italic',
                                                            }}
                                                        >
                                                            {t('gradeStudent.level_select')}
                                                        </p>
                                                    )}
                                                    {/* Sub-items */}
                                                    {level.subItems.length > 0 && (
                                                        <div
                                                            style={{
                                                                marginTop: 8,
                                                                paddingTop: 8,
                                                                borderTop: `1px solid ${isSelected ? fmt.accentColor + '40' : 'var(--border)'}`,
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <div
                                                                style={{
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: 8,
                                                                }}
                                                            >
                                                                {level.subItems.map((si) => {
                                                                    const legacyChecked = (
                                                                        entry.checkedSubItems ?? []
                                                                    ).includes(si.id);
                                                                    const defaultScore = legacyChecked
                                                                        ? (si.maxPoints ?? si.points ?? 0)
                                                                        : (si.minPoints ?? 0);
                                                                    const currentScore =
                                                                        entry.subItemScores?.[si.id] ?? defaultScore;
                                                                    const min = si.minPoints ?? 0;
                                                                    const max = si.maxPoints ?? si.points ?? 1;
                                                                    return (
                                                                        <div
                                                                            key={si.id}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            style={{
                                                                                display: 'flex',
                                                                                flexDirection: 'column',
                                                                                gap: 4,
                                                                                fontSize: '0.75em',
                                                                                lineHeight: 1.3,
                                                                            }}
                                                                        >
                                                                            <div
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    justifyContent: 'space-between',
                                                                                    alignItems: 'flex-end',
                                                                                }}
                                                                            >
                                                                                <div style={{ paddingRight: 8 }}>
                                                                                    {si.label}
                                                                                </div>
                                                                                <div
                                                                                    style={{
                                                                                        fontWeight: 600,
                                                                                        color: 'var(--accent)',
                                                                                        flexShrink: 0,
                                                                                    }}
                                                                                >
                                                                                    {currentScore} / {max}{' '}
                                                                                    {t('gradeStudent.table_points')}
                                                                                </div>
                                                                            </div>
                                                                            <input
                                                                                type="range"
                                                                                min={min}
                                                                                max={max}
                                                                                step={0.5}
                                                                                value={currentScore}
                                                                                onChange={(e) =>
                                                                                    setSubItemScore(
                                                                                        entry,
                                                                                        si.id,
                                                                                        Number(e.target.value)
                                                                                    )
                                                                                }
                                                                                style={{
                                                                                    width: '100%',
                                                                                    cursor: 'pointer',
                                                                                    height: 4,
                                                                                    accentColor: fmt.accentColor,
                                                                                }}
                                                                            />
                                                                            {si.linkedStandards &&
                                                                                si.linkedStandards.length > 0 && (
                                                                                    <div
                                                                                        style={{
                                                                                            color: 'var(--accent)',
                                                                                            opacity: 0.8,
                                                                                            display: 'flex',
                                                                                            flexWrap: 'wrap',
                                                                                            gap: 3,
                                                                                        }}
                                                                                    >
                                                                                        {si.linkedStandards.map(
                                                                                            (std, idx) => (
                                                                                                <span
                                                                                                    key={idx}
                                                                                                    title={
                                                                                                        showStdDesc
                                                                                                            ? (std.statementNotation ??
                                                                                                              '')
                                                                                                            : std.description
                                                                                                    }
                                                                                                >
                                                                                                    {showStdDesc
                                                                                                        ? std.description
                                                                                                        : `[${std.statementNotation ?? std.guid}]`}
                                                                                                </span>
                                                                                            )
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Base-points range slider (selected only, when range exists) */}
                                                    {isSelected &&
                                                        (level.minPoints !== level.maxPoints ||
                                                            level.subItems.length === 0) && (
                                                            <div
                                                                style={{
                                                                    marginTop: 8,
                                                                    paddingTop: 8,
                                                                    borderTop: `1px solid ${fmt.accentColor}30`,
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <div
                                                                    style={{
                                                                        display: 'flex',
                                                                        flexDirection: 'column',
                                                                        gap: 4,
                                                                    }}
                                                                >
                                                                    <label
                                                                        style={{
                                                                            fontSize: '0.7em',
                                                                            color: 'var(--text-muted)',
                                                                            textTransform: 'uppercase',
                                                                        }}
                                                                    >
                                                                        {c.levels.some((l) => l.subItems.length > 0)
                                                                            ? t('gradeStudent.label_base_points')
                                                                            : t('gradeStudent.label_points')}
                                                                    </label>
                                                                    <div
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            gap: 8,
                                                                        }}
                                                                    >
                                                                        <input
                                                                            type="range"
                                                                            min={level.minPoints}
                                                                            max={level.maxPoints}
                                                                            step={0.5}
                                                                            value={
                                                                                entry.selectedPoints ?? level.minPoints
                                                                            }
                                                                            onChange={(e) =>
                                                                                updateEntry(c.id, {
                                                                                    selectedPoints: Number(
                                                                                        e.target.value
                                                                                    ),
                                                                                })
                                                                            }
                                                                            style={{
                                                                                flex: 1,
                                                                                accentColor: fmt.accentColor,
                                                                            }}
                                                                        />
                                                                        <div
                                                                            style={{
                                                                                fontSize: '0.75em',
                                                                                fontWeight: 600,
                                                                                minWidth: 24,
                                                                                textAlign: 'right',
                                                                            }}
                                                                        >
                                                                            {entry.selectedPoints ?? level.minPoints}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Inline comment editor */}
                                {activeCommentCrit === c.id && (
                                    <div
                                        style={{
                                            marginTop: 12,
                                            padding: 12,
                                            background: 'var(--bg-elevated)',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                        }}
                                    >
                                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <TiptapEditor
                                                    ref={commentEditorRef}
                                                    content={entry.comment || ''}
                                                    onChange={(html) => updateEntry(c.id, { comment: html })}
                                                    placeholder={t('gradeStudent.comment_placeholder')}
                                                />
                                            </div>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                onClick={() => setShowCommentBankFor(c.id)}
                                                title={t('gradeStudent.comment_open_bank')}
                                            >
                                                <BookOpen size={16} />
                                            </button>
                                        </div>
                                        {/* Audio feedback */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                                            {recordingCritId === c.id ? (
                                                <button
                                                    className="btn btn-danger btn-sm pulse"
                                                    onClick={() => stopAudioRecording(c.id)}
                                                >
                                                    <MicOff size={13} /> {t('gradeStudent.audio_stop')}
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    onClick={() => startAudioRecording(c.id)}
                                                >
                                                    <Mic size={13} /> {t('gradeStudent.audio_record')}
                                                </button>
                                            )}
                                            {entry.audioDataUrl && (
                                                <>
                                                    <audio
                                                        controls
                                                        src={entry.audioDataUrl}
                                                        style={{ height: 28, flex: 1 }}
                                                    />
                                                    <button
                                                        className="btn btn-ghost btn-sm"
                                                        onClick={() => updateEntry(c.id, { audioDataUrl: undefined })}
                                                        title={t('gradeStudent.audio_remove')}
                                                    >
                                                        ✕
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Overall comment */}
                <div className="card">
                    <div className="form-group">
                        <label>{t('gradeStudent.overall_comment_label')}</label>
                        <TiptapEditor
                            content={sr.overallComment}
                            onChange={(html) => {
                                setSr((p) => (p ? { ...p, overallComment: html } : p));
                                setIsDirty(true);
                            }}
                            placeholder={t('gradeStudent.overall_comment_placeholder')}
                        />
                    </div>
                </div>

                {/* Anchor paper panel */}
                {anchorSR &&
                    showAnchorPanel &&
                    (() => {
                        const anchorStudent = students.find((s) => s.id === anchorSR.studentId);
                        const anchorRubric = anchorSR.rubricSnapshot ?? liveRubric;
                        return (
                            <div className="card" style={{ marginTop: 16, borderLeft: '4px solid var(--accent)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <BookOpen size={16} style={{ color: 'var(--accent)' }} />
                                    <h3 style={{ margin: 0 }}>
                                        {t('gradeStudent.anchor_panel_title')}: {anchorStudent?.name ?? '?'}
                                    </h3>
                                </div>
                                {anchorRubric?.criteria.map((c) => {
                                    const entry = anchorSR.entries.find((e) => e.criterionId === c.id);
                                    const comment = entry?.comment
                                        ? entry.comment
                                              .replace(/<[^>]*>/g, ' ')
                                              .replace(/\s+/g, ' ')
                                              .trim()
                                        : '';
                                    const levelLabel = entry?.singlePointOutcome
                                        ? entry.singlePointOutcome === 'exceeds'
                                            ? '▲ Exceeds'
                                            : entry.singlePointOutcome === 'meets'
                                              ? '✓ Meets'
                                              : '✗ Not Yet'
                                        : entry?.levelId
                                          ? (c.levels.find((l) => l.id === entry.levelId)?.label ?? '—')
                                          : '—';
                                    return (
                                        <div
                                            key={c.id}
                                            style={{
                                                marginBottom: 10,
                                                padding: '8px 12px',
                                                background: 'var(--bg-elevated)',
                                                borderRadius: 6,
                                            }}
                                        >
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.title}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--accent)', marginTop: 2 }}>
                                                {levelLabel}
                                            </div>
                                            {comment && (
                                                <div
                                                    style={{
                                                        fontSize: '0.78rem',
                                                        color: 'var(--text-muted)',
                                                        fontStyle: 'italic',
                                                        marginTop: 2,
                                                    }}
                                                >
                                                    {comment}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })()}

                {/* Attachments panel */}
                {showAttachPanel && (
                    <div className="card" style={{ marginTop: 16 }}>
                        <h3>{t('gradeStudent.attachments_title')}</h3>
                        {studentAttachments.length > 0 && (
                            <>
                                <p
                                    className="text-xs text-muted"
                                    style={{ margin: '12px 0 8px', fontWeight: 600, textTransform: 'uppercase' }}
                                >
                                    {t('gradeStudent.student_attachments', 'Student files')}
                                </p>
                                <div>
                                    {studentAttachments.map((att) => (
                                        <AttachmentViewer key={att.id} attachment={att} />
                                    ))}
                                </div>
                            </>
                        )}
                        {rubricAttachments.length > 0 && (
                            <>
                                <p
                                    className="text-xs text-muted"
                                    style={{ margin: '12px 0 8px', fontWeight: 600, textTransform: 'uppercase' }}
                                >
                                    {t('gradeStudent.rubric_attachments', 'Rubric materials')}
                                </p>
                                <div>
                                    {rubricAttachments.map((att) => (
                                        <AttachmentViewer key={att.id} attachment={att} />
                                    ))}
                                </div>
                            </>
                        )}
                        {studentAttachments.length === 0 && rubricAttachments.length === 0 && (
                            <p className="text-muted text-sm" style={{ marginTop: 16 }}>
                                {t('gradeStudent.no_attachments', 'No attachments.')}
                            </p>
                        )}
                    </div>
                )}
            </div>
            {showAnalysisPanel && rubric && studentId && rubricId && (
                <DocumentAnalysisPanel
                    studentId={studentId}
                    rubricId={rubricId}
                    rubricName={rubric.name}
                    vocabularyItems={liveRubric?.vocabularyItems ?? []}
                    criteria={rubric.criteria}
                    studentAttachments={studentAttachments}
                    existingResult={existingAnalysisResult}
                    onClose={() => setShowAnalysisPanel(false)}
                    onSaveResult={saveAnalysisResult}
                    onAddToCommentBank={(phrase) => addCommentBankItem(phrase, ['vocabulary'])}
                    onApplyToEntry={(criterionId, subItemId) => {
                        const entry = sr?.entries.find((e) => e.criterionId === criterionId);
                        if (!entry) return;
                        if (!entry.checkedSubItems.includes(subItemId)) {
                            updateEntry(criterionId, { checkedSubItems: [...entry.checkedSubItems, subItemId] });
                        }
                    }}
                />
            )}
            {showCommentBankFor && (
                <CommentBankModal
                    onClose={() => setShowCommentBankFor(null)}
                    onSelect={(text) => {
                        if (!showCommentBankFor) return;
                        // Use the TipTap editor's insertContent API so the text lands as a
                        // proper document node rather than being appended to raw HTML.
                        if (commentEditorRef.current) {
                            commentEditorRef.current.insertContent(text);
                        }
                        setShowCommentBankFor(null);
                    }}
                />
            )}

            {showEssayAssignment && rubricId && studentId && rubric && student && (
                <EssayAssignmentModal
                    rubricId={rubricId}
                    rubricName={rubric.name}
                    studentId={studentId}
                    studentName={student.name}
                    classStudents={classStudents}
                    onClose={() => setShowEssayAssignment(false)}
                    onSaveAssignment={saveEssayAssignment}
                    onOpenSlipSheet={(assignment, sts) => {
                        setSlipSheetData({ assignment, students: sts });
                        setShowEssayAssignment(false);
                    }}
                />
            )}

            {showEssayImport && rubricId && studentId && student && (
                <EssayImportModal
                    rubricId={rubricId}
                    studentId={studentId}
                    studentName={student.name}
                    onFetchSubmissions={(_key) => fetchEssaySubmissionsForStudent(rubricId, studentId)}
                    onGetSignedUrl={getEssaySignedUrl}
                    onDeleteSubmission={deleteEssaySubmission}
                    onImport={(attachment) => {
                        addAttachment(attachment);
                        setShowEssayImport(false);
                        setShowAttachPanel(true);
                    }}
                    onClose={() => setShowEssayImport(false)}
                />
            )}

            {slipSheetData && (
                <EssaySlipSheet
                    baseAssignment={slipSheetData.assignment}
                    students={slipSheetData.students}
                    onClose={() => setSlipSheetData(null)}
                />
            )}

            {showShortcuts && (
                <div className="modal-overlay" onClick={() => setShowShortcuts(false)}>
                    <div
                        className="modal"
                        style={{ maxWidth: 440, width: '95vw' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                            <h3 style={{ margin: 0, flex: 1 }}>
                                {t('gradeStudent.shortcuts_title', 'Keyboard Shortcuts')}
                            </h3>
                            <button className="btn btn-ghost btn-icon" onClick={() => setShowShortcuts(false)}>
                                <X size={18} />
                            </button>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                                {[
                                    { key: '1 – 5', desc: t('gradeStudent.shortcut_level') },
                                    { key: 'Tab / Shift+Tab', desc: t('gradeStudent.shortcut_tab') },
                                    { key: 'Ctrl+S', desc: t('gradeStudent.shortcut_save') },
                                    { key: '?', desc: t('gradeStudent.shortcut_help') },
                                    { key: 'Esc', desc: t('gradeStudent.shortcut_esc') },
                                ].map(({ key, desc }) => (
                                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '10px 16px 10px 0', whiteSpace: 'nowrap' }}>
                                            <kbd
                                                style={{
                                                    background: 'var(--bg-elevated)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: 5,
                                                    padding: '2px 8px',
                                                    fontSize: '0.8rem',
                                                    fontFamily: 'monospace',
                                                }}
                                            >
                                                {key}
                                            </kbd>
                                        </td>
                                        <td
                                            style={{
                                                padding: '10px 0',
                                                color: 'var(--text-muted)',
                                                fontSize: '0.875rem',
                                            }}
                                        >
                                            {desc}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Sticky grade footer */}
            {summary && rubric.format.showCalculatedGrade !== false && (
                <div className="grade-footer" role="status" aria-live="polite" aria-label="Grade summary">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1 }}>
                        {scale && (
                            <span
                                className="grade-chip"
                                style={{
                                    background: `${summary.gradeColor}22`,
                                    border: `2px solid ${summary.gradeColor}`,
                                    color: summary.gradeColor,
                                }}
                            >
                                {summary.letterGrade}
                            </span>
                        )}
                        {scale && (
                            <span style={{ fontSize: '1.05rem', fontWeight: 700 }}>
                                {summary.modifiedPercentage.toFixed(1)}%
                            </span>
                        )}
                        <span className="text-muted text-sm">
                            {summary.rawScore} / {summary.configuredMaxPoints} {t('gradeStudent.table_points')}
                        </span>
                        <span className="text-muted text-sm" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            {summary.gradedCount}/{summary.totalCriteria}{' '}
                            {t('gradeStudent.table_criterion').toLowerCase()}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.8rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                userSelect: 'none',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={feedbackOnly}
                                onChange={(e) => {
                                    setFeedbackOnly(e.target.checked);
                                    setIsDirty(true);
                                }}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            {t('gradeStudent.feedback_only_label')}
                        </label>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                fontSize: '0.8rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                userSelect: 'none',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={isAnchor}
                                onChange={(e) => {
                                    setIsAnchor(e.target.checked);
                                    setIsDirty(true);
                                }}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            {t('gradeStudent.mark_as_anchor')}
                            <span
                                title={t('gradeStudent.anchor_help_text')}
                                aria-label={t('gradeStudent.anchor_help_text')}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    background: 'var(--bg-elevated)',
                                    border: '1px solid var(--border)',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color: 'var(--text-dim)',
                                    cursor: 'help',
                                    flexShrink: 0,
                                }}
                            >
                                ?
                            </span>
                        </label>
                        {anchorSR && (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setShowAnchorPanel((p) => !p)}
                                style={{ fontSize: '0.75rem' }}
                            >
                                <BookOpen size={12} />{' '}
                                {showAnchorPanel
                                    ? t('gradeStudent.anchor_panel_hide')
                                    : t('gradeStudent.anchor_panel_title')}
                            </button>
                        )}
                        {nextStudent && (
                            <button className="btn btn-secondary btn-sm" onClick={handleSaveAndNext}>
                                <Save size={14} /> <ChevronRight size={14} /> {nextStudent.name.split(' ')[0]}
                            </button>
                        )}
                        <button className={`btn btn-sm ${saved ? 'btn-success' : 'btn-primary'}`} onClick={handleSave}>
                            <Save size={14} /> {saved ? t('gradeStudent.action_saved') : t('gradeStudent.action_save')}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
