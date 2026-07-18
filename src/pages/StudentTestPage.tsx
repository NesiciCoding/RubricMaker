import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ToastContext } from '../context/ToastContext';
import {
    Clock,
    CheckCircle,
    XCircle,
    Copy,
    AlertTriangle,
    Loader2,
    Eye,
    ChevronUp,
    ChevronDown,
    Lightbulb,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { decodeTestAssignment } from '../utils/shareCode';
import { encodeTestSubmission } from '../utils/shareCode';
import { nanoid } from '../utils/nanoid';
import {
    loadTestDraft,
    saveTestDraft,
    clearTestDraft,
    loadTestTimer,
    saveTestTimer,
    clearTestTimer,
} from '../store/storage';
import SebGate from '../components/Tests/SebGate';
import HelpPopover from '../components/Tests/HelpPopover';
import RichContent from '../components/Editor/RichContent';
import { useLiveSessionTelemetry } from '../hooks/useLiveSessionTelemetry';
import { seededShuffle } from '../utils/seededShuffle';
import { isStagedTest, entrySectionId, sectionQuestions, resolveNextSection } from '../utils/placementRouting';
import { isStaircaseTest, resolveNextStaircaseQuestion } from '../utils/placementStaircase';
import { renderClozeSegments, parseHotTextFragments } from '../utils/clozeParse';
import { initClientLogger, logEvent } from '../services/logging/clientLogger';
import { TestAdapter } from '../services/database/TestAdapter';
import { useMediaRecorder } from '../hooks/useMediaRecorder';
import { encodeAudioResponse, parseAudioResponse } from '../utils/audioResponseCode';
import { autoScoreResponse } from '../utils/testCalc';
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

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60)
        .toString()
        .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Returns the URL only when protocol is http(s), blocking javascript: and other dangerous schemes. */
function safeImgSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {
        // not a valid absolute URL — allow data: URIs that are image MIME types
        if (/^data:image\//i.test(url)) return url;
    }
    return undefined;
}

/** Returns the URL only when protocol is http(s), blocking javascript: and other dangerous schemes. */
function safeAudioSrc(url: string | undefined): string | undefined {
    if (!url) return undefined;
    try {
        const u = new URL(url);
        if (u.protocol === 'https:' || u.protocol === 'http:') return u.href;
    } catch {
        // not a valid absolute URL
    }
    return undefined;
}

