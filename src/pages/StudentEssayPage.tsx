import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CheckCircle, Copy, AlertTriangle, Mail, KeyRound, Loader2, Save } from 'lucide-react';
import EssayEditor from '../components/Editor/EssayEditor';
import { decodeEssayAssignment } from '../utils/essayShareCode';
import { encodeEssaySubmission } from '../utils/essaySubmissionCode';
import { countWords } from '../utils/essayUtils';
import { nanoid } from '../utils/nanoid';
import type { EssaySubmission } from '../types';
import { EssayAdapter } from '../services/database/EssayAdapter';

const DRAFT_KEY_PREFIX = 'rm_essay_draft_';
const TIMER_KEY_PREFIX  = 'rm_essay_timer_';

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
    } catch { /* execCommand not available */ }
    navigator.clipboard?.writeText(text).catch(() => {});
    return false;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

// ── Email OTP gate ────────────────────────────────────────────────────────────

interface OtpGateProps {
    adapter: EssayAdapter;
    onAuthenticated: (userId: string, email: string) => void;
}

function OtpGate({ adapter, onAuthenticated }: OtpGateProps) {
    const [email, setEmail]           = useState('');
    const [otp, setOtp]               = useState('');
    const [step, setStep]             = useState<'email' | 'otp'>('email');
    const [busy, setBusy]             = useState(false);
    const [sessionChecking, setSessionChecking] = useState(true);
    const [error, setError]           = useState('');

    // Check if there's already a valid session (page reload) before rendering the form
    useEffect(() => {
        adapter.getSession().then(({ userId, email: e }) => {
            if (userId && e) onAuthenticated(userId, e);
            else setSessionChecking(false);
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (sessionChecking) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <Loader2 size={28} style={{ color: '#6366f1', animation: 'spin 1s linear infinite' }} />
            </div>
        );
    }

    const handleSendOtp = async () => {
        if (!email.trim()) { setError('Enter your email address.'); return; }
        setBusy(true); setError('');
        const result = await adapter.sendOtp(email.trim());
        setBusy(false);
        if (result.success) { setStep('otp'); }
        else { setError(result.error ?? 'Failed to send code. Try again.'); }
    };

    const handleVerify = async () => {
        if (!otp.trim()) { setError('Enter the 6-digit code from your email.'); return; }
        setBusy(true); setError('');
        const { userId, error: e } = await adapter.verifyOtp(email.trim(), otp.trim());
        setBusy(false);
        if (userId) { onAuthenticated(userId, email.trim()); }
        else {
            const msg = e ?? '';
            if (/expired|otp expired/i.test(msg)) {
                setError('This code has expired. Click "Use a different email" and request a new code.');
            } else {
                setError('Invalid code. Please double-check the 6 digits from your email.');
            }
        }
    };

    return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24 }}>
            <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', padding: 36, maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Mail size={22} style={{ color: '#6366f1' }} />
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Verify your email</h2>
                </div>
                <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', lineHeight: 1.5 }}>
                    {step === 'email'
                        ? 'Enter your school email address to receive a login code before you can start writing.'
                        : `We sent a 6-digit code to ${email}. Enter it below.`}
                </p>

                {step === 'email' ? (
                    <>
                        <input
                            type="email" value={email}
                            onChange={e => { setEmail(e.target.value); setError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
                            placeholder="student@school.nl"
                            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.95rem', outline: 'none' }}
                            autoFocus
                        />
                        {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.825rem' }}>{error}</p>}
                        <button onClick={handleSendOtp} disabled={busy}
                            style={{ padding: '11px 0', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {busy ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</> : 'Send login code'}
                        </button>
                    </>
                ) : (
                    <>
                        <input
                            type="text" value={otp} maxLength={6}
                            onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setError(''); }}
                            onKeyDown={e => e.key === 'Enter' && handleVerify()}
                            placeholder="123456"
                            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '1.2rem', letterSpacing: '0.3em', textAlign: 'center', fontFamily: 'monospace', outline: 'none' }}
                            autoFocus
                        />
                        {error && <p style={{ margin: 0, color: '#ef4444', fontSize: '0.825rem' }}>{error}</p>}
                        <button onClick={handleVerify} disabled={busy || otp.length < 6}
                            style={{ padding: '11px 0', borderRadius: 8, border: 'none', background: otp.length === 6 ? '#6366f1' : '#e2e8f0', color: otp.length === 6 ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: '0.95rem', cursor: otp.length < 6 || busy ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                            {busy ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Verifying…</> : <><KeyRound size={15} /> Verify &amp; start essay</>}
                        </button>
                        <button onClick={() => { setStep('email'); setOtp(''); setError(''); }}
                            style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: '0.825rem', cursor: 'pointer', textDecoration: 'underline' }}>
                            Use a different email
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StudentEssayPage() {
    const { code } = useParams<{ code: string }>();
    const assignment = code ? decodeEssayAssignment(code) : null;

    // Determine if this assignment uses Supabase DB submission.
    // useMemo keeps the adapter instance stable for the component's lifetime
    // (assignment comes from the URL and never changes mid-session).
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
    const [studentEmail, setStudentEmail]   = useState<string | null>(null);

    const [html, setHtml]                   = useState<string>(() => sessionStorage.getItem(draftKey) ?? '');
    const [submitted, setSubmitted]         = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied]               = useState(false);
    const [submitting, setSubmitting]       = useState(false);
    const [submitError, setSubmitError]     = useState('');
    const [draftSavedAt, setDraftSavedAt]   = useState<Date | null>(null);

    // Timer
    const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
        if (!assignment?.timeLimitMinutes) return null;
        const stored = sessionStorage.getItem(timerKey);
        if (stored) return Math.max(0, parseInt(stored, 10));
        return assignment.timeLimitMinutes * 60;
    });
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Set document title to assignment name
    useEffect(() => {
        if (!assignment) return;
        const prev = document.title;
        document.title = assignment.title;
        return () => { document.title = prev; };
    }, [assignment?.title]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-save draft every 30 s and record timestamp for the indicator
    useEffect(() => {
        if (submitted) return;
        const interval = setInterval(() => {
            sessionStorage.setItem(draftKey, html);
            setDraftSavedAt(new Date());
        }, 30_000);
        return () => clearInterval(interval);
    }, [html, draftKey, submitted]);

    // Countdown — auto-submit when time runs out
    useEffect(() => {
        if (secondsLeft === null || secondsLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev === null) return null;
                const next = prev - 1;
                sessionStorage.setItem(timerKey, String(next));
                if (next <= 0) {
                    // Auto-submit: stop interval first, then trigger submit asynchronously
                    if (timerRef.current) clearInterval(timerRef.current);
                    setTimeout(() => handleSubmit(), 0);
                }
                return next;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [secondsLeft === null, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Disable right-click in SEB
    useEffect(() => {
        if (!isInSEB) return;
        const prevent = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', prevent);
        return () => document.removeEventListener('contextmenu', prevent);
    }, [isInSEB]);

    const handleSubmit = useCallback(async () => {
        if (!assignment) return;
        sessionStorage.setItem(draftKey, html);
        if (timerRef.current) clearInterval(timerRef.current);

        const submissionId = nanoid();
        const wordCount    = countWords(html);
        const now          = new Date().toISOString();

        // Always generate the legacy code as a fallback / receipt
        const submissionObj: EssaySubmission = {
            id: submissionId,
            assignmentRubricId: assignment.rubricId,
            assignmentStudentId: assignment.studentId,
            teacherKey: assignment.teacherKey,
            contentHtml: html,
            wordCount,
            submittedAt: now,
        };
        const legacyCode = encodeEssaySubmission(submissionObj);

        // DB path: upload to Supabase Storage + insert submission row
        if (hasDb && adapter && studentUserId && studentEmail) {
            setSubmitting(true);
            setSubmitError('');
            const result = await adapter.submitEssay(
                assignment, submissionId, html, studentEmail, studentUserId, wordCount
            );
            setSubmitting(false);
            if (!result.success) {
                setSubmitError(`Submission failed: ${result.error}. Your essay is saved below as a backup code.`);
                setSubmissionCode(legacyCode); // show fallback code so student isn't stuck
            }
        }

        setSubmissionCode(legacyCode);
        setSubmitted(true);
        if (isInSEB) {
            copyText(legacyCode);
            setTimeout(() => { window.location.href = sebQuitUrl; }, 1500);
        }
    }, [assignment, html, draftKey, hasDb, adapter, studentUserId, studentEmail, isInSEB, sebQuitUrl]);

    const handleCopy = useCallback(() => {
        copyText(submissionCode);
        setCopied(true);
        if (isInSEB) {
            setTimeout(() => { window.location.href = sebQuitUrl; }, 800);
        } else {
            setTimeout(() => setCopied(false), 2500);
        }
    }, [submissionCode, isInSEB, sebQuitUrl]);

    // ── Guard: invalid link ───────────────────────────────────────────────────
    if (!assignment) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24 }}>
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
                    <h2 style={{ marginBottom: 8 }}>Invalid or expired link</h2>
                    <p style={{ color: '#64748b' }}>This essay link is not valid. Please ask your teacher for a new link.</p>
                </div>
            </div>
        );
    }

    // ── Guard: assignment expired ─────────────────────────────────────────────
    if (assignment.expiresAt && new Date(assignment.expiresAt) < new Date()) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24 }}>
                <div style={{ maxWidth: 480, textAlign: 'center' }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⏰</div>
                    <h2 style={{ marginBottom: 8 }}>Assignment deadline has passed</h2>
                    <p style={{ color: '#64748b' }}>
                        The deadline was {new Date(assignment.expiresAt).toLocaleString()}. Please contact your teacher.
                    </p>
                </div>
            </div>
        );
    }

    // ── Guard: email auth (DB mode only) ─────────────────────────────────────
    if (hasDb && !studentUserId) {
        return (
            <OtpGate
                adapter={adapter!}
                onAuthenticated={(uid, email) => { setStudentUserId(uid); setStudentEmail(email); }}
            />
        );
    }

    const wordCount   = countWords(html);
    const isOverLimit = assignment.maxWords  ? wordCount > assignment.maxWords  : false;
    const isBelowMin  = assignment.minWords  ? wordCount < assignment.minWords  : false;
    const timedOut    = secondsLeft !== null && secondsLeft <= 0;
    const sebBlocked  = !!(assignment.requireSEB && !isInSEB);
    const canSubmit   = !isOverLimit && !timedOut && !submitted && !submitting && !sebBlocked;
    const wordCountColor = isOverLimit ? '#ef4444' : isBelowMin ? '#f59e0b' : '#10b981';

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', colorScheme: 'light', color: '#1e293b' }}>
            {/* SEB blocking banner */}
            {sebBlocked && (
                <div style={{ background: '#fef2f2', borderBottom: '1px solid #fca5a5', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: '#991b1b', fontWeight: 600 }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                    This exam must be opened in Safe Exam Browser. Submission is blocked until you reopen this link inside SEB.
                </div>
            )}

            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>{assignment.title}</h1>
                    {studentEmail && (
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 2 }}>Signed in as {studentEmail}</div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {draftSavedAt && !submitted && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: '#64748b' }}>
                            <Save size={12} />
                            Saved {draftSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    )}
                    {secondsLeft !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums', color: secondsLeft < 120 ? '#ef4444' : '#374151' }}>
                            <Clock size={17} />
                            {timedOut ? 'Time up' : formatTime(secondsLeft)}
                        </div>
                    )}
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: wordCountColor }}>
                        {wordCount} words
                        {(assignment.minWords || assignment.maxWords) && (
                            <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>
                                ({assignment.minWords ?? 0}–{assignment.maxWords ?? '∞'})
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px' }}>
                {/* Prompt */}
                {assignment.prompt && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '14px 18px', marginBottom: 20, fontSize: '0.95rem', color: '#1e40af', lineHeight: 1.6 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', marginBottom: 6, letterSpacing: '0.05em' }}>Assignment prompt</div>
                        {assignment.prompt}
                    </div>
                )}

                {/* DB submission error */}
                {submitError && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.875rem', color: '#b91c1c', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                        {submitError}
                    </div>
                )}

                {/* Submitted confirmation */}
                {submitted && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <CheckCircle size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>
                                {hasDb && !submitError ? 'Essay submitted to your teacher!' : 'Essay submitted!'}
                            </span>
                        </div>
                        {hasDb && !submitError ? (
                            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                                Your teacher can see your submission in RubricMaker. Keep the backup code below just in case.
                            </p>
                        ) : (
                            <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                                Copy the submission code below and send it to your teacher.
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                            <textarea readOnly value={submissionCode} rows={6}
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.72rem', resize: 'vertical', background: '#fff', border: '1px solid #86efac', borderRadius: 8, padding: 10, color: '#374151' }} />
                            <button onClick={handleCopy}
                                style={{ padding: '0 16px', background: copied ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', flexShrink: 0 }}>
                                <Copy size={14} />
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                    </div>
                )}

                {/* Editor */}
                <EssayEditor
                    content={html}
                    onChange={setHtml}
                    editable={!submitted || !assignment.readOnlyAfterSubmit}
                    placeholder="Start writing your essay here…"
                />

                {/* Submit row */}
                {!submitted && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 16 }}>
                        {timedOut && <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>Time is up — your essay was submitted automatically.</span>}
                        {isOverLimit && <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>Over limit by {wordCount - (assignment.maxWords ?? 0)} words.</span>}
                        <button onClick={handleSubmit} disabled={!canSubmit}
                            style={{ padding: '10px 32px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.95rem', background: canSubmit ? '#6366f1' : '#e2e8f0', color: canSubmit ? '#fff' : '#94a3b8', cursor: canSubmit ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 8 }}>
                            {submitting ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</> : 'Submit essay'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
