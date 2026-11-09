import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Check,
    ChevronLeft,
    ChevronRight,
    Keyboard,
    LayoutGrid,
    ListChecks,
    User,
    Users,
    X,
} from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { EmptyState } from '../components/ui/EmptyState';
import Modal from '../components/ui/Modal';
import SegmentedToggle from '../components/ui/SegmentedToggle';
import CommentBankModal from '../components/Comments/CommentBankModal';
import { useStoreActions, useStoreSelector } from '../context/useStore';
import { useSettings } from '../context/AppContext';
import { useOwnOrSharedItem } from '../hooks/useSharedMaterials';
import { useDbStatus } from '../hooks/useDbStatus';
import { useCanEditStudentWork } from '../hooks/useClassRoles';
import { SkeletonRow } from '../components/ui/Skeleton';
import { pickLatestAttempt } from '../utils/testAnswerText';
import { scoreTestAnswer } from '../utils/testCalc';
import { scoreStudentTest } from '../utils/studentTestScore';
import { clamp } from '../utils/clamp';
import { stripHtmlTags } from '../utils/exportDataPrep';
import type { CommentBankItem, StudentTest, TestAnswer, TestQuestion } from '../types';

// TODO(i18n): move strings to locales once the design is approved —
// hardcoded English keeps this page out of the locale-parity tests.
type ViewMode = 'question' | 'student' | 'matrix';

const MATRIX_GREY_BG = 'color-mix(in srgb, var(--text-muted) 18%, transparent)';
const MATRIX_GREEN_BG = 'color-mix(in srgb, var(--green) 30%, transparent)';
const MATRIX_RED_BG = 'color-mix(in srgb, var(--red) 25%, transparent)';
const MATRIX_YELLOW_BG = 'color-mix(in srgb, var(--yellow) 30%, transparent)';

interface QueueStep {
    key: string;
    studentTestId: string;
    studentId: string;
    studentName: string;
    questionId: string;
    questionIndex: number;
    question: TestQuestion;
    response: string;
    autoScore: number | null;
    savedPoints: number | undefined;
    skipped: boolean;
}

function expectedAnswerText(q: TestQuestion): string {
    if (q.expectedAnswer) return stripHtmlTags(q.expectedAnswer);
    if (q.expectedAnswers?.length) return q.expectedAnswers.map((a) => stripHtmlTags(a)).join(' / ');
    if (q.type === 'numeric' && q.expectedNumericValue !== undefined) return String(q.expectedNumericValue);
    return '';
}

function answerDisplayText(q: TestQuestion, response: string): string {
    if (q.type === 'multiple-choice') {
        return q.options?.find((o) => o.id === response)?.text ?? response;
    }
    if (q.type === 'multiple-response') {
        try {
            const ids = JSON.parse(response) as string[];
            return ids.map((id) => q.options?.find((o) => o.id === id)?.text ?? id).join(', ');
        } catch {
            return response;
        }
    }
    return response;
}

function shortPrompt(q: TestQuestion, index: number): string {
    const text = stripHtmlTags(q.prompt).slice(0, 80);
    return `Q${index + 1} · ${text}${stripHtmlTags(q.prompt).length > 80 ? '…' : ''}`;
}

