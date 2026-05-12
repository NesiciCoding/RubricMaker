import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CheckCircle, Copy, AlertTriangle } from 'lucide-react';
import EssayEditor from '../components/Editor/EssayEditor';
import { decodeEssayAssignment } from '../utils/essayShareCode';
import { encodeEssaySubmission } from '../utils/essaySubmissionCode';
import { nanoid } from '../utils/nanoid';
import type { EssaySubmission } from '../types';

const DRAFT_KEY_PREFIX = 'rm_essay_draft_';
const TIMER_KEY_PREFIX = 'rm_essay_timer_';

function countWords(html: string): number {
    const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return text ? text.split(' ').filter(w => w.length > 0).length : 0;
}

function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

export default function StudentEssayPage() {
    const { code } = useParams<{ code: string }>();
    const assignment = code ? decodeEssayAssignment(code) : null;

    const isInSEB = /SEB/i.test(navigator.userAgent);
    const draftKey = DRAFT_KEY_PREFIX + (code ?? '');
    const timerKey = TIMER_KEY_PREFIX + (code ?? '');

    const [html, setHtml] = useState<string>(() => sessionStorage.getItem(draftKey) ?? '');
    const [submitted, setSubmitted] = useState(false);
    const [submissionCode, setSubmissionCode] = useState('');
    const [copied, setCopied] = useState(false);

    // Timer state — initialised from sessionStorage so a refresh doesn't reset it
    const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
        if (!assignment?.timeLimitMinutes) return null;
        const stored = sessionStorage.getItem(timerKey);
        if (stored) return Math.max(0, parseInt(stored, 10));
        return assignment.timeLimitMinutes * 60;
    });
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Auto-save draft to sessionStorage every 30 s
    useEffect(() => {
        if (submitted) return;
        const interval = setInterval(() => {
            sessionStorage.setItem(draftKey, html);
        }, 30_000);
        return () => clearInterval(interval);
    }, [html, draftKey, submitted]);

    // Countdown timer
    useEffect(() => {
        if (secondsLeft === null || secondsLeft <= 0 || submitted) return;
        timerRef.current = setInterval(() => {
            setSecondsLeft(prev => {
                if (prev === null) return null;
                const next = prev - 1;
                sessionStorage.setItem(timerKey, String(next));
                return next;
            });
        }, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [secondsLeft === null, submitted]); // eslint-disable-line react-hooks/exhaustive-deps

    // Disable right-click when inside SEB
    useEffect(() => {
        if (!isInSEB) return;
        const prevent = (e: MouseEvent) => e.preventDefault();
        document.addEventListener('contextmenu', prevent);
        return () => document.removeEventListener('contextmenu', prevent);
    }, [isInSEB]);

    const handleSubmit = useCallback(() => {
        if (!assignment) return;
        sessionStorage.setItem(draftKey, html);
        const submission: EssaySubmission = {
            id: nanoid(),
            assignmentRubricId: assignment.rubricId,
            assignmentStudentId: assignment.studentId,
            teacherKey: assignment.teacherKey,
            contentHtml: html,
            wordCount: countWords(html),
            submittedAt: new Date().toISOString(),
        };
        setSubmissionCode(encodeEssaySubmission(submission));
        setSubmitted(true);
        if (timerRef.current) clearInterval(timerRef.current);
    }, [assignment, html, draftKey]);

    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(submissionCode).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }, [submissionCode]);

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

    const wordCount = countWords(html);
    const isOverLimit = assignment.maxWords ? wordCount > assignment.maxWords : false;
    const isBelowMin = assignment.minWords ? wordCount < assignment.minWords : false;
    const timedOut = secondsLeft !== null && secondsLeft <= 0;
    const canSubmit = !isOverLimit && !timedOut && !submitted;

    const wordCountColor = isOverLimit ? '#ef4444' : isBelowMin ? '#f59e0b' : '#10b981';

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', fontFamily: 'Inter, system-ui, sans-serif', colorScheme: 'light', color: '#1e293b' }}>
            {/* SEB warning banner */}
            {assignment.requireSEB && !isInSEB && (
                <div style={{ background: '#fef9c3', borderBottom: '1px solid #fde047', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem', color: '#854d0e' }}>
                    <AlertTriangle size={16} />
                    This exam should be opened in Safe Exam Browser.
                </div>
            )}

            {/* Header */}
            <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                <h1 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#1e293b' }}>{assignment.title}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                    {secondsLeft !== null && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontWeight: 700, fontSize: '1.05rem', fontVariantNumeric: 'tabular-nums',
                            color: secondsLeft < 120 ? '#ef4444' : '#374151',
                        }}>
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

                {/* Submitted confirmation */}
                {submitted && (
                    <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 12, padding: 20, marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <CheckCircle size={20} style={{ color: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontWeight: 700, fontSize: '1rem', color: '#15803d' }}>Essay submitted!</span>
                        </div>
                        <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: '#166534' }}>
                            Copy the submission code below and send it to your teacher.
                        </p>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
                            <textarea
                                readOnly
                                value={submissionCode}
                                rows={3}
                                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.72rem', resize: 'none', background: '#fff', border: '1px solid #86efac', borderRadius: 8, padding: 10, color: '#374151' }}
                            />
                            <button
                                onClick={handleCopy}
                                style={{ padding: '0 16px', background: copied ? '#16a34a' : '#22c55e', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', flexShrink: 0 }}
                            >
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
                        {timedOut && (
                            <span style={{ fontSize: '0.875rem', color: '#ef4444', fontWeight: 600 }}>Time is up — your essay was locked.</span>
                        )}
                        {isOverLimit && (
                            <span style={{ fontSize: '0.875rem', color: '#ef4444' }}>
                                Over limit by {wordCount - (assignment.maxWords ?? 0)} words.
                            </span>
                        )}
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            style={{
                                padding: '10px 32px', borderRadius: 8, border: 'none', fontWeight: 700, fontSize: '0.95rem',
                                background: canSubmit ? '#6366f1' : '#e2e8f0',
                                color: canSubmit ? '#fff' : '#94a3b8',
                                cursor: canSubmit ? 'pointer' : 'not-allowed',
                            }}
                        >
                            Submit essay
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
