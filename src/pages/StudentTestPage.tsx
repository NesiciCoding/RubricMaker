import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Clock, CheckCircle, Copy, AlertTriangle, Loader2, Eye, ChevronUp, ChevronDown, Lightbulb } from 'lucide-react';
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
import { useLiveSessionTelemetry } from '../hooks/useLiveSessionTelemetry';
import { seededShuffle } from '../utils/seededShuffle';
import { renderClozeSegments, parseHotTextFragments } from '../utils/clozeParse';
import { initClientLogger, logEvent } from '../services/logging/clientLogger';
import type {
    Test,
    TestAnswer,
    TestAssignmentPayload,
    TestQuestion,
    TestSection,
    TestSubmissionPayload,
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

function withAnswer(answers: Record<string, string>, key: string, value: string): Record<string, string> {
    const map = new Map(Object.entries(answers));
    if (!UNSAFE_KEYS.has(key)) map.set(key, value);
    return Object.fromEntries(map);
}

export default function StudentTestPage() {
    const { t } = useTranslation();
    const { code } = useParams<{ code: string }>();

    const assignment = useMemo<TestAssignmentPayload | null>(() => {
        if (!code) return null;
        return decodeTestAssignment(code);
    }, [code]);

    const hasDb = !!(assignment?.supabaseUrl && assignment?.supabaseAnonKey);
    const draftKey = DRAFT_KEY_PREFIX + (code ?? '');

    const [test, setTest] = useState<Test | null>(assignment?.test ?? null);
    const [testOwnerId, setTestOwnerId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loading, setLoading] = useState(hasDb && !assignment?.test);

    const [answers, setAnswers] = useState<Map<string, string>>(() => {
        const draft = loadTestDraft(draftKey);
        return new Map(Object.entries(draft?.answers ?? {}));
    });
    const [draftRestored, setDraftRestored] = useState<boolean>(() => !!loadTestDraft(draftKey));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

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
    useEffect(() => {
        if (!hasDb || !assignment || test) {
            setLoading(false);
            return;
        }
        const client = createClient(assignment.supabaseUrl!, assignment.supabaseAnonKey!, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        initClientLogger(client, { role: 'student' });
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await client
                    .from('tests')
                    .select('data, owner_id')
                    .eq('id', assignment.testId)
                    .maybeSingle();
                if (cancelled) return;
                if (error || !data) {
                    setLoadError(t('tests.taking.load_error'));
                    logEvent('error', 'test_load_error', { testId: assignment.testId }, 'error');
                } else {
                    setTest(data.data as Test);
                    setTestOwnerId((data.owner_id as string) ?? null);
                    logEvent('lifecycle', 'test_loaded', { testId: assignment.testId });
                }
            } catch {
                if (!cancelled) {
                    setLoadError(t('tests.taking.load_error'));
                    logEvent('error', 'test_load_error', { testId: assignment.testId }, 'error');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [hasDb, assignment, test, t]);

    const orderedQuestions = useMemo<TestQuestion[]>(() => {
        if (!test) return [];
        if (!test.shuffleQuestions || !code) return test.questions;
        return seededShuffle(test.questions, code);
    }, [test, code]);

    // ── Draft autosave ────────────────────────────────────────────────────────
    useEffect(() => {
        if (submitted) return;
        saveTestDraft(draftKey, { answers: Object.fromEntries(answers), savedAt: new Date().toISOString() });
    }, [answers, draftKey, submitted]);

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

    const telemetry = useLiveSessionTelemetry({
        kind: 'test',
        assignmentKey: assignment?.teacherKey ?? '',
        enabled: !!assignment && !submitted,
        getSnapshot,
        supabaseUrl: assignment?.supabaseUrl,
        supabaseAnonKey: assignment?.supabaseAnonKey,
    });

    const handleSubmit = useCallback(async () => {
        if (!assignment || !test) return;
        if (submitInFlightRef.current || submitted) return;
        submitInFlightRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);

        const submittedAt = new Date().toISOString();
        const testAnswers: TestAnswer[] = test.questions.map((q) => ({
            questionId: q.id,
            response: answers.get(q.id) ?? '',
        }));

        const submissionPayload: TestSubmissionPayload = {
            testId: assignment.testId,
            studentId: assignment.studentId,
            teacherKey: assignment.teacherKey,
            answers: testAnswers,
            startedAt: startedAtRef.current,
            submittedAt,
            events: telemetry.flush(),
        };
        const legacyCode = encodeTestSubmission(submissionPayload);

        if (hasDb && assignment.supabaseUrl && assignment.supabaseAnonKey) {
            setSubmitting(true);
            setSubmitError('');
            try {
                const client = createClient(assignment.supabaseUrl, assignment.supabaseAnonKey, {
                    auth: { persistSession: false, autoRefreshToken: false },
                });
                initClientLogger(client, { role: 'student' });
                const studentTestId = nanoid();
                const { error } = await client.from('student_tests').insert({
                    id: studentTestId,
                    owner_id: testOwnerId,
                    data: {
                        id: studentTestId,
                        testId: assignment.testId,
                        studentId: assignment.studentId,
                        answers: testAnswers,
                        status: 'submitted',
                        startedAt: startedAtRef.current,
                        submittedAt,
                        events: submissionPayload.events,
                    },
                });
                if (error) {
                    setSubmitError(t('tests.taking.submit_error_db'));
                    logEvent('error', 'test_submit_error', { testId: assignment.testId }, 'error');
                } else {
                    logEvent('action', 'test_submitted', {
                        testId: assignment.testId,
                        answerCount: testAnswers.length,
                    });
                }
            } catch {
                setSubmitError(t('tests.taking.submit_error_db'));
                logEvent('error', 'test_submit_error', { testId: assignment.testId }, 'error');
            }
            setSubmitting(false);
        }

        setSubmissionCode(legacyCode);
        clearTestDraft(draftKey);
        clearTestTimer(draftKey + '_timer');
        setSubmitted(true);
        submitInFlightRef.current = false;
    }, [assignment, test, answers, hasDb, testOwnerId, draftKey, telemetry, t, submitted]);

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
    if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
        return (
            <CenteredMessage>
                <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
                <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('tests.taking.expired_title')}</h2>
                <p style={{ color: 'var(--text-muted)' }}>
                    {t('tests.taking.expired_desc', { date: new Date(assignment.expiresAt).toLocaleString() })}
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

    const timedOut = secondsLeft !== null && secondsLeft <= 0;
    const question = orderedQuestions[currentIndex];
    const isLast = currentIndex === orderedQuestions.length - 1;
    const isFirst = currentIndex === 0;
    const answeredCount = orderedQuestions.filter((q) => (answers.get(q.id) ?? '').trim().length > 0).length;

    // Find current question's section label
    const sections = test.sections ?? [];
    const currentSection = question?.sectionId ? sections.find((s) => s.id === question.sectionId) : null;

    return (
        <SebGate requireSEB={assignment.requireSEB}>
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
                                {t('tests.taking.progress', {
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
                        </div>
                    ) : (
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

                            {question && (
                                <QuestionCard
                                    key={question.id}
                                    question={question}
                                    index={currentIndex}
                                    total={orderedQuestions.length}
                                    value={answers.get(question.id) ?? ''}
                                    onChange={(value) => setAnswers((prev) => new Map(prev).set(question.id, value))}
                                    code={code ?? ''}
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
                                    onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                                    disabled={isFirst}
                                    className="btn btn-secondary"
                                    style={{ opacity: isFirst ? 0.5 : 1 }}
                                >
                                    {t('tests.taking.previous')}
                                </button>

                                {isLast ? (
                                    <button
                                        onClick={handleSubmit}
                                        disabled={submitting}
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
                                        onClick={() =>
                                            setCurrentIndex((i) => Math.min(orderedQuestions.length - 1, i + 1))
                                        }
                                        className="btn btn-primary"
                                    >
                                        {t('tests.taking.next')}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Question timeline — sticky footer */}
                {!submitted && orderedQuestions.length > 0 && (
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
                padding: '10px 16px',
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
}

function QuestionCard({ question, index, total, value, onChange, code }: QuestionCardProps) {
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
                {t('tests.taking.question_label', { current: index + 1, total })}
            </div>
            <p style={{ margin: '0 0 16px', fontSize: '1rem', lineHeight: 1.6, color: 'var(--text)' }}>
                {isCloze
                    ? t(
                          question.type === 'cloze-dropdown'
                              ? 'tests.taking.cloze_dropdown_instruction'
                              : 'tests.taking.cloze_instruction'
                      )
                    : question.prompt}
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
            </p>

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
