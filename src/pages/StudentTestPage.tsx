import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ToastContext } from '../context/ToastContext';
import { CheckCircle, XCircle, Copy, AlertTriangle, Loader2, Eye, Flag, LogOut } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { decodeTestAssignment } from '../utils/shareCode';
import { buildSebQuitUrl, quitSafeExamBrowser } from '../utils/sebConfig';
import { useSebQuitRedirect } from '../hooks/useSebQuitRedirect';
import { encodeTestSubmission } from '../utils/shareCode';
import { nanoid } from '../utils/nanoid';
import { loadTestDraft, saveTestDraft, clearTestDraft, clearTestTimer } from '../store/storage';
import SebGate from '../components/Tests/SebGate';
import RichContent from '../components/Editor/RichContent';
import PassageReadAloud from '../components/Tests/PassageReadAloud';
import StudentQuestionCard from '../components/Tests/StudentQuestionCard';
import { safeAudioSrc } from '../utils/safeMediaSrc';
import LimitedAudio from '../components/Tests/LimitedAudio';
import CountdownTimer from '../components/ui/CountdownTimer';
import RichNote from '../components/Tests/RichNote';
import { pickedOptionFeedback } from '../utils/optionFeedback';
import { useLiveSessionTelemetry } from '../hooks/useLiveSessionTelemetry';
import { StudentTaskSkeleton } from '../components/ui/Skeleton';
import { isStagedTest, entrySectionId, sectionQuestions, resolveNextSection } from '../utils/placementRouting';
import { isStaircaseTest, resolveNextStaircaseQuestion } from '../utils/placementStaircase';
import { isGeneratorTest, type NextPlacementQuestionResult } from '../utils/placementGenerator';
import { seededShuffle } from '../utils/seededShuffle';
import { resolveContentLanguage, resolveQuestionContentLanguage } from '../utils/contentLanguage';
import { initClientLogger, logEvent } from '../services/logging/clientLogger';
import { TestAdapter } from '../services/database/TestAdapter';
import { authErrorKey } from '../utils/authErrors';
import { isAllowedSupabaseUrl } from '../services/database/trustedSupabaseUrl';
import { autoScoreResponse } from '../utils/testCalc';
import { enqueueSubmission, removeSubmission, pendingSubmissions, isAlreadySubmitted } from '../utils/testSubmitOutbox';
import { clozeInstructionKey } from '../utils/questionTypeKey';
import { versionForStudent, versionQuestion } from '../utils/testVersions';
import { deliveredTest, deliveredVariantIds } from '../utils/variantDelivery';
import SubmitReviewDialog from '../components/Tests/SubmitReviewDialog';
import type {
    TestAnswer,
    TestAssignmentContent,
    TestAssignmentPayload,
    TestQuestion,
    TestSection,
    TestSubmissionPayload,
    StaircaseStep,
} from '../types';

const DRAFT_KEY_PREFIX = 'rm_test_draft_';

function copyText(text: string): boolean {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) return true;
    } catch {
        /* execCommand not available */
    }
    navigator.clipboard?.writeText(text).catch(() => {});
    return false;
}

// Detect a short-code link: bare nanoid (21 URL-safe chars), no base64 JSON.
// These are generated when the app has Supabase configured (TestAssignmentModal's
// "Enable direct submission to database" toggle) — the URL carries only the
// test_assignments row id (= teacherKey); everything else, including the test
// content itself, is fetched from the get-test-assignment edge function after
// authenticating. Mirrors StudentEssayPage's isShortCode/short-code handling.
function isShortCode(code: string): boolean {
    return /^[A-Za-z0-9_-]{10,40}$/.test(code);
}