export default function TestGradingQueuePage() {
    const { testId } = useParams<{ testId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const {
        tests,
        studentTests,
        students: allStudents,
    } = useStoreSelector((s) => ({
        tests: s.tests,
        studentTests: s.studentTests,
        students: s.students,
    }));
    const { item: test, loading: sharedLoading } = useOwnOrSharedItem(
        'test',
        testId,
        tests.find((x) => x.id === testId)
    );

    const { settings, updateSettings } = useSettings();
    // An explicit ?view= link (e.g. from the results page) wins for that visit; otherwise
    // each teacher gets their own persisted preference, falling back to the matrix default.
    const initialView = searchParams.get('view');
    const savedView = settings.gradeQueueView;
    const [view, setView] = useState<ViewMode>(
        initialView === 'question' || initialView === 'student'
            ? initialView
            : savedView === 'question' || savedView === 'student' || savedView === 'matrix'
              ? savedView
              : 'matrix'
    );
    function handleViewChange(v: ViewMode) {
        setView(v);
        updateSettings({ gradeQueueView: v });
    }
    const [groupIndex, setGroupIndex] = useState(0);
    const [stepIndex, setStepIndex] = useState(0);
    const [selectedIdx, setSelectedIdx] = useState(0);
    const [draftPoints, setDraftPoints] = useState<Record<string, string>>({});
    const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
    const [skipped, setSkipped] = useState<Set<string>>(new Set());
    const [commentBankFor, setCommentBankFor] = useState<string | null>(null);
    const [savedCommentFor, setSavedCommentFor] = useState<string | null>(null);
    const { saveStudentTest, recordCommentBankUsage, addCommentBankItem } = useStoreActions();
    const dbStatus = useDbStatus();
    const canEditStudentWork = useCanEditStudentWork();

    const students = useMemo(() => allStudents.filter((s) => !s.archivedAt), [allStudents]);

    const attempts: StudentTest[] = useMemo(() => {
        const byStudent = new Map<string, StudentTest[]>();
        for (const st of studentTests.filter((st) => st.testId === testId && !st.absent)) {
            byStudent.set(st.studentId, [...(byStudent.get(st.studentId) ?? []), st]);
        }
        return [...byStudent.values()]
            .map((list) => pickLatestAttempt(list)!)
            .filter(Boolean)
            .sort((a, b) => a.studentId.localeCompare(b.studentId));
    }, [studentTests, testId]);

    const steps: QueueStep[] = useMemo(() => {
        if (!test) return [];
        const out: QueueStep[] = [];
        const nameOf = (id: string) => students.find((s) => s.id === id)?.name ?? id;
        if (view === 'question') {
            test.questions.forEach((q, qi) => {
                for (const st of attempts) {
                    const answer = st.answers.find((a) => a.questionId === q.id);
                    if (!answer || answer.response.trim() === '') continue;
                    out.push({
                        key: `${st.id}:${q.id}`,
                        studentTestId: st.id,
                        studentId: st.studentId,
                        studentName: nameOf(st.studentId),
                        questionId: q.id,
                        questionIndex: qi,
                        question: q,
                        response: answer.response,
                        autoScore: scoreTestAnswer(q, answer),
                        savedPoints: answer.pointsEarned,
                        skipped: skipped.has(`${st.id}:${q.id}`),
                    });
                }
            });
        } else {
            for (const st of attempts) {
                for (const [qi, q] of test.questions.entries()) {
                    const answer = st.answers.find((a) => a.questionId === q.id);
                    if (!answer || answer.response.trim() === '') continue;
                    out.push({
                        key: `${st.id}:${q.id}`,
                        studentTestId: st.id,
                        studentId: st.studentId,
                        studentName: nameOf(st.studentId),
                        questionId: q.id,
                        questionIndex: qi,
                        question: q,
                        response: answer.response,
                        autoScore: scoreTestAnswer(q, answer),
                        savedPoints: answer.pointsEarned,
                        skipped: skipped.has(`${st.id}:${q.id}`),
                    });
                }
            }
        }
        return out;
    }, [test, attempts, students, view, skipped]);

    // Groups: per question in question-mode, per student in student-mode.
    const groups = useMemo(() => {
        const map = new Map<string, { label: string; steps: number[] }>();
        steps.forEach((s, i) => {
            const gkey = view === 'question' ? s.questionId : s.studentTestId;
            const label = view === 'question' ? shortPrompt(s.question, s.questionIndex) : s.studentName;
            const g = map.get(gkey) ?? { label, steps: [] };
            g.steps.push(i);
            map.set(gkey, g);
        });
        return [...map.values()];
    }, [steps, view]);

    const visibleSteps = groups[groupIndex]?.steps ?? [];
    const currentGlobal = visibleSteps[Math.min(stepIndex, Math.max(visibleSteps.length - 1, 0))] ?? 0;
    const current = steps[currentGlobal];

    // Matrix view shares the same step set (student-major order, same as the By student
    // branch) — selection is a plain index into `steps`, so drafts/skips carry across views.
    const inMatrix = view === 'matrix';
    const matrixIdx = Math.min(selectedIdx, Math.max(steps.length - 1, 0));
    const detailStep = inMatrix ? steps[matrixIdx] : current;

    const detailPrev = useCallback(() => {
        if (inMatrix) setSelectedIdx((i) => Math.max(i - 1, 0));
        else setStepIndex((i) => Math.max(i - 1, 0));
    }, [inMatrix]);
    const detailNext = useCallback(() => {
        if (inMatrix) setSelectedIdx((i) => Math.min(i + 1, steps.length - 1));
        else setStepIndex((i) => Math.min(i + 1, visibleSteps.length - 1));
    }, [inMatrix, steps.length, visibleSteps.length]);
    const detailCanPrev = inMatrix ? matrixIdx > 0 : stepIndex > 0;
    const detailCanNext = inMatrix ? matrixIdx < steps.length - 1 : stepIndex < visibleSteps.length - 1;

    const decided = steps.filter(
        (s) => s.savedPoints !== undefined || draftPoints[s.key] !== undefined || skipped.has(s.key)
    ).length;

    const attemptById = useMemo(() => new Map(attempts.map((st) => [st.id, st])), [attempts]);

    function latestAnswerFor(step: QueueStep): TestAnswer | undefined {
        const answers = attemptById.get(step.studentTestId)?.answers;
        if (!answers) return undefined;
        for (let i = answers.length - 1; i >= 0; i--) {
            if (answers[i].questionId === step.questionId) return answers[i];
        }
        return undefined;
    }

    const detailStudentClassId = detailStep ? students.find((s) => s.id === detailStep.studentId)?.classId : undefined;
    const readOnly = !canEditStudentWork(detailStudentClassId);

    const unsavedCount = steps.filter((s) => {
        const answer = latestAnswerFor(s);
        const d = draftPoints[s.key];
        const f = feedbackDrafts[s.key];
        return (
            (d !== undefined && d !== String(answer?.pointsEarned ?? '')) ||
            (f !== undefined && f !== (answer?.feedback ?? ''))
        );
    }).length;

    function handleSaveCurrent() {
        const step = detailStep;
        if (!step || readOnly || !test) return;
        const st = attemptById.get(step.studentTestId);
        if (!st) return;
        const existingAnswers = st.answers;
        let idx = -1;
        for (let i = existingAnswers.length - 1; i >= 0; i--) {
            if (existingAnswers[i].questionId === step.questionId) {
                idx = i;
                break;
            }
        }
        const previous = idx >= 0 ? existingAnswers[idx] : undefined;
        const pointsEarned = clamp(
            Number(draftPoints[step.key] ?? previous?.pointsEarned ?? step.autoScore ?? 0) || 0,
            0,
            step.question.points
        );
        const feedback = feedbackDrafts[step.key] ?? previous?.feedback ?? '';
        const updatedAnswer: TestAnswer =
            idx >= 0
                ? { ...previous!, pointsEarned, feedback }
                : { questionId: step.questionId, response: step.response, pointsEarned, feedback };
        const nextAnswers =
            idx >= 0
                ? existingAnswers.map((a, i) => (i === idx ? updatedAnswer : a))
                : [...existingAnswers, updatedAnswer];
        const updated: StudentTest = {
            ...st,
            ...(dbStatus.isConnected && dbStatus.userId ? { lastEditedBy: dbStatus.userId } : {}),
            answers: nextAnswers,
            rawTotalPoints: scoreStudentTest(test, { ...st, answers: nextAnswers }).rawPoints,
            status: st.status === 'submitted' ? 'graded' : st.status,
            gradedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        saveStudentTest(updated);
        setSkipped((prev) => {
            if (!prev.has(step.key)) return prev;
            const next = new Set(prev);
            next.delete(step.key);
            return next;
        });
    }

    function handleInsertComment(item: CommentBankItem) {
        const key = commentBankFor;
        if (!key) return;
        const target = steps.find((s) => s.key === key);
        if (!target) return;
        const current = feedbackDrafts[key] ?? latestAnswerFor(target)?.feedback ?? '';
        const next = current ? `${current}\n${item.text}` : item.text;
        setFeedbackDrafts((prev) => ({ ...prev, [key]: next }));
        recordCommentBankUsage(item.id);
        setCommentBankFor(null);
    }

    function handleSaveAsComment() {
        const step = detailStep;
        if (!step) return;
        const text = (feedbackDrafts[step.key] ?? latestAnswerFor(step)?.feedback ?? '').trim();
        if (!text) return;
        addCommentBankItem(text, []);
        setSavedCommentFor(step.key);
        setTimeout(() => setSavedCommentFor((cur) => (cur === step.key ? null : cur)), 2500);
    }

    // Matrix detail opens in the shared Radix-backed Modal (focus trap, Escape,
    // focus restoration and body portal) — see #533 / #1017. growFrom keeps the
    // open animation anchored to the clicked cell.
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [growFrom, setGrowFrom] = useState<{ x: number; y: number } | undefined>(undefined);
    const pointsInputRef = useRef<HTMLInputElement>(null);

    function openCellPopover(idx: number, anchorEl: HTMLElement | null) {
        setSelectedIdx(idx);
        if (anchorEl) {
            const r = anchorEl.getBoundingClientRect();
            setGrowFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
        } else {
            setGrowFrom(undefined);
        }
        setPopoverOpen(true);
    }

    // Focus the points field whenever the dialog (re)opens on an answer.
    useEffect(() => {
        if (inMatrix && popoverOpen) pointsInputRef.current?.focus();
    }, [inMatrix, popoverOpen, matrixIdx]);

    useEffect(() => {
        setGroupIndex(0);
        setStepIndex(0);
        setSelectedIdx(0);
        setPopoverOpen(false);
    }, [view, testId]);

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const target = e.target as HTMLElement;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
            if (!detailStep) return;
            if (readOnly) {
                if (e.key === 'j' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    detailNext();
                } else if (e.key === 'k' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    detailPrev();
                }
                return;
            }
            if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                detailNext();
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                detailPrev();
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                setSkipped((prev) => new Set(prev).add(detailStep.key));
                detailNext();
            } else if (/^[0-9]$/.test(e.key) && detailStep.question.points <= 9) {
                setDraftPoints((prev) => ({ ...prev, [detailStep.key]: e.key }));
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [detailStep, detailNext, detailPrev, inMatrix, readOnly]);

    if (!test && sharedLoading) {
        return (
            <>
                <Topbar title="Grading queue" />
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
                <Topbar title="Grading queue" />
                <div className="page-content">
                    <EmptyState
                        icon={ListChecks}
                        title="Test not found"
                        titleLevel={2}
                        description=""
                        action={{ label: 'Back to tests', icon: ArrowLeft, onClick: () => navigate('/tests') }}
                    />
                </div>
            </>
        );
    }
    if (attempts.length === 0) {
        return (
            <>
                <Topbar
                    title={`Grading queue — ${test.name}`}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tests/${test.id}/scores`)}>
                            <ArrowLeft size={15} /> Back to scores
                        </button>
                    }
                />
                <div className="page-content">
                    <EmptyState
                        icon={Users}
                        title="No submissions to grade yet"
                        titleLevel={2}
                        description="Handed-in attempts will appear here as an [answer] → [points] queue."
                        action={{
                            label: 'Back to scores',
                            icon: ArrowLeft,
                            onClick: () => navigate(`/tests/${test.id}/scores`),
                        }}
                    />
                </div>
            </>
        );
    }

    const draft = detailStep
        ? (draftPoints[detailStep.key] ?? String(detailStep.savedPoints ?? detailStep.autoScore ?? ''))
        : '';
    const feedbackDraft = detailStep
        ? (feedbackDrafts[detailStep.key] ?? latestAnswerFor(detailStep)?.feedback ?? '')
        : '';

    // Matrix cell presentation: grey = no decision yet, green = full points,
    // red = zero, yellow = partial (theme yellow stands in for orange).
    const cellVisual = (step: QueueStep): { bg: string; label: string; sub: string } => {
        const draftVal = draftPoints[step.key];
        const decidedCell = step.savedPoints !== undefined || draftVal !== undefined;
        const earned = draftVal !== undefined ? Number(draftVal) || 0 : (step.savedPoints ?? step.autoScore);
        const max = step.question.points;
        if (step.skipped)
            return {
                bg: MATRIX_YELLOW_BG,
                label: earned !== undefined ? `${earned}/${max}` : `–/${max}`,
                sub: 'skipped',
            };
        if (!decidedCell) {
            return {
                bg: MATRIX_GREY_BG,
                label: earned !== undefined && earned !== null ? `${earned}/${max}` : `–/${max}`,
                sub: 'auto',
            };
        }
        const e = earned ?? 0;
        if (e >= max) return { bg: MATRIX_GREEN_BG, label: `${e}/${max}`, sub: '' };
        if (e <= 0) return { bg: MATRIX_RED_BG, label: `${e}/${max}`, sub: '' };
        return { bg: MATRIX_YELLOW_BG, label: `${e}/${max}`, sub: '' };
    };

    function renderDetailCard(showClose: boolean) {
        if (!detailStep) return null;
        return (
            <article className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, margin: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h3 id="queue-grade-title" style={{ margin: 0, fontSize: '1rem' }}>
                        {view === 'student'
                            ? `Q${detailStep.questionIndex + 1} · ${detailStep.studentName}`
                            : `${detailStep.studentName} · Q${detailStep.questionIndex + 1}`}
                    </h3>
                    {detailStep.savedPoints !== undefined ? (
                        <span className="badge badge-green">decided: {detailStep.savedPoints}</span>
                    ) : (
                        <span className="badge">auto: {detailStep.autoScore ?? '—'}</span>
                    )}
                    {skipped.has(detailStep.key) && <span className="badge badge-yellow">skipped</span>}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={!detailCanPrev}
                            onClick={detailPrev}
                            aria-label="Previous answer"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={!detailCanNext}
                            onClick={detailNext}
                            aria-label="Next answer"
                        >
                            <ChevronRight size={14} />
                        </button>
                        {showClose && (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setPopoverOpen(false)}
                                aria-label="Close grading popover"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </span>
                </div>

                <div>
                    <div className="text-muted text-xs">QUESTION</div>
                    <p style={{ margin: '4px 0' }}>{stripHtmlTags(detailStep.question.prompt)}</p>
                    {expectedAnswerText(detailStep.question) && (
                        <p className="text-muted text-sm" style={{ margin: 0 }}>
                            Expected: {expectedAnswerText(detailStep.question)}
                        </p>
                    )}
                </div>

                <div>
                    <div className="text-muted text-xs">STUDENT ANSWER</div>
                    <p style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                        {stripHtmlTags(answerDisplayText(detailStep.question, detailStep.response))}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="text-muted text-xs">Points (max {detailStep.question.points})</span>
                        <input
                            ref={pointsInputRef}
                            type="number"
                            min={0}
                            max={detailStep.question.points}
                            value={draft}
                            disabled={readOnly}
                            onChange={(e) => setDraftPoints((prev) => ({ ...prev, [detailStep.key]: e.target.value }))}
                            style={{ width: 120 }}
                            aria-label={`Points for ${detailStep.studentName}, question ${detailStep.questionIndex + 1}`}
                        />
                    </label>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={readOnly}
                        title={readOnly ? 'This class is shared with you as view-only.' : undefined}
                        onClick={handleSaveCurrent}
                    >
                        <Check size={13} /> Save score
                    </button>
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSkipped((prev) => new Set(prev).add(detailStep.key))}
                    >
                        Skip (S)
                    </button>
                </div>

                <div>
                    <label
                        htmlFor={`queue-feedback-${detailStep.key}`}
                        className="text-muted text-xs"
                        style={{ display: 'block', marginBottom: 4 }}
                    >
                        Feedback
                    </label>
                    <textarea
                        id={`queue-feedback-${detailStep.key}`}
                        rows={2}
                        value={feedbackDraft}
                        disabled={readOnly}
                        onChange={(e) => {
                            setFeedbackDrafts((prev) => ({ ...prev, [detailStep.key]: e.target.value }));
                            setSavedCommentFor((cur) => (cur === detailStep.key ? null : cur));
                        }}
                        placeholder="Feedback for the student…"
                        style={{ width: '100%' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={readOnly}
                            onClick={() => setCommentBankFor(detailStep.key)}
                        >
                            <BookOpen size={13} /> Insert comment
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={readOnly || !feedbackDraft.trim()}
                            onClick={handleSaveAsComment}
                        >
                            {savedCommentFor === detailStep.key ? (
                                <>
                                    <Check size={13} /> Comment saved
                                </>
                            ) : (
                                'Save as comment'
                            )}
                        </button>
                    </div>
                </div>
                {readOnly ? (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        This class is shared with you as view-only — scores can't be changed.
                    </p>
                ) : (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        Save writes points + feedback to the attempt and marks it graded.
                    </p>
                )}
            </article>
        );
    }

    return (
        <>
            <Topbar
                title={`Grading queue — ${test.name}`}
                actions={
                    <>
                        {unsavedCount > 0 && (
                            <span className="badge badge-yellow" title="Draft points/feedback not saved yet.">
                                {unsavedCount} unsaved
                            </span>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tests/${test.id}/scores`)}>
                            <ArrowLeft size={15} /> Back to scores
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <SegmentedToggle
                        ariaLabel="Queue direction"
                        value={view}
                        onChange={(v) => handleViewChange(v as ViewMode)}
                        options={[
                            { value: 'question', label: 'By question', icon: <ListChecks size={14} /> },
                            { value: 'student', label: 'By student', icon: <User size={14} /> },
                            { value: 'matrix', label: 'Matrix', icon: <LayoutGrid size={14} /> },
                        ]}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                        <span className="text-muted text-sm" aria-live="polite">
                            {decided} of {steps.length} decided
                        </span>
                        <div style={{ width: 140, height: 8, borderRadius: 4, background: 'var(--border)' }}>
                            <div
                                style={{
                                    width: steps.length ? `${(decided / steps.length) * 100}%` : '0%',
                                    height: '100%',
                                    borderRadius: 4,
                                    background: 'var(--accent)',
                                }}
                            />
                        </div>
                    </div>
                </div>

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: inMatrix ? '1fr' : '260px 1fr',
                        gap: 16,
                        alignItems: 'start',
                    }}
                >
                    {!inMatrix && (
                        <nav aria-label="Queue groups" className="card" style={{ padding: 8 }}>
                            {(view === 'question'
                                ? test.questions.map((q, i) => shortPrompt(q, i))
                                : groups.map((g) => g.label)
                            ).map((label, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    className={`btn btn-ghost btn-sm ${i === groupIndex ? 'btn-secondary' : ''}`}
                                    style={{
                                        display: 'flex',
                                        width: '100%',
                                        justifyContent: 'flex-start',
                                        marginBottom: 2,
                                    }}
                                    onClick={() => {
                                        setGroupIndex(i);
                                        setStepIndex(0);
                                    }}
                                >
                                    <span
                                        style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                    >
                                        {label}
                                    </span>
                                    <span className="text-muted text-xs" style={{ marginLeft: 'auto' }}>
                                        {groups[i]?.steps.length ?? 0}
                                    </span>
                                </button>
                            ))}
                        </nav>
                    )}

                    {inMatrix && (
                        <div className="card" style={{ overflowX: 'auto', padding: 12, gridColumn: '1 / -1' }}>
                            <table
                                style={{
                                    borderCollapse: 'separate',
                                    borderSpacing: 4,
                                    fontSize: '0.85rem',
                                    minWidth: '100%',
                                }}
                                aria-label="Grading matrix"
                            >
                                <thead>
                                    <tr>
                                        <th
                                            style={{
                                                position: 'sticky',
                                                left: 0,
                                                background: 'var(--bg-elevated)',
                                                zIndex: 1,
                                                textAlign: 'left',
                                                padding: '6px 8px',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            Student
                                        </th>
                                        {test.questions.map((q, qi) => (
                                            <th
                                                key={q.id}
                                                style={{
                                                    padding: '6px 8px',
                                                    textAlign: 'center',
                                                    whiteSpace: 'nowrap',
                                                }}
                                                title={stripHtmlTags(q.prompt)}
                                            >
                                                Q{qi + 1} <span className="text-muted">/{q.points}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {attempts.map((st) => {
                                        const name = students.find((s) => s.id === st.studentId)?.name ?? st.studentId;
                                        return (
                                            <tr key={st.id}>
                                                <td
                                                    style={{
                                                        position: 'sticky',
                                                        left: 0,
                                                        background: 'var(--bg-elevated)',
                                                        zIndex: 1,
                                                        padding: '6px 8px',
                                                        fontWeight: 600,
                                                        whiteSpace: 'nowrap',
                                                    }}
                                                >
                                                    {name}
                                                </td>
                                                {test.questions.map((q, qi) => {
                                                    const step = steps.find(
                                                        (s) => s.studentTestId === st.id && s.questionId === q.id
                                                    );
                                                    if (!step) {
                                                        return (
                                                            <td key={q.id} style={{ padding: 2 }}>
                                                                <div
                                                                    title={`${name} · Q${qi + 1}: no answer`}
                                                                    style={{
                                                                        height: 40,
                                                                        borderRadius: 6,
                                                                        border: '1px dashed var(--border)',
                                                                    }}
                                                                />
                                                            </td>
                                                        );
                                                    }
                                                    const v = cellVisual(step);
                                                    const selected = detailStep?.key === step.key;
                                                    return (
                                                        <td key={q.id} style={{ padding: 2 }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) =>
                                                                    openCellPopover(
                                                                        steps.indexOf(step),
                                                                        e.currentTarget
                                                                    )
                                                                }
                                                                title={`${name} · Q${qi + 1}: ${v.label}${v.sub ? ` (${v.sub})` : ''} — open to grade`}
                                                                aria-label={`${name}, question ${qi + 1}: ${v.label}${v.sub ? `, ${v.sub}` : ''}`}
                                                                style={{
                                                                    width: '100%',
                                                                    minWidth: 72,
                                                                    borderRadius: 6,
                                                                    border: selected
                                                                        ? '2px solid var(--accent)'
                                                                        : '1px solid transparent',
                                                                    background: v.bg,
                                                                    padding: '4px 6px',
                                                                    cursor: 'pointer',
                                                                    color: 'var(--text)',
                                                                }}
                                                            >
                                                                <div style={{ fontWeight: 700 }}>{v.label}</div>
                                                                {v.sub && (
                                                                    <div
                                                                        className="text-muted"
                                                                        style={{ fontSize: '0.68rem' }}
                                                                    >
                                                                        {v.sub}
                                                                    </div>
                                                                )}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            <div
                                className="text-muted text-xs"
                                style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}
                            >
                                <span>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 2,
                                            background: MATRIX_GREEN_BG,
                                            border: '1px solid var(--green)',
                                        }}
                                    />{' '}
                                    full points
                                </span>
                                <span>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 2,
                                            background: MATRIX_YELLOW_BG,
                                            border: '1px solid var(--yellow)',
                                        }}
                                    />{' '}
                                    partial / skipped
                                </span>
                                <span>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 2,
                                            background: MATRIX_RED_BG,
                                            border: '1px solid var(--red)',
                                        }}
                                    />{' '}
                                    zero
                                </span>
                                <span>
                                    <span
                                        style={{
                                            display: 'inline-block',
                                            width: 10,
                                            height: 10,
                                            borderRadius: 2,
                                            background: MATRIX_GREY_BG,
                                            border: '1px solid var(--border)',
                                        }}
                                    />{' '}
                                    needs grading (auto shown)
                                </span>
                            </div>
                        </div>
                    )}

                    {!inMatrix && detailStep ? (
                        renderDetailCard(false)
                    ) : !inMatrix ? (
                        <EmptyState
                            icon={ListChecks}
                            title="Nothing in this group"
                            titleLevel={2}
                            description="Answers with empty responses are skipped here."
                        />
                    ) : null}
                </div>

                {inMatrix && popoverOpen && detailStep && (
                    <Modal
                        titleId="queue-grade-title"
                        onClose={() => setPopoverOpen(false)}
                        maxWidth={560}
                        growFrom={growFrom}
                    >
                        {renderDetailCard(true)}
                    </Modal>
                )}

                <p className="text-muted text-xs" style={{ margin: 0, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Keyboard size={13} /> J/K or ↑/↓ moves between answers · digits set points (0–9 max questions) · S
                    skips{inMatrix ? ' · click a matrix cell to grade it' : ''}
                </p>
                {commentBankFor && steps.some((s) => s.key === commentBankFor) && (
                    <CommentBankModal onClose={() => setCommentBankFor(null)} onSelect={handleInsertComment} />
                )}
            </div>
        </>
    );
}
