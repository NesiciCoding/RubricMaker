import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { createClient } from '@supabase/supabase-js';
import { Clock, CheckCircle, Copy, AlertTriangle, Loader2, Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { decodeTestAssignment } from '../utils/testShareCode';
import { encodeTestSubmission } from '../utils/testSubmissionCode';
import { nanoid } from '../utils/nanoid';
import SebGate from '../components/Tests/SebGate';
import { useLiveSessionTelemetry } from '../hooks/useLiveSessionTelemetry';
import type { Test, TestAnswer, TestAssignmentPayload, TestQuestion, TestSubmissionPayload } from '../types';

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

/**
 * Deterministic shuffle seeded by the share code so reloads/draft restores
 * keep the same question order for a given student.
 */
function seededShuffle<T>(items: T[], seed: string): T[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
        h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    }
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        h = (h * 1103515245 + 12345) >>> 0;
        const j = h % (i + 1);
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
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

    const [answers, setAnswers] = useState<Record<string, string>>(() => {
        try {
            const raw = localStorage.getItem(draftKey);
            if (!raw) return {};
            const parsed = JSON.parse(raw) as { answers?: Record<string, string> };
            return parsed.answers ?? {};
        } catch {
            return {};
        }
    });
    const [draftRestored, setDraftRestored] = useState<boolean>(() => !!localStorage.getItem(draftKey));
    const [currentIndex, setCurrentIndex] = useState(0);
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    const startedAtRef = useRef<string>(new Date().toISOString());

    const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
        const minutes = assignment?.durationMinutes ?? null;
        if (!minutes) return null;
        const stored = sessionStorage.getItem(draftKey + '_timer');
        if (stored) return Math.max(0, parseInt(stored, 10));
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
                } else {
                    setTest(data.data as Test);
                    setTestOwnerId((data.owner_id as string) ?? null);
                }
            } catch {
                if (!cancelled) setLoadError(t('tests.taking.load_error'));
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
        localStorage.setItem(draftKey, JSON.stringify({ answers, savedAt: new Date().toISOString() }));
    }, [answers, draftKey, submitted]);

    const getSnapshot = useCallback(
        () => ({
            answers,
            wordCount: Object.values(answers).reduce((sum, a) => sum + a.trim().split(/\s+/).filter(Boolean).length, 0),
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
        if (timerRef.current) clearInterval(timerRef.current);

        const submittedAt = new Date().toISOString();
        const testAnswers: TestAnswer[] = test.questions.map((q) => ({
            questionId: q.id,
            response: answers[q.id] ?? '',
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
                }
            } catch {
                setSubmitError(t('tests.taking.submit_error_db'));
            }
            setSubmitting(false);
        }

        setSubmissionCode(legacyCode);
        localStorage.removeItem(draftKey);
        setSubmitted(true);
    }, [assignment, test, answers, hasDb, testOwnerId, draftKey, telemetry, t]);

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
                sessionStorage.setItem(draftKey + '_timer', String(next));
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
    const answeredCount = orderedQuestions.filter((q) => (answers[q.id] ?? '').trim().length > 0).length;

    return (
        <SebGate requireSEB={assignment.requireSEB}>
            <div
                style={{
                    minHeight: '100vh',
                    background: 'var(--bg)',
                    fontFamily: 'var(--font, Inter, system-ui, sans-serif)',
                    color: 'var(--text)',
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
                                {t('tests.taking.progress', { answered: answeredCount, total: orderedQuestions.length })}
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
                            {question && (
                                <QuestionCard
                                    question={question}
                                    index={currentIndex}
                                    total={orderedQuestions.length}
                                    value={answers[question.id] ?? ''}
                                    onChange={(value) =>
                                        setAnswers((prev) => ({ ...prev, [question.id]: value }))
                                    }
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
                                        onClick={() => setCurrentIndex((i) => Math.min(orderedQuestions.length - 1, i + 1))}
                                        className="btn btn-primary"
                                    >
                                        {t('tests.taking.next')}
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </SebGate>
    );
}

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

interface QuestionCardProps {
    question: TestQuestion;
    index: number;
    total: number;
    value: string;
    onChange: (value: string) => void;
}

function QuestionCard({ question, index, total, value, onChange }: QuestionCardProps) {
    const { t } = useTranslation();
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
                {question.prompt}
            </p>

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
                                    value === opt.id ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'var(--bg)',
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
                        outline: 'none',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                    }}
                />
            )}

            {question.type === 'open' && (
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
                        outline: 'none',
                        resize: 'vertical',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        fontFamily: 'inherit',
                    }}
                />
            )}
        </div>
    );
}
