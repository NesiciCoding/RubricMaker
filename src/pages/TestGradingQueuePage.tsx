import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    BookOpen,
    Check,
    ChevronLeft,
    ChevronRight,
    Keyboard,
    KeyRound,
    LayoutGrid,
    ListChecks,
    Undo2,
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
import { useCanGradeStudentWork } from '../hooks/useRosterScope';
import { SkeletonRow } from '../components/ui/Skeleton';
import { formatCorrectAnswer, pickLatestAttempt } from '../utils/testAnswerText';
import QueueAnswer from '../components/Tests/QueueAnswer';
import { useToast } from '../hooks/useToast';
import { canAdoptAnswer, markAdoptedAnswersCorrect, withAdoptedAnswer } from '../utils/answerKey';
import { findNextUndecided } from '../utils/gradingQueueNavigation';
import {
    clearGradeQueueSession,
    gradeQueueSessionKey,
    hasSessionContent,
    loadGradeQueueSession,
    saveGradeQueueSession,
    type GradeQueueSession,
    type GradeQueueSessionState,
} from '../utils/gradeQueueSession';
import { scoreTestAnswer } from '../utils/testCalc';
import { scoreStudentTest } from '../utils/studentTestScore';
import { answerReviewState, autoConfirmEnabled, type AnswerReviewState } from '../utils/testAutoConfirm';
import { clamp } from '../utils/clamp';
import { stripHtmlTags } from '../utils/exportDataPrep';
import { useTranslation } from 'react-i18next';
import type { CommentBankItem, StudentTest, Test, TestAnswer, TestQuestion } from '../types';
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
    review: AnswerReviewState;
}

function hasExpectedAnswer(q: TestQuestion): boolean {
    return formatCorrectAnswer(q).trim() !== '' || !!q.expectedAnswer || !!q.expectedAnswers?.length;
}

function shortPrompt(q: TestQuestion, index: number): string {
    const text = stripHtmlTags(q.prompt).slice(0, 80);
    return `Q${index + 1} · ${text}${stripHtmlTags(q.prompt).length > 80 ? '…' : ''}`;
}