export default function StudentTestPage() {
    const { t } = useTranslation();
    const { code } = useParams<{ code: string }>();

    const assignment = useMemo<TestAssignmentPayload | null>(() => {
        /* v8 ignore next -- the /test/:code route always provides a code */
        if (!code) return null;
        const legacy = decodeTestAssignment(code);
        if (legacy) return legacy;
        if (!isShortCode(code)) return null;

        let savedConfig: { supabaseUrl?: string; supabaseAnonKey?: string } = {};
        try {
            savedConfig = JSON.parse(localStorage.getItem('rm_supabase_config') ?? '{}');
        } catch {
            /* ignore malformed config */
        }
        const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || savedConfig.supabaseUrl;
        const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || savedConfig.supabaseAnonKey;
        if (!envUrl || !envKey) return null;

        return {
            testId: '',
            studentId: '',
            teacherKey: code,
            requireSEB: false,
            createdAt: new Date().toISOString(),
            supabaseUrl: envUrl,
            supabaseAnonKey: envKey,
        };
    }, [code]);

    const urlAllowed = useMemo(() => isAllowedSupabaseUrl(assignment?.supabaseUrl), [assignment?.supabaseUrl]);
    const hasDb = !!(assignment?.supabaseUrl && assignment?.supabaseAnonKey && urlAllowed);
    /* v8 ignore next -- code is always defined for the /test/:code route */
    const draftKey = DRAFT_KEY_PREFIX + (code ?? '');

    // Isolated client + anonymous auth for the test share-link flow (storageKey:
    // rm_student_test_auth) — separate from the essay flow's rm_student_auth so the
    // two can never collide. Stable for the component's lifetime.
    const adapter = useMemo<TestAdapter | null>(() => {
        if (!assignment?.supabaseUrl || !assignment?.supabaseAnonKey) return null;
        if (!urlAllowed) return null;
        const a = new TestAdapter(assignment.supabaseUrl, assignment.supabaseAnonKey);
        initClientLogger(a.getClient(), { role: 'student' });
        return a;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally stable — assignment is decoded from the URL and never changes

    // Content resolved from the edge function after authentication. For legacy
    // (offline-embedded) links this is filled in immediately from the URL; for
    // short-code links it's the only way to get testId/studentId/requireSEB/the
    // test itself. undefined = not yet fetched; null = fetch complete, no data.
    const [resolvedContent, setResolvedContent] = useState<TestAssignmentContent | null | undefined>(
        assignment?.test
            ? {
                  testId: assignment.testId,
                  studentId: assignment.studentId,
                  requireSEB: assignment.requireSEB,
                  durationMinutes: assignment.durationMinutes ?? null,
                  expiresAt: assignment.expiresAt ?? null,
                  test: assignment.test,
                  readAloudAccommodation: assignment.readAloudAccommodation,
              }
            : undefined
    );
    const contentReady = resolvedContent !== undefined;
    const fullTest = resolvedContent?.test ?? null;
    const deliveryStudentId = resolvedContent?.studentId || assignment?.studentId || '';
    // The runner, the answer payload and the progress counters all read this test, so a student only
    // ever sees one member of an easier-cloze family.
    const test = useMemo(
        () => (fullTest ? deliveredTest(fullTest, deliveryStudentId) : null),
        [fullTest, deliveryStudentId]
    );
    const deliveredVariants = useMemo(
        () => (fullTest ? deliveredVariantIds(fullTest, deliveryStudentId) : []),
        [fullTest, deliveryStudentId]
    );
    // Test content keeps its own language (English unless set) rather than inheriting <html lang> from the
    // interface, so a student who picked Dutch doesn't get English passages read by a Dutch screen-reader voice.
    // Test default; per-section and per-question overrides resolve at each render site (#956).
    const contentLang = resolveContentLanguage(test?.contentLanguage);
    // Read-aloud is always on in practice mode (today's behaviour); in graded modes
    // (assessment/placement) it's gated on the student's accommodation setting (roadmap
    // Phase 44, §6.2) so it doesn't quietly help everyone on a test that's meant to measure
    // unassisted reading.
    const readAloudAllowed =
        test?.mode === 'practice' ||
        (resolvedContent?.readAloudAccommodation ?? assignment?.readAloudAccommodation ?? false);
    // Tracks an 'expired' result from the edge function so the expiry guard fires
    // even for short-code links that have no expiresAt embedded in the URL.
    const [contentExpired, setContentExpired] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(hasDb && !contentReady);

    const [answers, setAnswers] = useState<Map<string, string>>(() => {
        const draft = loadTestDraft(draftKey);
        return new Map(Object.entries(draft?.answers ?? {}));
    });
    const [draftRestored, setDraftRestored] = useState<boolean>(() => !!loadTestDraft(draftKey));
    const [currentIndex, setCurrentIndex] = useState(0);
    // Question ids the student flagged for review, and question indices they've viewed — both
    // drive the timeline palette (fixed-question tests only; adaptive runs have no palette).
    const [flagged, setFlagged] = useState<Set<string>>(new Set());
    const [reviewOpen, setReviewOpen] = useState(false);
    const [seenIndices, setSeenIndices] = useState<Set<number>>(() => new Set([0]));
    const toggleFlag = useCallback((questionId: string) => {
        setFlagged((prev) => {
            const next = new Set(prev);
            if (next.has(questionId)) next.delete(questionId);
            else next.add(questionId);
            return next;
        });
    }, []);
    React.useEffect(() => {
        setSeenIndices((prev) => (prev.has(currentIndex) ? prev : new Set(prev).add(currentIndex)));
    }, [currentIndex]);
    // Ids of sections visited so far, in order — only meaningful for staged (placement) tests.
    // Seeded from the draft when resuming; the effect below seeds the entry section once the
    // test loads for a fresh attempt (the currentStageId fallback below covers the one-render
    // gap before that effect runs, so nothing needs to block on it).
    const [sectionPath, setSectionPath] = useState<string[]>(() => loadTestDraft(draftKey)?.sectionPath ?? []);
    // The full adaptive question trace for a staircase (placement) test — only meaningful when
    // isStaircase is true. Each entry is scored and locked in immediately; there's no going back.
    const [levelPath, setLevelPath] = useState<StaircaseStep[]>(() => loadTestDraft(draftKey)?.levelPath ?? []);
    // A generator-engine (roadmap 27.1) run's question/level/Elo state is server-authoritative —
    // unlike levelPath above, this is never persisted to the local draft; a reload simply calls
    // next-placement-question again with no previousQuestionId, which idempotently re-serves
    // whatever question the server already has pending.
    const [generatorResult, setGeneratorResult] = useState<NextPlacementQuestionResult | null>(null);
    const [generatorLoading, setGeneratorLoading] = useState(false);
    const [generatorError, setGeneratorError] = useState('');
    // Prompts of the generator questions asked so far, keyed by question id — the run only ever
    // holds the *current* question (generatorResult), so without accumulating them the teacher's
    // live monitor has responses (the answers map) but no question text to show them against.
    const [askedPrompts, setAskedPrompts] = useState<Record<string, string>>({});
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);
    const [audioPlays, setAudioPlays] = useState<Record<string, number>>({});

    const startedAtRef = useRef<string>(new Date().toISOString());
    const submitInFlightRef = useRef(false);
    const [retakeCount, setRetakeCount] = useState(0);

    // ── Fetch test content (DB mode) ─────────────────────────────────────────
    // Signs in anonymously (silent — no email gate, unlike essays) then fetches
    // content via the get-test-assignment edge function, which uses a service-role
    // client server-side to bypass RLS. The direct disconnected-client table read
    // this replaced always failed RLS (no session, so auth.uid() = NULL never
    // matches tests_own's owner_id check).
    useEffect(() => {
        if (!hasDb || !assignment || !adapter || contentReady) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            const session = await adapter.ensureSession();
            if (cancelled) return;
            if (!session.ok) {
                // Mark contentReady so this effect doesn't keep retrying ensureSession()
                // on every unrelated re-render.
                setResolvedContent(null);
                setLoadError(t(authErrorKey(session.code) ?? 'tests.taking.load_error'));
                logEvent(
                    'error',
                    'test_load_error',
                    { testId: assignment.testId, authErrorCode: session.code ?? null },
                    'error'
                );
                setLoading(false);
                return;
            }
            const result = await adapter.fetchAssignmentContent(assignment.teacherKey);
            if (cancelled) return;
            if (result.ok) {
                setResolvedContent(result.data);
                logEvent('lifecycle', 'test_loaded', { testId: result.data.testId });
            } else {
                setResolvedContent(null);
                if (result.reason === 'expired') {
                    setContentExpired(true);
                } else {
                    setLoadError(t('tests.taking.load_error'));
                }
                logEvent('error', 'test_load_error', { testId: assignment.testId }, 'error');
            }
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [hasDb, assignment, adapter, contentReady, draftKey, t]);

    const staged = !!test && isStagedTest(test);
    // Falls back to the entry section directly (rather than waiting for the seeding effect
    // below to commit) so a staged test never renders a blank question list for one frame.
    const currentStageId =
        sectionPath.length > 0 ? sectionPath[sectionPath.length - 1] : test ? entrySectionId(test) : null;

    // Persists sectionPath=[entry] into real state once the test loads, so the first
    // "continue to next section" click has a non-empty path to append to.
    useEffect(() => {
        if (!test || !staged || sectionPath.length > 0) return;
        const entry = entrySectionId(test);
        /* v8 ignore next -- isStagedTest above guarantees a non-empty sections list */
        if (entry) setSectionPath([entry]);
    }, [test, staged, sectionPath.length]);

    useEffect(() => {
        setCurrentIndex(0);
        // seenIndices is index-based within the active section, so it must reset when the
        // stage changes; otherwise an index seen in one section reads as seen in the next.
        setSeenIndices(new Set([0]));
    }, [currentStageId]);

    const orderedQuestions = useMemo<TestQuestion[]>(() => {
        if (!test) return [];
        if (staged) {
            /* v8 ignore next -- a staged test always has an entry section id */
            if (!currentStageId) return [];
            const stageQuestions = sectionQuestions(test, currentStageId);
            if (!test.shuffleQuestions || !code) return stageQuestions;
            return seededShuffle(stageQuestions, `${code}-${currentStageId}`);
        }
        if (!test.shuffleQuestions || !code) return test.questions;
        return seededShuffle(test.questions, code);
    }, [test, code, staged, currentStageId]);

    // Parallel-paper version for this student: derived, never transmitted, so an offline share link
    // and the teacher's printed answer sheet resolve the same option order.
    const testVersion = versionForStudent(
        resolvedContent?.studentId || assignment?.studentId || '',
        test?.versionCount
    );
    const displayQuestion = useCallback(
        (question: TestQuestion) => versionQuestion(question, testVersion),
        [testVersion]
    );

    const isStaircase = !!test && isStaircaseTest(test);
    const staircaseQuestion = useMemo(() => {
        if (!test || !isStaircase) return null;
        /* v8 ignore next -- code is always defined here */
        return resolveNextStaircaseQuestion(test, levelPath, code ?? '');
    }, [test, isStaircase, levelPath, code]);

    const isGenerator = !!test && isGeneratorTest(test);

    // ── Generator-engine (27.1) run: server-authoritative, one question at a time ──────────
    const advanceGenerator = useCallback(
        async (previousQuestionId?: string, previousResponse?: string) => {
            /* v8 ignore next -- both call sites are guarded */
            if (!assignment || !adapter) return;
            setGeneratorLoading(true);
            setGeneratorError('');
            const outcome = await adapter.nextPlacementQuestion(
                assignment.teacherKey,
                previousQuestionId,
                previousResponse
            );
            setGeneratorLoading(false);
            if (!outcome.ok) {
                setGeneratorError(t('tests.taking.generator_load_error'));
                logEvent('error', 'test_load_error', { testId: assignment.testId }, 'error');
                return;
            }
            setGeneratorResult(outcome.data);
            if (!outcome.data.done) {
                const q = outcome.data.question;
                setAskedPrompts((prev) => (prev[q.id] ? prev : { ...prev, [q.id]: q.prompt }));
            }
        },
        [assignment, adapter, t]
    );

    useEffect(() => {
        if (
            !isGenerator ||
            !assignment ||
            !adapter ||
            generatorResult ||
            generatorLoading ||
            generatorError ||
            submitted
        )
            return;
        void advanceGenerator();
    }, [
        isGenerator,
        assignment,
        adapter,
        generatorResult,
        generatorLoading,
        generatorError,
        submitted,
        advanceGenerator,
    ]);

    // Navigating to the config's quit URL is the only way out of a session with allowQuit=false,
    // but it must wait for a confirmed hand-in: a failed/queued DB submit is still retrying in the
    // background (SEB quitting would abandon those retries), and a practice run never leaves a
    // record worth protecting, so it should stay open for the student to review their answers
    // instead of auto-quitting. The manual quit button below is unaffected and always available.
    const deliveryConfirmed = submitted && test?.mode !== 'practice' && (!hasDb || !submitError);
    const inSeb = useSebQuitRedirect(deliveryConfirmed);

    // ── Draft autosave ────────────────────────────────────────────────────────
    useEffect(() => {
        if (submitted) return;
        saveTestDraft(draftKey, {
            answers: Object.fromEntries(answers),
            savedAt: new Date().toISOString(),
            sectionPath: sectionPath.length > 0 ? sectionPath : undefined,
            levelPath: levelPath.length > 0 ? levelPath : undefined,
        });
    }, [answers, draftKey, submitted, sectionPath, levelPath]);

    const getSnapshot = useCallback(
        () => ({
            answers: Object.fromEntries(answers),
            wordCount: Array.from(answers.values()).reduce(
                (sum, a) => sum + a.trim().split(/\s+/).filter(Boolean).length,
                0
            ),
            // askedPrompts must go out whenever this is a generator run, not only while a question
            // is pending — otherwise the terminal (done) snapshot drops all prompts while `answers`
            // still holds the responses, leaving the live monitor unable to pair answers with text.
            ...(isGenerator
                ? {
                      askedPrompts,
                      ...(generatorResult && !generatorResult.done
                          ? {
                                generatorLevel: generatorResult.cefrLevel,
                                generatorEloAnchor: generatorResult.eloAnchor,
                                questionsAsked: generatorResult.questionsAsked,
                            }
                          : {}),
                  }
                : {}),
        }),
        [answers, isGenerator, generatorResult, askedPrompts]
    );

    const { showToast } = useContext(ToastContext);
    const telemetry = useLiveSessionTelemetry({
        kind: 'test',
        assignmentKey: assignment?.teacherKey ?? '',
        enabled: !!assignment && !submitted,
        getSnapshot,
        supabaseUrl: hasDb ? assignment?.supabaseUrl : undefined,
        supabaseAnonKey: hasDb ? assignment?.supabaseAnonKey : undefined,
        onNudge: (message) => showToast(message, 'info'),
    });

    const handleAudioPlay = useCallback(
        (key: string, count: number) => {
            setAudioPlays((prev) => ({ ...prev, [key]: count }));
            telemetry.recordEvent({ type: 'audio_play', at: new Date().toISOString(), value: `${key}:${count}` });
        },
        [telemetry]
    );

    // Retry any queued hand-ins for this project (a prior failed submit, from this attempt or an
    // earlier page load). success — or a 409 "already submitted", which means a prior retry
    // landed — clears the item; a still-failing item stays queued for the next trigger.
    const retryTimersRef = useRef<number[]>([]);
    const flushOutbox = useCallback(async () => {
        if (!adapter || !assignment?.supabaseUrl) return;
        if (pendingSubmissions(assignment.supabaseUrl).length === 0) return;
        // A reload's flush can fire before the content effect has signed the student back in;
        // submit-test needs the same anonymous identity, so re-establish it first.
        await adapter.ensureSession();
        for (const item of pendingSubmissions(assignment.supabaseUrl)) {
            const res = await adapter.submitTest(
                item.assignmentId,
                item.id,
                item.answers,
                item.startedAt,
                item.submittedAt,
                item.events,
                item.sectionPath,
                item.levelPath,
                item.testVersion
            );
            if (res.success || isAlreadySubmitted(res.error)) {
                removeSubmission(item.id);
                if (item.assignmentId === assignment.teacherKey) {
                    setSubmitError('');
                    setSubmitted(true);
                    logEvent('action', 'test_submitted_retry', { answerCount: item.answers.length });
                    telemetry.broadcast('submitted', {
                        submittedAt: item.submittedAt,
                        answerCount: item.answers.length,
                    });
                }
            }
        }
    }, [adapter, assignment, telemetry]);

    const scheduleOutboxRetries = useCallback(() => {
        for (const delay of [3000, 8000, 20000, 45000]) {
            retryTimersRef.current.push(window.setTimeout(() => void flushOutbox(), delay));
        }
    }, [flushOutbox]);

    // Flush on mount (covers a reload after a failed hand-in) and whenever connectivity returns.
    useEffect(() => {
        if (!hasDb || !adapter) return;
        void flushOutbox();
        const onOnline = () => void flushOutbox();
        window.addEventListener('online', onOnline);
        const timers = retryTimersRef.current;
        return () => {
            window.removeEventListener('online', onOnline);
            timers.forEach((id) => window.clearTimeout(id));
        };
    }, [hasDb, adapter, flushOutbox]);

    const handleSubmit = useCallback(async () => {
        /* v8 ignore next -- the UI only exposes submit once assignment+test are present */
        if (!assignment || !test) return;
        /* v8 ignore next -- the submit button/timer are the only callers and both gate on state */
        if (submitInFlightRef.current || submitted) return;
        submitInFlightRef.current = true;
        // The timer can hand in while the review dialog is open; it must not survive into a retake.
        setReviewOpen(false);

        /* v8 ignore next -- resolvedContent (when set) always carries a testId */
        const effectiveTestId = resolvedContent?.testId || assignment.testId;
        /* v8 ignore next -- resolvedContent (when set) always carries a studentId */
        const effectiveStudentId = resolvedContent?.studentId || assignment.studentId;

        // Set before the (potentially slow) generator flush below too, not just the final
        // submitTest call, so the spinner/disabled state covers the whole submit sequence —
        // otherwise a timeout-triggered submit can flush a pending answer with no visible
        // feedback until the network call finishes.
        if (hasDb && adapter) {
            setSubmitting(true);
            setSubmitError('');
        }

        // The timer can call this directly on timeout, before the student presses "Continue" on
        // the currently-pending generator question — without this, next-placement-question would
        // never learn about it and the session would never reach status: 'converged', which
        // submit-test's generator branch requires before accepting a submission.
        if (isGenerator && adapter && generatorResult && !generatorResult.done) {
            const response = answers.get(generatorResult.question.id) ?? '';
            const outcome = await adapter.nextPlacementQuestion(
                assignment.teacherKey,
                generatorResult.question.id,
                response
            );
            if (!outcome.ok) {
                setSubmitting(false);
                setSubmitError(t('tests.taking.submit_error_db'));
                logEvent('error', 'test_submit_error', { testId: effectiveTestId }, 'error');
                submitInFlightRef.current = false;
                return;
            }
        }

        const submittedAt = new Date().toISOString();
        // A generator-engine run has no fixed test.questions to map over — every question was
        // pulled live from the bank, so the answers map itself is the only record of what was
        // asked/answered.
        const testAnswers: TestAnswer[] = isGenerator
            ? Array.from(answers.entries()).map(([questionId, response]) => ({ questionId, response }))
            : test.questions.map((q) => ({ questionId: q.id, response: answers.get(q.id) ?? '' }));

        // The timer can call this directly on timeout, before the student presses "Continue" on
        // the currently-shown staircase question — without this, that presented-but-uncommitted
        // question would be silently dropped from the trace instead of scored as a miss.
        const effectiveLevelPath =
            isStaircase &&
            staircaseQuestion &&
            !levelPath.some((step) => step.questionId === staircaseQuestion.question.id)
                ? [
                      ...levelPath,
                      {
                          sectionId: staircaseQuestion.sectionId,
                          level: staircaseQuestion.level,
                          questionId: staircaseQuestion.question.id,
                          correct:
                              autoScoreResponse(
                                  staircaseQuestion.question,
                                  answers.get(staircaseQuestion.question.id) ?? ''
                              ) >= staircaseQuestion.question.points,
                      },
                  ]
                : levelPath;

        const submissionPayload: TestSubmissionPayload = {
            testId: effectiveTestId,
            studentId: effectiveStudentId,
            teacherKey: assignment.teacherKey,
            answers: testAnswers,
            startedAt: startedAtRef.current,
            submittedAt,
            events: telemetry.flush(),
            sectionPath: staged && sectionPath.length > 0 ? sectionPath : undefined,
            levelPath: isStaircase && effectiveLevelPath.length > 0 ? effectiveLevelPath : undefined,
            testVersion: testVersion ?? undefined,
            deliveredVariantIds: deliveredVariants.length > 0 ? deliveredVariants : undefined,
        };
        const legacyCode = encodeTestSubmission(submissionPayload);

        if (hasDb && adapter) {
            const studentTestId = nanoid();
            const result = await adapter.submitTest(
                assignment.teacherKey,
                studentTestId,
                testAnswers,
                startedAtRef.current,
                submittedAt,
                submissionPayload.events,
                submissionPayload.sectionPath,
                submissionPayload.levelPath,
                submissionPayload.testVersion
            );
            setSubmitting(false);
            if (!result.success) {
                // Don't strand the hand-in: queue it (reusing studentTestId so a retry can't
                // create a second row) and retry automatically in the background. The paste-code
                // fallback below still shows as a manual backup.
                enqueueSubmission({
                    id: studentTestId,
                    assignmentId: assignment.teacherKey,
                    supabaseUrl: assignment.supabaseUrl!,
                    supabaseAnonKey: assignment.supabaseAnonKey!,
                    answers: testAnswers,
                    startedAt: startedAtRef.current,
                    submittedAt,
                    events: submissionPayload.events,
                    sectionPath: submissionPayload.sectionPath,
                    levelPath: submissionPayload.levelPath,
                    testVersion: submissionPayload.testVersion,
                    queuedAt: new Date().toISOString(),
                });
                setSubmitError(t('tests.taking.submit_error_db'));
                logEvent('error', 'test_submit_error', { testId: effectiveTestId }, 'error');
                scheduleOutboxRetries();
            } else {
                logEvent('action', 'test_submitted', {
                    testId: effectiveTestId,
                    answerCount: testAnswers.length,
                });
                // Tell the teacher's live monitor the quiz was handed in — the last
                // broadcast before `setSubmitted(true)` below disables telemetry and
                // tears the channel down. Mirrors StudentEssayPage's 'submitted'
                // broadcast; LiveMonitorPage listens for it on both kinds. The
                // monitor also re-derives status from persisted student_tests rows,
                // so a reload after the fact still shows Submitted. Await the
                // server ack so the live flip isn't silently dropped; on failure the
                // persisted-row path still covers the monitor.
                const ack = await telemetry.broadcast('submitted', {
                    submittedAt,
                    answerCount: testAnswers.length,
                });
                if (ack !== 'ok') {
                    logEvent('error', 'submitted_broadcast_failed', { ack }, 'error');
                }
            }
        }

        setSubmissionCode(legacyCode);
        clearTestDraft(draftKey);
        clearTestTimer(draftKey + '_timer');
        setSubmitted(true);
        submitInFlightRef.current = false;
    }, [
        assignment,
        test,
        resolvedContent,
        answers,
        hasDb,
        adapter,
        draftKey,
        telemetry,
        t,
        submitted,
        staged,
        sectionPath,
        isStaircase,
        levelPath,
        staircaseQuestion,
        isGenerator,
        generatorResult,
        scheduleOutboxRetries,
    ]);

    const handleRetake = useCallback(() => {
        clearTestDraft(draftKey);
        clearTestTimer(draftKey + '_timer');
        startedAtRef.current = new Date().toISOString();
        setAnswers(new Map());
        setCurrentIndex(0);
        setFlagged(new Set());
        setReviewOpen(false);
        setSeenIndices(new Set([0]));
        setSectionPath([]);
        setLevelPath([]);
        setAskedPrompts({});
        // The init effect bails when generatorResult is set, so a generator retake must clear it (and
        // its loading/error flags) or it would keep the previous run instead of drawing a fresh Q1.
        setGeneratorResult(null);
        setGeneratorLoading(false);
        setGeneratorError('');
        setSubmitted(false);
        setSubmissionCode('');
        setSubmitError('');
        setDraftRestored(false);
        setRetakeCount((c) => c + 1);
    }, [draftKey]);

    const handleCopy = useCallback(() => {
        copyText(submissionCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    }, [submissionCode]);

    // ── Guard: invalid link ───────────────────────────────────────────────────
    if (!assignment) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.invalid_link_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{t('tests.taking.invalid_link_desc')}</p>
            </CenteredMessage>
        );
    }

    // ── Guard: expired ─────────────────────────────────────────────────────────
    // contentExpired is set when the edge function returns 410 for a short-code
    // link; effectiveExpiresAt also covers legacy links with expiresAt embedded.
    const effectiveExpiresAt = resolvedContent?.expiresAt ?? assignment.expiresAt ?? null;
    if (contentExpired || (effectiveExpiresAt && new Date(effectiveExpiresAt) < new Date())) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.expired_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                    {effectiveExpiresAt
                        ? t('tests.taking.expired_desc', { date: new Date(effectiveExpiresAt).toLocaleString() })
                        : t('tests.taking.expired_desc_no_date')}
                </p>
            </CenteredMessage>
        );
    }

    // ── Guard: loading ────────────────────────────────────────────────────────
    if (loading) {
        return <StudentTaskSkeleton />;
    }

    // ── Guard: load error / no content ───────────────────────────────────────
    if (loadError || !test) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.load_error_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                    {/* v8 ignore next 1 */ loadError ?? t('tests.taking.load_error')}
                </p>
            </CenteredMessage>
        );
    }

    // ── Guard: staircase test with no reachable question at all ──────────────
    // A misconfigured staircase (empty or misassigned level pools) resolves the very first
    // question to null — distinct from a legitimate convergence, which only happens after
    // at least one question has been asked.
    if (isStaircase && levelPath.length === 0 && !staircaseQuestion) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.load_error_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{t('tests.taking.staircase_not_configured')}</p>
            </CenteredMessage>
        );
    }

    // ── Guard: generator run failed to load its first/next question ──────────
    if (isGenerator && generatorError && !generatorResult) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.load_error_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{generatorError}</p>
            </CenteredMessage>
        );
    }
    if (isGenerator && generatorLoading && !generatorResult) {
        return <StudentTaskSkeleton />;
    }

    const generatorQuestion =
        isGenerator && generatorResult && !generatorResult.done ? generatorResult.question : undefined;
    const question = isStaircase
        ? staircaseQuestion?.question
        : isGenerator
          ? generatorQuestion
          : orderedQuestions[currentIndex];
    // A staircase/generator run has no fixed question count — every question is effectively the
    // "last" of its own micro-stage, and there's no going back once an answer is locked in.
    const isLast = isStaircase || isGenerator ? true : currentIndex === orderedQuestions.length - 1;
    const isFirst = isStaircase || isGenerator ? true : currentIndex === 0;
    const answeredCount = isStaircase
        ? levelPath.length
        : isGenerator
          ? (generatorResult?.questionsAsked ?? 0)
          : orderedQuestions.filter((q) => (answers.get(q.id) ?? '').trim().length > 0).length;
    // Positions to review before handing in; an adaptive run has no fixed set to go back to.
    const reviewable = !isStaircase && !isGenerator;
    const unansweredIndices = reviewable
        ? orderedQuestions.flatMap((q, i) => ((answers.get(q.id) ?? '').trim() ? [] : [i]))
        : [];
    const flaggedIndices = reviewable ? orderedQuestions.flatMap((q, i) => (flagged.has(q.id) ? [i] : [])) : [];
    // The run has converged (or exhausted its pool) — ready to submit instead of continuing.
    const staircaseTerminal = isStaircase && !staircaseQuestion;
    const generatorTerminal = isGenerator && generatorResult?.done === true;

    // Find current question's section label — a generator question's "section" is the ad hoc
    // passage the server returned alongside it, if any, rather than a real TestSection.
    const sections = test.sections ?? [];
    const generatorPassage =
        isGenerator && generatorResult && !generatorResult.done ? generatorResult.passage : undefined;
    const currentSection = generatorPassage
        ? {
              id: generatorPassage.bankItemId,
              title: generatorPassage.title,
              content: generatorPassage.content,
              audioUrl: generatorPassage.audioUrl,
              spokenText: generatorPassage.spokenText,
              maxPlays: generatorPassage.maxPlays,
          }
        : question?.sectionId
          ? sections.find((s) => s.id === question.sectionId)
          : null;
    const sectionAudioSrc = safeAudioSrc(currentSection?.audioUrl);
    const sectionStimulus = currentSection as Partial<TestSection> | null | undefined;

    // For a staged test, the last question of a stage routes onward instead of submitting
    // directly — resolveNextSection returns null once the path reaches a terminal section.
    const nextStageId =
        staged && currentStageId
            ? resolveNextSection(
                  test,
                  currentStageId,
                  test.questions.map((q) => ({ questionId: q.id, response: answers.get(q.id) ?? '' })),
                  sectionPath
              )
            : null;

    return (
        <SebGate
            requireSEB={/* v8 ignore next 1 */ resolvedContent?.requireSEB ?? assignment.requireSEB}
            startUrl={window.location.href}
            fileName={test.name}
            configEndpoint={
                hasDb && assignment.supabaseUrl
                    ? {
                          supabaseUrl: assignment.supabaseUrl,
                          code: assignment.teacherKey,
                          apikey: assignment.supabaseAnonKey,
                      }
                    : undefined
            }
        >
            <div
                style={{
                    minHeight: '100vh',
                    background: 'var(--bg)',
                    fontFamily: 'var(--font, Inter, system-ui, sans-serif)',
                    color: 'var(--text)',
                    paddingBottom: 80,
                }}
            >
                {/* Draft restored banner */}
                {draftRestored && !submitted && (
                    <div
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                            borderBottom: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                            padding: '10px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: '0.875rem',
                            color: 'var(--accent-text)',
                        }}
                    >
                        {t('tests.taking.draft_restored')}
                        <button
                            onClick={() => setDraftRestored(false)}
                            style={{
                                marginLeft: 'auto',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--accent-text)',
                                fontSize: '0.8rem',
                                textDecoration: 'underline',
                            }}
                        >
                            {t('tests.taking.dismiss')}
                        </button>
                    </div>
                )}

                {/* Live monitoring disclosure */}
                {telemetry.isBroadcasting && !submitted && (
                    <div
                        style={{
                            background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                            borderBottom: '1px solid var(--border)',
                            padding: '8px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)',
                        }}
                    >
                        <Eye size={14} style={{ flexShrink: 0 }} />
                        {t('tests.taking.live_disclosure')}
                    </div>
                )}

                {/* Header */}
                <div
                    style={{
                        background: 'var(--bg-elevated)',
                        borderBottom: '1px solid var(--border)',
                        padding: '14px 28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                    }}
                >
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
                        {test.name}
                    </h1>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        {!submitted && (
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {isStaircase || isGenerator
                                    ? t('tests.taking.staircase_progress', { answered: answeredCount })
                                    : t('tests.taking.progress', {
                                          answered: answeredCount,
                                          total: orderedQuestions.length,
                                      })}
                            </div>
                        )}
                        <CountdownTimer
                            durationMinutes={assignment?.durationMinutes ?? resolvedContent?.durationMinutes ?? null}
                            storageKey={draftKey + '_timer'}
                            submitted={submitted}
                            resetSignal={retakeCount}
                            onTimeUp={handleSubmit}
                            timeUpLabel={t('tests.taking.time_up')}
                        />
                    </div>
                </div>

                <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 20px' }}>
                    {test.description && (
                        <div
                            style={{
                                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                borderRadius: 10,
                                padding: '14px 18px',
                                marginBottom: 20,
                                fontSize: '0.95rem',
                                color: 'var(--text)',
                                lineHeight: 1.6,
                            }}
                        >
                            {test.description}
                        </div>
                    )}

                    {submitError && (
                        <div
                            style={{
                                background: '#fef2f2',
                                border: '1px solid #fca5a5',
                                borderRadius: 10,
                                padding: '12px 16px',
                                marginBottom: 16,
                                fontSize: '0.875rem',
                                color: '#b91c1c',
                                display: 'flex',
                                gap: 8,
                                alignItems: 'flex-start',
                            }}
                        >
                            <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                            {submitError}
                        </div>
                    )}

                    {submitted ? (
                        <div
                            style={{
                                background: '#f0fdf4',
                                border: '1px solid #86efac',
                                borderRadius: 12,
                                padding: 20,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <CheckCircle size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                                <span style={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>
                                    {hasDb && !submitError
                                        ? t('tests.taking.submitted_title_db')
                                        : t('tests.taking.submitted_title')}
                                </span>
                            </div>
                            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                                {hasDb && !submitError
                                    ? t('tests.taking.submitted_desc_db')
                                    : t('tests.taking.submitted_desc_code')}
                            </p>
                            {(!hasDb || !!submitError) && (
                                <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                                    <textarea
                                        readOnly
                                        value={submissionCode}
                                        rows={6}
                                        style={{
                                            flex: 1,
                                            fontFamily: 'monospace',
                                            fontSize: '0.72rem',
                                            resize: 'vertical',
                                            background: 'var(--bg-elevated)',
                                            border: '1px solid #86efac',
                                            borderRadius: 8,
                                            padding: 10,
                                            color: 'var(--text)',
                                        }}
                                    />
                                    <button
                                        onClick={handleCopy}
                                        style={{
                                            padding: '0 16px',
                                            background: copied ? '#16a34a' : '#22c55e',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: 8,
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            fontSize: '0.875rem',
                                            flexShrink: 0,
                                        }}
                                    >
                                        <Copy size={14} />
                                        {copied ? t('tests.taking.copied') : t('tests.taking.copy')}
                                    </button>
                                </div>
                            )}
                            {test?.allowMultipleAttempts && (
                                <button
                                    type="button"
                                    onClick={handleRetake}
                                    className="btn btn-secondary"
                                    style={{ marginTop: 12 }}
                                >
                                    {t('tests.taking.retake')}
                                </button>
                            )}
                            {inSeb && (
                                <button
                                    type="button"
                                    onClick={() => quitSafeExamBrowser(buildSebQuitUrl())}
                                    className="btn btn-secondary"
                                    style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                >
                                    <LogOut size={14} /> {t('tests.taking.seb_quit')}
                                </button>
                            )}
                        </div>
                    ) : null}

                    {submitted && test?.mode === 'practice' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                            {orderedQuestions.map((q, index) => {
                                const response = answers.get(q.id) ?? '';
                                const earned = autoScoreResponse(q, response);
                                const isCorrect = earned >= q.points;
                                const qSection = (test?.sections ?? []).find((sec) => sec.id === q.sectionId);
                                const qLang = resolveQuestionContentLanguage(q, qSection, test);
                                return (
                                    <div key={q.id} className="card" style={{ padding: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            {isCorrect ? (
                                                <CheckCircle
                                                    size={18}
                                                    style={{ color: 'var(--green-text)', flexShrink: 0, marginTop: 2 }}
                                                />
                                            ) : (
                                                <XCircle
                                                    size={18}
                                                    style={{ color: 'var(--red-text)', flexShrink: 0, marginTop: 2 }}
                                                />
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <div className="text-muted text-xs">
                                                    {t('tests.taking.practice_review_question_number', {
                                                        number: index + 1,
                                                    })}
                                                </div>
                                                <div
                                                    lang={
                                                        q.type === 'cloze' ||
                                                        q.type === 'cloze-dropdown' ||
                                                        q.type === 'cloze-bank'
                                                            ? undefined
                                                            : qLang
                                                    }
                                                    style={{ fontWeight: 600, marginTop: 2 }}
                                                >
                                                    {q.type === 'cloze' ||
                                                    q.type === 'cloze-dropdown' ||
                                                    q.type === 'cloze-bank'
                                                        ? t(clozeInstructionKey(q.type))
                                                        : q.prompt}
                                                </div>
                                                {q.explanation && (
                                                    <div
                                                        className="text-muted text-sm"
                                                        style={{ marginTop: 8, marginBottom: 0 }}
                                                    >
                                                        <RichNote text={q.explanation} lang={qLang} />
                                                    </div>
                                                )}
                                                {pickedOptionFeedback(q, response).map((line, i) => (
                                                    <p
                                                        key={i}
                                                        lang={qLang}
                                                        className="text-muted text-sm"
                                                        style={{
                                                            marginTop: 8,
                                                            marginBottom: 0,
                                                            whiteSpace: 'pre-wrap',
                                                        }}
                                                    >
                                                        <strong>{line.text}</strong>: {line.feedback}
                                                    </p>
                                                ))}
                                                {(() => {
                                                    const section = (test?.sections ?? []).find(
                                                        (sec) => sec.id === q.sectionId
                                                    );
                                                    const firstOfSection =
                                                        !!section &&
                                                        orderedQuestions.find((oq) => oq.sectionId === section.id)
                                                            ?.id === q.id;
                                                    // A section transcript belongs to the section, not to the first
                                                    // question that happens to render it — read it in the section
                                                    // language, keeping qLang for the question's own transcript.
                                                    const sectionLang = resolveContentLanguage(
                                                        section?.contentLanguage,
                                                        test?.contentLanguage
                                                    );
                                                    const hasOwnTranscript = !!q.transcript;
                                                    const transcript =
                                                        q.transcript || (firstOfSection ? section?.transcript : '');
                                                    return transcript ? (
                                                        <details style={{ marginTop: 8 }}>
                                                            <summary className="text-sm">
                                                                {t('tests.taking.transcript_title')}
                                                            </summary>
                                                            <p
                                                                lang={hasOwnTranscript ? qLang : sectionLang}
                                                                className="text-muted text-sm"
                                                                style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}
                                                            >
                                                                {transcript}
                                                            </p>
                                                        </details>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {!submitted && (
                        <>
                            {/* Section label */}
                            {currentSection && (
                                <div
                                    lang={resolveContentLanguage(currentSection.contentLanguage, test?.contentLanguage)}
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        color: 'var(--accent-text)',
                                        marginBottom: 10,
                                        padding: '4px 10px',
                                        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                        borderRadius: 6,
                                        display: 'inline-block',
                                    }}
                                >
                                    {currentSection.title}
                                </div>
                            )}
                            {currentSection?.content && (
                                <div
                                    style={{
                                        marginBottom: 16,
                                        padding: 16,
                                        background: 'var(--bg-elevated)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 10,
                                    }}
                                >
                                    {readAloudAllowed && (
                                        <PassageReadAloud
                                            contentHtml={currentSection.content}
                                            lang={resolveContentLanguage(
                                                currentSection.contentLanguage,
                                                test?.contentLanguage
                                            )}
                                        />
                                    )}
                                    <RichContent
                                        html={currentSection.content}
                                        lang={resolveContentLanguage(
                                            currentSection.contentLanguage,
                                            test?.contentLanguage
                                        )}
                                    />
                                </div>
                            )}
                            {(sectionAudioSrc || sectionStimulus?.spokenText) && currentSection && (
                                <div style={{ marginBottom: 16 }}>
                                    <LimitedAudio
                                        src={sectionAudioSrc}
                                        spokenText={sectionStimulus?.spokenText}
                                        maxPlays={sectionStimulus?.maxPlays}
                                        plays={audioPlays[`section:${currentSection.id}`] ?? 0}
                                        onPlay={(count) => handleAudioPlay(`section:${currentSection.id}`, count)}
                                        lang={resolveContentLanguage(
                                            currentSection.contentLanguage,
                                            test?.contentLanguage
                                        )}
                                        label={t('tests.taking.section_audio_alt')}
                                    />
                                </div>
                            )}

                            {question && (
                                <StudentQuestionCard
                                    key={question.id}
                                    question={displayQuestion(question)}
                                    index={isStaircase ? levelPath.length : isGenerator ? answeredCount : currentIndex}
                                    total={orderedQuestions.length}
                                    value={answers.get(question.id) ?? ''}
                                    onChange={(value) => setAnswers((prev) => new Map(prev).set(question.id, value))}
                                    code={/* v8 ignore next 1 */ code ?? ''}
                                    onRecordingChange={setIsRecordingAudio}
                                    hideTotal={isStaircase || isGenerator}
                                    readAloudAllowed={readAloudAllowed}
                                    lang={resolveQuestionContentLanguage(
                                        question,
                                        (test?.sections ?? []).find((sec) => sec.id === question.sectionId),
                                        test
                                    )}
                                    audioPlays={audioPlays[`question:${question.id}`] ?? 0}
                                    onAudioPlay={(count) => handleAudioPlay(`question:${question.id}`, count)}
                                />
                            )}

                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 12,
                                    marginTop: 16,
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                                    disabled={isFirst || isRecordingAudio}
                                    className="btn btn-secondary"
                                    style={{ opacity: isFirst ? 0.5 : 1 }}
                                >
                                    {t('tests.taking.previous')}
                                </button>

                                {!isStaircase && !isGenerator && question && (
                                    <button
                                        type="button"
                                        onClick={() => toggleFlag(question.id)}
                                        aria-pressed={flagged.has(question.id)}
                                        className="btn btn-ghost btn-sm"
                                        style={{
                                            color: flagged.has(question.id)
                                                ? 'var(--yellow-text)'
                                                : 'var(--text-muted)',
                                            gap: 6,
                                        }}
                                    >
                                        <Flag size={15} fill={flagged.has(question.id) ? 'var(--yellow)' : 'none'} />
                                        {flagged.has(question.id) ? t('tests.taking.flagged') : t('tests.taking.flag')}
                                    </button>
                                )}

                                {isLast && staged && nextStageId ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // resolveNextSection returns null when it would route back to an
                                            // already-visited section, so nextStageId is never the current last id.
                                            setSectionPath((prev) => [...prev, nextStageId]);
                                            setCurrentIndex(0);
                                        }}
                                        disabled={isRecordingAudio}
                                        className="btn btn-primary"
                                        style={{ padding: '10px 32px', fontWeight: 700, fontSize: '0.95rem' }}
                                    >
                                        {t('tests.taking.continue_section')}
                                    </button>
                                ) : isLast && isStaircase && !staircaseTerminal && staircaseQuestion ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const { sectionId, level, question: currentQuestion } = staircaseQuestion;
                                            const response = answers.get(currentQuestion.id) ?? '';
                                            const earned = autoScoreResponse(currentQuestion, response);
                                            const correct = earned >= currentQuestion.points;
                                            // A staircase question is never re-presented, so it can't already
                                            // be in the trace — always append the newly committed step.
                                            setLevelPath((prev) => [
                                                ...prev,
                                                { sectionId, level, questionId: currentQuestion.id, correct },
                                            ]);
                                        }}
                                        disabled={isRecordingAudio}
                                        className="btn btn-primary"
                                        style={{ padding: '10px 32px', fontWeight: 700, fontSize: '0.95rem' }}
                                    >
                                        {t('tests.taking.continue_section')}
                                    </button>
                                ) : isLast && isGenerator && !generatorTerminal && generatorQuestion ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const response = answers.get(generatorQuestion.id) ?? '';
                                            void advanceGenerator(generatorQuestion.id, response);
                                        }}
                                        disabled={isRecordingAudio || generatorLoading}
                                        className="btn btn-primary"
                                        style={{
                                            padding: '10px 32px',
                                            fontWeight: 700,
                                            fontSize: '0.95rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        {generatorLoading && (
                                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                        )}
                                        {t('tests.taking.continue_section')}
                                    </button>
                                ) : isLast ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (unansweredIndices.length > 0 || flaggedIndices.length > 0) {
                                                setReviewOpen(true);
                                            } else {
                                                void handleSubmit();
                                            }
                                        }}
                                        disabled={submitting || isRecordingAudio}
                                        style={{
                                            padding: '10px 32px',
                                            borderRadius: 8,
                                            border: 'none',
                                            fontWeight: 700,
                                            fontSize: '0.95rem',
                                            background: 'var(--accent)',
                                            color: '#fff',
                                            cursor: submitting ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                        }}
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                                                {t('tests.taking.submitting')}
                                            </>
                                        ) : (
                                            t('tests.taking.submit_btn')
                                        )}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCurrentIndex((i) => Math.min(orderedQuestions.length - 1, i + 1))
                                        }
                                        disabled={isRecordingAudio}
                                        className="btn btn-primary"
                                    >
                                        {t('tests.taking.next')}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {reviewOpen && !submitted && (
                    <SubmitReviewDialog
                        unanswered={unansweredIndices}
                        flagged={flaggedIndices}
                        onJump={(index) => {
                            setReviewOpen(false);
                            setCurrentIndex(index);
                        }}
                        onSubmit={() => {
                            setReviewOpen(false);
                            void handleSubmit();
                        }}
                        onClose={() => setReviewOpen(false)}
                    />
                )}
                {/* Question timeline — sticky footer (not shown for an adaptive staircase/generator run, which has no fixed question set to jump between) */}
                {!submitted && !isStaircase && !isGenerator && orderedQuestions.length > 0 && (
                    <QuestionTimeline
                        questions={orderedQuestions}
                        currentIndex={currentIndex}
                        answers={answers}
                        sections={sections}
                        flagged={flagged}
                        seenIndices={seenIndices}
                        onJump={setCurrentIndex}
                        contentLang={contentLang}
                    />
                )}
            </div>
        </SebGate>
    );
}

// ── Question Timeline ─────────────────────────────────────────────────────────

interface TimelineProps {
    questions: TestQuestion[];
    currentIndex: number;
    answers: Map<string, string>;
    sections: TestSection[];
    flagged: Set<string>;
    seenIndices: Set<number>;
    onJump: (index: number) => void;
    contentLang: string;
}

function LegendSwatch({ label, style }: { label: string; style: React.CSSProperties }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, flexShrink: 0, ...style }} />
            {label}
        </span>
    );
}

