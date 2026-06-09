import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CheckCircle, Copy, AlertTriangle, Mail, Loader2, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EssayEditor from '../components/Editor/EssayEditor';
import EssayTTSControls from '../components/Essay/EssayTTSControls';
import { decodeEssayAssignment } from '../utils/essayShareCode';
import { encodeEssaySubmission } from '../utils/essaySubmissionCode';
import { countWords } from '../utils/essayUtils';
import { nanoid } from '../utils/nanoid';
import type { EssayAssignmentContent, EssaySubmission } from '../types';
import { EssayAdapter } from '../services/database/EssayAdapter';

const DRAFT_KEY_PREFIX = 'rm_essay_draft_';
const TIMER_KEY_PREFIX = 'rm_essay_timer_';

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

// ── Email gate (SEB-compatible) ───────────────────────────────────────────────

interface EmailGateProps {
    adapter: EssayAdapter;
    onAuthenticated: (userId: string, email: string) => void;
}

function EmailGate({ adapter, onAuthenticated }: EmailGateProps) {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [sessionChecking, setSessionChecking] = useState(true);
    const [error, setError] = useState('');

    // Auto-bypass the gate when a verified session already exists.
    // This covers two cases:
    //  1. Student logged in via the portal before entering SEB (portal session on default key)
    //  2. Student reloads the essay page mid-session after the email gate already ran
    // Anonymous sessions have no email, so they correctly fall through to the gate.
    useEffect(() => {
        adapter.getSession().then(({ userId, email }) => {
            if (userId && email) {
                onAuthenticated(userId, email);
            } else {
                setSessionChecking(false);
            }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (sessionChecking) {
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg)',
                }}
            >
                <Loader2 size={28} style={{ color: 'var(--accent)', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    const handleStart = async () => {
        const trimmed = email.trim();
        if (!trimmed || !trimmed.includes('@')) {
            setError(t('essay.email_invalid'));
            return;
        }
        setBusy(true);
        setError('');
        const { userId, error: e } = await adapter.signInAnonymously();
        setBusy(false);
        if (userId) {
            onAuthenticated(userId, trimmed);
        } else {
            setError(e ?? t('essay.session_error'));
        }
    };

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
            <div
                style={{
                    background: 'var(--bg-elevated)',
                    borderRadius: 14,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
                    padding: 36,
                    maxWidth: 420,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 18,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mail size={22} style={{ color: 'var(--accent)' }} />
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{t('essay.email_gate_title')}</h2>
                </div>
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t('essay.email_gate_desc')}
                </p>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                        setEmail(e.target.value);
                        setError('');
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && handleStart()}
                    placeholder={t('essay.email_placeholder')}
                    style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        fontSize: '0.95rem',
                        outline: 'none',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                    }}
                    autoFocus
                />
                {error && <p style={{ margin: 0, color: 'var(--red)', fontSize: '0.825rem' }}>{error}</p>}
                <button
                    onClick={handleStart}
                    disabled={busy}
                    style={{
                        padding: '11px 0',
                        borderRadius: 8,
                        border: 'none',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                    }}
                >
                    {busy ? (
                        <>
                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {t('essay.starting')}
                        </>
                    ) : (
                        t('essay.start_btn')
                    )}
                </button>
            </div>
        </div>
    );
}

// Detect a short-code link: bare nanoid (21 URL-safe chars), no base64 JSON.
// These are generated when the app has Supabase configured; all content is
// fetched from the get-essay-assignment edge function after authentication.
function isShortCode(code: string): boolean {
    return /^[A-Za-z0-9_-]{10,40}$/.test(code);
}

export default function StudentEssayPage() {
    const { t, i18n } = useTranslation();
    const { code } = useParams<{ code: string }>();

    // Legacy format: full JSON base64 — try to decode first.
    const legacyAssignment = code ? decodeEssayAssignment(code) : null;

    // Short-code format: bare teacherKey — credentials come from the app's env vars, or from
    // the rm_supabase_config localStorage entry set by the teacher app on the same origin.
    const savedConfig = (() => {
        try {
            return JSON.parse(localStorage.getItem('rm_supabase_config') ?? '{}') as {
                supabaseUrl?: string;
                supabaseAnonKey?: string;
            };
        } catch {
            return {};
        }
    })();
    const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || savedConfig.supabaseUrl || undefined;
    const envKey =
        (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || savedConfig.supabaseAnonKey || undefined;
    const shortCodeActive = !legacyAssignment && !!code && !!envUrl && !!envKey && isShortCode(code);

    const assignment =
        legacyAssignment ??
        (shortCodeActive
            ? {
                  teacherKey: code!,
                  rubricId: '',
                  studentId: '',
                  title: '',
                  readOnlyAfterSubmit: true,
                  createdAt: new Date().toISOString(),
                  supabaseUrl: envUrl,
                  supabaseAnonKey: envKey,
              }
            : null);

    // Determine if this assignment uses Supabase DB submission.
    // useMemo keeps the adapter instance stable for the component's lifetime.
    const hasDb = !!(assignment?.supabaseUrl && assignment?.supabaseAnonKey);
    const adapter = useMemo<EssayAdapter | null>(() => {
        if (!assignment?.supabaseUrl || !assignment?.supabaseAnonKey) return null;
        return new EssayAdapter(assignment.supabaseUrl, assignment.supabaseAnonKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally stable — assignment is decoded from the URL and never changes

    // SEB detection is user-agent sniffing only — a tech-savvy student can spoof it.
    // It is a deterrent, not a hard enforcement mechanism.
    const isInSEB = /SEB/i.test(navigator.userAgent);
    const sebQuitUrl = `${window.location.origin}/#/seb-done`;
    const draftKey = DRAFT_KEY_PREFIX + (code ?? '');
    const timerKey = TIMER_KEY_PREFIX + (code ?? '');

    // Auth state (only used in DB mode)
    const [studentUserId, setStudentUserId] = useState<string | null>(null);
    const [studentEmail, setStudentEmail] = useState<string | null>(null);

    // Tracks an 'expired' result from the edge function so the expiry guard fires
    // even for short-code links that have no expiresAt embedded in the URL.
    const [contentExpired, setContentExpired] = useState(false);

    // Content resolved from the edge function after authentication.
    // For legacy links the content is already in the URL; for short codes everything
    // is fetched here. undefined = not yet fetched; null = fetch complete, no data.
    const [resolvedContent, setResolvedContent] = useState<EssayAssignmentContent | null | undefined>(
        legacyAssignment
            ? {
                  rubricId: legacyAssignment.rubricId,
                  studentId: legacyAssignment.studentId,
                  title: legacyAssignment.title,
                  prompt: legacyAssignment.prompt ?? null,
                  minWords: legacyAssignment.minWords ?? null,
                  maxWords: legacyAssignment.maxWords ?? null,
                  timeLimitMinutes: legacyAssignment.timeLimitMinutes ?? null,
                  requireSEB: legacyAssignment.requireSEB ?? false,
                  expiresAt: legacyAssignment.expiresAt ?? null,
                  readOnlyAfterSubmit: legacyAssignment.readOnlyAfterSubmit,
              }
            : undefined
    );
    const contentReady = resolvedContent !== undefined;

    const [html, setHtml] = useState<string>(() => localStorage.getItem(draftKey) ?? '');
    const [draftRestored, setDraftRestored] = useState<boolean>(() => !!localStorage.getItem(draftKey));
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);

    // Timer — initialised from the URL (legacy) or from resolved content (short code).
    const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
        const minutes = legacyAssignment?.timeLimitMinutes ?? null;
        if (!minutes) return null;
        const stored = sessionStorage.getItem(timerKey);
        if (stored) return Math.max(0, parseInt(stored, 10));
        return minutes * 60;
    });
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // After the student authenticates, fetch full assignment content from the edge function.
    // For legacy links this is a no-op (content already in URL, resolvedContent pre-filled).
    // For short-code links this is the only way to get title, prompt, limits, etc.
    useEffect(() => {
        if (!studentUserId || !hasDb || !adapter || contentReady) return;
        adapter.fetchAssignmentContent(assignment!.teacherKey).then((result) => {
            if (result.ok) {
                setResolvedContent(result.data);
                // Start timer if the assignment has a time limit and it hasn't started yet.
                if (result.data.timeLimitMinutes && secondsLeft === null) {
                    const stored = sessionStorage.getItem(timerKey);
                    setSecondsLeft(stored ? Math.max(0, parseInt(stored, 10)) : result.data.timeLimitMinutes * 60);
                }
            } else {
                if (result.reason === 'expired') setContentExpired(true);
                setResolvedContent(null);
            }
        });
    }, [studentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

    // Set document title once we have the resolved title
    useEffect(() => {
        const title = resolvedContent?.title || assignment?.title;
        if (!title) return;
        const prev = document.title;
        document.title = title;
        return () => {
            document.title = prev;
        };
    }, [resolvedContent?.title, assignment?.title]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-save draft every 30 s and record timestamp for the indicator
    useEffect(() => {
        if (submitted) return;
        const interval = setInterval(() => {
            localStorage.setItem(draftKey, html);
            setDraftSavedAt(new Date());
        }, 30_000);
        return () => clearInterval(interval);
    }, [html, draftKey, submitted]);

    const handleSubmit = useCallback(async () => {
        if (!assignment) return;
        localStorage.setItem(draftKey, html);
        if (timerRef.current) clearInterval(timerRef.current);

        const submissionId = nanoid();
        const wordCount = countWords(html);
        const now = new Date().toISOString();

        const hasLimits = !!(assignment.minWords || assignment.maxWords);
        const wordLimitStatus: EssaySubmission['wordLimitStatus'] = hasLimits
            ? assignment.maxWords && wordCount > assignment.maxWords
                ? 'over'
                : assignment.minWords && wordCount < assignment.minWords
                  ? 'under'
                  : 'ok'
            : undefined;

        // Always generate the legacy code as a fallback / receipt
        const submissionObj: EssaySubmission = {
            id: submissionId,
            assignmentRubricId: resolvedContent?.rubricId ?? assignment.rubricId,
            assignmentStudentId: resolvedContent?.studentId ?? assignment.studentId,
            teacherKey: assignment.teacherKey,
            contentHtml: html,
            wordCount,
            submittedAt: now,
            wordLimitStatus,
        };
        const legacyCode = encodeEssaySubmission(submissionObj);

        // DB path: upload to Supabase Storage + insert submission row
        if (hasDb && adapter && studentUserId && studentEmail) {
            setSubmitting(true);
            setSubmitError('');
            const result = await adapter.submitEssay(
                assignment,
                submissionId,
                html,
                studentEmail,
                studentUserId,
                wordCount
            );
            setSubmitting(false);
            if (!result.success) {
                setSubmitError(`Submission failed: ${result.error}. Your essay is saved below as a backup code.`);
                setSubmissionCode(legacyCode); // show fallback code so student isn't stuck
            }
        }

        setSubmissionCode(legacyCode);
        localStorage.removeItem(draftKey);
        setSubmitted(true);
        if (isInSEB) {
            copyText(legacyCode);
            setTimeout(() => {
                window.location.href = sebQuitUrl;
            }, 1500);
        }
    }, [assignment, html, draftKey, hasDb, adapter, studentUserId, studentEmail, isInSEB, sebQuitUrl]);

    // Keep a stable ref to handleSubmit so the timer interval always calls the latest version,
    // avoiding the stale-closure bug where the interval would capture an early draft of the callback.
    const handleSubmitRef = useRef(handleSubmit);
    useEffect(() => {
        handleSubmitRef.current = handleSubmit;
    }, [handleSubmit]);

    // Countdown — auto-submit when time runs out
    useEffect(() => {
        if (secondsLeft === null || secondsLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft((prev) => {
                if (prev === null) return null;
                const next = prev - 1;
                sessionStorage.setItem(timerKey, String(next));
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
    }, [secondsLeft === null, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Disable right-click in SEB
    useEffect(() => {
        if (!isInSEB) return;
        const prevent = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', prevent);
        return () => document.removeEventListener('contextmenu', prevent);
    }, [isInSEB]);

    const handleCopy = useCallback(() => {
        copyText(submissionCode);
        setCopied(true);
        if (isInSEB) {
            setTimeout(() => {
                window.location.href = sebQuitUrl;
            }, 800);
        } else {
            setTimeout(() => setCopied(false), 2500);
        }
    }, [submissionCode, isInSEB, sebQuitUrl]);

    // ── Guard: invalid link ───────────────────────────────────────────────────
    if (!assignment) {
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
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('essay.invalid_link_title')}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>{t('essay.invalid_link_desc')}</p>
                </div>
            </div>
        );
    }

    // ── Guard: assignment expired ─────────────────────────────────────────────
    // contentExpired is set when the edge function returns 410 for a short-code link.
    // effectiveExpiresAt covers legacy links where expiresAt is embedded in the URL.
    const effectiveExpiresAt = resolvedContent?.expiresAt ?? assignment.expiresAt ?? null;
    if (contentExpired || (effectiveExpiresAt && new Date(effectiveExpiresAt) < new Date())) {
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
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
                    <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>{t('essay.expired_title')}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {effectiveExpiresAt
                            ? t('essay.expired_desc', { date: new Date(effectiveExpiresAt).toLocaleString() })
                            : t('essay.expired_desc_no_date')}
                    </p>
                </div>
            </div>
        );
    }

    // ── Guard: email gate (DB mode only) ─────────────────────────────────────
    if (hasDb && !studentUserId) {
        return (
            <EmailGate
                adapter={adapter!}
                onAuthenticated={(uid, email) => {
                    setStudentUserId(uid);
                    setStudentEmail(email);
                }}
            />
        );
    }

    // ── Guard: waiting for assignment content from edge function ─────────────
    if (hasDb && studentUserId && !contentReady) {
        return (
            <div
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: '#f8fafc',
                }}
            >
                <Loader2 size={28} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    const wordCount = countWords(html);
    const effectiveMaxWords = resolvedContent?.maxWords ?? null;
    const effectiveMinWords = resolvedContent?.minWords ?? null;
    const isOverLimit = effectiveMaxWords ? wordCount > effectiveMaxWords : false;
    const isBelowMin = effectiveMinWords ? wordCount < effectiveMinWords : false;
    const timedOut = secondsLeft !== null && secondsLeft <= 0;
    const sebBlocked = !!(resolvedContent?.requireSEB && !isInSEB);
    // Manual submit is blocked when over the word limit. The timer auto-submits
    // unconditionally when it expires, setting submitted = true.
    const canSubmit = !isOverLimit && !submitted && !submitting && !sebBlocked;
    const wordCountColor = isOverLimit ? '#ef4444' : isBelowMin ? '#f59e0b' : '#10b981';

    return (
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
                    <Save size={14} style={{ flexShrink: 0 }} />
                    {t('essay.draft_restored')}
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
                        {t('essay.dismiss')}
                    </button>
                </div>
            )}

            {/* SEB blocking banner */}
            {sebBlocked && (
                <div
                    style={{
                        background: '#fef2f2',
                        borderBottom: '1px solid #fca5a5',
                        padding: '12px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: '0.875rem',
                        color: '#991b1b',
                        fontWeight: 600,
                    }}
                >
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    {t('essay.seb_blocked')}
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
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text)' }}>
                        {resolvedContent?.title || assignment.title}
                    </h1>
                    {studentEmail && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            {t('essay.signed_in_as', { email: studentEmail })}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {draftSavedAt && !submitted && (
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.75rem',
                                color: 'var(--text-muted)',
                            }}
                        >
                            <Save size={12} />
                            {t('essay.draft_saved_at', {
                                time: draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
                            {timedOut ? t('essay.time_up_countdown') : formatTime(secondsLeft)}
                        </div>
                    )}
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: wordCountColor }}>
                        {t('essay.words_count', { count: wordCount })}
                        {(effectiveMinWords || effectiveMaxWords) && (
                            <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 4 }}>
                                ({effectiveMinWords ?? 0}–{effectiveMaxWords ?? '∞'})
                            </span>
                        )}
                    </div>
                    {!submitted && (
                        <EssayTTSControls
                            promptText={resolvedContent?.prompt ?? assignment.prompt}
                            contentHtml={html}
                            lang={i18n.language}
                        />
                    )}
                </div>
            </div>

            <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>
                {/* Prompt — fetched from edge function after auth when Supabase is configured */}
                {resolvedContent?.prompt && (
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
                        <div
                            style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: 'var(--accent)',
                                marginBottom: 6,
                                letterSpacing: '0.05em',
                            }}
                        >
                            {t('essay.prompt_label')}
                        </div>
                        {resolvedContent?.prompt}
                    </div>
                )}

                {/* DB submission error */}
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

                {/* Submitted confirmation */}
                {submitted && (
                    <div
                        style={{
                            background: '#f0fdf4',
                            border: '1px solid #86efac',
                            borderRadius: 12,
                            padding: 20,
                            marginBottom: 20,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <CheckCircle size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>
                                {hasDb && !submitError ? t('essay.submitted_title_db') : t('essay.submitted_title')}
                            </span>
                        </div>
                        {hasDb && !submitError ? (
                            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                                {t('essay.submitted_desc_db')}
                            </p>
                        ) : (
                            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                                {t('essay.submitted_desc_code')}
                            </p>
                        )}
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
                                {copied ? t('essay.copied') : t('essay.copy')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Editor */}
                <EssayEditor
                    content={html}
                    onChange={setHtml}
                    editable={!submitted || !(resolvedContent?.readOnlyAfterSubmit ?? assignment.readOnlyAfterSubmit)}
                    placeholder={t('essay.editor_placeholder')}
                />

                {/* Submit row */}
                {!submitted && (
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'flex-end',
                            alignItems: 'center',
                            gap: 12,
                            marginTop: 16,
                        }}
                    >
                        {timedOut && !isOverLimit && (
                            <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>
                                {t('essay.time_up_auto')}
                            </span>
                        )}
                        {timedOut && isOverLimit && (
                            <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>
                                {t('essay.time_up_over_submitted', {
                                    count: wordCount - (effectiveMaxWords ?? 0),
                                })}
                            </span>
                        )}
                        {!timedOut && isOverLimit && (
                            <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>
                                {t('essay.over_limit', { count: wordCount - (effectiveMaxWords ?? 0) })}
                            </span>
                        )}
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            style={{
                                padding: '10px 32px',
                                borderRadius: 8,
                                border: isOverLimit ? '1.5px solid #fca5a5' : 'none',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                background: isOverLimit
                                    ? '#fef2f2'
                                    : canSubmit
                                      ? 'var(--accent)'
                                      : 'var(--bg-elevated)',
                                color: isOverLimit ? '#dc2626' : canSubmit ? '#fff' : 'var(--text-dim)',
                                cursor: canSubmit ? 'pointer' : 'not-allowed',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            {submitting ? (
                                <>
                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />{' '}
                                    {t('essay.submitting')}
                                </>
                            ) : isOverLimit ? (
                                <>
                                    <AlertTriangle size={16} /> {t('essay.too_many_words')}
                                </>
                            ) : (
                                t('essay.submit_btn')
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