export default function TestGradingQueuePage() {
    const { testId } = useParams<{ testId: string }>();
    const { t } = useTranslation();
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
    const {
        item: test,
        entry: sharedEntry,
        loading: sharedLoading,
    } = useOwnOrSharedItem(
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
    const [lastSave, setLastSave] = useState<{
        stepKey: string;
        previousAttempts: StudentTest[];
        previousTest?: Test;
    } | null>(null);
    const { saveStudentTest, updateTest, recordCommentBankUsage, addCommentBankItem } = useStoreActions();
    const { showToast } = useToast();
    const dbStatus = useDbStatus();
    const canEditStudentWork = useCanGradeStudentWork();
    const queueSessionKey = useMemo(() => gradeQueueSessionKey(testId, dbStatus.userId), [testId, dbStatus.userId]);
    const restoredPositionRef = useRef<GradeQueueSession | null>(null);
    const sessionKeyRef = useRef<string | null>(null);
    const pendingSessionRef = useRef<{ state: GradeQueueSessionState; settled: boolean } | null>(null);

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

    const [showAutoConfirmed, setShowAutoConfirmed] = useState(false);

    const allSteps: QueueStep[] = useMemo(() => {
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
                        review: answerReviewState(test, q, answer),
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
                        review: answerReviewState(test, q, answer),
                    });
                }
            }
        }
        return out;
    }, [test, attempts, students, view, skipped]);

    // The matrix is the overview, so it keeps auto-confirmed cells; the walk-through views only
    // queue what still needs a human unless the teacher asks to see everything.
    const steps = useMemo(
        () =>
            view === 'matrix' || showAutoConfirmed
                ? allSteps
                : allSteps.filter((s) => s.review.state !== 'auto-confirmed'),
        [allSteps, view, showAutoConfirmed]
    );
    const autoConfirmedCount = allSteps.filter((s) => s.review.state === 'auto-confirmed').length;
    const stepIndexByCell = useMemo(
        () => new Map(steps.map((s, i) => [`${s.studentTestId}:${s.questionId}`, i])),
        [steps]
    );

    // Groups: per question in question-mode, per student in student-mode. Question view is
    // seeded with every question so the nav (one button per test.questions) indexes into
    // groups 1:1 — otherwise a question with no answers shifts every later button, and an
    // out-of-range groupIndex falls back to an unrelated answer instead of the empty state.
    const groups = useMemo(() => {
        const map = new Map<string, { label: string; steps: number[] }>();
        if (view === 'question' && test) {
            test.questions.forEach((q, qi) => map.set(q.id, { label: shortPrompt(q, qi), steps: [] }));
        }
        steps.forEach((s, i) => {
            const gkey = view === 'question' ? s.questionId : s.studentTestId;
            const label = view === 'question' ? shortPrompt(s.question, s.questionIndex) : s.studentName;
            const g = map.get(gkey) ?? { label, steps: [] };
            g.steps.push(i);
            map.set(gkey, g);
        });
        return [...map.values()];
    }, [steps, view, test]);

    const visibleSteps = groups[groupIndex]?.steps ?? [];
    const currentGlobal = visibleSteps[Math.min(stepIndex, Math.max(visibleSteps.length - 1, 0))];
    const current = currentGlobal === undefined ? undefined : steps[currentGlobal];

    // Matrix view shares the same step set (student-major order, same as the By student
    // branch) — selection is a plain index into `steps`, so drafts/skips carry across views.
    const inMatrix = view === 'matrix';
    const matrixIdx = Math.min(selectedIdx, Math.max(steps.length - 1, 0));
    const detailStep = inMatrix ? steps[matrixIdx] : current;

    // Moving past the last answer of a group continues into the neighbouring group, so a full pass
    // over a test does not stop at every question/student boundary.
    const detailPrev = useCallback(() => {
        if (inMatrix) {
            setSelectedIdx(Math.max(matrixIdx - 1, 0));
            return;
        }
        if (stepIndex > 0) {
            setStepIndex(stepIndex - 1);
            return;
        }
        for (let gi = groupIndex - 1; gi >= 0; gi--) {
            const inGroup = groups[gi]?.steps.length ?? 0;
            if (inGroup > 0) {
                setGroupIndex(gi);
                setStepIndex(inGroup - 1);
                return;
            }
        }
    }, [inMatrix, matrixIdx, stepIndex, groupIndex, groups]);
    const detailNext = useCallback(() => {
        if (inMatrix) {
            setSelectedIdx(Math.min(matrixIdx + 1, steps.length - 1));
            return;
        }
        if (stepIndex < visibleSteps.length - 1) {
            setStepIndex(stepIndex + 1);
            return;
        }
        for (let gi = groupIndex + 1; gi < groups.length; gi++) {
            if ((groups[gi]?.steps.length ?? 0) > 0) {
                setGroupIndex(gi);
                setStepIndex(0);
                return;
            }
        }
    }, [inMatrix, matrixIdx, steps.length, stepIndex, visibleSteps.length, groupIndex, groups]);
    const detailCanPrev = inMatrix
        ? matrixIdx > 0
        : stepIndex > 0 || groups.slice(0, groupIndex).some((g) => g.steps.length > 0);
    const detailCanNext = inMatrix
        ? matrixIdx < steps.length - 1
        : stepIndex < visibleSteps.length - 1 || groups.slice(groupIndex + 1).some((g) => g.steps.length > 0);

    const decided = steps.filter(
        (s) =>
            s.savedPoints !== undefined ||
            draftPoints[s.key] !== undefined ||
            skipped.has(s.key) ||
            s.review.state === 'auto-confirmed'
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

    const decidedByStep = useMemo(
        () =>
            new Map(
                steps.map((s) => [
                    s.key,
                    s.savedPoints !== undefined ||
                        draftPoints[s.key] !== undefined ||
                        skipped.has(s.key) ||
                        s.review.state === 'auto-confirmed',
                ])
            ),
        [steps, draftPoints, skipped]
    );

    function advanceToNextUndecided(extraDecided?: ReadonlySet<string>) {
        // Adoption decides answers in the same pass, so those steps must count as decided here —
        // otherwise the queue lands straight back on the answer it just marked.
        const decided = (key: string) => extraDecided?.has(key) || decidedByStep.get(key) === true;
        if (inMatrix) {
            const next = findNextUndecided(
                steps.map((s) => decided(s.key)),
                matrixIdx
            );
            if (next >= 0) setSelectedIdx(next);
            return;
        }
        const nextInGroup = findNextUndecided(
            visibleSteps.map((global) => decided(steps[global]?.key ?? '')),
            stepIndex
        );
        if (nextInGroup >= 0) {
            setStepIndex(nextInGroup);
            return;
        }
        for (let gi = groupIndex + 1; gi < groups.length; gi++) {
            const groupSteps = groups[gi]?.steps ?? [];
            const next = groupSteps.findIndex((global) => !decided(steps[global]?.key ?? ''));
            if (next >= 0) {
                setGroupIndex(gi);
                setStepIndex(next);
                return;
            }
        }
    }

    function handleSaveCurrent(options: { advance?: boolean; extraDecided?: ReadonlySet<string> } = {}) {
        const step = detailStep;
        if (!step || readOnly || !test) return;
        const st = attemptById.get(step.studentTestId);
        if (!st) return;
        const previousAttempt = st;
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
            rawTotalPoints: scoreStudentTest(test, { ...st, rawTotalPoints: undefined, answers: nextAnswers })
                .rawPoints,
            status: st.status === 'submitted' ? 'graded' : st.status,
            gradedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        saveStudentTest(updated);
        // Drop the saved key from the draft maps so the "unsaved" badge clears, the matrix
        // cell reflects the saved (clamped) value, and the draft can't override later saves.
        setDraftPoints((prev) => {
            const { [step.key]: _omit, ...rest } = prev;
            return rest;
        });
        setFeedbackDrafts((prev) => {
            const { [step.key]: _omit, ...rest } = prev;
            return rest;
        });
        setSkipped((prev) => {
            if (!prev.has(step.key)) return prev;
            const next = new Set(prev);
            next.delete(step.key);
            return next;
        });
        setLastSave({ stepKey: step.key, previousAttempts: [previousAttempt] });
        if (options.advance) advanceToNextUndecided(options.extraDecided);
    }

    function handleUndoSave() {
        if (!lastSave) return;
        lastSave.previousAttempts.forEach((attempt) => saveStudentTest(attempt));
        if (lastSave.previousTest) updateTest(lastSave.previousTest);
        setLastSave(null);
    }

    /** Accepts the given answer as the question's model answer and marks identical answers correct. */
    function handleAdoptAnswer() {
        const step = detailStep;
        if (!step || readOnly || !test || !answerKeyEditable) return;
        const answer = step.response.trim();
        if (!answer) return;
        const nextTest = withAdoptedAnswer(test, step.questionId, answer);
        if (nextTest !== test) updateTest(nextTest);
        // Propagation writes locally before the server agrees, so only touch students this teacher may grade.
        const editableAttempts = attempts.filter((a) =>
            canEditStudentWork(students.find((s) => s.id === a.studentId)?.classId)
        );
        const { attempts: propagated, matched } = markAdoptedAnswersCorrect(
            nextTest,
            step.questionId,
            answer,
            editableAttempts,
            step.studentTestId
        );
        const previousPropagated = editableAttempts.filter((a) => propagated.some((p) => p.id === a.id));
        propagated.forEach((attempt) => saveStudentTest(attempt));
        handleSaveCurrent({
            advance: true,
            extraDecided: new Set(propagated.map((attempt) => `${attempt.id}:${step.questionId}`)),
        });
        // Undo reverses the whole adoption: the marks it filled in, the current save and the key edit.
        setLastSave((current) =>
            current
                ? {
                      ...current,
                      previousAttempts: [...current.previousAttempts, ...previousPropagated],
                      ...(nextTest !== test ? { previousTest: test } : {}),
                  }
                : current
        );
        showToast(t('tests.queue.answer_key_applied', { count: matched }), 'success');
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
        setLastSave(null);
    }, [view, testId]);

    // Resume an interrupted session once per test + account: drafts, skips and the cursor come back.
    useEffect(() => {
        if (!testId || sessionKeyRef.current === queueSessionKey) return;
        const sameTest = sessionKeyRef.current?.startsWith(`rm_grade_queue_session:${testId}:`) ?? false;
        const workInProgress =
            Object.keys(draftPoints).length > 0 || Object.keys(feedbackDrafts).length > 0 || skipped.size > 0;
        // The signed-in account can resolve after mount: re-key that work instead of wiping it.
        // Only then — work begun under one known account must never move to another.
        const accountUnresolved = sessionKeyRef.current === gradeQueueSessionKey(testId, null);
        if (sameTest && workInProgress && accountUnresolved) {
            sessionKeyRef.current = queueSessionKey;
            return;
        }
        const stored = loadGradeQueueSession(queueSessionKey);
        sessionKeyRef.current = queueSessionKey;
        restoredPositionRef.current = stored;
        setDraftPoints(stored?.draftPoints ?? {});
        setFeedbackDrafts(stored?.feedbackDrafts ?? {});
        setSkipped(new Set(stored?.skipped ?? []));
        const restoredWork =
            Object.keys(stored?.draftPoints ?? {}).length > 0 ||
            Object.keys(stored?.feedbackDrafts ?? {}).length > 0 ||
            (stored?.skipped.length ?? 0) > 0;
        if (restoredWork) showToast(t('tests.queue.session_restored'), 'info');
    }, [testId, queueSessionKey, showToast, t, draftPoints, feedbackDrafts, skipped]);

    // The queue is built from attempts that arrive after mount, so the cursor waits for the groups.
    useEffect(() => {
        const stored = restoredPositionRef.current;
        if (!stored) return;
        if (stored.view !== view) {
            restoredPositionRef.current = null;
            return;
        }
        // Question view has a group per question before any attempt loads, so wait for answers.
        if (groups.length === 0 || attempts.length === 0) return;
        restoredPositionRef.current = null;
        const group = Math.min(stored.groupIndex, groups.length - 1);
        const insideGroup = groups[group]?.steps.length ?? 0;
        setGroupIndex(group);
        setStepIndex(Math.min(stored.stepIndex, Math.max(insideGroup - 1, 0)));
        setSelectedIdx(Math.min(stored.selectedIdx, Math.max(steps.length - 1, 0)));
    }, [groups, steps.length, view, attempts.length]);

    // Persist as the teacher works, and drop the session once the queue is finished.
    useEffect(() => {
        if (!testId || sessionKeyRef.current !== queueSessionKey) return;
        const next: GradeQueueSessionState = {
            view,
            groupIndex,
            stepIndex,
            selectedIdx,
            draftPoints,
            feedbackDrafts,
            skipped: [...skipped],
        };
        // Every answer settled with no draft or feedback left in the box: nothing to resume.
        const allSettled =
            steps.length > 0 &&
            Object.keys(draftPoints).length === 0 &&
            Object.keys(feedbackDrafts).length === 0 &&
            steps.every((s) => s.savedPoints !== undefined || s.review.state === 'auto-confirmed');
        pendingSessionRef.current = { state: next, settled: allSettled };
        const timer = setTimeout(() => {
            pendingSessionRef.current = null;
            if (allSettled || !hasSessionContent(next)) {
                clearGradeQueueSession(queueSessionKey);
                return;
            }
            if (!saveGradeQueueSession(queueSessionKey, next)) {
                showToast(t('tests.queue.session_save_failed'), 'warning');
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [
        testId,
        queueSessionKey,
        view,
        groupIndex,
        stepIndex,
        selectedIdx,
        draftPoints,
        feedbackDrafts,
        skipped,
        steps,
        showToast,
        t,
    ]);

    // Leaving within the 400 ms debounce must not drop the latest drafts: flush the pending write.
    useEffect(
        () => () => {
            const pending = pendingSessionRef.current;
            const key = sessionKeyRef.current;
            if (!pending || pending.settled || !key || !hasSessionContent(pending.state)) return;
            saveGradeQueueSession(key, pending.state);
        },
        []
    );

    // The key listener needs this render's drafts, but must not re-subscribe on every keystroke.
    const handleSaveRef = useRef(handleSaveCurrent);
    useEffect(() => {
        handleSaveRef.current = handleSaveCurrent;
    });

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            // Modified keys are browser/app shortcuts (Ctrl+S save, Cmd+K search, tab-switch
            // digits) — never queue shortcuts. While the comment bank is open, J/K/S/digits
            // must edit the modal, not the underlying queue. (Escape is handled by Radix.)
            if (e.ctrlKey || e.metaKey || e.altKey || commentBankFor) return;
            const target = e.target as HTMLElement | null;
            // The points field is auto-focused when the matrix dialog opens, and a number input cannot
            // type letters, so it belongs to the queue shortcuts rather than to text entry.
            const inPointsField = !!target && target === pointsInputRef.current;
            const isTextEntry =
                !!target &&
                (target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    (target.tagName === 'INPUT' && !inPointsField));
            if (isTextEntry) return;
            if (!detailStep) return;
            // Arrow keys step the number while the field is focused, so they keep their native meaning.
            if (inPointsField && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
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
            const onControl = !!target && (target.tagName === 'BUTTON' || target.tagName === 'A');
            if (e.key === 'Enter' && !onControl) {
                e.preventDefault();
                handleSaveRef.current({ advance: true });
            } else if (e.key === 'j' || e.key === 'ArrowDown') {
                e.preventDefault();
                detailNext();
            } else if (e.key === 'k' || e.key === 'ArrowUp') {
                e.preventDefault();
                detailPrev();
            } else if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                setSkipped((prev) => new Set(prev).add(detailStep.key));
                detailNext();
            } else if (!inPointsField && /^[0-9]$/.test(e.key) && detailStep.question.points <= 9) {
                setDraftPoints((prev) => ({ ...prev, [detailStep.key]: e.key }));
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [detailStep, detailNext, detailPrev, readOnly, commentBankFor]);

    if (!test && sharedLoading) {
        return (
            <>
                <Topbar title={t('tests.queue.title')} />
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
                <Topbar title={t('tests.queue.title')} />
                <div className="page-content">
                    <EmptyState
                        icon={ListChecks}
                        title={t('tests.queue.not_found')}
                        titleLevel={2}
                        description=""
                        action={{
                            label: t('tests.queue.back_to_tests'),
                            icon: ArrowLeft,
                            onClick: () => navigate('/tests'),
                        }}
                    />
                </div>
            </>
        );
    }
    if (attempts.length === 0) {
        return (
            <>
                <Topbar
                    title={t('tests.queue.title_with_name', { name: test.name })}
                    actions={
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tests/${test.id}/scores`)}>
                            <ArrowLeft size={15} /> {t('tests.queue.back_to_scores')}
                        </button>
                    }
                />
                <div className="page-content">
                    <EmptyState
                        icon={Users}
                        title={t('tests.queue.empty_title')}
                        titleLevel={2}
                        description={t('tests.queue.empty_desc')}
                        action={{
                            label: t('tests.queue.back_to_scores'),
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
    const draftIsFullMarks =
        !!detailStep && detailStep.question.points > 0 && (Number(draft) || 0) >= detailStep.question.points;
    // Adopting an answer rewrites the test itself, which a view-only shared copy must not allow.
    const answerKeyEditable = !sharedEntry || sharedEntry.access === 'edit';

    // Matrix cell presentation: grey = no decision yet, green = full points,
    // red = zero, yellow = partial (theme yellow stands in for orange).
    const cellVisual = (step: QueueStep): { bg: string; label: string; sub: string } => {
        const draftVal = draftPoints[step.key];
        const autoConfirmed = step.review.state === 'auto-confirmed';
        const decidedCell = step.savedPoints !== undefined || draftVal !== undefined || autoConfirmed;
        const earned = draftVal !== undefined ? Number(draftVal) || 0 : (step.savedPoints ?? step.autoScore);
        const max = step.question.points;
        if (step.skipped)
            return {
                bg: MATRIX_YELLOW_BG,
                label: earned !== undefined ? `${earned}/${max}` : `–/${max}`,
                sub: t('tests.queue.sub_skipped'),
            };
        if (!decidedCell) {
            return {
                bg: MATRIX_GREY_BG,
                label: earned !== undefined && earned !== null ? `${earned}/${max}` : `–/${max}`,
                sub:
                    step.review.state === 'needs-review' && step.review.reason === 'near-miss'
                        ? t('tests.queue.sub_unsure')
                        : t('tests.queue.sub_auto'),
            };
        }
        const e = earned ?? 0;
        const sub =
            autoConfirmed && step.savedPoints === undefined && draftVal === undefined
                ? t('tests.queue.sub_auto_confirmed')
                : '';
        if (e >= max) return { bg: MATRIX_GREEN_BG, label: `${e}/${max}`, sub };
        if (e <= 0) return { bg: MATRIX_RED_BG, label: `${e}/${max}`, sub };
        return { bg: MATRIX_YELLOW_BG, label: `${e}/${max}`, sub };
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
                        <span className="badge badge-green">
                            {t('tests.queue.badge_decided', { points: detailStep.savedPoints })}
                        </span>
                    ) : detailStep.review.state === 'auto-confirmed' ? (
                        <span className="badge badge-green">
                            {t('tests.queue.badge_auto_confirmed', { value: detailStep.autoScore ?? '—' })}
                        </span>
                    ) : (
                        <span className="badge">
                            {t('tests.queue.badge_auto', { value: detailStep.autoScore ?? '—' })}
                        </span>
                    )}
                    {detailStep.review.state === 'needs-review' && detailStep.review.reason !== 'auto-confirm-off' && (
                        <span className="badge badge-yellow">
                            {t(`tests.queue.reason_${detailStep.review.reason.replaceAll('-', '_')}`)}
                        </span>
                    )}
                    {skipped.has(detailStep.key) && (
                        <span className="badge badge-yellow">{t('tests.queue.badge_skipped')}</span>
                    )}
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={!detailCanPrev}
                            onClick={detailPrev}
                            aria-label={t('tests.queue.prev_answer')}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <button
                            className="btn btn-ghost btn-sm"
                            disabled={!detailCanNext}
                            onClick={detailNext}
                            aria-label={t('tests.queue.next_answer')}
                        >
                            <ChevronRight size={14} />
                        </button>
                        {showClose && (
                            <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setPopoverOpen(false)}
                                aria-label={t('tests.queue.close_popover')}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </span>
                </div>

                <div>
                    <div className="text-muted text-xs">{t('tests.queue.question_label')}</div>
                    <p style={{ margin: '4px 0' }}>{stripHtmlTags(detailStep.question.prompt)}</p>
                    {hasExpectedAnswer(detailStep.question) && (
                        <div className="text-muted text-sm" style={{ margin: 0 }}>
                            <span className="text-xs">{t('tests.queue.expected_label')}</span>
                            <QueueAnswer question={detailStep.question} />
                        </div>
                    )}
                </div>

                <div>
                    <div className="text-muted text-xs">{t('tests.queue.student_answer_label')}</div>
                    <div style={{ margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                        <QueueAnswer question={detailStep.question} response={detailStep.response} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span className="text-muted text-xs">
                            {t('tests.queue.points_label', { max: detailStep.question.points })}
                        </span>
                        <input
                            ref={pointsInputRef}
                            type="number"
                            min={0}
                            max={detailStep.question.points}
                            value={draft}
                            disabled={readOnly}
                            onChange={(e) => setDraftPoints((prev) => ({ ...prev, [detailStep.key]: e.target.value }))}
                            style={{ width: 120 }}
                            aria-label={t('tests.queue.points_aria', {
                                name: detailStep.studentName,
                                number: detailStep.questionIndex + 1,
                            })}
                        />
                    </label>
                    <button
                        className="btn btn-primary btn-sm"
                        disabled={readOnly}
                        title={readOnly ? t('tests.queue.view_only_short') : undefined}
                        onClick={() => handleSaveCurrent({ advance: true })}
                    >
                        <Check size={13} /> {t('tests.queue.save_and_next')}
                    </button>
                    {canAdoptAnswer(detailStep.question) && (
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={readOnly || !answerKeyEditable || !draftIsFullMarks}
                            title={
                                !answerKeyEditable
                                    ? t('tests.queue.answer_key_no_permission')
                                    : !draftIsFullMarks
                                      ? t('tests.queue.answer_key_needs_full')
                                      : undefined
                            }
                            onClick={handleAdoptAnswer}
                        >
                            <KeyRound size={13} /> {t('tests.queue.accept_answer')}
                        </button>
                    )}
                    {lastSave && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={handleUndoSave}>
                            <Undo2 size={13} /> {t('tests.queue.undo_last_save')}
                        </button>
                    )}
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSkipped((prev) => new Set(prev).add(detailStep.key))}
                    >
                        {t('tests.queue.skip')}
                    </button>
                </div>

                <div>
                    <label
                        htmlFor={`queue-feedback-${detailStep.key}`}
                        className="text-muted text-xs"
                        style={{ display: 'block', marginBottom: 4 }}
                    >
                        {t('tests.queue.feedback_label')}
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
                        placeholder={t('tests.queue.feedback_placeholder')}
                        style={{ width: '100%' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={readOnly}
                            onClick={() => setCommentBankFor(detailStep.key)}
                        >
                            <BookOpen size={13} /> {t('tests.queue.insert_comment')}
                        </button>
                        <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={readOnly || !feedbackDraft.trim()}
                            onClick={handleSaveAsComment}
                        >
                            {savedCommentFor === detailStep.key ? (
                                <>
                                    <Check size={13} /> {t('tests.queue.comment_saved')}
                                </>
                            ) : (
                                t('tests.queue.save_as_comment')
                            )}
                        </button>
                    </div>
                </div>
                {readOnly ? (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        {t('tests.queue.view_only')}
                    </p>
                ) : (
                    <p className="text-muted text-xs" style={{ margin: 0 }}>
                        {t('tests.queue.save_hint')}
                    </p>
                )}
            </article>
        );
    }

    return (
        <>
            <Topbar
                title={t('tests.queue.title_with_name', { name: test.name })}
                actions={
                    <>
                        {unsavedCount > 0 && (
                            <span className="badge badge-yellow" title={t('tests.queue.unsaved_title')}>
                                {t('tests.queue.unsaved_badge', { count: unsavedCount })}
                            </span>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/tests/${test.id}/scores`)}>
                            <ArrowLeft size={15} /> {t('tests.queue.back_to_scores')}
                        </button>
                    </>
                }
            />
            <div className="page-content fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <SegmentedToggle
                        ariaLabel={t('tests.queue.direction_label')}
                        value={view}
                        onChange={(v) => handleViewChange(v as ViewMode)}
                        options={[
                            { value: 'question', label: t('tests.queue.by_question'), icon: <ListChecks size={14} /> },
                            { value: 'student', label: t('tests.queue.by_student'), icon: <User size={14} /> },
                            { value: 'matrix', label: t('tests.queue.matrix'), icon: <LayoutGrid size={14} /> },
                        ]}
                    />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
                        {!inMatrix && autoConfirmEnabled(test) && autoConfirmedCount > 0 && (
                            <label className="text-sm" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                    type="checkbox"
                                    checked={showAutoConfirmed}
                                    onChange={(e) => setShowAutoConfirmed(e.target.checked)}
                                />
                                {t('tests.queue.show_auto_confirmed', { count: autoConfirmedCount })}
                            </label>
                        )}
                        <span className="text-muted text-sm" aria-live="polite">
                            {t('tests.queue.decided', { decided, total: steps.length })}
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
                        <nav aria-label={t('tests.queue.groups_label')} className="card" style={{ padding: 8 }}>
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
                                aria-label={t('tests.queue.matrix_label')}
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
                                            {t('tests.queue.student_col')}
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
                                                    const cellIndex = stepIndexByCell.get(`${st.id}:${q.id}`);
                                                    if (cellIndex === undefined) {
                                                        return (
                                                            <td key={q.id} style={{ padding: 2 }}>
                                                                <div
                                                                    title={t('tests.queue.no_answer_title', {
                                                                        name,
                                                                        number: qi + 1,
                                                                    })}
                                                                    style={{
                                                                        height: 40,
                                                                        borderRadius: 6,
                                                                        border: '1px dashed var(--border)',
                                                                    }}
                                                                />
                                                            </td>
                                                        );
                                                    }
                                                    const step = steps[cellIndex];
                                                    const v = cellVisual(step);
                                                    const selected = detailStep?.key === step.key;
                                                    return (
                                                        <td key={q.id} style={{ padding: 2 }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) =>
                                                                    openCellPopover(cellIndex, e.currentTarget)
                                                                }
                                                                title={t('tests.queue.cell_open_title', {
                                                                    name,
                                                                    number: qi + 1,
                                                                    label: v.label,
                                                                    suffix: v.sub ? ` (${v.sub})` : '',
                                                                })}
                                                                aria-label={t('tests.queue.cell_open_aria', {
                                                                    name,
                                                                    number: qi + 1,
                                                                    label: v.label,
                                                                    suffix: v.sub ? `, ${v.sub}` : '',
                                                                })}
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
                                    {t('tests.queue.legend_full')}
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
                                    {t('tests.queue.legend_partial')}
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
                                    {t('tests.queue.legend_zero')}
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
                                    {t('tests.queue.legend_needs')}
                                </span>
                            </div>
                        </div>
                    )}

                    {!inMatrix && detailStep ? (
                        renderDetailCard(false)
                    ) : !inMatrix ? (
                        <EmptyState
                            icon={ListChecks}
                            title={t('tests.queue.nothing_in_group')}
                            titleLevel={2}
                            description={t('tests.queue.nothing_in_group_desc')}
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
                    <Keyboard size={13} /> {t('tests.queue.keyboard_hint')}
                    {inMatrix ? t('tests.queue.keyboard_hint_matrix') : ''}
                </p>
                {commentBankFor && steps.some((s) => s.key === commentBankFor) && (
                    <CommentBankModal onClose={() => setCommentBankFor(null)} onSelect={handleInsertComment} />
                )}
            </div>
        </>
    );
}