function QuestionTimeline({
    questions,
    currentIndex,
    answers,
    sections,
    flagged,
    seenIndices,
    onJump,
    contentLang,
}: TimelineProps) {
    const { t } = useTranslation();

    // Group consecutive questions with same sectionId
    const groups: { sectionTitle: string | null; sectionId?: string; indices: number[] }[] = [];
    questions.forEach((q, i) => {
        const section = q.sectionId ? sections.find((s) => s.id === q.sectionId) : undefined;
        const sectionTitle = section?.title ?? null;
        const last = groups[groups.length - 1];
        if (last && last.sectionTitle === sectionTitle) {
            last.indices.push(i);
        } else {
            groups.push({ sectionTitle, sectionId: section?.id, indices: [i] });
        }
    });

    const neutralBg = 'color-mix(in srgb, var(--text-muted) 20%, var(--bg))';

    // Portalled to <body>: a fixed bar inside page content is positioned against the nearest
    // transformed ancestor (any `.fade-in` ending on a transform) instead of the viewport (#1017).
    return createPortal(
        <div
            style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--bg-elevated)',
                borderTop: '1px solid var(--border)',
                padding: `10px calc(16px + env(safe-area-inset-right, 0px)) calc(10px + env(safe-area-inset-bottom, 0px)) 16px`,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
                zIndex: 100,
            }}
            aria-label={t('tests.taking.timeline_label')}
        >
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    fontSize: '0.68rem',
                    color: 'var(--text-muted)',
                    flexWrap: 'wrap',
                }}
            >
                <LegendSwatch label={t('tests.taking.legend_answered')} style={{ background: 'var(--accent)' }} />
                <LegendSwatch label={t('tests.taking.legend_unanswered')} style={{ background: neutralBg }} />
                <LegendSwatch
                    label={t('tests.taking.legend_unseen')}
                    style={{ background: 'var(--bg)', border: '1px dashed var(--border)' }}
                />
                <LegendSwatch
                    label={t('tests.taking.legend_flagged')}
                    style={{ background: 'var(--bg)', border: '2px solid var(--yellow)' }}
                />
            </div>
            {groups.map((group) => (
                <div
                    key={`${group.sectionTitle ?? '__none__'}-${group.indices[0]}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    {group.sectionTitle && (
                        <span
                            lang={resolveContentLanguage(
                                sections.find((s) => s.id === group.sectionId)?.contentLanguage,
                                contentLang
                            )}
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                                marginRight: 4,
                                flexShrink: 0,
                            }}
                        >
                            {group.sectionTitle}
                        </span>
                    )}
                    {group.indices.map((i) => {
                        const q = questions[i];
                        const answered = (answers.get(q.id) ?? '').trim().length > 0;
                        const isCurrent = i === currentIndex;
                        const isSeen = seenIndices.has(i);
                        const isFlagged = flagged.has(q.id);
                        const border = isCurrent
                            ? '2px solid var(--accent)'
                            : isFlagged
                              ? '2px solid var(--yellow)'
                              : isSeen
                                ? '2px solid transparent'
                                : '2px dashed var(--border)';
                        return (
                            <button
                                key={q.id}
                                type="button"
                                onClick={() => onJump(i)}
                                aria-label={t('tests.taking.go_to_question', { number: i + 1 })}
                                aria-current={isCurrent ? 'step' : undefined}
                                style={{
                                    position: 'relative',
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border,
                                    background: answered ? 'var(--accent)' : isSeen ? neutralBg : 'var(--bg)',
                                    color: answered ? '#fff' : 'var(--text-muted)',
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    transition: 'background 0.15s, box-shadow 0.15s',
                                }}
                            >
                                {i + 1}
                                {isFlagged && (
                                    <Flag
                                        size={9}
                                        fill="var(--yellow)"
                                        color="var(--yellow)"
                                        style={{ position: 'absolute', top: -4, right: -4 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>,
        document.body
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function CenteredMessage({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg)',
                padding: 24,
            }}
        >
            <div style={{ maxWidth: 480, textAlign: 'center' }}>{children}</div>
        </div>
    );
}