function withAnswer(answers: Record<string, string>, key: string, value: string): Record<string, string> {
    const map = new Map(Object.entries(answers));
    if (!UNSAFE_KEYS.has(key)) map.set(key, value);
    return Object.fromEntries(map);
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

    const hasDb = !!(assignment?.supabaseUrl && assignment?.supabaseAnonKey);
    const draftKey = DRAFT_KEY_PREFIX + (code ?? '');

    // Isolated client + anonymous auth for the test share-link flow (storageKey:
    // rm_student_test_auth) — separate from the essay flow's rm_student_auth so the
    // two can never collide. Stable for the component's lifetime.
    const adapter = useMemo<TestAdapter | null>(() => {
        if (!assignment?.supabaseUrl || !assignment?.supabaseAnonKey) return null;
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
              }
            : undefined
    );
    const contentReady = resolvedContent !== undefined;
    const test = resolvedContent?.test ?? null;
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
    // Ids of sections visited so far, in order — only meaningful for staged (placement) tests.
    // Seeded from the draft when resuming; the effect below seeds the entry section once the
    // test loads for a fresh attempt (the currentStageId fallback below covers the one-render
    // gap before that effect runs, so nothing needs to block on it).
    const [sectionPath, setSectionPath] = useState<string[]>(() => loadTestDraft(draftKey)?.sectionPath ?? []);
    // The full adaptive question trace for a staircase (placement) test — only meaningful when
    // isStaircase is true. Each entry is scored and locked in immediately; there's no going back.
    const [levelPath, setLevelPath] = useState<StaircaseStep[]>(() => loadTestDraft(draftKey)?.levelPath ?? []);
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [isRecordingAudio, setIsRecordingAudio] = useState(false);

    const startedAtRef = useRef<string>(new Date().toISOString());
    const submitInFlightRef = useRef(false);

    const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
        const minutes = assignment?.durationMinutes ?? null;
        if (!minutes) return null;
        const stored = loadTestTimer(draftKey + '_timer');
        if (stored !== null) return stored;
        return minutes * 60;
    });
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
                // on every unrelated re-render (e.g. the countdown timer ticking for a
                // legacy link with an embedded durationMinutes).
                setResolvedContent(null);
                setLoadError(t('tests.taking.load_error'));
                logEvent('error', 'test_load_error', { testId: assignment.testId }, 'error');
                setLoading(false);
                return;
            }
            const result = await adapter.fetchAssignmentContent(assignment.teacherKey);
            if (cancelled) return;
            if (result.ok) {
                setResolvedContent(result.data);
                if (result.data.durationMinutes && secondsLeft === null) {
                    const stored = loadTestTimer(draftKey + '_timer');
                    setSecondsLeft(stored ?? result.data.durationMinutes * 60);
                }
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
    }, [hasDb, assignment, adapter, contentReady, secondsLeft, draftKey, t]);

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
        if (entry) setSectionPath([entry]);
    }, [test, staged, sectionPath.length]);

    useEffect(() => {
        setCurrentIndex(0);
    }, [currentStageId]);

    const orderedQuestions = useMemo<TestQuestion[]>(() => {
        if (!test) return [];
        if (staged) {
            if (!currentStageId) return [];
            const stageQuestions = sectionQuestions(test, currentStageId);
            if (!test.shuffleQuestions || !code) return stageQuestions;
            return seededShuffle(stageQuestions, `${code}-${currentStageId}`);
        }
        if (!test.shuffleQuestions || !code) return test.questions;
        return seededShuffle(test.questions, code);
    }, [test, code, staged, currentStageId]);

    const isStaircase = !!test && isStaircaseTest(test);
    const staircaseQuestion = useMemo(() => {
        if (!test || !isStaircase) return null;
        return resolveNextStaircaseQuestion(test, levelPath, code ?? '');
    }, [test, isStaircase, levelPath, code]);

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
        }),
        [answers]
    );

    const { showToast } = useContext(ToastContext);
    const telemetry = useLiveSessionTelemetry({
        kind: 'test',
        assignmentKey: assignment?.teacherKey ?? '',
        enabled: !!assignment && !submitted,
        getSnapshot,
        supabaseUrl: assignment?.supabaseUrl,
        supabaseAnonKey: assignment?.supabaseAnonKey,
        onNudge: (message) => showToast(message, 'info'),
    });

    const handleSubmit = useCallback(async () => {
        if (!assignment || !test) return;
        if (submitInFlightRef.current || submitted) return;
        submitInFlightRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);

        const effectiveTestId = resolvedContent?.testId || assignment.testId;
        const effectiveStudentId = resolvedContent?.studentId || assignment.studentId;

        const submittedAt = new Date().toISOString();
        const testAnswers: TestAnswer[] = test.questions.map((q) => ({
            questionId: q.id,
            response: answers.get(q.id) ?? '',
        }));

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
        };
        const legacyCode = encodeTestSubmission(submissionPayload);

        if (hasDb && adapter) {
            setSubmitting(true);
            setSubmitError('');
            const studentTestId = nanoid();
            const result = await adapter.submitTest(
                assignment.teacherKey,
                studentTestId,
                testAnswers,
                startedAtRef.current,
                submittedAt,
                submissionPayload.events,
                submissionPayload.sectionPath,
                submissionPayload.levelPath
            );
            setSubmitting(false);
            if (!result.success) {
                setSubmitError(t('tests.taking.submit_error_db'));
                logEvent('error', 'test_submit_error', { testId: effectiveTestId }, 'error');
            } else {
                logEvent('action', 'test_submitted', {
                    testId: effectiveTestId,
                    answerCount: testAnswers.length,
                });
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
    ]);

    const handleSubmitRef = useRef(handleSubmit);
    useEffect(() => {
        handleSubmitRef.current = handleSubmit;
    }, [handleSubmit]);

    // ── Countdown — auto-submit at 0 ──────────────────────────────────────────
    useEffect(() => {
        if (secondsLeft === null || secondsLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev === null) return null;
                const next = prev - 1;
                saveTestTimer(draftKey + '_timer', next);
                if (next <= 0) {
                    if (timerRef.current) clearInterval(timerRef.current);
                    void handleSubmitRef.current();
                }
                return next;
            });
        }, 1000);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [secondsLeft === null, submitted, draftKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRetake = useCallback(() => {
        clearTestDraft(draftKey);
        clearTestTimer(draftKey + '_timer');
        startedAtRef.current = new Date().toISOString();
        setAnswers(new Map());
        setCurrentIndex(0);
        setSectionPath([]);
        setLevelPath([]);
        setSubmitted(false);
        setSubmissionCode('');
        setSubmitError('');
        setDraftRestored(false);
        if (assignment?.durationMinutes) setSecondsLeft(assignment.durationMinutes * 60);
    }, [assignment, draftKey]);

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
        return (
            <CenteredMessage>
                <Loader2 size={28} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            </CenteredMessage>
        );
    }

    // ── Guard: load error / no content ───────────────────────────────────────
    if (loadError || !test) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.load_error_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>{loadError ?? t('tests.taking.load_error')}</p>
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

    const timedOut = secondsLeft !== null && secondsLeft <= 0;
    const question = isStaircase ? staircaseQuestion?.question : orderedQuestions[currentIndex];
    // A staircase test has no fixed question count — every question is effectively the "last"
    // of its own micro-stage, and there's no going back once an answer is locked in.
    const isLast = isStaircase ? true : currentIndex === orderedQuestions.length - 1;
    const isFirst = isStaircase ? true : currentIndex === 0;
    const answeredCount = isStaircase
        ? levelPath.length
        : orderedQuestions.filter((q) => (answers.get(q.id) ?? '').trim().length > 0).length;
    // The run has converged (or exhausted its pool) — ready to submit instead of continuing.
    const staircaseTerminal = isStaircase && !staircaseQuestion;

    // Find current question's section label
    const sections = test.sections ?? [];
    const currentSection = question?.sectionId ? sections.find((s) => s.id === question.sectionId) : null;
    const sectionAudioSrc = safeAudioSrc(currentSection?.audioUrl);

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
        <SebGate requireSEB={resolvedContent?.requireSEB ?? assignment.requireSEB}>
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
                            color: 'var(--accent)',
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
                                color: 'var(--accent)',
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
                                {isStaircase
                                    ? t('tests.taking.staircase_progress', { answered: answeredCount })
                                    : t('tests.taking.progress', {
                                          answered: answeredCount,
                                          total: orderedQuestions.length,
                                      })}
                            </div>
                        )}
                        {secondsLeft !== null && (
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontWeight: 700,
                                    fontSize: '1.05rem',
                                    fontVariantNumeric: 'tabular-nums',
                                    color: secondsLeft < 120 ? '#ef4444' : 'var(--text)',
                                }}
                            >
                                <Clock size={17} />
                                {timedOut ? t('tests.taking.time_up') : formatTime(secondsLeft)}
                            </div>
                        )}
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
                        </div>
                    ) : null}

                    {submitted && test?.mode === 'practice' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                            {orderedQuestions.map((q, index) => {
                                const response = answers.get(q.id) ?? '';
                                const earned = autoScoreResponse(q, response);
                                const isCorrect = earned >= q.points;
                                return (
                                    <div key={q.id} className="card" style={{ padding: 14 }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                            {isCorrect ? (
                                                <CheckCircle
                                                    size={18}
                                                    style={{ color: 'var(--green)', flexShrink: 0, marginTop: 2 }}
                                                />
                                            ) : (
                                                <XCircle
                                                    size={18}
                                                    style={{ color: 'var(--red)', flexShrink: 0, marginTop: 2 }}
                                                />
                                            )}
                                            <div style={{ flex: 1 }}>
                                                <div className="text-muted text-xs">
                                                    {t('tests.taking.practice_review_question_number', {
                                                        number: index + 1,
                                                    })}
                                                </div>
                                                <div style={{ fontWeight: 600, marginTop: 2 }}>
                                                    {q.type === 'cloze' || q.type === 'cloze-dropdown'
                                                        ? t(
                                                              q.type === 'cloze-dropdown'
                                                                  ? 'tests.taking.cloze_dropdown_instruction'
                                                                  : 'tests.taking.cloze_instruction'
                                                          )
                                                        : q.prompt}
                                                </div>
                                                {q.explanation && (
                                                    <p
                                                        className="text-muted text-sm"
                                                        style={{
                                                            marginTop: 8,
                                                            marginBottom: 0,
                                                            whiteSpace: 'pre-wrap',
                                                        }}
                                                    >
                                                        {q.explanation}
                                                    </p>
                                                )}
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
                                    style={{
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.06em',
                                        color: 'var(--accent)',
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
                                    <RichContent html={currentSection.content} />
                                </div>
                            )}
                            {sectionAudioSrc && (
                                <audio
                                    controls
                                    src={sectionAudioSrc}
                                    aria-label={t('tests.taking.section_audio_alt')}
                                    style={{ marginBottom: 16, width: '100%' }}
                                />
                            )}

                            {question && (
                                <QuestionCard
                                    key={question.id}
                                    question={question}
                                    index={isStaircase ? levelPath.length : currentIndex}
                                    total={orderedQuestions.length}
                                    value={answers.get(question.id) ?? ''}
                                    onChange={(value) => setAnswers((prev) => new Map(prev).set(question.id, value))}
                                    code={code ?? ''}
                                    onRecordingChange={setIsRecordingAudio}
                                    hideTotal={isStaircase}
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

                                {isLast && staged && nextStageId ? (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSectionPath((prev) => [...prev, nextStageId]);
                                            setCurrentIndex(0);
                                        }}
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
                                ) : isLast ? (
                                    <button
                                        type="button"
                                        onClick={handleSubmit}
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

                {/* Question timeline — sticky footer (not shown for an adaptive staircase run, which has no fixed question set to jump between) */}
                {!submitted && !isStaircase && orderedQuestions.length > 0 && (
                    <QuestionTimeline
                        questions={orderedQuestions}
                        currentIndex={currentIndex}
                        answers={answers}
                        sections={sections}
                        onJump={setCurrentIndex}
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
    onJump: (index: number) => void;
}

function QuestionTimeline({ questions, currentIndex, answers, sections, onJump }: TimelineProps) {
    const { t } = useTranslation();

    // Group consecutive questions with same sectionId
    const groups: { sectionTitle: string | null; indices: number[] }[] = [];
    questions.forEach((q, i) => {
        const sectionTitle = q.sectionId ? (sections.find((s) => s.id === q.sectionId)?.title ?? null) : null;
        const last = groups[groups.length - 1];
        if (last && last.sectionTitle === sectionTitle) {
            last.indices.push(i);
        } else {
            groups.push({ sectionTitle, indices: [i] });
        }
    });

    return (
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
            {groups.map((group) => (
                <div
                    key={`${group.sectionTitle ?? '__none__'}-${group.indices[0]}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                >
                    {group.sectionTitle && (
                        <span
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
                        return (
                            <button
                                key={q.id}
                                onClick={() => onJump(i)}
                                aria-label={t('tests.taking.go_to_question', { number: i + 1 })}
                                aria-current={isCurrent ? 'step' : undefined}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: isCurrent ? '2px solid var(--accent)' : '2px solid transparent',
                                    background: answered
                                        ? 'var(--accent)'
                                        : 'color-mix(in srgb, var(--text-muted) 20%, var(--bg))',
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
                            </button>
                        );
                    })}
                </div>
            ))}
        </div>
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

// ── Question Card ─────────────────────────────────────────────────────────────

interface QuestionCardProps {
    question: TestQuestion;
    index: number;
    total: number;
    value: string;
    onChange: (value: string) => void;
    code: string;
    onRecordingChange?: (recording: boolean) => void;
    /** True for an adaptive (staircase) run, where the total question count isn't known ahead of time */
    hideTotal?: boolean;
}

function QuestionCard({
    question,
    index,
    total,
    value,
    onChange,
    code,
    onRecordingChange,
    hideTotal,
}: QuestionCardProps) {
    const { t } = useTranslation();
    const isCloze = question.type === 'cloze' || question.type === 'cloze-dropdown';
    const [hintVisible, setHintVisible] = useState(false);
    const wordCount =
        question.type === 'open' && value.trim() ? value.trim().split(/\s+/).filter(Boolean).length : null;
    return (
        <div
            style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
            }}
        >
            <div
                style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    marginBottom: 8,
                    letterSpacing: '0.05em',
                }}
            >
                {hideTotal
                    ? t('tests.taking.question_label_no_total', { current: index + 1 })
                    : t('tests.taking.question_label', { current: index + 1, total })}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    margin: '0 0 16px',
                    fontSize: '1rem',
                    lineHeight: 1.6,
                    color: 'var(--text)',
                }}
            >
                {isCloze ? (
                    <p style={{ margin: 0 }}>
                        {t(
                            question.type === 'cloze-dropdown'
                                ? 'tests.taking.cloze_dropdown_instruction'
                                : 'tests.taking.cloze_instruction'
                        )}
                    </p>
                ) : (
                    <RichContent html={question.prompt} className="rm-question-prompt" />
                )}
                {(question.type === 'true-false' ||
                    question.type === 'multiple-response' ||
                    question.type === 'matching' ||
                    question.type === 'ordering' ||
                    question.type === 'categorize' ||
                    question.type === 'hot-text' ||
                    isCloze) && (
                    <HelpPopover title={t(`tests.help.${question.type.replace('-', '_')}_student_title`)}>
                        {t(`tests.help.${question.type.replace('-', '_')}_student_body`)}
                    </HelpPopover>
                )}
            </div>

            {/* Image stimulus */}
            {safeImgSrc(question.imageUrl) && (
                <img
                    src={safeImgSrc(question.imageUrl)}
                    alt={t('tests.taking.question_image_alt')}
                    style={{
                        display: 'block',
                        maxWidth: '100%',
                        maxHeight: 320,
                        borderRadius: 8,
                        objectFit: 'contain',
                        border: '1px solid var(--border)',
                        marginBottom: 16,
                    }}
                />
            )}

            {/* Audio stimulus */}
            {safeAudioSrc(question.audioUrl) && (
                <audio
                    controls
                    src={safeAudioSrc(question.audioUrl)}
                    aria-label={t('tests.taking.question_audio_alt')}
                    style={{ display: 'block', width: '100%', marginBottom: 16 }}
                />
            )}

            {/* Hint toggle */}
            {question.hint && (
                <div style={{ marginBottom: 16 }}>
                    <button
                        type="button"
                        onClick={() => setHintVisible((v) => !v)}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            background: 'none',
                            border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
                            borderRadius: 6,
                            padding: '4px 10px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: 'var(--accent)',
                            cursor: 'pointer',
                        }}
                    >
                        <Lightbulb size={13} />
                        {hintVisible ? t('tests.taking.hint_hide') : t('tests.taking.hint_show')}
                    </button>
                    {hintVisible && (
                        <div
                            style={{
                                marginTop: 8,
                                padding: '10px 14px',
                                background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                                borderRadius: 8,
                                fontSize: '0.9rem',
                                color: 'var(--text)',
                                lineHeight: 1.55,
                            }}
                        >
                            {question.hint}
                        </div>
                    )}
                </div>
            )}

            {question.type === 'multiple-choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(question.options ?? []).map((opt) => (
                        <label
                            key={opt.id}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 14px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background:
                                    value === opt.id
                                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                        : 'var(--bg)',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="radio"
                                name={`q-${question.id}`}
                                value={opt.id}
                                checked={value === opt.id}
                                onChange={() => onChange(opt.id)}
                            />
                            {safeImgSrc(opt.imageUrl) && (
                                <img
                                    src={safeImgSrc(opt.imageUrl)}
                                    alt={opt.text ? '' : t('tests.taking.option_image_fallback')}
                                    style={{ maxWidth: 80, maxHeight: 60, borderRadius: 4, objectFit: 'contain' }}
                                />
                            )}
                            <span style={{ color: 'var(--text)' }}>{opt.text}</span>
                        </label>
                    ))}
                </div>
            )}

            {question.type === 'multiple-response' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(question.options ?? []).map((opt) => {
                        const selected: string[] = value ? (JSON.parse(value) as string[]) : [];
                        const checked = selected.includes(opt.id);
                        return (
                            <label
                                key={opt.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 10,
                                    padding: '10px 14px',
                                    borderRadius: 8,
                                    border: '1px solid var(--border)',
                                    background: checked
                                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                        : 'var(--bg)',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                        const next = checked
                                            ? selected.filter((id) => id !== opt.id)
                                            : [...selected, opt.id];
                                        onChange(JSON.stringify(next));
                                    }}
                                />
                                {safeImgSrc(opt.imageUrl) && (
                                    <img
                                        src={safeImgSrc(opt.imageUrl)}
                                        alt={opt.text ? '' : t('tests.taking.option_image_fallback')}
                                        style={{ maxWidth: 80, maxHeight: 60, borderRadius: 4, objectFit: 'contain' }}
                                    />
                                )}
                                <span style={{ color: 'var(--text)' }}>{opt.text}</span>
                            </label>
                        );
                    })}
                </div>
            )}

            {question.type === 'true-false' && (
                <div style={{ display: 'flex', gap: 10 }}>
                    {(['true', 'false'] as const).map((option) => (
                        <button
                            key={option}
                            type="button"
                            onClick={() => onChange(option)}
                            style={{
                                flex: 1,
                                padding: '14px 0',
                                borderRadius: 8,
                                border: value === option ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background:
                                    value === option
                                        ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
                                        : 'var(--bg)',
                                color: 'var(--text)',
                                fontWeight: value === option ? 700 : 400,
                                fontSize: '0.95rem',
                                cursor: 'pointer',
                            }}
                        >
                            {t(`tests.true_false_${option}`)}
                        </button>
                    ))}
                </div>
            )}

            {isCloze && <ClozeAnswer question={question} value={value} onChange={onChange} code={code} />}

            {question.type === 'matching' && (
                <MatchingAnswer question={question} value={value} onChange={onChange} code={code} />
            )}

            {question.type === 'categorize' && (
                <CategorizeAnswer question={question} value={value} onChange={onChange} code={code} />
            )}

            {question.type === 'hot-text' && <HotTextAnswer question={question} value={value} onChange={onChange} />}

            {question.type === 'short-answer' && (
                <input
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t('tests.taking.short_answer_placeholder')}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: '0.95rem',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                    }}
                />
            )}

            {question.type === 'numeric' && (
                <input
                    type="number"
                    step="any"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={t('tests.taking.numeric_placeholder')}
                    style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: '0.95rem',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                    }}
                />
            )}

            {question.type === 'open' && (
                <>
                    <textarea
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        placeholder={t('tests.taking.open_answer_placeholder')}
                        rows={6}
                        style={{
                            width: '100%',
                            padding: '10px 14px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            fontSize: '0.95rem',
                            resize: 'vertical',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontFamily: 'inherit',
                        }}
                    />
                    {wordCount !== null && (
                        <div
                            style={{
                                textAlign: 'right',
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                                marginTop: 4,
                            }}
                        >
                            {t('tests.taking.word_count', { count: wordCount })}
                        </div>
                    )}
                </>
            )}

            {question.type === 'ordering' && (
                <OrderingAnswer question={question} value={value} onChange={onChange} code={code} />
            )}

            {question.type === 'audio-response' && (
                <AudioResponseAnswer
                    value={value}
                    onChange={onChange}
                    maxRecordingSeconds={question.maxRecordingSeconds ?? DEFAULT_MAX_RECORDING_SECONDS}
                    onRecordingChange={onRecordingChange}
                />
            )}
        </div>
    );
}

const DEFAULT_MAX_RECORDING_SECONDS = 60;

function blobToDataUri(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

interface AudioResponseAnswerProps {
    value: string;
    onChange: (value: string) => void;
    maxRecordingSeconds: number;
    onRecordingChange?: (recording: boolean) => void;
}

/** Recordings are always `data:audio/...` URIs produced locally by blobToDataUri — reject anything else before it reaches an <audio src>. */
function safeRecordedAudioSrc(dataUri: string): string | undefined {
    return /^data:audio\//i.test(dataUri) ? dataUri : undefined;
}

function AudioResponseAnswer({ value, onChange, maxRecordingSeconds, onRecordingChange }: AudioResponseAnswerProps) {
    const { t } = useTranslation();
    const { status, start, stop } = useMediaRecorder();
    const [elapsedSec, setElapsedSec] = useState(0);
    const [micError, setMicError] = useState(false);
    const elapsedRef = useRef(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const existing = parseAudioResponse(value);

    useEffect(() => {
        onRecordingChange?.(status === 'recording');
    }, [status, onRecordingChange]);

    const stopRecording = useCallback(async () => {
        if (timerRef.current) clearInterval(timerRef.current);
        const result = await stop();
        if (result) {
            const dataUri = await blobToDataUri(result.blob);
            onChange(encodeAudioResponse({ dataUri, mimeType: result.mimeType, durationSec: elapsedRef.current }));
        }
    }, [stop, onChange]);

    async function startRecording() {
        setMicError(false);
        elapsedRef.current = 0;
        setElapsedSec(0);
        const ok = await start();
        if (!ok) {
            setMicError(true);
            return;
        }
        timerRef.current = setInterval(() => {
            elapsedRef.current += 1;
            setElapsedSec(elapsedRef.current);
            if (elapsedRef.current >= maxRecordingSeconds) void stopRecording();
        }, 1000);
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {status === 'recording' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: 'var(--red)',
                            animation: 'pulse 1s infinite',
                            flexShrink: 0,
                        }}
                    />
                    <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>
                        {t('tests.taking.recording_in_progress', {
                            elapsed: elapsedSec,
                            max: maxRecordingSeconds,
                        })}
                    </span>
                    <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void stopRecording()}
                        style={{ marginLeft: 'auto' }}
                    >
                        {t('tests.taking.stop_recording')}
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void startRecording()}>
                        {existing ? t('tests.taking.re_record') : t('tests.taking.start_recording')}
                    </button>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('tests.taking.max_recording_note', { max: maxRecordingSeconds })}
                    </span>
                </div>
            )}
            {micError && (
                <p style={{ color: 'var(--red)', fontSize: '0.85rem', margin: 0 }}>
                    {t('tests.taking.microphone_error')}
                </p>
            )}
            {existing && status !== 'recording' && safeRecordedAudioSrc(existing.dataUri) && (
                <audio controls src={safeRecordedAudioSrc(existing.dataUri)} style={{ width: '100%' }} />
            )}
        </div>
    );
}

interface ClozeAnswerProps {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
}

function ClozeAnswer({ question, value, onChange, code }: ClozeAnswerProps) {
    const { t } = useTranslation();
    const segments = useMemo(() => renderClozeSegments(question.prompt), [question.prompt]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setGapAnswer(gapIndex: number, gapValue: string) {
        onChange(JSON.stringify({ ...answers, [gapIndex]: gapValue }));
    }

    return (
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 2.4, color: 'var(--text)' }}>
            {segments.map((segment, i) => {
                if (segment.type === 'text') {
                    return <span key={i}>{segment.text}</span>;
                }
                const gap = segment.gap;
                const current = answers[gap.index] ?? '';
                if (question.type === 'cloze-dropdown') {
                    const choices = seededShuffle(gap.alternatives, `${code}-${question.id}-${gap.index}`);
                    return (
                        <select
                            key={i}
                            value={current}
                            onChange={(e) => setGapAnswer(gap.index, e.target.value)}
                            style={{
                                margin: '0 4px',
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'var(--bg)',
                                color: 'var(--text)',
                                fontSize: '0.95rem',
                            }}
                        >
                            <option value="">{t('tests.taking.cloze_dropdown_placeholder')}</option>
                            {choices.map((choice) => (
                                <option key={choice} value={choice}>
                                    {choice}
                                </option>
                            ))}
                        </select>
                    );
                }
                return (
                    <input
                        key={i}
                        type="text"
                        value={current}
                        onChange={(e) => setGapAnswer(gap.index, e.target.value)}
                        placeholder={t('tests.taking.cloze_gap_placeholder')}
                        style={{
                            margin: '0 4px',
                            padding: '4px 8px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                            width: 120,
                        }}
                    />
                );
            })}
        </p>
    );
}

interface MatchingAnswerProps {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
}

function MatchingAnswer({ question, value, onChange, code }: MatchingAnswerProps) {
    const { t } = useTranslation();
    const pairs = question.matchingPairs ?? [];
    const shuffledPairs = useMemo(() => seededShuffle(pairs, `${code}-${question.id}`), [pairs, code, question.id]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setAnswer(leftId: string, chosenId: string) {
        onChange(JSON.stringify(withAnswer(answers, leftId, chosenId)));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pairs.map((pair) => (
                <div key={pair.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, color: 'var(--text)' }}>{pair.left}</span>
                    <select
                        value={answers[pair.id] ?? ''}
                        onChange={(e) => setAnswer(pair.id, e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                        }}
                    >
                        <option value="">{t('tests.taking.matching_select_placeholder')}</option>
                        {shuffledPairs.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.right}
                            </option>
                        ))}
                    </select>
                </div>
            ))}
        </div>
    );
}

interface OrderingAnswerProps {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
}

function OrderingAnswer({ question, value, onChange, code }: OrderingAnswerProps) {
    const { t } = useTranslation();
    const items = question.orderItems ?? [];
    const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
    const shuffledIds = useMemo(
        () =>
            seededShuffle(
                items.map((item) => item.id),
                `${code}-${question.id}`
            ),
        [items, code, question.id]
    );
    const order = useMemo<string[]>(() => {
        try {
            const parsed = value ? (JSON.parse(value) as string[]) : [];
            if (parsed.length === items.length && parsed.every((id) => itemsById.has(id))) return parsed;
        } catch {
            /* fall through to shuffled default */
        }
        return shuffledIds;
    }, [value, shuffledIds, items, itemsById]);

    function move(from: number, to: number) {
        if (to < 0 || to >= order.length) return;
        const next = [...order];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        onChange(JSON.stringify(next));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {order.map((id, idx) => (
                <div
                    key={id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--bg)',
                    }}
                >
                    <span style={{ flex: 1, color: 'var(--text)' }}>{itemsById.get(id)?.text}</span>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.taking.move_item_up')}
                        disabled={idx === 0}
                        onClick={() => move(idx, idx - 1)}
                    >
                        <ChevronUp size={14} />
                    </button>
                    <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        aria-label={t('tests.taking.move_item_down')}
                        disabled={idx === order.length - 1}
                        onClick={() => move(idx, idx + 1)}
                    >
                        <ChevronDown size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

interface CategorizeAnswerProps {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
    code: string;
}

function CategorizeAnswer({ question, value, onChange, code }: CategorizeAnswerProps) {
    const { t } = useTranslation();
    const items = question.categorizeItems ?? [];
    const categories = question.categories ?? [];
    const shuffledItems = useMemo(() => seededShuffle(items, `${code}-${question.id}`), [items, code, question.id]);
    const answers: Record<string, string> = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as Record<string, string>) : {};
        } catch {
            return {};
        }
    }, [value]);

    function setAnswer(itemId: string, categoryId: string) {
        onChange(JSON.stringify(withAnswer(answers, itemId, categoryId)));
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shuffledItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, color: 'var(--text)' }}>{item.text}</span>
                    <select
                        value={answers[item.id] ?? ''}
                        onChange={(e) => setAnswer(item.id, e.target.value)}
                        style={{
                            flex: 1,
                            padding: '8px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--border)',
                            background: 'var(--bg)',
                            color: 'var(--text)',
                            fontSize: '0.95rem',
                        }}
                    >
                        <option value="">{t('tests.taking.categorize_select_placeholder')}</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                                {cat.label}
                            </option>
                        ))}
                    </select>
                </div>
            ))}
        </div>
    );
}

interface HotTextAnswerProps {
    question: TestQuestion;
    value: string;
    onChange: (value: string) => void;
}

function HotTextAnswer({ question, value, onChange }: HotTextAnswerProps) {
    const { t } = useTranslation();
    const segments = useMemo(() => parseHotTextFragments(question.hotTextPassage ?? ''), [question.hotTextPassage]);
    const selected: number[] = useMemo(() => {
        try {
            return value ? (JSON.parse(value) as number[]) : [];
        } catch {
            return [];
        }
    }, [value]);

    function toggle(index: number) {
        const next = selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index];
        onChange(JSON.stringify(next));
    }

    return (
        <div>
            <p className="text-muted text-xs" style={{ margin: '0 0 8px' }}>
                {t('tests.taking.hot_text_instruction')}
            </p>
            <p style={{ margin: 0, fontSize: '1rem', lineHeight: 2, color: 'var(--text)' }}>
                {segments.map((segment, i) => {
                    if (segment.type === 'text') {
                        return <span key={i}>{segment.text}</span>;
                    }
                    const isSelected = selected.includes(segment.index);
                    return (
                        <span
                            key={i}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggle(segment.index)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggle(segment.index);
                                }
                            }}
                            style={{
                                display: 'inline',
                                margin: '0 2px',
                                padding: '2px 4px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: isSelected
                                    ? 'color-mix(in srgb, var(--accent) 25%, transparent)'
                                    : 'color-mix(in srgb, var(--text-muted) 12%, transparent)',
                                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                            }}
                        >
                            {segment.text}
                        </span>
                    );
                })}
            </p>
        </div>
    );
}
