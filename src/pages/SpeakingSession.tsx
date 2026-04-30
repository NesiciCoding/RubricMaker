import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, Pause, Square, Save, Mic, X, Trash2 } from 'lucide-react';
import Topbar from '../components/Layout/Topbar';
import { useApp } from '../context/AppContext';
import { calcEntryPoints, calcGradeSummary } from '../utils/gradeCalc';
import { nanoid } from '../utils/nanoid';
import type { ScoreEntry, PronunciationErrorType, PronunciationMark, SpeakingSession as SpeakingSessionType } from '../types';

const ERROR_TYPES: PronunciationErrorType[] = [
    'word_stress', 'sentence_stress', 'th_sound',
    'connected_speech', 'vowel_sound', 'final_consonant',
];

export default function SpeakingSession() {
    const { rubricId, studentId } = useParams<{ rubricId: string; studentId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { rubrics, students, gradeScales, settings, speakingSessions, saveSpeakingSession } = useApp();

    const rubric = rubrics.find(r => r.id === rubricId);
    const student = students.find(s => s.id === studentId);
    const scale = gradeScales.find(g => g.id === (rubric?.gradeScaleId ?? settings.defaultGradeScaleId)) ?? gradeScales[0];

    // Existing session if returning to edit
    const existingSession = speakingSessions.find(s => s.rubricId === rubricId && s.studentId === studentId);

    // ── Timer state ─────────────────────────────────────────────────────────────
    const [durationMinutes, setDurationMinutes] = useState(2);
    const [elapsed, setElapsed] = useState(existingSession?.elapsedSeconds ?? 0);
    const [timerRunning, setTimerRunning] = useState(false);
    const [timerLocked, setTimerLocked] = useState(!!existingSession);
    const [autoLock, setAutoLock] = useState(true);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Scoring state ───────────────────────────────────────────────────────────
    const criteria = rubric?.criteria ?? [];
    const [entries, setEntries] = useState<ScoreEntry[]>(() => {
        if (existingSession) return existingSession.entries;
        return criteria.map(c => ({
            criterionId: c.id,
            levelId: null,
            comment: '',
            checkedSubItems: [],
        }));
    });
    const [overallComment, setOverallComment] = useState(existingSession?.overallComment ?? '');

    // ── Pronunciation marks ─────────────────────────────────────────────────────
    const [marks, setMarks] = useState<PronunciationMark[]>(existingSession?.pronunciationMarks ?? []);

    // ── Dirty state ─────────────────────────────────────────────────────────────
    const [isDirty, setIsDirty] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [isDirty]);

    // ── Timer logic ─────────────────────────────────────────────────────────────
    const durationSeconds = durationMinutes * 60;

    const stopTimer = useCallback((lock = false) => {
        setTimerRunning(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
        if (lock) setTimerLocked(true);
        setIsDirty(true);
    }, []);

    useEffect(() => {
        if (!timerRunning) return;
        intervalRef.current = setInterval(() => {
            setElapsed(prev => {
                const next = prev + 1;
                if (next >= durationSeconds && autoLock) {
                    stopTimer(true);
                }
                return next;
            });
        }, 1000);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [timerRunning, durationSeconds, autoLock, stopTimer]);

    function formatTime(secs: number) {
        const m = Math.floor(secs / 60).toString().padStart(2, '0');
        const s = (secs % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    }

    const timeRemaining = Math.max(0, durationSeconds - elapsed);
    const timerPct = Math.min(100, (elapsed / durationSeconds) * 100);
    const timeUp = elapsed >= durationSeconds;

    // ── Scoring helpers ─────────────────────────────────────────────────────────
    function selectLevel(criterionId: string, levelId: string) {
        setIsDirty(true);
        setEntries(prev => prev.map(e =>
            e.criterionId === criterionId ? { ...e, levelId } : e
        ));
    }

    // ── Pronunciation helpers ───────────────────────────────────────────────────
    function addMark(errorType: PronunciationErrorType) {
        setIsDirty(true);
        setMarks(prev => [...prev, { errorType }]);
    }

    function removeMark(idx: number) {
        setIsDirty(true);
        setMarks(prev => prev.filter((_, i) => i !== idx));
    }

    // ── Save ────────────────────────────────────────────────────────────────────
    function handleSave() {
        if (!rubric || !student) return;
        const session: SpeakingSessionType = {
            id: existingSession?.id ?? nanoid(),
            rubricId: rubricId!,
            studentId: studentId!,
            durationSeconds,
            elapsedSeconds: elapsed,
            pronunciationMarks: marks,
            entries,
            overallComment,
            gradedAt: new Date().toISOString(),
            rubricSnapshot: rubric,
        };
        saveSpeakingSession(session);
        setIsSaved(true);
        setIsDirty(false);
        setTimeout(() => setIsSaved(false), 2000);
    }

    // ── Grade summary ───────────────────────────────────────────────────────────
    const summary = rubric ? calcGradeSummary(
        { id: 'tmp', rubricId: rubricId!, studentId: studentId!, entries, overallComment, isPeerReview: false },
        criteria, scale, rubric
    ) : null;

    if (!rubric || !student) {
        return (
            <div className="page-content">
                <p>{t('gradeStudent.error_not_found')}</p>
                <button className="btn btn-secondary" onClick={() => navigate(-1)}>{t('gradeStudent.action_back')}</button>
            </div>
        );
    }

    return (
        <>
            <Topbar
                title={`${t('speaking.page_title')} — ${student.name}`}
                actions={
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>
                            <ArrowLeft size={14} /> {t('gradeStudent.action_back')}
                        </button>
                        <button
                            className={`btn btn-sm ${isSaved ? 'btn-success' : 'btn-primary'}`}
                            onClick={handleSave}
                        >
                            <Save size={14} /> {isSaved ? t('speaking.session_saved') : t('speaking.save_session')}
                        </button>
                    </div>
                }
            />

            <div className="page-content fade-in" style={{ maxWidth: 900 }}>
                {/* ── Timer Panel ── */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                        <Mic size={18} style={{ color: 'var(--accent)' }} />
                        <h3 style={{ margin: 0 }}>{t('speaking.timer_label')}</h3>
                    </div>

                    {!timerLocked && (
                        <div className="form-group" style={{ maxWidth: 200, marginBottom: 16 }}>
                            <label style={{ fontSize: '0.85rem' }}>{t('speaking.duration_minutes')}</label>
                            <input
                                type="number" min={1} max={30}
                                value={durationMinutes}
                                onChange={e => { setDurationMinutes(Math.max(1, Number(e.target.value))); setElapsed(0); }}
                                disabled={timerRunning}
                                style={{ maxWidth: 80 }}
                            />
                        </div>
                    )}

                    {/* Progress bar */}
                    <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
                        <div style={{
                            height: '100%',
                            width: `${timerPct}%`,
                            background: timeUp ? 'var(--red)' : 'var(--accent)',
                            transition: 'width 0.5s linear',
                            borderRadius: 4,
                        }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                        <div style={{ fontFamily: 'monospace', fontSize: '2.5rem', fontWeight: 700, color: timeUp ? 'var(--red)' : 'var(--text)', minWidth: 100 }}>
                            {formatTime(timeRemaining)}
                        </div>
                        {timeUp && <span style={{ color: 'var(--red)', fontWeight: 700 }}>{t('speaking.time_up')}</span>}

                        {!timerLocked ? (
                            <div style={{ display: 'flex', gap: 8 }}>
                                {!timerRunning ? (
                                    <button className="btn btn-primary btn-sm" onClick={() => setTimerRunning(true)}>
                                        <Play size={14} /> {t('speaking.start')}
                                    </button>
                                ) : (
                                    <button className="btn btn-secondary btn-sm" onClick={() => stopTimer(false)}>
                                        <Pause size={14} /> {t('speaking.pause')}
                                    </button>
                                )}
                                <button className="btn btn-secondary btn-sm" onClick={() => stopTimer(true)}>
                                    <Square size={14} /> {t('speaking.stop')}
                                </button>
                            </div>
                        ) : (
                            <span className="badge badge-blue">{t('speaking.session_locked')}</span>
                        )}
                    </div>

                    {!timerLocked && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.85rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={autoLock} onChange={e => setAutoLock(e.target.checked)} />
                            {t('speaking.auto_lock')}
                        </label>
                    )}

                    <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {t('speaking.elapsed_time', { elapsed, duration: durationSeconds })}
                    </div>
                </div>

                {/* ── Pronunciation Quick-Marks ── */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 12 }}>{t('speaking.pronunciation_panel')}</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                        {ERROR_TYPES.map(type => (
                            <button
                                key={type}
                                className="btn btn-secondary btn-sm"
                                onClick={() => addMark(type)}
                            >
                                {t(`speaking.error_types.${type}`)}
                            </button>
                        ))}
                        {marks.length > 0 && (
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--text-muted)' }} onClick={() => { setMarks([]); setIsDirty(true); }}>
                                <Trash2 size={12} /> {t('speaking.clear_marks')}
                            </button>
                        )}
                    </div>

                    {marks.length === 0 ? (
                        <p className="text-muted text-sm">{t('speaking.no_marks')}</p>
                    ) : (
                        <>
                            <p className="text-sm" style={{ marginBottom: 8, fontWeight: 600 }}>
                                {t('speaking.marks_label', { count: marks.length })}
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {marks.map((mark, idx) => (
                                    <div key={idx} style={{
                                        display: 'flex', alignItems: 'flex-start', gap: 10,
                                        background: 'var(--bg-elevated)', borderRadius: 8,
                                        padding: '8px 12px', border: '1px solid var(--border)',
                                    }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{t(`speaking.error_types.${mark.errorType}`)}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                                {t(`speaking.pronunciationFeedback.${mark.errorType}`)}
                                            </div>
                                        </div>
                                        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeMark(idx)}>
                                            <X size={13} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* ── Rubric Scoring ── */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <h3 style={{ marginBottom: 16 }}>{rubric.name}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {criteria.map(criterion => {
                            const entry = entries.find(e => e.criterionId === criterion.id);
                            const points = entry ? calcEntryPoints(entry, criterion) : 0;
                            const maxPts = Math.max(...criterion.levels.map(l => l.maxPoints));
                            return (
                                <div key={criterion.id} style={{
                                    background: 'var(--bg-elevated)', borderRadius: 10,
                                    padding: 16, border: '1px solid var(--border)',
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
                                        <div style={{ fontWeight: 600 }}>{criterion.title}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {points} / {maxPts} pts
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {criterion.levels.map(level => {
                                            const isSelected = entry?.levelId === level.id;
                                            return (
                                                <button
                                                    key={level.id}
                                                    onClick={() => selectLevel(criterion.id, level.id)}
                                                    style={{
                                                        padding: '6px 14px',
                                                        borderRadius: 8,
                                                        border: isSelected
                                                            ? `2px solid var(--accent)`
                                                            : '1px solid var(--border)',
                                                        background: isSelected ? 'var(--accent-soft)' : 'var(--bg)',
                                                        color: isSelected ? 'var(--accent)' : 'var(--text)',
                                                        fontWeight: isSelected ? 700 : 400,
                                                        fontSize: '0.85rem',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {level.label}
                                                    <span style={{ fontSize: '0.75em', marginLeft: 4, opacity: 0.7 }}>
                                                        ({level.minPoints}–{level.maxPoints})
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {criterion.levels.find(l => l.id === entry?.levelId)?.description && (
                                        <p style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {criterion.levels.find(l => l.id === entry?.levelId)?.description}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── Overall Comment ── */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <label style={{ fontWeight: 600, marginBottom: 8, display: 'block' }}>
                        {t('gradeStudent.overall_comment_label')}
                    </label>
                    <textarea
                        value={overallComment}
                        onChange={e => { setOverallComment(e.target.value); setIsDirty(true); }}
                        placeholder={t('gradeStudent.overall_comment_placeholder')}
                        rows={3}
                        style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }}
                    />
                </div>

                {/* ── Grade Summary ── */}
                {summary && (
                    <div className="card" style={{ marginBottom: 24, display: 'flex', gap: 24, alignItems: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('gradeStudent.label_grade')}</div>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: summary.gradeColor }}>{summary.letterGrade}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('gradeStudent.label_percentage')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.modifiedPercentage.toFixed(1)}%</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('gradeStudent.label_total_points')}</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{summary.rawScore} / {summary.maxRawScore}</div>
                        </div>
                    </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button className={`btn ${isSaved ? 'btn-success' : 'btn-primary'}`} onClick={handleSave}>
                        <Save size={16} /> {isSaved ? t('speaking.session_saved') : t('speaking.save_session')}
                    </button>
                </div>
            </div>
        </>
    );
}
